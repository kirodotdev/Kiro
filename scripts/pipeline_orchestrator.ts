/**
 * Pipeline Orchestrator & Plan Dispatcher
 *
 * Chains agent modes into an automated pipeline:
 *
 *   User Goal → 🔍 Analyser → 📋 Planner/Dispatcher → 💻 Coder(s)
 *
 * The Planner doubles as a **Dispatcher**: after generating the task plan,
 * it assigns each task to the next available Coder agent and selects the
 * right model based on task complexity:
 *
 *   - epic / large   → Claude Opus 4.6   (deep reasoning)
 *   - medium         → Claude Sonnet 4.6 (balanced)
 *   - small / trivial→ Claude Sonnet 4.6 (fast & cheap)
 *
 * Coder agents run in parallel per the plan's parallelGroups, respecting
 * task dependencies.  Every step emits activity events so the dashboard
 * can show exactly what each sub-agent is doing and when it finishes.
 *
 * ── Config (env vars) ─────────────────────────────────────────────────
 *
 *   OPUS_MODEL     — model id for complex tasks (default: claude-opus-4-20250514)
 *   SONNET_MODEL   — model id for simple tasks  (default: claude-sonnet-4-20250514)
 *   MAX_CODERS     — max parallel coder agents   (default: 3)
 */

import {
  getAgentPool,
  generateSessionId,
  generatePipelineId,
  type AgentSession,
} from "./agent_pool.js";
import {
  createProvider,
  type ChatMessage,
  type CompletionOptions,
} from "./ai_provider.js";
import {
  getSystemPrompt,
  type AgentMode,
  type ProjectAnalysis,
  type TaskPlan,
  type PlannedTask,
  type CoderOutput,
} from "./agent_modes.js";
import { extractJsonFromText } from "./ai_provider.js";

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const OPUS_MODEL  = process.env.OPUS_MODEL  || "claude-opus-4-20250514";
const SONNET_MODEL = process.env.SONNET_MODEL || "claude-sonnet-4-20250514";
// 0 = unlimited parallel coders (default)
const MAX_CODERS  = parseInt(process.env.MAX_CODERS || "0", 10) || Infinity;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | "created"
  | "analysing"
  | "planning"
  | "dispatching"
  | "coding"
  | "completed"
  | "failed";

export type TaskDispatchStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "blocked";

/** Tracks a single task assignment inside the dispatcher. */
export interface DispatchedTask {
  task: PlannedTask;
  status: TaskDispatchStatus;
  assignedAgent?: string;
  assignedModel?: string;
  startedAt?: string;
  completedAt?: string;
  result?: CoderOutput;
  error?: string;
}

/** Full pipeline state — queryable from the dashboard. */
export interface PipelineState {
  id: string;
  goal: string;
  status: PipelineStatus;
  createdAt: string;
  updatedAt: string;

  /** Analyser output */
  analysis?: ProjectAnalysis;
  analysisAgentId?: string;

  /** Planner output (includes dispatch decisions) */
  plan?: TaskPlan;
  plannerAgentId?: string;

  /** Per-task dispatch state */
  tasks: DispatchedTask[];

  /** Summary stats */
  tasksTotal: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRunning: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Model selector — maps complexity to the right Claude model
// ────────────────────────────────────────────────────────────────────────────

/**
 * Choose the right model for a task based on its estimated complexity.
 *
 * - epic / large  → Opus (deep reasoning, multi-file refactors)
 * - medium        → Sonnet (good balance)
 * - small/trivial → Sonnet (fast, cheap)
 */
export function selectModelForTask(task: PlannedTask): { model: string; reason: string } {
  const c = task.estimatedComplexity;
  if (c === "epic" || c === "large") {
    return {
      model: OPUS_MODEL,
      reason: `Complexity "${c}" → Opus (deep reasoning for multi-file changes)`,
    };
  }
  return {
    model: SONNET_MODEL,
    reason: `Complexity "${c}" → Sonnet (fast implementation)`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Pipeline registry
// ────────────────────────────────────────────────────────────────────────────

const _pipelines = new Map<string, PipelineState>();

export function getPipeline(id: string): PipelineState | undefined {
  return _pipelines.get(id);
}

export function listPipelines(): PipelineState[] {
  return Array.from(_pipelines.values());
}

export function deletePipeline(id: string): boolean {
  return _pipelines.delete(id);
}

// ────────────────────────────────────────────────────────────────────────────
// AI helper — send messages to a provider and parse JSON output
// ────────────────────────────────────────────────────────────────────────────

async function aiComplete(
  agentId: string,
  mode: AgentMode,
  userContent: string,
  model?: string,
): Promise<string> {
  const pool = getAgentPool();
  const session = pool.getSession(agentId);

  let resultText = "";

  await pool.submit(agentId, async () => {
    const providerOverride = session?.provider as
      | "bedrock" | "anthropic" | "openai" | "azure-openai"
      | "github-models" | "openrouter" | "groq" | "gemini"
      | "deepseek" | "ollama"
      | undefined;

    const provider = createProvider(providerOverride);

    const messages: ChatMessage[] = [
      { role: "system", content: getSystemPrompt(mode) },
      { role: "user", content: userContent },
    ];

    const options: CompletionOptions = {
      model: model ?? session?.model,
      maxTokens: parseInt(process.env.PIPELINE_MAX_TOKENS || "0", 10) || undefined,
      temperature: 0.3,
      topP: 0.95,
      task: `pipeline-${mode}`,
    };

    const result = await provider.complete(messages, options);
    resultText = result.text;

    // Record usage
    const inTokens = Math.ceil(messages.map((m) => m.content).join("").length / 4);
    const outTokens = Math.ceil(resultText.length / 4);
    pool.recordUsage(agentId, inTokens, outTokens);
  });

  return resultText;
}

/** Parse JSON from AI output (tolerant of markdown fences). */
function parseJsonOutput<T>(raw: string): T {
  // Try extractJsonFromText first — it handles fences, leading text, etc.
  const extracted = extractJsonFromText(raw);
  if (extracted) {
    // It returns the first JSON-like substring. Parse it.
    return JSON.parse(extracted) as T;
  }
  // Fallback: try parsing the whole output directly
  return JSON.parse(raw) as T;
}

// ────────────────────────────────────────────────────────────────────────────
// Pipeline Orchestrator
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run the full Analyser → Planner/Dispatcher → Coder(s) pipeline.
 *
 * Returns the completed PipelineState when all coders finish.
 * Activity events are emitted at every step so the dashboard can track
 * exactly what each sub-agent is doing.
 */
export async function runPipeline(
  goal: string,
  projectContext: string,
  opts?: { provider?: string },
): Promise<PipelineState> {
  const pool = getAgentPool();
  const pipelineId = generatePipelineId();
  const now = new Date().toISOString();

  const state: PipelineState = {
    id: pipelineId,
    goal,
    status: "created",
    createdAt: now,
    updatedAt: now,
    tasks: [],
    tasksTotal: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    tasksRunning: 0,
  };
  _pipelines.set(pipelineId, state);

  pool.emitActivity("system", "created", `Pipeline created for goal: "${goal}"`, {
    pipelineId,
    mode: "orchestrator",
  });

  try {
    // ── 1. ANALYSE ──────────────────────────────────────────────────
    state.status = "analysing";
    state.updatedAt = new Date().toISOString();

    const analyserId = generateSessionId();
    const analyserSession = pool.getOrCreateSession(analyserId, "🔍 Analyser", SONNET_MODEL, opts?.provider);
    analyserSession.mode = "analyser";
    analyserSession.pipelineId = pipelineId;
    state.analysisAgentId = analyserId;

    pool.emitActivity(analyserId, "running", "Scanning project structure, dependencies, patterns...", {
      pipelineId,
      mode: "analyser",
    });

    const analysisRaw = await aiComplete(
      analyserId,
      "analyser",
      `Goal: ${goal}\n\nProject context:\n${projectContext}`,
      SONNET_MODEL,
    );

    let analysis: ProjectAnalysis;
    try {
      analysis = parseJsonOutput<ProjectAnalysis>(analysisRaw);
    } catch {
      pool.emitActivity(analyserId, "failed", "Failed to parse analysis output as JSON", {
        pipelineId,
        mode: "analyser",
        data: { raw: analysisRaw.slice(0, 500) },
      });
      state.status = "failed";
      state.updatedAt = new Date().toISOString();
      return state;
    }

    state.analysis = analysis;
    state.updatedAt = new Date().toISOString();

    pool.emitActivity(analyserId, "completed", `Analysis complete: ${analysis.projectName} — ${analysis.issues.length} issues found`, {
      pipelineId,
      mode: "analyser",
      data: {
        projectName: analysis.projectName,
        languages: analysis.tech.languages,
        issueCount: analysis.issues.length,
        strengthCount: analysis.strengths.length,
      },
    });

    // ── 2. PLAN + DISPATCH ──────────────────────────────────────────
    state.status = "planning";
    state.updatedAt = new Date().toISOString();

    const plannerId = generateSessionId();
    const plannerSession = pool.getOrCreateSession(plannerId, "📋 Planner/Dispatcher", SONNET_MODEL, opts?.provider);
    plannerSession.mode = "planner";
    plannerSession.pipelineId = pipelineId;
    state.plannerAgentId = plannerId;

    pool.emitActivity(plannerId, "running", "Creating task plan from analysis...", {
      pipelineId,
      mode: "planner",
    });

    const planRaw = await aiComplete(
      plannerId,
      "planner",
      `Goal: ${goal}\n\nProject Analysis:\n${JSON.stringify(analysis, null, 2)}`,
      SONNET_MODEL,
    );

    let plan: TaskPlan;
    try {
      plan = parseJsonOutput<TaskPlan>(planRaw);
    } catch {
      pool.emitActivity(plannerId, "failed", "Failed to parse plan output as JSON", {
        pipelineId,
        mode: "planner",
        data: { raw: planRaw.slice(0, 500) },
      });
      state.status = "failed";
      state.updatedAt = new Date().toISOString();
      return state;
    }

    state.plan = plan;
    state.tasksTotal = plan.tasks.length;
    state.updatedAt = new Date().toISOString();

    // Build dispatch entries for every task
    for (const task of plan.tasks) {
      const { model, reason } = selectModelForTask(task);
      state.tasks.push({
        task,
        status: "pending",
        assignedModel: model,
      });

      pool.emitActivity(plannerId, "delegated",
        `Task #${task.id} "${task.title}" → ${model === OPUS_MODEL ? "Opus" : "Sonnet"} (${reason})`, {
          pipelineId,
          mode: "planner",
          data: { taskId: task.id, model, complexity: task.estimatedComplexity },
        });
    }

    pool.emitActivity(plannerId, "completed",
      `Plan ready: ${plan.tasks.length} tasks, ${plan.parallelGroups.length} parallel groups`, {
        pipelineId,
        mode: "planner",
        data: {
          taskCount: plan.tasks.length,
          groups: plan.parallelGroups.length,
          effort: plan.estimatedTotalEffort,
        },
      });

    // ── 3. DISPATCH to CODERS ───────────────────────────────────────
    state.status = "dispatching";
    state.updatedAt = new Date().toISOString();

    pool.emitActivity(plannerId, "running", "Dispatching tasks to coder agents...", {
      pipelineId,
      mode: "planner",
    });

    await dispatchTasks(state, plan, analysis, pipelineId, opts?.provider);

    // ── 4. DONE ─────────────────────────────────────────────────────
    const allCompleted = state.tasks.every((t) => t.status === "completed");
    state.status = allCompleted ? "completed" : "failed";
    state.updatedAt = new Date().toISOString();

    pool.emitActivity("system", state.status === "completed" ? "completed" : "failed",
      `Pipeline ${state.status}: ${state.tasksCompleted}/${state.tasksTotal} tasks completed, ${state.tasksFailed} failed`, {
        pipelineId,
        mode: "orchestrator",
        data: {
          completed: state.tasksCompleted,
          failed: state.tasksFailed,
          total: state.tasksTotal,
        },
      });

    return state;
  } catch (err: unknown) {
    state.status = "failed";
    state.updatedAt = new Date().toISOString();
    const msg = err instanceof Error ? err.message : String(err);

    pool.emitActivity("system", "failed", `Pipeline crashed: ${msg}`, {
      pipelineId,
      mode: "orchestrator",
    });

    return state;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Plan Dispatcher — assigns tasks to the next ready coder agent
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch tasks respecting parallelGroups and dependencies.
 *
 * Within each parallel group, up to MAX_CODERS agents work simultaneously.
 * The dispatcher picks the model (Opus vs Sonnet) based on the planner's
 * complexity rating, and assigns to the next available coder agent.
 */
async function dispatchTasks(
  state: PipelineState,
  plan: TaskPlan,
  analysis: ProjectAnalysis,
  pipelineId: string,
  provider?: string,
): Promise<void> {
  const pool = getAgentPool();
  const completedTaskIds = new Set<number>();

  // Build a lookup from task ID → DispatchedTask ref
  const taskMap = new Map<number, DispatchedTask>();
  for (const dt of state.tasks) {
    taskMap.set(dt.task.id, dt);
  }

  // Process parallel groups in order
  for (let gi = 0; gi < plan.parallelGroups.length; gi++) {
    const group = plan.parallelGroups[gi];
    const groupLabel = `Group ${gi + 1}/${plan.parallelGroups.length}`;

    pool.emitActivity(state.plannerAgentId || "system", "running",
      `${groupLabel}: dispatching ${group.length} task(s) in parallel`, {
        pipelineId,
        mode: "planner",
        data: { group: gi + 1, taskIds: group },
      });

    // Check that all dependency tasks for this group are done
    for (const taskId of group) {
      const dt = taskMap.get(taskId);
      if (!dt) continue;
      const unmetDeps = dt.task.dependencies.filter((depId) => !completedTaskIds.has(depId));
      if (unmetDeps.length > 0) {
        dt.status = "blocked";
        dt.error = `Blocked by unfinished dependencies: ${unmetDeps.join(", ")}`;
        state.tasksFailed++;
        pool.emitActivity("system", "failed",
          `Task #${taskId} "${dt.task.title}" blocked — deps ${unmetDeps.join(",")} not done`, {
            pipelineId,
            mode: "planner",
          });
      }
    }

    // Dispatch non-blocked tasks in this group concurrently (up to MAX_CODERS)
    const runnableTasks = group
      .map((id) => taskMap.get(id)!)
      .filter((dt) => dt && dt.status === "pending");

    // Process in batches of MAX_CODERS
    for (let bi = 0; bi < runnableTasks.length; bi += MAX_CODERS) {
      const batch = runnableTasks.slice(bi, bi + MAX_CODERS);

      const batchPromises = batch.map((dt) =>
        runCoderForTask(dt, analysis, pipelineId, provider)
          .then(() => {
            completedTaskIds.add(dt.task.id);
            state.tasksCompleted++;
          })
          .catch(() => {
            state.tasksFailed++;
          })
      );

      // Wait for this batch to finish before starting the next
      await Promise.allSettled(batchPromises);
      state.tasksRunning = 0;
      state.updatedAt = new Date().toISOString();
    }
  }

  // Handle any tasks that weren't in any parallel group (fallback: run sequentially)
  const groupedIds = new Set(plan.parallelGroups.flat());
  const ungrouped = state.tasks.filter((dt) => !groupedIds.has(dt.task.id) && dt.status === "pending");

  for (const dt of ungrouped) {
    try {
      await runCoderForTask(dt, analysis, pipelineId, provider);
      completedTaskIds.add(dt.task.id);
      state.tasksCompleted++;
    } catch {
      state.tasksFailed++;
    }
    state.updatedAt = new Date().toISOString();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Single coder task runner
// ────────────────────────────────────────────────────────────────────────────

/** Spin up a Coder agent for one task, using the model the dispatcher chose. */
async function runCoderForTask(
  dt: DispatchedTask,
  analysis: ProjectAnalysis,
  pipelineId: string,
  provider?: string,
): Promise<void> {
  const pool = getAgentPool();
  const task = dt.task;
  const model = dt.assignedModel || SONNET_MODEL;
  const modelLabel = model.includes("opus") ? "Opus" : "Sonnet";

  // Create a dedicated agent session for this task
  const coderId = generateSessionId();
  const coderSession = pool.getOrCreateSession(
    coderId,
    `💻 Coder #${task.id} (${modelLabel})`,
    model,
    provider,
  );
  coderSession.mode = "coder";
  coderSession.pipelineId = pipelineId;

  dt.assignedAgent = coderId;
  dt.status = "running";
  dt.startedAt = new Date().toISOString();

  pool.emitActivity(coderId, "received",
    `Assigned task #${task.id} "${task.title}" [${task.estimatedComplexity}] → ${modelLabel}`, {
      pipelineId,
      mode: "coder",
      data: { taskId: task.id, model, complexity: task.estimatedComplexity },
    });

  pool.emitActivity(coderId, "running",
    `Implementing: ${task.description.slice(0, 120)}...`, {
      pipelineId,
      mode: "coder",
    });

  try {
    const userContent = [
      `Task #${task.id}: ${task.title}`,
      `Description: ${task.description}`,
      `Files to touch: ${task.files.join(", ")}`,
      `Priority: ${task.priority}`,
      `Complexity: ${task.estimatedComplexity}`,
      `Acceptance criteria:\n${task.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`,
      `\nProject Analysis:\n${JSON.stringify(analysis, null, 2)}`,
    ].join("\n\n");

    const resultRaw = await aiComplete(coderId, "coder", userContent, model);

    let coderOutput: CoderOutput;
    try {
      coderOutput = parseJsonOutput<CoderOutput>(resultRaw);
    } catch {
      // If JSON parse fails, still record what we got
      dt.status = "failed";
      dt.completedAt = new Date().toISOString();
      dt.error = "Failed to parse coder output as JSON";

      pool.emitActivity(coderId, "failed",
        `Task #${task.id} — coder output was not valid JSON`, {
          pipelineId,
          mode: "coder",
          data: { raw: resultRaw.slice(0, 300) },
        });
      throw new Error(dt.error);
    }

    dt.result = coderOutput;
    dt.completedAt = new Date().toISOString();

    if (coderOutput.status === "completed") {
      dt.status = "completed";
      const changeCount = coderOutput.changes.length;
      const testCount = coderOutput.testFiles.length;

      pool.emitActivity(coderId, "completed",
        `Task #${task.id} ✅ done — ${changeCount} file change(s), ${testCount} test file(s)`, {
          pipelineId,
          mode: "coder",
          data: {
            taskId: task.id,
            status: "completed",
            changes: changeCount,
            tests: testCount,
            acceptanceMet: coderOutput.acceptanceMet,
          },
        });
    } else if (coderOutput.status === "partial") {
      dt.status = "completed"; // partial is still "done" for pipeline flow
      pool.emitActivity(coderId, "completed",
        `Task #${task.id} ⚠️ partial — ${coderOutput.notes}`, {
          pipelineId,
          mode: "coder",
          data: { taskId: task.id, status: "partial", notes: coderOutput.notes },
        });
    } else {
      // blocked
      dt.status = "failed";
      dt.error = coderOutput.notes;
      pool.emitActivity(coderId, "failed",
        `Task #${task.id} 🚫 blocked — ${coderOutput.notes}`, {
          pipelineId,
          mode: "coder",
          data: { taskId: task.id, status: "blocked", notes: coderOutput.notes },
        });
      throw new Error(`Task #${task.id} blocked: ${coderOutput.notes}`);
    }
  } catch (err: unknown) {
    if (dt.status !== "failed") {
      dt.status = "failed";
      dt.completedAt = new Date().toISOString();
      dt.error = err instanceof Error ? err.message : String(err);

      pool.emitActivity(coderId, "failed",
        `Task #${task.id} crashed: ${dt.error}`, {
          pipelineId,
          mode: "coder",
        });
    }
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Utility — find the next idle coder agent (for external callers)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Find which coder agents are currently idle (not running any request).
 * Used by the dashboard to show agent readiness.
 */
export function getReadyCoders(): AgentSession[] {
  const pool = getAgentPool();
  return pool.listSessions().filter(
    (s) => s.mode === "coder" && s.activeRequests === 0,
  );
}

/**
 * Get all coder agents currently working.
 */
export function getActiveCoders(): AgentSession[] {
  const pool = getAgentPool();
  return pool.listSessions().filter(
    (s) => s.mode === "coder" && s.activeRequests > 0,
  );
}

/**
 * Get a detailed dispatch report for a pipeline.
 */
export function getDispatchReport(pipelineId: string): {
  pipeline: PipelineState | undefined;
  coders: {
    ready: AgentSession[];
    active: AgentSession[];
  };
  taskBreakdown: {
    opus: number;
    sonnet: number;
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
} {
  const pipeline = getPipeline(pipelineId);
  const ready = getReadyCoders();
  const active = getActiveCoders();

  let opus = 0, sonnet = 0, pending = 0, running = 0, completed = 0, failed = 0;
  if (pipeline) {
    for (const dt of pipeline.tasks) {
      if (dt.assignedModel?.includes("opus")) opus++;
      else sonnet++;
      if (dt.status === "pending") pending++;
      else if (dt.status === "running") running++;
      else if (dt.status === "completed") completed++;
      else if (dt.status === "failed" || dt.status === "blocked") failed++;
    }
  }

  return {
    pipeline,
    coders: { ready, active },
    taskBreakdown: {
      opus,
      sonnet,
      total: pipeline?.tasksTotal ?? 0,
      pending,
      running,
      completed,
      failed,
    },
  };
}
