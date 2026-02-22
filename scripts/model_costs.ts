/**
 * Model Cost Registry & Usage Tracker
 *
 * Provides per-model pricing so you can estimate costs and pick the
 * cheapest model that meets your quality bar.
 *
 * ── How to customise ──────────────────────────────────────────────────
 *
 *  1. Override the default model per task via env vars:
 *       AI_MODEL_CLASSIFIER=gpt-4o-mini
 *       AI_MODEL_COMMENT=gpt-4o-mini
 *       AI_MODEL_DUPLICATE=gpt-4o-mini
 *
 *  2. Or set a single override for all tasks:
 *       AI_MODEL=gpt-4o-mini
 *
 *  3. Prices update frequently — edit the COST_TABLE below or set:
 *       AI_COST_PER_1K_INPUT=0.005
 *       AI_COST_PER_1K_OUTPUT=0.015
 *       to override at runtime without code changes.
 *
 * ── Prices used ───────────────────────────────────────────────────────
 *
 *  All prices are in USD per 1 000 tokens (as of Feb 2026).
 *  Sources: https://aws.amazon.com/bedrock/pricing/
 *           https://openai.com/pricing
 *           https://github.com/marketplace/models
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ModelCost {
  /** USD per 1 000 input tokens */
  inputPer1k: number;
  /** USD per 1 000 output tokens */
  outputPer1k: number;
  /** Human-readable label shown in logs */
  displayName: string;
  /**
   * Relative cost multiplier (baseline = 1.0 = Claude Sonnet 4).
   *
   * Examples:
   *   Claude Sonnet 4  → 1.0x
   *   Claude Opus 4.6  → 2.2x
   *   Claude Opus 4    → 5.0x
   *   Claude Haiku 3.5 → 0.27x
   *
   * The rate is applied as a multiplier on the estimated cost.
   * Override at runtime with the AI_COST_RATE env var.
   */
  costRate: number;
}

export interface UsageRecord {
  model: string;
  provider: string;
  task: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
  estimatedCostUsd: number;
  timestamp: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// Cost table
// ────────────────────────────────────────────────────────────────────────────

/**
 * Known model prices.  Keys are matched against model IDs using
 * `startsWith` so partial prefixes work (e.g. "gpt-4o" matches "gpt-4o-2024-08-06").
 *
 * Add or update entries here when prices change.
 */
const COST_TABLE: Record<string, ModelCost> = {
  // ── AWS Bedrock – Anthropic Claude ──────────────────────────────────
  "us.anthropic.claude-sonnet-4": {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    displayName: "Claude Sonnet 4 (Bedrock)",
    costRate: 1.0,
  },
  "anthropic.claude-sonnet-4": {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    displayName: "Claude Sonnet 4",
    costRate: 1.0,
  },
  "us.anthropic.claude-sonnet-4.6": {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    displayName: "Claude Sonnet 4.6 (Bedrock)",
    costRate: 1.0,
  },
  "anthropic.claude-sonnet-4.6": {
    inputPer1k: 0.003,
    outputPer1k: 0.015,
    displayName: "Claude Sonnet 4.6",
    costRate: 1.0,
  },
  "us.anthropic.claude-opus-4-20250514": {
    inputPer1k: 0.015,
    outputPer1k: 0.075,
    displayName: "Claude Opus 4 (Bedrock)",
    costRate: 5.0,
  },
  "anthropic.claude-opus-4": {
    inputPer1k: 0.015,
    outputPer1k: 0.075,
    displayName: "Claude Opus 4",
    costRate: 5.0,
  },
  "us.anthropic.claude-opus-4.6": {
    inputPer1k: 0.0066,
    outputPer1k: 0.033,
    displayName: "Claude Opus 4.6 (Bedrock)",
    costRate: 2.2,
  },
  "anthropic.claude-opus-4.6": {
    inputPer1k: 0.0066,
    outputPer1k: 0.033,
    displayName: "Claude Opus 4.6",
    costRate: 2.2,
  },
  "us.anthropic.claude-haiku": {
    inputPer1k: 0.0008,
    outputPer1k: 0.004,
    displayName: "Claude Haiku 3.5 (Bedrock)",
    costRate: 0.27,
  },
  "anthropic.claude-3-5-haiku": {
    inputPer1k: 0.0008,
    outputPer1k: 0.004,
    displayName: "Claude 3.5 Haiku",
    costRate: 0.27,
  },
  "us.anthropic.claude-haiku-4": {
    inputPer1k: 0.001,
    outputPer1k: 0.005,
    displayName: "Claude Haiku 4 (Bedrock)",
    costRate: 0.33,
  },
  "anthropic.claude-haiku-4": {
    inputPer1k: 0.001,
    outputPer1k: 0.005,
    displayName: "Claude Haiku 4",
    costRate: 0.33,
  },

  // ── OpenAI ──────────────────────────────────────────────────────────
  "gpt-4o": {
    inputPer1k: 0.0025,
    outputPer1k: 0.01,
    displayName: "GPT-4o",
    costRate: 0.83,
  },
  "gpt-4o-mini": {
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
    displayName: "GPT-4o Mini",
    costRate: 0.05,
  },
  "gpt-4-turbo": {
    inputPer1k: 0.01,
    outputPer1k: 0.03,
    displayName: "GPT-4 Turbo",
    costRate: 3.33,
  },
  "gpt-3.5-turbo": {
    inputPer1k: 0.0005,
    outputPer1k: 0.0015,
    displayName: "GPT-3.5 Turbo",
    costRate: 0.17,
  },
  "gpt-5": {
    inputPer1k: 0.005,
    outputPer1k: 0.02,
    displayName: "GPT-5",
    costRate: 1.67,
  },
  "gpt-5-mini": {
    inputPer1k: 0.0005,
    outputPer1k: 0.002,
    displayName: "GPT-5 Mini",
    costRate: 0.17,
  },
  "gpt-5.3": {
    inputPer1k: 0.006,
    outputPer1k: 0.024,
    displayName: "GPT-5.3",
    costRate: 2.0,
  },

  // ── OpenAI reasoning models ─────────────────────────────────────────
  "o1": {
    inputPer1k: 0.015,
    outputPer1k: 0.06,
    displayName: "o1",
    costRate: 5.0,
  },
  "o1-mini": {
    inputPer1k: 0.003,
    outputPer1k: 0.012,
    displayName: "o1-mini",
    costRate: 1.0,
  },
  "o3": {
    inputPer1k: 0.01,
    outputPer1k: 0.04,
    displayName: "o3",
    costRate: 3.33,
  },
  "o3-mini": {
    inputPer1k: 0.0011,
    outputPer1k: 0.0044,
    displayName: "o3-mini",
    costRate: 0.37,
  },
  "o3-pro": {
    inputPer1k: 0.02,
    outputPer1k: 0.08,
    displayName: "o3-pro",
    costRate: 6.67,
  },
  "o4-mini": {
    inputPer1k: 0.0011,
    outputPer1k: 0.0044,
    displayName: "o4-mini",
    costRate: 0.37,
  },

  // ── Google Gemini ───────────────────────────────────────────────────
  "gemini-2.5-pro": {
    inputPer1k: 0.00125,
    outputPer1k: 0.01,
    displayName: "Gemini 2.5 Pro",
    costRate: 0.42,
  },
  "gemini-2.5-flash": {
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
    displayName: "Gemini 2.5 Flash",
    costRate: 0.05,
  },
  "gemini-2.0-flash": {
    inputPer1k: 0.0001,
    outputPer1k: 0.0004,
    displayName: "Gemini 2.0 Flash",
    costRate: 0.03,
  },

  // ── Meta Llama ──────────────────────────────────────────────────────
  "llama-4": {
    inputPer1k: 0.0002,
    outputPer1k: 0.0008,
    displayName: "Llama 4",
    costRate: 0.07,
  },
  "llama-3.3": {
    inputPer1k: 0.0001,
    outputPer1k: 0.0004,
    displayName: "Llama 3.3",
    costRate: 0.03,
  },

  // ── Mistral ─────────────────────────────────────────────────────────
  "mistral-large": {
    inputPer1k: 0.002,
    outputPer1k: 0.006,
    displayName: "Mistral Large",
    costRate: 0.67,
  },
  "mistral-small": {
    inputPer1k: 0.0002,
    outputPer1k: 0.0006,
    displayName: "Mistral Small",
    costRate: 0.07,
  },
  "codestral": {
    inputPer1k: 0.0003,
    outputPer1k: 0.0009,
    displayName: "Codestral",
    costRate: 0.1,
  },

  // ── DeepSeek ────────────────────────────────────────────────────────
  "deepseek-v3": {
    inputPer1k: 0.00027,
    outputPer1k: 0.0011,
    displayName: "DeepSeek V3",
    costRate: 0.09,
  },
  "deepseek-r1": {
    inputPer1k: 0.00055,
    outputPer1k: 0.0022,
    displayName: "DeepSeek R1",
    costRate: 0.18,
  },

  // ── GitHub Models – free-tier (rate-limited) ────────────────────────
  "github/": {
    inputPer1k: 0,
    outputPer1k: 0,
    displayName: "GitHub Models (free tier)",
    costRate: 0,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Return the cost entry for a model ID.
 * Matches using `startsWith` so "gpt-4o-2024-08" hits "gpt-4o".
 * Returns `null` when no match is found.
 */
export function getModelCost(modelId: string): ModelCost | null {
  // Check env-var overrides first
  const envInput = parseFloat(process.env.AI_COST_PER_1K_INPUT || "");
  const envOutput = parseFloat(process.env.AI_COST_PER_1K_OUTPUT || "");
  const envRate = parseFloat(process.env.AI_COST_RATE || "");
  if (!isNaN(envInput) && !isNaN(envOutput)) {
    return {
      inputPer1k: envInput,
      outputPer1k: envOutput,
      displayName: `${modelId} (env override)`,
      costRate: !isNaN(envRate) ? envRate : 1.0,
    };
  }

  // Exact match
  if (COST_TABLE[modelId]) return COST_TABLE[modelId];

  // Prefix match (longest prefix wins)
  const prefixes = Object.keys(COST_TABLE)
    .filter((k) => modelId.startsWith(k))
    .sort((a, b) => b.length - a.length);

  return prefixes.length > 0 ? COST_TABLE[prefixes[0]] : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Token estimation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rough token count estimate (~4 chars per token for English text).
 * Good enough for cost logging; not meant for billing.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ────────────────────────────────────────────────────────────────────────────
// Usage tracking
// ────────────────────────────────────────────────────────────────────────────

const usageLog: UsageRecord[] = [];

/**
 * Record a single AI call.
 * Also logs the estimated cost to stdout so it's visible in CI.
 */
export function recordUsage(
  model: string,
  provider: string,
  task: string,
  inputText: string,
  outputText: string
): UsageRecord {
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  const cost = getModelCost(model);

  // Apply the costRate multiplier (env override takes priority)
  const envRate = parseFloat(process.env.AI_COST_RATE || "");
  const effectiveRate = !isNaN(envRate) ? envRate : (cost?.costRate ?? 1.0);

  const baseCost = cost
    ? (inputTokens / 1000) * cost.inputPer1k +
      (outputTokens / 1000) * cost.outputPer1k
    : 0;
  const builtInRate = cost?.costRate ?? 1.0;
  const estimatedCost = builtInRate > 0
    ? baseCost * (effectiveRate / builtInRate)
    : baseCost;

  const record: UsageRecord = {
    model,
    provider,
    task,
    inputTokensEstimate: inputTokens,
    outputTokensEstimate: outputTokens,
    estimatedCostUsd: estimatedCost,
    timestamp: new Date(),
  };

  usageLog.push(record);

  const rateStr = cost ? `${effectiveRate}x` : "?";
  const costStr = cost
    ? `~$${estimatedCost.toFixed(6)} (${rateStr})`
    : "(unknown pricing)";
  const displayName = cost?.displayName || model;
  console.log(
    `  💰 ${displayName}  │  ~${inputTokens} in / ~${outputTokens} out  │  ${costStr}`
  );

  return record;
}

/**
 * Return all recorded usage so far (mainly for summaries).
 */
export function getUsageLog(): readonly UsageRecord[] {
  return usageLog;
}

/**
 * Print a summary table of all recorded usage in the current run.
 */
export function printUsageSummary(): void {
  if (usageLog.length === 0) {
    console.log("No AI usage recorded.");
    return;
  }

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;

  console.log("\n┌──────────────────────────────────────────────────────────────────────┐");
  console.log("│                          AI Usage Summary                          │");
  console.log("├──────────────────────┬────────────┬──────┬────────────┬────────────┤");
  console.log("│ Task                 │ Model      │ Rate │ Tokens     │ Est. Cost  │");
  console.log("├──────────────────────┼────────────┼──────┼────────────┼────────────┤");

  for (const r of usageLog) {
    const task = r.task.padEnd(20).substring(0, 20);
    const costInfo = getModelCost(r.model);
    const model = (costInfo?.displayName || r.model)
      .padEnd(10)
      .substring(0, 10);
    const rate = costInfo ? `${costInfo.costRate}x`.padEnd(4).substring(0, 4) : "?   ";
    const tokens = `${r.inputTokensEstimate}/${r.outputTokensEstimate}`.padEnd(10).substring(0, 10);
    const cost = `$${r.estimatedCostUsd.toFixed(6)}`.padEnd(10).substring(0, 10);
    console.log(`│ ${task} │ ${model} │ ${rate} │ ${tokens} │ ${cost} │`);

    totalCost += r.estimatedCostUsd;
    totalInput += r.inputTokensEstimate;
    totalOutput += r.outputTokensEstimate;
  }

  console.log("├──────────────────────┼────────────┼──────┼────────────┼────────────┤");
  const totTokens = `${totalInput}/${totalOutput}`.padEnd(10).substring(0, 10);
  const totCost = `$${totalCost.toFixed(6)}`.padEnd(10).substring(0, 10);
  console.log(`│ ${"TOTAL".padEnd(20)} │ ${"".padEnd(10)} │ ${"".padEnd(4)} │ ${totTokens} │ ${totCost} │`);
  console.log("└──────────────────────┴────────────┴──────┴────────────┴────────────┘");
}

// ────────────────────────────────────────────────────────────────────────────
// Model selection helpers
// ────────────────────────────────────────────────────────────────────────────

export type TaskName = "classifier" | "comment" | "duplicate";

/**
 * Resolve the model to use for a given task.
 *
 * Priority:
 *   1. AI_MODEL_<TASK>  (e.g. AI_MODEL_CLASSIFIER=gpt-4o-mini)
 *   2. AI_MODEL          (global override)
 *   3. Provider default   (falls through to each provider's built-in default)
 */
export function resolveModel(task: TaskName): string | undefined {
  const taskEnvKey = `AI_MODEL_${task.toUpperCase()}`;
  return process.env[taskEnvKey] || process.env.AI_MODEL || undefined;
}

/**
 * List all known models with their per-1k-token costs.
 * Useful for CLI tooling or a `--list-models` flag.
 */
export function listKnownModels(): Array<{ id: string } & ModelCost> {
  return Object.entries(COST_TABLE).map(([id, cost]) => ({
    id,
    ...cost,
  }));
}
