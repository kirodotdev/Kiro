/**
 * Self-Hosted AI Proxy Backend — RAM-Accelerated Edition
 *
 * A high-performance OpenAI-compatible API server that runs entirely
 * in RAM for maximum speed.  All files are pre-loaded into memory at
 * startup — zero disk I/O during operation.  Supports multiple
 * concurrent agent sessions so you can run several tabs/tools at once.
 *
 * ── Usage ──────────────────────────────────────────────────────────────
 *
 *   1. Set your provider & keys in .env (see .env.example)
 *   2. npm run server          (starts on http://localhost:3456)
 *   3. Point any OpenAI-compatible client at http://localhost:3456
 *
 * ── Endpoints ─────────────────────────────────────────────────────────
 *
 *   POST /v1/chat/completions  — Chat completions (OpenAI-compatible)
 *   GET  /v1/models            — List available models
 *   GET  /v1/usage             — Global usage stats
 *   GET  /health               — Health check + pool status
 *
 *   ── Agent management ────────────────────────────────────────────────
 *   POST   /v1/agents          — Create a new agent session
 *   GET    /v1/agents          — List all agent sessions
 *   GET    /v1/agents/:id      — Get one agent's stats
 *   DELETE /v1/agents/:id      — Remove an agent session
 *   GET    /v1/agents/pool     — Pool concurrency stats
 *
 * ── Multi-agent headers ───────────────────────────────────────────────
 *
 *   X-Agent-Id:    <session-id>     — ties a request to a session
 *   X-Agent-Name:  <display-name>   — friendly label (auto-created)
 *
 * ── Config (env vars) ─────────────────────────────────────────────────
 *
 *   AI_PROXY_PORT            — listen port (default 3456)
 *   AI_PROXY_API_KEY         — optional Bearer token
 *   MAX_CONCURRENT_AGENTS    — max parallel API calls (default 5)
 *   MAX_QUEUE_SIZE           — max queued requests (default 50)
 */

import { readFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { URL as NodeURL } from "node:url";
import { createProvider, type ChatMessage, type CompletionOptions } from "./ai_provider.js";
import { listKnownModels, getUsageLog, printUsageSummary } from "./model_costs.js";
import { getAgentPool, generateSessionId, type ProviderName } from "./agent_pool.js";
import {
  getGlobalCommandMode,
  setGlobalCommandMode,
  enableAutoAuthorizeAll,
  getCommandSettings,
  submitCommand,
  approveCommand,
  approveAllPending,
  denyCommand,
  denyAllPending,
  cancelCommand,
  getPendingCommands,
  getCommandHistory,
  getCommand,
  setAgentCommandPolicy,
  getEffectivePolicy,
  type CommandAuthMode,
} from "./command_runner.js";
import {
  initRamCache,
  isRamCacheEnabled,
  getRamCacheStats,
  readCached,
  listCachedFiles,
  invalidateResponsesByPrefix,
  flushAll as flushRamCache,
  shutdownRamCache,
} from "./ram_cache.js";
import {
  isDesktopShareEnabled,
  handleJoinRoom,
  handleSignalStream,
  handleSignal,
  handleChat,
  getRoomList,
  deleteRoom,
  type SignalMessage,
} from "./desktop_share.js";
import {
  initPerfOptimizer,
  tuneServer,
  perfMiddleware,
  fastJsonResponse,
  fastCorsResponse,
  fastErrorResponse,
  fastReadBody,
  invalidateJsonCache,
  getPerfStats,
  shutdownPerfOptimizer,
} from "./perf_optimizer.js";
import {
  initVramManager,
  isVramEnabled,
  getVramStats,
  allocBuffer,
  freeBuffer,
  writeToBuffer,
  readBufferAsText,
  listBuffers,
  freeAllBuffers,
  submitVramTask,
  pinToVram,
  searchAllBuffers,
  setVramCeiling,
  refreshGpuInfo,
  shutdownVramManager,
} from "./vram_manager.js";
import {
  assignSkills,
  removeSkills,
  setSkills,
  applyPreset,
  getAgentSkills,
  getAgentProfile,
  clearAgentSkills,
  buildSkillPromptFragment,
  rankAgentsForTask,
  getSkillsByCategory,
  getAllCategories,
  listPresets,
  getSkillSystemStats,
  SKILL_REGISTRY,
} from "./agent_skills.js";

// ── Load .env file (no external dependency) ────────────────────────────────
try {
  const envPath = new URL("./.env", import.meta.url);
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;  // don't override existing
  }
} catch {
  // .env not found — rely on shell environment
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.AI_PROXY_PORT || "3456", 10);
const API_KEY = process.env.AI_PROXY_API_KEY || ""; // optional auth

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return fastReadBody(req);
}

function jsonResponse(res: ServerResponse, status: number, body: unknown, cacheKey?: string): void {
  fastJsonResponse(res, status, body, cacheKey);
}

function errorResponse(res: ServerResponse, status: number, message: string): void {
  fastErrorResponse(res, status, message);
}

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!API_KEY) return true; // no auth configured
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== API_KEY) {
    errorResponse(res, 401, "Invalid API key");
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────────────────────

/** POST /v1/chat/completions — OpenAI-compatible chat completions (multi-agent) */
async function handleChatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: {
    model?: string;
    messages?: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stream?: boolean;
    agent_id?: string;
    agent_name?: string;
  };

  try {
    body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    errorResponse(res, 400, "messages is required and must be a non-empty array");
    return;
  }

  // Streaming: warn but don't block (callers can opt in when ready)
  if (body.stream) {
    console.warn("⚠️  stream: true requested — not yet implemented, falling back to non-streaming");
  }

  // ── Resolve agent session (header > body > auto-create) ────────────
  const pool = getAgentPool();
  const agentId =
    (req.headers["x-agent-id"] as string) ||
    body.agent_id ||
    generateSessionId();
  const agentName =
    (req.headers["x-agent-name"] as string) ||
    body.agent_name ||
    undefined;

  const session = pool.getOrCreateSession(agentId, agentName, body.model);

  // Map to our internal format
  const messages: ChatMessage[] = body.messages.map((m) => ({
    role: (m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user") as ChatMessage["role"],
    content: m.content,
  }));

  const options: CompletionOptions = {
    model: body.model || session.model || undefined,
    maxTokens: body.max_tokens || undefined,  // no cap — let the provider decide
    temperature: body.temperature ?? 0.7,
    topP: body.top_p ?? 1.0,
    task: "proxy",
  };

  // ── Submit to concurrency pool ─────────────────────────────────────
  // If all slots are busy the request is queued automatically.
  try {
    let resultText = "";
    let promptTokens = 0;
    let completionTokens = 0;

    await pool.submit(agentId, async () => {
      const providerOverride = session.provider as ProviderName | undefined;
      const provider = createProvider(providerOverride);
      const result = await provider.complete(messages, options);
      resultText = result.text;

      promptTokens = Math.ceil(
        messages.map((m) => m.content).join("").length / 4
      );
      completionTokens = Math.ceil(resultText.length / 4);

      // Track usage per agent
      pool.recordUsage(agentId, promptTokens, completionTokens);
    });

    // Build OpenAI-compatible response
    const response = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model || "default",
      agent_id: agentId,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: resultText },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };

    jsonResponse(res, 200, response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Queue full")) {
      console.error(`⏳ Queue full — rejecting request from "${session.name}"`);
      errorResponse(res, 503, message);
    } else {
      console.error(`❌ Completion error (${session.name}):`, message);
      errorResponse(res, 502, `Provider error: ${message}`);
    }
  }
}

/** GET /v1/models — list available models */
function handleListModels(_req: IncomingMessage, res: ServerResponse): void {
  const models = listKnownModels().map((m) => ({
    id: m.id,
    object: "model",
    created: 0,
    owned_by: "self-hosted",
    name: m.displayName,
    cost_rate: m.costRate,
  }));

  jsonResponse(res, 200, {
    object: "list",
    data: models,
  });
}

/** GET /health — health check + pool status */
function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  const provider = process.env.AI_PROVIDER || "bedrock";
  const usage = getUsageLog();
  const pool = getAgentPool();
  const poolStats = pool.getStats();

  jsonResponse(res, 200, {
    status: "ok",
    provider,
    uptime: process.uptime(),
    totalRequests: usage.length,
    pool: {
      maxConcurrency: poolStats.maxConcurrency,
      activeSlots: poolStats.activeSlots,
      queueLength: poolStats.queueLength,
      agentCount: poolStats.agents.length,
      totalProcessed: poolStats.totalProcessed,
    },
  });
}

/** GET /v1/usage — usage summary */
function handleUsage(_req: IncomingMessage, res: ServerResponse): void {
  const usage = getUsageLog();
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  for (const r of usage) {
    totalCost += r.estimatedCostUsd;
    totalInput += r.inputTokensEstimate;
    totalOutput += r.outputTokensEstimate;
  }

  jsonResponse(res, 200, {
    totalRequests: usage.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalEstimatedCostUsd: totalCost,
    records: usage,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Agent Management Handlers
// ────────────────────────────────────────────────────────────────────────────

/** POST /v1/agents — create a new agent session */
async function handleCreateAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { id?: string; name?: string; model?: string; provider?: string; skills?: string[]; preset?: string } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }

  const pool = getAgentPool();
  const id = body.id || generateSessionId();
  const session = pool.getOrCreateSession(id, body.name, body.model, body.provider);

  // Apply skills: preset takes precedence, then explicit skill list
  if (body.preset) {
    try {
      const skills = applyPreset(id, body.preset);
      session.skills = skills;
    } catch (e) {
      errorResponse(res, 400, e instanceof Error ? e.message : "Invalid preset");
      return;
    }
  } else if (body.skills && Array.isArray(body.skills)) {
    const skills = setSkills(id, body.skills);
    session.skills = skills;
  }

  jsonResponse(res, 201, {
    id: session.id,
    name: session.name,
    model: session.model || null,
    provider: session.provider || null,
    skills: getAgentSkills(session.id),
    createdAt: session.createdAt.toISOString(),
  });
}

/** GET /v1/agents — list all agent sessions */
function handleListAgents(_req: IncomingMessage, res: ServerResponse): void {
  const pool = getAgentPool();
  const agents = pool.listSessions().map((a) => ({
    id: a.id,
    name: a.name,
    model: a.model || null,
    provider: a.provider || null,
    skills: getAgentSkills(a.id),
    activeRequests: a.activeRequests,
    requestCount: a.requestCount,
    totalInputTokens: a.totalInputTokens,
    totalOutputTokens: a.totalOutputTokens,
    lastActiveAt: a.lastActiveAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  }));

  jsonResponse(res, 200, { object: "list", data: agents });
}

/** GET /v1/agents/:id — get one agent's details */
function handleGetAgent(res: ServerResponse, agentId: string): void {
  const pool = getAgentPool();
  const a = pool.getSession(agentId);
  if (!a) {
    errorResponse(res, 404, `Agent not found: ${agentId}`);
    return;
  }

  jsonResponse(res, 200, {
    id: a.id,
    name: a.name,
    model: a.model || null,
    provider: a.provider || null,
    skills: getAgentSkills(a.id),
    profile: getAgentProfile(a.id),
    activeRequests: a.activeRequests,
    requestCount: a.requestCount,
    totalInputTokens: a.totalInputTokens,
    totalOutputTokens: a.totalOutputTokens,
    lastActiveAt: a.lastActiveAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  });
}

/** DELETE /v1/agents/:id — remove an agent session */
function handleDeleteAgent(res: ServerResponse, agentId: string): void {
  const pool = getAgentPool();
  const removed = pool.removeSession(agentId);
  if (!removed) {
    errorResponse(res, 404, `Agent not found: ${agentId}`);
    return;
  }
  clearAgentSkills(agentId);
  jsonResponse(res, 200, { deleted: true, id: agentId });
}

/** GET /v1/agents/pool — pool concurrency stats */
function handlePoolStats(_req: IncomingMessage, res: ServerResponse): void {
  const pool = getAgentPool();
  jsonResponse(res, 200, pool.getStats());
}

// ────────────────────────────────────────────────────────────────────────────
// Agent Skills Handlers
// ────────────────────────────────────────────────────────────────────────────

/** GET /v1/skills — list all available skills in the registry */
function handleListSkills(_req: IncomingMessage, res: ServerResponse): void {
  const skills = [...SKILL_REGISTRY.values()].map((s) => ({
    id: s.id,
    displayName: s.displayName,
    icon: s.icon,
    category: s.category,
    description: s.description,
    requiredCapabilities: s.requiredCapabilities,
    compatibleModes: s.compatibleModes,
    tags: s.tags,
  }));
  jsonResponse(res, 200, { object: "list", data: skills, total: skills.length });
}

/** GET /v1/skills/categories — list all skill categories with counts */
function handleListSkillCategories(_req: IncomingMessage, res: ServerResponse): void {
  const categories = getAllCategories().map((cat) => ({
    category: cat,
    skills: getSkillsByCategory(cat).map((s) => s.id),
    count: getSkillsByCategory(cat).length,
  }));
  jsonResponse(res, 200, { data: categories });
}

/** GET /v1/skills/presets — list all skill presets */
function handleListSkillPresets(_req: IncomingMessage, res: ServerResponse): void {
  const presets = listPresets().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    icon: p.icon,
    description: p.description,
    skills: p.skills,
  }));
  jsonResponse(res, 200, { object: "list", data: presets, total: presets.length });
}

/** GET /v1/skills/stats — skill system summary */
function handleSkillStats(_req: IncomingMessage, res: ServerResponse): void {
  jsonResponse(res, 200, getSkillSystemStats());
}

/** GET /v1/agents/:id/skills — get an agent's assigned skills */
function handleGetAgentSkills(res: ServerResponse, agentId: string): void {
  const pool = getAgentPool();
  if (!pool.getSession(agentId)) {
    errorResponse(res, 404, `Agent not found: ${agentId}`);
    return;
  }
  jsonResponse(res, 200, getAgentProfile(agentId));
}

/** PUT /v1/agents/:id/skills — set (replace) an agent's skills */
async function handleSetAgentSkills(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
  const pool = getAgentPool();
  const session = pool.getSession(agentId);
  if (!session) {
    errorResponse(res, 404, `Agent not found: ${agentId}`);
    return;
  }
  const raw = await readBody(req);
  let body: { skills?: string[]; preset?: string } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }

  if (body.preset) {
    try {
      const skills = applyPreset(agentId, body.preset);
      session.skills = skills;
      jsonResponse(res, 200, { agentId, preset: body.preset, skills, profile: getAgentProfile(agentId) });
    } catch (e) {
      errorResponse(res, 400, e instanceof Error ? e.message : "Invalid preset");
    }
    return;
  }

  if (!body.skills || !Array.isArray(body.skills)) {
    errorResponse(res, 400, "Provide { skills: [...] } or { preset: \"...\" }");
    return;
  }

  const skills = setSkills(agentId, body.skills);
  session.skills = skills;
  jsonResponse(res, 200, { agentId, skills, profile: getAgentProfile(agentId) });
}

/** POST /v1/agents/:id/skills — add skills to an agent (additive) */
async function handleAddAgentSkills(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
  const pool = getAgentPool();
  const session = pool.getSession(agentId);
  if (!session) {
    errorResponse(res, 404, `Agent not found: ${agentId}`);
    return;
  }
  const raw = await readBody(req);
  let body: { skills?: string[] } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }
  if (!body.skills || !Array.isArray(body.skills)) {
    errorResponse(res, 400, "Provide { skills: [...] }");
    return;
  }
  const skills = assignSkills(agentId, body.skills);
  session.skills = skills;
  jsonResponse(res, 200, { agentId, skills, profile: getAgentProfile(agentId) });
}

/** DELETE /v1/agents/:id/skills — remove specific skills from an agent */
async function handleRemoveAgentSkills(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
  const pool = getAgentPool();
  const session = pool.getSession(agentId);
  if (!session) {
    errorResponse(res, 404, `Agent not found: ${agentId}`);
    return;
  }
  const raw = await readBody(req);
  let body: { skills?: string[] } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }
  if (!body.skills || !Array.isArray(body.skills)) {
    errorResponse(res, 400, "Provide { skills: [...] }");
    return;
  }
  const skills = removeSkills(agentId, body.skills);
  session.skills = skills;
  jsonResponse(res, 200, { agentId, skills, profile: getAgentProfile(agentId) });
}

/** POST /v1/skills/match — find the best agent for a task (by tags) */
async function handleSkillMatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { tags?: string[]; agentIds?: string[] } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }
  if (!body.tags || !Array.isArray(body.tags)) {
    errorResponse(res, 400, "Provide { tags: [\"...\"] }");
    return;
  }

  const pool = getAgentPool();
  const agentIds = body.agentIds || pool.listSessions().map((s) => s.id);
  const ranked = rankAgentsForTask(agentIds, body.tags);
  const best = ranked.length > 0 && ranked[0].score > 0 ? ranked[0] : null;

  jsonResponse(res, 200, { tags: body.tags, ranked, bestMatch: best });
}

/** GET /v1/agents/:id/prompt-fragment — get the skill-based prompt text for an agent */
function handleGetSkillPrompt(res: ServerResponse, agentId: string): void {
  const pool = getAgentPool();
  if (!pool.getSession(agentId)) {
    errorResponse(res, 404, `Agent not found: ${agentId}`);
    return;
  }
  const fragment = buildSkillPromptFragment(agentId);
  jsonResponse(res, 200, { agentId, promptFragment: fragment, skills: getAgentSkills(agentId) });
}

// ────────────────────────────────────────────────────────────────────────────
// Command Authorization & Execution Handlers
// ────────────────────────────────────────────────────────────────────────────

/** GET /v1/commands/settings — current command authorization settings */
function handleCommandSettings(_req: IncomingMessage, res: ServerResponse): void {
  jsonResponse(res, 200, getCommandSettings());
}

/** PUT /v1/commands/settings — update global command auth mode */
async function handleUpdateCommandSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { mode?: string; autoAuthorizeAll?: boolean } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }

  // Shortcut: autoAuthorizeAll = true → set mode to "auto"
  if (body.autoAuthorizeAll === true) {
    enableAutoAuthorizeAll();
    jsonResponse(res, 200, getCommandSettings());
    return;
  }
  if (body.autoAuthorizeAll === false) {
    setGlobalCommandMode("prompt");
    jsonResponse(res, 200, getCommandSettings());
    return;
  }

  const mode = body.mode as CommandAuthMode | undefined;
  if (mode && ["auto", "prompt", "deny"].includes(mode)) {
    setGlobalCommandMode(mode);
    jsonResponse(res, 200, getCommandSettings());
  } else {
    errorResponse(res, 400, 'Invalid mode — use "auto", "prompt", or "deny"');
  }
}

/** POST /v1/commands — submit a command for execution */
async function handleSubmitCommand(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: {
    command?: string;
    reason?: string;
    cwd?: string;
    agent_id?: string;
    agent_name?: string;
    timeout_ms?: number;
  } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }

  if (!body.command) {
    errorResponse(res, 400, '"command" field is required');
    return;
  }

  const agentId =
    (req.headers["x-agent-id"] as string) || body.agent_id || "anonymous";
  const agentName =
    (req.headers["x-agent-name"] as string) || body.agent_name || undefined;

  const entry = await submitCommand({
    agentId,
    agentName,
    command: body.command,
    reason: body.reason,
    cwd: body.cwd,
    timeoutMs: body.timeout_ms,
  });

  const status = entry.status === "pending" ? 202 : 200;
  jsonResponse(res, status, entry);
}

/** GET /v1/commands — list command history */
function handleListCommands(_req: IncomingMessage, res: ServerResponse): void {
  jsonResponse(res, 200, {
    pending: getPendingCommands(),
    history: getCommandHistory(),
  });
}

/** GET /v1/commands/pending — list pending commands awaiting approval */
function handleListPending(_req: IncomingMessage, res: ServerResponse): void {
  jsonResponse(res, 200, { data: getPendingCommands() });
}

/** POST /v1/commands/:id/approve — approve a pending command */
async function handleApproveCommand(res: ServerResponse, cmdId: string): Promise<void> {
  const entry = await approveCommand(cmdId);
  if (!entry) {
    errorResponse(res, 404, `Command not found or not pending: ${cmdId}`);
    return;
  }
  jsonResponse(res, 200, entry);
}

/** POST /v1/commands/approve-all — approve all pending commands */
async function handleApproveAll(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const entries = await approveAllPending();
  jsonResponse(res, 200, { approved: entries.length, data: entries });
}

/** POST /v1/commands/:id/deny — deny a pending command */
function handleDenyCommand(res: ServerResponse, cmdId: string): void {
  const entry = denyCommand(cmdId);
  if (!entry) {
    errorResponse(res, 404, `Command not found or not pending: ${cmdId}`);
    return;
  }
  jsonResponse(res, 200, entry);
}

/** POST /v1/commands/deny-all — deny all pending commands */
function handleDenyAll(_req: IncomingMessage, res: ServerResponse): void {
  const entries = denyAllPending();
  jsonResponse(res, 200, { denied: entries.length, data: entries });
}

/** POST /v1/commands/:id/cancel — cancel a pending command */
function handleCancelCommand(res: ServerResponse, cmdId: string): void {
  const entry = cancelCommand(cmdId);
  if (!entry) {
    errorResponse(res, 404, `Command not found or not pending: ${cmdId}`);
    return;
  }
  jsonResponse(res, 200, entry);
}

/** GET /v1/commands/:id — get a specific command */
function handleGetCommand(res: ServerResponse, cmdId: string): void {
  const entry = getCommand(cmdId);
  if (!entry) {
    errorResponse(res, 404, `Command not found: ${cmdId}`);
    return;
  }
  jsonResponse(res, 200, entry);
}

/** PUT /v1/agents/:id/command-policy — set per-agent command policy */
async function handleSetAgentPolicy(
  req: IncomingMessage,
  res: ServerResponse,
  agentId: string,
): Promise<void> {
  const raw = await readBody(req);
  let body: { policy?: string } = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    errorResponse(res, 400, "Invalid JSON body");
    return;
  }

  const policy = body.policy;
  if (policy && !["auto", "prompt", "deny"].includes(policy)) {
    errorResponse(res, 400, 'Invalid policy — use "auto", "prompt", or "deny"');
    return;
  }

  setAgentCommandPolicy(agentId, (policy as CommandAuthMode) ?? undefined);
  jsonResponse(res, 200, {
    agentId,
    policy: policy ?? null,
    effectivePolicy: getEffectivePolicy(agentId),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────────────────────

/** Match /v1/desktop/rooms/:id */
function matchDesktopRoomId(url: string): string | null {
  const m = url.match(/^\/v1\/desktop\/rooms\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/agents/:id  — returns the id segment or null */
function matchAgentId(url: string): string | null {
  const m = url.match(/^\/v1\/agents\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/agents/:id/command-policy */
function matchAgentPolicy(url: string): string | null {
  const m = url.match(/^\/v1\/agents\/([^/]+)\/command-policy$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/agents/:id/skills */
function matchAgentSkills(url: string): string | null {
  const m = url.match(/^\/v1\/agents\/([^/]+)\/skills$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/agents/:id/prompt-fragment */
function matchAgentPromptFragment(url: string): string | null {
  const m = url.match(/^\/v1\/agents\/([^/]+)\/prompt-fragment$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/commands/:id */
function matchCommandId(url: string): string | null {
  const m = url.match(/^\/v1\/commands\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/commands/:id/approve */
function matchCommandApprove(url: string): string | null {
  const m = url.match(/^\/v1\/commands\/([^/]+)\/approve$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/commands/:id/deny */
function matchCommandDeny(url: string): string | null {
  const m = url.match(/^\/v1\/commands\/([^/]+)\/deny$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Match /v1/commands/:id/cancel */
function matchCommandCancel(url: string): string | null {
  const m = url.match(/^\/v1\/commands\/([^/]+)\/cancel$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method?.toUpperCase() || "GET";
  const url = (req.url || "/").split("?")[0]; // strip query string

  // CORS preflight (fast path)
  if (method === "OPTIONS") {
    fastCorsResponse(res);
    return;
  }

  // Auth check (skip for health and desktop UI)
  if (url !== "/health" && url !== "/desktop" && !checkAuth(req, res)) return;

  // ── Core API routes ────────────────────────────────────────────────
  if (method === "POST" && url === "/v1/chat/completions") {
    await handleChatCompletions(req, res);
    return;
  }
  if (method === "GET" && url === "/v1/models") {
    handleListModels(req, res);
    return;
  }
  if (method === "GET" && url === "/v1/usage") {
    handleUsage(req, res);
    return;
  }
  if (method === "GET" && url === "/health") {
    handleHealth(req, res);
    return;
  }

  // ── Performance & RAM cache routes ───────────────────────────────
  if (method === "GET" && url === "/v1/perf") {
    handlePerfStats(req, res);
    return;
  }
  if (method === "GET" && url === "/v1/cache") {
    handleCacheStats(req, res);
    return;
  }
  if (method === "GET" && url === "/v1/cache/files") {
    handleCacheFileList(req, res);
    return;
  }
  if (method === "POST" && url === "/v1/cache/flush") {
    handleCacheFlush(req, res);
    return;
  }

  // ── VRAM routes ────────────────────────────────────────────────────
  if (method === "GET" && url === "/v1/vram") {
    jsonResponse(res, 200, getVramStats());
    return;
  }
  if (method === "GET" && url === "/v1/vram/buffers") {
    jsonResponse(res, 200, { buffers: listBuffers() });
    return;
  }
  if (method === "POST" && url === "/v1/vram/alloc") {
    const raw = await readBody(req);
    try {
      const { name, size, gpuIndex } = JSON.parse(raw);
      if (!name || !size) { errorResponse(res, 400, "name and size required"); return; }
      const buf = allocBuffer(name, size, gpuIndex || 0);
      jsonResponse(res, 200, { allocated: true, name: buf.name, size: buf.size, gpuIndex: buf.gpuIndex });
    } catch (e) { errorResponse(res, 400, e instanceof Error ? e.message : "Invalid request"); }
    return;
  }
  if (method === "POST" && url === "/v1/vram/write") {
    const raw = await readBody(req);
    try {
      const { name, data, gpuIndex } = JSON.parse(raw);
      if (!name || !data) { errorResponse(res, 400, "name and data required"); return; }
      const buf = writeToBuffer(name, data, gpuIndex || 0);
      jsonResponse(res, 200, { written: true, name: buf.name, size: buf.size });
    } catch (e) { errorResponse(res, 400, e instanceof Error ? e.message : "Invalid request"); }
    return;
  }
  if (method === "GET" && url.startsWith("/v1/vram/read/")) {
    const bufName = decodeURIComponent(url.slice("/v1/vram/read/".length));
    const text = readBufferAsText(bufName);
    if (text !== null) jsonResponse(res, 200, { name: bufName, data: text });
    else errorResponse(res, 404, `VRAM buffer "${bufName}" not found`);
    return;
  }
  if (method === "DELETE" && url.startsWith("/v1/vram/free/")) {
    const bufName = decodeURIComponent(url.slice("/v1/vram/free/".length));
    const ok = freeBuffer(bufName);
    if (ok) jsonResponse(res, 200, { freed: true, name: bufName });
    else errorResponse(res, 404, `VRAM buffer "${bufName}" not found`);
    return;
  }
  if (method === "POST" && url === "/v1/vram/free-all") {
    const result = freeAllBuffers();
    jsonResponse(res, 200, result);
    return;
  }
  if (method === "POST" && url === "/v1/vram/task") {
    const raw = await readBody(req);
    try {
      const { type, buffer, params } = JSON.parse(raw);
      if (!type || !buffer) { errorResponse(res, 400, "type and buffer required"); return; }
      const result = await submitVramTask(type, buffer, params);
      jsonResponse(res, 200, result);
    } catch (e) { errorResponse(res, 400, e instanceof Error ? e.message : "Invalid request"); }
    return;
  }
  if (method === "POST" && url === "/v1/vram/pin") {
    const raw = await readBody(req);
    try {
      const { name, data, gpuIndex } = JSON.parse(raw);
      if (!name || !data) { errorResponse(res, 400, "name and data required"); return; }
      const buf = pinToVram(name, data, gpuIndex || 0);
      jsonResponse(res, 200, { pinned: true, name: buf.name, size: buf.size });
    } catch (e) { errorResponse(res, 400, e instanceof Error ? e.message : "Invalid request"); }
    return;
  }
  if (method === "POST" && url === "/v1/vram/search") {
    const raw = await readBody(req);
    try {
      const { pattern } = JSON.parse(raw);
      if (!pattern) { errorResponse(res, 400, "pattern required"); return; }
      const results = await searchAllBuffers(pattern);
      jsonResponse(res, 200, { results });
    } catch (e) { errorResponse(res, 400, e instanceof Error ? e.message : "Invalid request"); }
    return;
  }
  if (method === "PUT" && url === "/v1/vram/ceiling") {
    const raw = await readBody(req);
    try {
      const { mb } = JSON.parse(raw);
      if (typeof mb !== "number" || mb <= 0) { errorResponse(res, 400, "mb must be a positive number"); return; }
      setVramCeiling(mb);
      jsonResponse(res, 200, { ceiling: `${mb} MB` });
    } catch { errorResponse(res, 400, "Invalid JSON body"); }
    return;
  }
  if (method === "POST" && url === "/v1/vram/refresh-gpu") {
    const gpus = refreshGpuInfo();
    jsonResponse(res, 200, { gpus });
    return;
  }

  // ── Desktop sharing routes ─────────────────────────────────────────
  if (url === "/desktop" && method === "GET") {
    serveDesktopPage(res);
    return;
  }
  if (url === "/v1/desktop/rooms") {
    if (method === "POST") {
      const raw = await readBody(req);
      try {
        const body = JSON.parse(raw);
        const result = handleJoinRoom(body);
        jsonResponse(res, 200, result);
      } catch { errorResponse(res, 400, "Invalid JSON body"); }
      return;
    }
    if (method === "GET") {
      jsonResponse(res, 200, { data: getRoomList() });
      return;
    }
  }
  const desktopRoomId = matchDesktopRoomId(url);
  if (desktopRoomId && method === "DELETE") {
    const ok = deleteRoom(desktopRoomId);
    if (ok) jsonResponse(res, 200, { deleted: true, id: desktopRoomId });
    else errorResponse(res, 404, `Room not found: ${desktopRoomId}`);
    return;
  }
  if (url === "/v1/desktop/signal" && method === "POST") {
    const raw = await readBody(req);
    try {
      const signal = JSON.parse(raw) as SignalMessage;
      const result = handleSignal(signal);
      jsonResponse(res, 200, result);
    } catch { errorResponse(res, 400, "Invalid JSON body"); }
    return;
  }
  if (url === "/v1/desktop/signal/stream" && method === "GET") {
    const fullUrl = new NodeURL(req.url || "/", `http://localhost:${PORT}`);
    const qRoom = fullUrl.searchParams.get("room") || "";
    const qPeer = fullUrl.searchParams.get("peer") || "";
    if (!qRoom || !qPeer) {
      errorResponse(res, 400, "room and peer query params required");
      return;
    }
    handleSignalStream(req, res, qRoom, qPeer);
    return;
  }
  if (url === "/v1/desktop/chat" && method === "POST") {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw);
      const msg = handleChat(body.roomId, body.from, body.text);
      if (msg) jsonResponse(res, 200, msg);
      else errorResponse(res, 404, "Room not found");
    } catch { errorResponse(res, 400, "Invalid JSON body"); }
    return;
  }

  // ── Agent management routes ────────────────────────────────────────
  if (url === "/v1/agents/pool" && method === "GET") {
    handlePoolStats(req, res);
    return;
  }
  if (url === "/v1/agents") {
    if (method === "GET") { handleListAgents(req, res); return; }
    if (method === "POST") { await handleCreateAgent(req, res); return; }
  }

  const agentId = matchAgentId(url);
  if (agentId) {
    if (method === "GET") { handleGetAgent(res, agentId); return; }
    if (method === "DELETE") { handleDeleteAgent(res, agentId); return; }
  }

  // ── Per-agent command policy route ─────────────────────────────────
  const policyAgentId = matchAgentPolicy(url);
  if (policyAgentId && method === "PUT") {
    await handleSetAgentPolicy(req, res, policyAgentId);
    return;
  }

  // ── Agent skills routes ────────────────────────────────────────────
  if (url === "/v1/skills" && method === "GET") {
    handleListSkills(req, res);
    return;
  }
  if (url === "/v1/skills/categories" && method === "GET") {
    handleListSkillCategories(req, res);
    return;
  }
  if (url === "/v1/skills/presets" && method === "GET") {
    handleListSkillPresets(req, res);
    return;
  }
  if (url === "/v1/skills/stats" && method === "GET") {
    handleSkillStats(req, res);
    return;
  }
  if (url === "/v1/skills/match" && method === "POST") {
    await handleSkillMatch(req, res);
    return;
  }

  // ── Per-agent skill routes: /v1/agents/:id/skills ──────────────────
  const skillsAgentId = matchAgentSkills(url);
  if (skillsAgentId) {
    if (method === "GET") { handleGetAgentSkills(res, skillsAgentId); return; }
    if (method === "PUT") { await handleSetAgentSkills(req, res, skillsAgentId); return; }
    if (method === "POST") { await handleAddAgentSkills(req, res, skillsAgentId); return; }
    if (method === "DELETE") { await handleRemoveAgentSkills(req, res, skillsAgentId); return; }
  }

  // ── Per-agent prompt fragment: /v1/agents/:id/prompt-fragment ──────
  const promptAgentId = matchAgentPromptFragment(url);
  if (promptAgentId && method === "GET") {
    handleGetSkillPrompt(res, promptAgentId);
    return;
  }

  // ── Command authorization & execution routes ───────────────────────
  if (url === "/v1/commands/settings") {
    if (method === "GET") { handleCommandSettings(req, res); return; }
    if (method === "PUT") { await handleUpdateCommandSettings(req, res); return; }
  }
  if (url === "/v1/commands/pending" && method === "GET") {
    handleListPending(req, res); return;
  }
  if (url === "/v1/commands/approve-all" && method === "POST") {
    await handleApproveAll(req, res); return;
  }
  if (url === "/v1/commands/deny-all" && method === "POST") {
    handleDenyAll(req, res); return;
  }
  if (url === "/v1/commands") {
    if (method === "POST") { await handleSubmitCommand(req, res); return; }
    if (method === "GET") { handleListCommands(req, res); return; }
  }

  // ── Command :id routes ────────────────────────────────────────────
  const approveId = matchCommandApprove(url);
  if (approveId && method === "POST") { await handleApproveCommand(res, approveId); return; }

  const denyId = matchCommandDeny(url);
  if (denyId && method === "POST") { handleDenyCommand(res, denyId); return; }

  const cancelId = matchCommandCancel(url);
  if (cancelId && method === "POST") { handleCancelCommand(res, cancelId); return; }

  const cmdId = matchCommandId(url);
  if (cmdId && method === "GET") { handleGetCommand(res, cmdId); return; }

  // ── Serve cached files (e.g., /desktop.html) ────────────────────
  if (method === "GET") {
    const filePath = url.replace(/^\//, "");
    const cached = readCached(filePath.startsWith("scripts/") ? filePath : `scripts/${filePath}`);
    if (cached) {
      res.writeHead(200, {
        "Content-Type": cached.mime,
        "Content-Length": cached.size,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        "Connection": "keep-alive",
      });
      res.end(cached.data);
      return;
    }
  }

  errorResponse(res, 404, `Not found: ${method} ${url}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Start
// ────────────────────────────────────────────────────────────────────────────

// ── Initialize RAM cache & performance optimizer ─────────────────────────
initRamCache();
initPerfOptimizer();

// ── Perf & cache route handlers ──────────────────────────────────────────

/** GET /v1/perf — performance stats */
function handlePerfStats(_req: IncomingMessage, res: ServerResponse): void {
  const mem = process.memoryUsage();
  jsonResponse(res, 200, {
    perf: getPerfStats(),
    memory: {
      heapUsedMB: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMB: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(1)),
      rssMB: parseFloat((mem.rss / 1024 / 1024).toFixed(1)),
      externalMB: parseFloat((mem.external / 1024 / 1024).toFixed(1)),
    },
    cache: getRamCacheStats(),
  }, "perf-stats");
}

/** GET /v1/cache — RAM cache stats */
function handleCacheStats(_req: IncomingMessage, res: ServerResponse): void {
  jsonResponse(res, 200, getRamCacheStats(), "cache-stats");
}

/** GET /v1/cache/files — list all cached file paths */
function handleCacheFileList(_req: IncomingMessage, res: ServerResponse): void {
  jsonResponse(res, 200, { files: listCachedFiles() });
}

/** POST /v1/cache/flush — flush pending writes and clear response caches */
function handleCacheFlush(_req: IncomingMessage, res: ServerResponse): void {
  flushRamCache();
  invalidateResponsesByPrefix("");
  invalidateJsonCache("perf-stats");
  invalidateJsonCache("cache-stats");
  jsonResponse(res, 200, { flushed: true });
}

// ── Desktop page handler ─────────────────────────────────────────────────
let _desktopHtml: Buffer | null = null;

function serveDesktopPage(res: ServerResponse): void {
  if (!isDesktopShareEnabled()) {
    errorResponse(res, 403, "Desktop sharing is disabled");
    return;
  }
  // Try RAM cache first (zero disk I/O)
  if (isRamCacheEnabled()) {
    const cached = readCached("scripts/desktop.html");
    if (cached) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(cached.size),
        "X-Served-From": "ram-cache",
      });
      res.end(cached.data);
      return;
    }
  }
  // Fallback: read once from disk and keep in memory forever
  if (!_desktopHtml) {
    try {
      const htmlPath = new URL("./desktop.html", import.meta.url);
      _desktopHtml = Buffer.from(readFileSync(htmlPath, "utf-8"), "utf-8");
    } catch {
      errorResponse(res, 500, "desktop.html not found");
      return;
    }
  }
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": String(_desktopHtml.length),
  });
  res.end(_desktopHtml);
}

// ── Initialize VRAM manager ──────────────────────────────────────────────
initVramManager();

// ── Create server with performance middleware ────────────────────────────
const wrappedHandler = perfMiddleware(handleRequest);

const server = createServer((req, res) => {
  wrappedHandler(req, res).catch((err) => {
    console.error("Unhandled error:", err);
    errorResponse(res, 500, "Internal server error");
  });
});

server.listen(PORT, () => {
  // Apply connection-level tuning
  tuneServer(server);
  const provider = process.env.AI_PROVIDER || "bedrock";
  const pool = getAgentPool();
  const stats = pool.getStats();
  const cmdMode = getGlobalCommandMode().toUpperCase();
  const cacheStats = getRamCacheStats();
  const vramStats = getVramStats();
  const desktopStatus = isDesktopShareEnabled() ? "ENABLED" : "DISABLED";
  const vramLine = isVramEnabled()
    ? `${vramStats.gpuCount} GPU(s), ${vramStats.totalVramMB}MB total`
    : `system RAM tier (${(vramStats.freeVramMB + vramStats.allocatedVramMB).toFixed(0)}MB)`;
  const skillsStats = getSkillSystemStats();
  const skillsLine = `${skillsStats.totalSkills} skills, ${skillsStats.totalPresets} presets`;
  console.log(`
┌──────────────────────────────────────────────────────────┐
│    ⚡ AI Proxy Backend — RAM + VRAM Accelerated          │
├──────────────────────────────────────────────────────────┤
│  URL:         http://localhost:${String(PORT).padEnd(27)}│
│  Provider:    ${provider.padEnd(43)}│
│  Auth:        ${(API_KEY ? "API key required" : "disabled (open)").padEnd(43)}│
│  Concurrency: ${String(stats.maxConcurrency).padEnd(43)}│
│  Queue size:  ${String(stats.maxQueueSize).padEnd(43)}│
│  Commands:    ${cmdMode.padEnd(43)}│
│  RAM Cache:   ${(cacheStats.fileCount + " files / " + cacheStats.fileBytesHuman).padEnd(43)}│
│  Max RAM:     ${cacheStats.maxBytesHuman.padEnd(43)}│
│  VRAM:        ${vramLine.padEnd(43)}│
│  Desktop:     ${desktopStatus.padEnd(43)}│
│  Skills:      ${skillsLine.padEnd(43)}│
├──────────────────────────────────────────────────────────┤
│  POST /v1/chat/completions  — Chat (multi-agent)         │
│  GET  /v1/models            — List models                │
│  GET  /v1/usage             — Usage stats                │
│  GET  /health               — Health + pool status       │
├──────────────────────────────────────────────────────────┤
│  POST   /v1/agents          — Create agent session       │
│  GET    /v1/agents          — List all agents            │
│  GET    /v1/agents/:id      — Agent detail               │
│  DELETE /v1/agents/:id      — Remove agent               │
│  GET    /v1/agents/pool     — Pool stats                 │
│  PUT    /v1/agents/:id/command-policy — Set agent policy  │
├──────────────────────────────────────────────────────────┤
│  GET    /v1/skills            — List all skills          │
│  GET    /v1/skills/categories — Skills by category       │
│  GET    /v1/skills/presets    — List skill presets        │
│  GET    /v1/skills/stats      — Skill system stats       │
│  POST   /v1/skills/match      — Match agents to task     │
│  GET    /v1/agents/:id/skills — Agent's skills           │
│  PUT    /v1/agents/:id/skills — Set agent skills         │
│  POST   /v1/agents/:id/skills — Add skills to agent      │
│  DELETE /v1/agents/:id/skills — Remove agent skills      │
│  GET    /v1/agents/:id/prompt-fragment — Skill prompt    │
├──────────────────────────────────────────────────────────┤
│  GET  /v1/commands/settings   — Command auth settings    │
│  PUT  /v1/commands/settings   — Update auth mode         │
│  POST /v1/commands            — Submit a command         │
│  GET  /v1/commands            — List all commands        │
│  GET  /v1/commands/pending    — Pending approvals        │
│  POST /v1/commands/approve-all— Approve all pending      │
│  POST /v1/commands/deny-all   — Deny all pending         │
│  POST /v1/commands/:id/approve— Approve one command      │
│  POST /v1/commands/:id/deny   — Deny one command         │
│  POST /v1/commands/:id/cancel — Cancel one command       │
│  GET  /v1/commands/:id        — Command detail           │
├──────────────────────────────────────────────────────────┤
│  GET  /desktop               — Desktop sharing UI        │
│  POST /v1/desktop/rooms      — Create/join room          │
│  GET  /v1/desktop/rooms      — List active rooms         │
│  DEL  /v1/desktop/rooms/:id  — Delete room               │
│  POST /v1/desktop/signal     — Relay WebRTC signal       │
│  GET  /v1/desktop/signal/stream — SSE signal stream      │
│  POST /v1/desktop/chat       — Send chat message         │
├──────────────────────────────────────────────────────────┤
│  GET  /v1/perf         — Performance & memory stats      │
│  GET  /v1/cache        — RAM cache stats                 │
│  GET  /v1/cache/files  — List cached files               │
│  POST /v1/cache/flush  — Flush writes & clear cache      │
├──────────────────────────────────────────────────────────┤
│  GET  /v1/vram           — VRAM stats & GPU info         │
│  GET  /v1/vram/buffers   — List allocated buffers        │
│  POST /v1/vram/alloc     — Allocate a named buffer       │
│  POST /v1/vram/write     — Write data to buffer          │
│  GET  /v1/vram/read/:n   — Read buffer contents          │
│  DEL  /v1/vram/free/:n   — Free a buffer                 │
│  POST /v1/vram/free-all  — Free all buffers              │
│  POST /v1/vram/pin       — Pin data to VRAM              │
│  POST /v1/vram/task      — Submit processing task        │
│  POST /v1/vram/search    — Search across all buffers     │
│  PUT  /v1/vram/ceiling   — Set VRAM ceiling (MB)         │
│  POST /v1/vram/refresh-gpu — Re-detect GPU info          │
├──────────────────────────────────────────────────────────┤
│  Headers: X-Agent-Id, X-Agent-Name (optional)            │
└──────────────────────────────────────────────────────────┘
  `);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  const pool = getAgentPool();
  pool.printStatus();
  printUsageSummary();
  shutdownRamCache();
  shutdownVramManager();
  shutdownPerfOptimizer();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  const pool = getAgentPool();
  pool.printStatus();
  printUsageSummary();
  shutdownRamCache();
  shutdownVramManager();
  shutdownPerfOptimizer();
  server.close();
  process.exit(0);
});
