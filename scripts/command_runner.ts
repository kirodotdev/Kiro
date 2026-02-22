/**
 * Command Runner — Auto-Authorize & Execute Agent Commands
 *
 * Provides a central system for agents to run terminal commands, with
 * a global "auto-authorize all" toggle and per-agent overrides.
 *
 * ── Modes ──────────────────────────────────────────────────────────────
 *
 *   "auto"    — All commands run immediately without user approval
 *   "prompt"  — Commands queue for manual approval (default)
 *   "deny"    — All commands are blocked (safety mode)
 *
 * ── Per-agent override ─────────────────────────────────────────────────
 *
 *   Each agent session can have its own autoRunCommands flag that
 *   overrides the global policy.  When set, the agent follows its
 *   own policy instead of the global one.
 *
 * ── Config (env vars) ─────────────────────────────────────────────────
 *
 *   COMMAND_AUTO_AUTHORIZE  — "true" to start in auto mode (default: "false")
 *   COMMAND_TIMEOUT_MS      — max execution time per command (default: 0 = no limit)
 *   COMMAND_SHELL           — shell to use (default: platform default)
 */

import { exec, type ExecOptions } from "node:child_process";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Global authorization mode for agent commands. */
export type CommandAuthMode = "auto" | "prompt" | "deny";

/** Per-agent override (undefined = follow global policy). */
export type AgentCommandPolicy = "auto" | "prompt" | "deny" | undefined;

/** Status of a command in the queue / history. */
export type CommandStatus =
  | "pending"     // Waiting for user approval (prompt mode)
  | "approved"    // Approved by user — about to execute
  | "running"     // Currently executing
  | "completed"   // Finished successfully (exit code 0)
  | "failed"      // Finished with non-zero exit code
  | "denied"      // Denied by user or deny policy
  | "timeout"     // Killed due to timeout
  | "cancelled";  // Cancelled before execution

/** A single command request from an agent. */
export interface CommandEntry {
  /** Unique command ID */
  id: string;
  /** Agent session that requested this command */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** The shell command to run */
  command: string;
  /** Why the agent wants to run this command */
  reason: string;
  /** Working directory (optional) */
  cwd?: string;
  /** Current status */
  status: CommandStatus;
  /** Authorization mode that was active when submitted */
  authMode: CommandAuthMode;
  /** Submitted timestamp */
  submittedAt: string;
  /** Started timestamp */
  startedAt?: string;
  /** Completed timestamp */
  completedAt?: string;
  /** stdout output */
  stdout?: string;
  /** stderr output */
  stderr?: string;
  /** Process exit code */
  exitCode?: number;
  /** Timeout duration used (ms, 0 = none) */
  timeoutMs: number;
}

/** Callback when a pending command needs user approval. */
export type ApprovalRequestListener = (entry: CommandEntry) => void;

// ────────────────────────────────────────────────────────────────────────────
// Global settings
// ────────────────────────────────────────────────────────────────────────────

const envAutoAuth = (process.env.COMMAND_AUTO_AUTHORIZE || "").toLowerCase();
let _globalMode: CommandAuthMode =
  envAutoAuth === "true" || envAutoAuth === "auto" ? "auto" : "prompt";
const _defaultTimeout =
  parseInt(process.env.COMMAND_TIMEOUT_MS || "0", 10) || 0;
const _shell = process.env.COMMAND_SHELL || undefined; // undefined = OS default

// ────────────────────────────────────────────────────────────────────────────
// Settings API
// ────────────────────────────────────────────────────────────────────────────

/** Get the current global authorization mode. */
export function getGlobalCommandMode(): CommandAuthMode {
  return _globalMode;
}

/** Set the global authorization mode. Returns the new mode. */
export function setGlobalCommandMode(mode: CommandAuthMode): CommandAuthMode {
  _globalMode = mode;
  console.log(`🔧 Command auth mode → ${mode.toUpperCase()}`);
  return _globalMode;
}

/** Convenience: enable auto-authorize for all commands globally. */
export function enableAutoAuthorizeAll(): CommandAuthMode {
  return setGlobalCommandMode("auto");
}

/** Convenience: disable auto-authorize (back to prompt mode). */
export function disableAutoAuthorizeAll(): CommandAuthMode {
  return setGlobalCommandMode("prompt");
}

/** Get the full settings snapshot. */
export function getCommandSettings(): {
  globalMode: CommandAuthMode;
  defaultTimeoutMs: number;
  shell: string | undefined;
  pendingCount: number;
  historyCount: number;
} {
  return {
    globalMode: _globalMode,
    defaultTimeoutMs: _defaultTimeout,
    shell: _shell,
    pendingCount: _pendingQueue.length,
    historyCount: _history.length,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-agent policies (stored on AgentSession externally, queried here)
// ────────────────────────────────────────────────────────────────────────────

// A simple map of agent-id → override policy (managed by the pool)
const _agentPolicies = new Map<string, AgentCommandPolicy>();

/** Set a per-agent command policy override. */
export function setAgentCommandPolicy(agentId: string, policy: AgentCommandPolicy): void {
  if (policy === undefined) {
    _agentPolicies.delete(agentId);
  } else {
    _agentPolicies.set(agentId, policy);
  }
}

/** Get the effective policy for an agent (per-agent override > global). */
export function getEffectivePolicy(agentId: string): CommandAuthMode {
  const override = _agentPolicies.get(agentId);
  return override ?? _globalMode;
}

/** Get all per-agent policies. */
export function listAgentPolicies(): Map<string, AgentCommandPolicy> {
  return new Map(_agentPolicies);
}

// ────────────────────────────────────────────────────────────────────────────
// Command queue & history
// ────────────────────────────────────────────────────────────────────────────

let _commandSeq = 0;
const _pendingQueue: CommandEntry[] = [];
const _history: CommandEntry[] = [];
const _approvalListeners = new Set<ApprovalRequestListener>();

/** Generate a unique command ID. */
function nextCommandId(): string {
  return `cmd-${++_commandSeq}-${Date.now().toString(36)}`;
}

/** Subscribe to pending-approval notifications (for SSE / dashboard). */
export function onApprovalRequest(listener: ApprovalRequestListener): () => void {
  _approvalListeners.add(listener);
  return () => { _approvalListeners.delete(listener); };
}

/** Get all pending commands awaiting approval. */
export function getPendingCommands(): CommandEntry[] {
  return [..._pendingQueue];
}

/** Get command history (all executed/denied/cancelled commands). */
export function getCommandHistory(): CommandEntry[] {
  return [..._history];
}

/** Get a single command by ID (pending or history). */
export function getCommand(id: string): CommandEntry | undefined {
  return _pendingQueue.find((c) => c.id === id) ??
    _history.find((c) => c.id === id);
}

// ────────────────────────────────────────────────────────────────────────────
// Command execution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Execute a shell command asynchronously and capture output.
 */
function execCommand(
  command: string,
  cwd?: string,
  timeoutMs?: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const opts: ExecOptions = {
      cwd: cwd || process.cwd(),
      shell: _shell ?? undefined,
      timeout: timeoutMs && timeoutMs > 0 ? timeoutMs : 0,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: { ...process.env },
    };

    const child = exec(command, opts, (err, stdout, stderr) => {
      const exitCode = err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0;
      resolve({
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        exitCode: typeof exitCode === "number" ? exitCode : 1,
      });
    });

    // Handle timeout kill signal
    child.on("error", () => {
      // Handled by the exec callback
    });
  });
}

/**
 * Move a command from pending to history.
 */
function finalizePending(id: string): CommandEntry | undefined {
  const idx = _pendingQueue.findIndex((c) => c.id === id);
  if (idx >= 0) {
    const [entry] = _pendingQueue.splice(idx, 1);
    _history.push(entry);
    return entry;
  }
  return undefined;
}

/**
 * Actually run a command entry and update its status/output.
 */
async function runCommandEntry(entry: CommandEntry): Promise<CommandEntry> {
  entry.status = "running";
  entry.startedAt = new Date().toISOString();

  console.log(`▶️  [${entry.agentName}] Running: ${entry.command}${entry.cwd ? ` (in ${entry.cwd})` : ""}`);

  try {
    const result = await execCommand(entry.command, entry.cwd, entry.timeoutMs);
    entry.stdout = result.stdout;
    entry.stderr = result.stderr;
    entry.exitCode = result.exitCode;
    entry.completedAt = new Date().toISOString();

    if (result.exitCode === 0) {
      entry.status = "completed";
      console.log(`✅ [${entry.agentName}] Command completed (exit 0)`);
    } else {
      entry.status = "failed";
      console.log(`❌ [${entry.agentName}] Command failed (exit ${result.exitCode})`);
    }
  } catch (err) {
    entry.status = "failed";
    entry.completedAt = new Date().toISOString();
    entry.stderr = err instanceof Error ? err.message : String(err);
    entry.exitCode = 1;
    console.error(`❌ [${entry.agentName}] Command error:`, err);
  }

  return entry;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API — submit, approve, deny, cancel
// ────────────────────────────────────────────────────────────────────────────

/**
 * Submit a command for execution.
 *
 * Depending on the effective policy for the agent:
 *   - "auto"   → runs immediately and returns the result
 *   - "prompt" → queues for approval and returns the pending entry
 *   - "deny"   → immediately denied
 */
export async function submitCommand(opts: {
  agentId: string;
  agentName?: string;
  command: string;
  reason?: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<CommandEntry> {
  const policy = getEffectivePolicy(opts.agentId);

  const entry: CommandEntry = {
    id: nextCommandId(),
    agentId: opts.agentId,
    agentName: opts.agentName || opts.agentId,
    command: opts.command,
    reason: opts.reason || "",
    cwd: opts.cwd,
    status: "pending",
    authMode: policy,
    submittedAt: new Date().toISOString(),
    timeoutMs: opts.timeoutMs ?? _defaultTimeout,
  };

  // ── Auto mode → run immediately ─────────────────────────────────────
  if (policy === "auto") {
    entry.status = "approved";
    _history.push(entry);
    await runCommandEntry(entry);
    return entry;
  }

  // ── Deny mode → reject immediately ─────────────────────────────────
  if (policy === "deny") {
    entry.status = "denied";
    entry.completedAt = new Date().toISOString();
    _history.push(entry);
    console.log(`🚫 [${entry.agentName}] Command denied by policy: ${entry.command}`);
    return entry;
  }

  // ── Prompt mode → queue for approval ────────────────────────────────
  _pendingQueue.push(entry);
  console.log(`⏸️  [${entry.agentName}] Command queued for approval: ${entry.command}`);

  // Notify listeners (dashboard, SSE)
  for (const listener of _approvalListeners) {
    try { listener(entry); } catch { /* ignore */ }
  }

  return entry;
}

/**
 * Approve a pending command and execute it.
 */
export async function approveCommand(id: string): Promise<CommandEntry | undefined> {
  const entry = _pendingQueue.find((c) => c.id === id);
  if (!entry || entry.status !== "pending") return undefined;

  finalizePending(id);
  entry.status = "approved";
  await runCommandEntry(entry);
  return entry;
}

/**
 * Approve ALL pending commands and execute them in parallel.
 */
export async function approveAllPending(): Promise<CommandEntry[]> {
  const pending = [..._pendingQueue];
  _pendingQueue.length = 0; // clear queue
  for (const entry of pending) {
    entry.status = "approved";
    _history.push(entry);
  }

  // Run all in parallel
  await Promise.allSettled(pending.map((entry) => runCommandEntry(entry)));
  return pending;
}

/**
 * Deny a pending command.
 */
export function denyCommand(id: string): CommandEntry | undefined {
  const entry = finalizePending(id);
  if (entry) {
    entry.status = "denied";
    entry.completedAt = new Date().toISOString();
    console.log(`🚫 Command denied: ${entry.command}`);
  }
  return entry;
}

/**
 * Deny ALL pending commands.
 */
export function denyAllPending(): CommandEntry[] {
  const pending = [..._pendingQueue];
  _pendingQueue.length = 0;
  const now = new Date().toISOString();
  for (const entry of pending) {
    entry.status = "denied";
    entry.completedAt = now;
    _history.push(entry);
  }
  return pending;
}

/**
 * Cancel a pending command (different from deny — implies user chose to
 * skip rather than explicitly forbid it).
 */
export function cancelCommand(id: string): CommandEntry | undefined {
  const entry = finalizePending(id);
  if (entry) {
    entry.status = "cancelled";
    entry.completedAt = new Date().toISOString();
  }
  return entry;
}
