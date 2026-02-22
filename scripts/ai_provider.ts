/**
 * AI Provider Abstraction Layer
 *
 * Supports multiple AI backends so you can switch between them:
 *   - AWS Bedrock        (Claude via AWS)
 *   - Anthropic          (Claude direct API)
 *   - OpenAI             (GPT-4o, GPT-5, o3, etc.)
 *   - Azure OpenAI       (OpenAI models via Azure)
 *   - GitHub Models      (free-tier models via GitHub PAT)
 *   - OpenRouter         (unified gateway to 200+ models)
 *   - Groq               (ultra-fast inference)
 *   - Google Gemini      (Gemini 2.5 Pro/Flash)
 *   - DeepSeek           (DeepSeek V3/R1)
 *   - Ollama             (local self-hosted models)
 *
 * Select a provider by setting:
 *   AI_PROVIDER = "bedrock" | "anthropic" | "openai" | "azure-openai" |
 *                 "github-models" | "openrouter" | "groq" | "gemini" |
 *                 "deepseek" | "ollama"
 *
 * Each provider reads its own env vars for auth — see .env.example for the full list.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { retryWithBackoff } from "./retry_utils.js";
import { recordUsage } from "./model_costs.js";

// Global default max tokens — 0 or unset = let the provider/model decide (no cap).
// When non-zero, used as the fallback if the caller doesn't specify maxTokens.
const DEFAULT_MAX_TOKENS: number | undefined =
  parseInt(process.env.DEFAULT_MAX_TOKENS || "0", 10) || undefined;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Chat-style message (common across all providers) */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options forwarded to any provider */
export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  /** Optional model override (uses provider default when omitted) */
  model?: string;
  /** Task label for cost tracking (e.g. "classifier", "comment", "duplicate") */
  task?: string;
}

/** Normalised provider response */
export interface ProviderResponse {
  text: string;
  /** Raw JSON body returned by the API (for debugging) */
  raw?: unknown;
}

/** Every provider must implement this interface */
export interface AIProvider {
  readonly name: string;
  complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<ProviderResponse>;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. AWS Bedrock provider
// ────────────────────────────────────────────────────────────────────────────

const BEDROCK_DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";

export class BedrockProvider implements AIProvider {
  readonly name = "bedrock";
  private client: BedrockRuntimeClient;

  constructor() {
    const region = process.env.AWS_REGION || "us-east-1";
    this.client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const modelId = options.model || BEDROCK_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    // Bedrock Anthropic Messages API format
    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      messages: messages.map((m) => ({
        role: m.role === "system" ? "user" : m.role, // Bedrock doesn't have system role in messages, but uses system field
        content: m.content,
      })),
    });

    const responseBody = await retryWithBackoff(async () => {
      const command = new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      });
      const response = await this.client.send(command);
      return new TextDecoder().decode(response.body);
    });

    const parsed = JSON.parse(responseBody);
    const text = this.extractText(parsed);

    // Track usage & costs
    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(modelId, this.name, options.task || "unknown", inputText, text);

    return { text, raw: parsed };
  }

  /** Extract text from Bedrock / Anthropic response format */
  private extractText(parsed: Record<string, unknown>): string {
    if (parsed.content && Array.isArray(parsed.content)) {
      const block = (parsed.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === "text"
      );
      if (block?.text) return block.text;
    }
    // Fallback for simpler response shapes
    if (typeof parsed.completion === "string") {
      return parsed.completion;
    }
    throw new Error("Unable to extract text from Bedrock response");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. GitHub Models provider
// ────────────────────────────────────────────────────────────────────────────

const GITHUB_MODELS_ENDPOINT =
  "https://models.inference.ai.azure.com/chat/completions";
const GITHUB_MODELS_DEFAULT_MODEL = "gpt-4o";

export class GitHubModelsProvider implements AIProvider {
  readonly name = "github-models";
  private token: string;
  private endpoint: string;

  constructor() {
    this.token = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || "";
    this.endpoint =
      process.env.GITHUB_MODELS_ENDPOINT || GITHUB_MODELS_ENDPOINT;

    if (!this.token) {
      throw new Error(
        "GitHub Models provider requires GITHUB_MODELS_TOKEN or GITHUB_TOKEN env var"
      );
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model = options.model || GITHUB_MODELS_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `GitHub Models API error ${res.status}: ${errText}`
        );
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const text = extractOpenAIText(responseBody as Record<string, unknown>, "GitHub Models");

    // Track usage & costs
    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: responseBody };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. OpenAI-compatible provider (works with Copilot, OpenAI)
// ────────────────────────────────────────────────────────────────────────────

const OPENAI_DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_DEFAULT_MODEL = "gpt-4o";

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai";
  private apiKey: string;
  private endpoint: string;

  constructor() {
    this.apiKey =
      process.env.OPENAI_API_KEY ||
      process.env.COPILOT_API_KEY ||
      "";
    this.endpoint =
      process.env.OPENAI_API_ENDPOINT || OPENAI_DEFAULT_ENDPOINT;

    if (!this.apiKey) {
      throw new Error(
        "OpenAI-compatible provider requires OPENAI_API_KEY or COPILOT_API_KEY env var"
      );
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model =
      options.model || process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const text = extractOpenAIText(responseBody as Record<string, unknown>, "OpenAI");

    // Track usage & costs
    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: responseBody };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Anthropic direct API provider
// ────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private apiKey: string;
  private endpoint: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";
    this.endpoint = process.env.ANTHROPIC_API_ENDPOINT || ANTHROPIC_DEFAULT_ENDPOINT;

    if (!this.apiKey) {
      throw new Error("Anthropic provider requires ANTHROPIC_API_KEY env var");
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model = options.model || process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    // Separate system message from user/assistant messages
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: chatMessages,
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const parsed = responseBody as Record<string, unknown>;
    const text = this.extractText(parsed);

    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: parsed };
  }

  private extractText(parsed: Record<string, unknown>): string {
    if (parsed.content && Array.isArray(parsed.content)) {
      const block = (parsed.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === "text"
      );
      if (block?.text) return block.text;
    }
    throw new Error("Unable to extract text from Anthropic response");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. OpenRouter provider (unified gateway to 200+ models)
// ────────────────────────────────────────────────────────────────────────────

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4";

export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || "";

    if (!this.apiKey) {
      throw new Error("OpenRouter provider requires OPENROUTER_API_KEY env var");
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model = options.model || process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://github.com/kiro",
          "X-Title": "Kiro Issue Automation",
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const text = extractOpenAIText(responseBody as Record<string, unknown>, "OpenRouter");

    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: responseBody };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Groq provider (ultra-fast inference)
// ────────────────────────────────────────────────────────────────────────────

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

export class GroqProvider implements AIProvider {
  readonly name = "groq";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || "";

    if (!this.apiKey) {
      throw new Error("Groq provider requires GROQ_API_KEY env var");
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model = options.model || process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const text = extractOpenAIText(responseBody as Record<string, unknown>, "Groq");

    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: responseBody };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Google Gemini provider
// ────────────────────────────────────────────────────────────────────────────

const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";

    if (!this.apiKey) {
      throw new Error("Gemini provider requires GOOGLE_API_KEY or GEMINI_API_KEY env var");
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model = options.model || process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    // Gemini uses generateContent API
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    // Convert chat messages to Gemini format
    const systemInstruction = messages.find((m) => m.role === "system");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body = JSON.stringify({
      contents,
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction.content }] } }
        : {}),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        topP,
      },
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const parsed = responseBody as Record<string, unknown>;
    const text = this.extractText(parsed);

    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: parsed };
  }

  private extractText(parsed: Record<string, unknown>): string {
    const candidates = parsed.candidates as
      | Array<{ content?: { parts?: Array<{ text?: string }> } }>
      | undefined;
    if (candidates?.[0]?.content?.parts?.[0]?.text) {
      return candidates[0].content.parts[0].text;
    }
    throw new Error("Unable to extract text from Gemini response");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 8. DeepSeek provider
// ────────────────────────────────────────────────────────────────────────────

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

export class DeepSeekProvider implements AIProvider {
  readonly name = "deepseek";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";

    if (!this.apiKey) {
      throw new Error("DeepSeek provider requires DEEPSEEK_API_KEY env var");
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model = options.model || process.env.DEEPSEEK_MODEL || DEEPSEEK_DEFAULT_MODEL;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`DeepSeek API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const text = extractOpenAIText(responseBody as Record<string, unknown>, "DeepSeek");

    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: responseBody };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 9. Azure OpenAI provider
// ────────────────────────────────────────────────────────────────────────────

export class AzureOpenAIProvider implements AIProvider {
  readonly name = "azure-openai";
  private apiKey: string;
  private endpoint: string;
  private deployment: string;

  constructor() {
    this.apiKey = process.env.AZURE_OPENAI_API_KEY || "";
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT || "";
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";

    if (!this.apiKey || !this.endpoint) {
      throw new Error(
        "Azure OpenAI provider requires AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY env vars"
      );
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const deployment = options.model || this.deployment;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = options.temperature ?? 0.3;
    const topP = options.topP ?? 0.9;

    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
    const url = `${this.endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    const body = JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Azure OpenAI API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const text = extractOpenAIText(responseBody as Record<string, unknown>, "Azure OpenAI");

    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(deployment, this.name, options.task || "unknown", inputText, text);

    return { text, raw: responseBody };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 10. Ollama provider (local self-hosted models)
// ────────────────────────────────────────────────────────────────────────────

const OLLAMA_DEFAULT_ENDPOINT = "http://localhost:11434/api/chat";
const OLLAMA_DEFAULT_MODEL = "llama3.2";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private endpoint: string;

  constructor() {
    this.endpoint = process.env.OLLAMA_ENDPOINT || OLLAMA_DEFAULT_ENDPOINT;
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<ProviderResponse> {
    const model = options.model || process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL;

    const body = JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        num_predict: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options.temperature ?? 0.3,
        top_p: options.topP ?? 0.9,
      },
    });

    const responseBody = await retryWithBackoff(async () => {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama API error ${res.status}: ${errText}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    });

    const parsed = responseBody as Record<string, unknown>;
    const msg = parsed.message as { content?: string } | undefined;
    const text = msg?.content || "";
    if (!text) throw new Error("Unable to extract text from Ollama response");

    const inputText = messages.map((m) => m.content).join("\n");
    recordUsage(model, this.name, options.task || "unknown", inputText, text);

    return { text, raw: parsed };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

/** Extract text from an OpenAI-compatible chat completion response */
function extractOpenAIText(parsed: Record<string, unknown>, providerLabel: string): string {
  const choices = parsed.choices as
    | Array<{ message?: { content?: string } }>
    | undefined;
  if (choices?.[0]?.message?.content) {
    return choices[0].message.content;
  }
  throw new Error(`Unable to extract text from ${providerLabel} response`);
}

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

export type ProviderName =
  | "bedrock"
  | "anthropic"
  | "openai"
  | "azure-openai"
  | "github-models"
  | "openrouter"
  | "groq"
  | "gemini"
  | "deepseek"
  | "ollama";

// ────────────────────────────────────────────────────────────────────────────
// Provider cache — avoids recreating clients (and re-resolving AWS creds)
// on every call within the same process.
// ────────────────────────────────────────────────────────────────────────────

const _providerCache = new Map<ProviderName, AIProvider>();

/**
 * Create an AI provider based on the AI_PROVIDER env var (default: "bedrock").
 *
 * Instances are cached per provider name so that a single triage run reuses
 * the same AWS/HTTP client instead of spinning up a new one for every task.
 *
 * Pass `{ fresh: true }` to bypass the cache (useful in tests).
 *
 * Example usage:
 *   const ai = createProvider();
 *   const res = await ai.complete([{ role: "user", content: "Hello" }]);
 *   console.log(res.text);
 */
export function createProvider(
  override?: ProviderName,
  options?: { fresh?: boolean }
): AIProvider {
  const name = override || (process.env.AI_PROVIDER as ProviderName) || "bedrock";

  if (!options?.fresh && _providerCache.has(name)) {
    return _providerCache.get(name)!;
  }

  let provider: AIProvider;

  switch (name) {
    case "bedrock":
      provider = new BedrockProvider();
      break;
    case "anthropic":
      provider = new AnthropicProvider();
      break;
    case "openai":
      provider = new OpenAICompatibleProvider();
      break;
    case "azure-openai":
      provider = new AzureOpenAIProvider();
      break;
    case "github-models":
      provider = new GitHubModelsProvider();
      break;
    case "openrouter":
      provider = new OpenRouterProvider();
      break;
    case "groq":
      provider = new GroqProvider();
      break;
    case "gemini":
      provider = new GeminiProvider();
      break;
    case "deepseek":
      provider = new DeepSeekProvider();
      break;
    case "ollama":
      provider = new OllamaProvider();
      break;
    default:
      throw new Error(
        `Unknown AI provider "${name}". Supported: bedrock, anthropic, openai, azure-openai, github-models, openrouter, groq, gemini, deepseek, ollama`
      );
  }

  _providerCache.set(name, provider);
  return provider;
}

/** Clear the provider cache (for testing). */
export function clearProviderCache(): void {
  _providerCache.clear();
}

/**
 * Helper: extract the first JSON object from a text response.
 * Useful when the model wraps JSON inside prose or markdown fences.
 */
export function extractJsonFromText(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}
