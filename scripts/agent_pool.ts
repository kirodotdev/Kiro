/**
 * Agent Pool & Session Manager
 *
 * Manages concurrent AI agent sessions so multiple tabs / tools can
 * make requests simultaneously without overwhelming the upstream API.
 *
 * Features:
 *   - Bounded concurrency pool with configurable slot count
 *   - Per-agent session tracking (name, model, usage stats)
 *   - Automatic request queuing when all slots are busy
 *   - Fair round-robin scheduling across agents
 *   - Per-session and global usage reporting
 *
 * ── Config (env vars) ─────────────────────────────────────────────────
 *
 *   MAX_CONCURRENT_AGENTS  – max parallel in-flight API calls (default 5)
 *   MAX_QUEUE_SIZE         – max queued requests before 503 (default 50)
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface AgentSession {
  /** Unique session id (UUID or user-provided) */
  id: string;
  /** Human-readable name like "Code Review Agent" */
  name: string;
  /** When the session was created */
  createdAt: Date;
  /** Last time this session made a request */
  lastActiveAt: Date;
  /** Total requests completed */
  requestCount: number;
  /** Requests currently in-flight */
  activeRequests: number;
  /** Estimated input tokens used */
  totalInputTokens: number;
  /** Estimated output tokens used */
  totalOutputTokens: number;
  /** Preferred model override (optional) */
  model?: string;
  /** Preferred provider override (optional) */
  provider?: string;
  /** Agent operating mode */
  mode?: string;
  /** Pipeline this agent belongs to (if any) */
  pipelineId?: string;
  /** Current status description */
  statusMessage?: string;
  /** Assigned skill IDs (from agent_skills registry) */
  skills?: string[];
}

export interface QueuedRequest {
  /** Which agent session queued this */
  agentId: string;
  /** The work to execute once a slot opens */
  execute: () => Promise<void>;
  /** Resolve the outer promise (signals the HTTP handler to continue) */
  resolve: () => void;
  /** Reject the outer promise (signals an error to the HTTP handler) */
  reject: (err: Error) => void;
  /** When this request entered the queue */
  queuedAt: number;
}

export interface PoolStats {
  maxConcurrency: number;
  activeSlots: number;
  queueLength: number;
  maxQueueSize: number;
  totalProcessed: number;
  totalQueued: number;
  totalRejected: number;
  agents: AgentSession[];
}

// ────────────────────────────────────────────────────────────────────────────
// Activity Events — real-time tracking of what each agent is doing
// ────────────────────────────────────────────────────────────────────────────

export type ActivityStatus =
  | "created"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "delegated"
  | "received";

export interface ActivityEvent {
  /** Monotonic event ID */
  eventId: number;
  /** ISO timestamp */
  timestamp: string;
  /** Pipeline this event belongs to (if any) */
  pipelineId?: string;
  /** Agent session that produced this event */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** Agent's current mode */
  mode: string;
  /** What happened */
  status: ActivityStatus;
  /** Human-readable description */
  message: string;
  /** Optional structured payload (analysis summary, task list, etc.) */
  data?: unknown;
}

/** Callback for real-time event subscribers (SSE, websocket, etc.) */
export type ActivityListener = (event: ActivityEvent) => void;

// ────────────────────────────────────────────────────────────────────────────
// Agent Pool
// ────────────────────────────────────────────────────────────────────────────

export class AgentPool {
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private activeCount = 0;
  private readonly queue: QueuedRequest[] = [];
  private readonly sessions = new Map<string, AgentSession>();
  private totalProcessed = 0;
  private totalQueued = 0;
  private totalRejected = 0;

  // ── Activity event log + real-time subscribers ─────────────────────
  private activityLog: ActivityEvent[] = [];
  private activitySeq = 0;
  private readonly activityListeners = new Set<ActivityListener>();
  private static readonly MAX_LOG_SIZE =
    parseInt(process.env.MAX_ACTIVITY_LOG || "0", 10) || Infinity;

  constructor(
    maxConcurrency?: number,
    maxQueueSize?: number,
  ) {
    // 0 or unset = unlimited (Infinity)
    const envConc = parseInt(process.env.MAX_CONCURRENT_AGENTS || "0", 10);
    const envQueue = parseInt(process.env.MAX_QUEUE_SIZE || "0", 10);
    this.maxConcurrency = maxConcurrency ?? (envConc > 0 ? envConc : Infinity);
    this.maxQueueSize   = maxQueueSize   ?? (envQueue > 0 ? envQueue : Infinity);
  }

  // ── Activity events ─────────────────────────────────────────────────

  /** Emit an activity event (stored + broadcast to listeners). */
  emitActivity(
    agentId: string,
    status: ActivityStatus,
    message: string,
    opts?: { pipelineId?: string; mode?: string; data?: unknown },
  ): ActivityEvent {
    const session = this.sessions.get(agentId);
    const event: ActivityEvent = {
      eventId: ++this.activitySeq,
      timestamp: new Date().toISOString(),
      pipelineId: opts?.pipelineId ?? session?.pipelineId,
      agentId,
      agentName: session?.name ?? agentId,
      mode: opts?.mode ?? session?.mode ?? "unknown",
      status,
      message,
      data: opts?.data,
    };

    // Keep log bounded (Infinity = no trimming)
    this.activityLog.push(event);
    if (Number.isFinite(AgentPool.MAX_LOG_SIZE) && this.activityLog.length > AgentPool.MAX_LOG_SIZE) {
      this.activityLog = this.activityLog.slice(-AgentPool.MAX_LOG_SIZE);
    }

    // Update session status
    if (session) {
      session.statusMessage = `[${status}] ${message}`;
      session.lastActiveAt = new Date();
    }

    // Broadcast to subscribers
    for (const listener of this.activityListeners) {
      try { listener(event); } catch { /* ignore broken listeners */ }
    }

    // Console log with mode icon
    const icon = status === "completed" ? "✅"
      : status === "failed" ? "❌"
      : status === "running" ? "⚙️"
      : status === "delegated" ? "📤"
      : status === "received" ? "📥"
      : status === "waiting" ? "⏳"
      : "🔵";
    console.log(
      `${icon} [${event.mode}] ${event.agentName}: ${message}` +
      (event.pipelineId ? ` (pipeline: ${event.pipelineId})` : "")
    );

    return event;
  }

  /** Subscribe to real-time activity events. Returns an unsubscribe function. */
  onActivity(listener: ActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => { this.activityListeners.delete(listener); };
  }

  /** Get the full activity log (most recent MAX_LOG_SIZE events). */
  getActivityLog(): ActivityEvent[] {
    return [...this.activityLog];
  }

  /** Get activity events since a given eventId (for polling). */
  getActivitySince(sinceEventId: number): ActivityEvent[] {
    return this.activityLog.filter((e) => e.eventId > sinceEventId);
  }

  /** Get activity events for a specific pipeline. */
  getPipelineActivity(pipelineId: string): ActivityEvent[] {
    return this.activityLog.filter((e) => e.pipelineId === pipelineId);
  }

  // ── Session management ──────────────────────────────────────────────

  /** Create or retrieve an agent session. */
  getOrCreateSession(id: string, name?: string, model?: string, provider?: string): AgentSession {
    let session = this.sessions.get(id);
    if (!session) {
      session = {
        id,
        name: name || `Agent ${this.sessions.size + 1}`,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        requestCount: 0,
        activeRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        model,
        provider,
      };
      this.sessions.set(id, session);
      console.log(`🤖 New agent session: "${session.name}" (${id})`);
    } else {
      // Update mutable fields if provided
      if (name) session.name = name;
      if (model) session.model = model;
      if (provider) session.provider = provider;
    }
    return session;
  }

  /** Get a session by ID (or undefined). */
  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  /** Remove a session. */
  removeSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      console.log(`🗑️  Removed agent session: "${session.name}" (${id})`);
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  /** List all active sessions. */
  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  // ── Concurrency pool ───────────────────────────────────────────────

  /**
   * Submit work to the pool.  If a slot is available it runs immediately;
   * otherwise it's queued.  Returns a promise that resolves when the work
   * finishes (or rejects if the queue is full / work throws).
   */
  async submit(agentId: string, work: () => Promise<void>): Promise<void> {
    const session = this.sessions.get(agentId);

    // Fast path — slot available
    if (this.activeCount < this.maxConcurrency) {
      return this.runSlot(agentId, work);
    }

    // Queue path — all slots busy
    if (this.queue.length >= this.maxQueueSize) {
      this.totalRejected++;
      throw new Error(
        `Queue full (${this.maxQueueSize} pending). Try again later.`
      );
    }

    this.totalQueued++;

    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        agentId,
        execute: work,
        resolve,
        reject,
        queuedAt: Date.now(),
      });

      if (session) {
        console.log(
          `⏳ Queued request for "${session.name}" ` +
          `(queue: ${this.queue.length}/${this.maxQueueSize}, ` +
          `active: ${this.activeCount}/${this.maxConcurrency})`
        );
      }
    });
  }

  /** Run work in a concurrency slot, then drain the queue. */
  private async runSlot(agentId: string, work: () => Promise<void>): Promise<void> {
    this.activeCount++;
    const session = this.sessions.get(agentId);
    if (session) {
      session.activeRequests++;
      session.lastActiveAt = new Date();
    }

    try {
      await work();
      this.totalProcessed++;
      if (session) {
        session.requestCount++;
      }
    } finally {
      this.activeCount--;
      if (session) {
        session.activeRequests = Math.max(0, session.activeRequests - 1);
      }
      this.drain();
    }
  }

  /** Pull the next queued request and run it (FIFO / fair). */
  private drain(): void {
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrency) {
      return;
    }

    const next = this.queue.shift()!;

    // Run in a slot — resolve/reject the outer promise
    this.runSlot(next.agentId, next.execute)
      .then(() => next.resolve())
      .catch((err) => next.reject(err));
  }

  // ── Usage tracking helpers ──────────────────────────────────────────

  /** Record token usage for an agent session. */
  recordUsage(agentId: string, inputTokens: number, outputTokens: number): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.totalInputTokens += inputTokens;
      session.totalOutputTokens += outputTokens;
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────

  /** Get a snapshot of pool + session stats. */
  getStats(): PoolStats {
    return {
      maxConcurrency: this.maxConcurrency,
      activeSlots: this.activeCount,
      queueLength: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      totalProcessed: this.totalProcessed,
      totalQueued: this.totalQueued,
      totalRejected: this.totalRejected,
      agents: this.listSessions(),
    };
  }

  /** Pretty-print pool status to console. */
  printStatus(): void {
    const stats = this.getStats();
    console.log(`\n┌─── Agent Pool Status ───────────────────────────────┐`);
    console.log(`│  Slots:     ${stats.activeSlots}/${stats.maxConcurrency} active`);
    console.log(`│  Queue:     ${stats.queueLength}/${stats.maxQueueSize} pending`);
    console.log(`│  Processed: ${stats.totalProcessed} total`);
    console.log(`│  Agents:    ${stats.agents.length} sessions`);
    console.log(`├─────────────────────────────────────────────────────┤`);
    for (const agent of stats.agents) {
      const active = agent.activeRequests > 0 ? " 🟢" : " ⚪";
      console.log(
        `│  ${active} ${agent.name.padEnd(20)} ` +
        `reqs: ${String(agent.requestCount).padStart(4)}  ` +
        `in: ${String(agent.totalInputTokens).padStart(7)}  ` +
        `out: ${String(agent.totalOutputTokens).padStart(7)}`
      );
    }
    console.log(`└─────────────────────────────────────────────────────┘\n`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton (shared by server.ts)
// ────────────────────────────────────────────────────────────────────────────

let _pool: AgentPool | null = null;

/** Get the global agent pool (created on first call). */
export function getAgentPool(): AgentPool {
  if (!_pool) {
    _pool = new AgentPool();
  }
  return _pool;
}

/** Generate a random session ID. */
export function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "agent-";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** Generate a random pipeline ID. */
export function generatePipelineId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "pipe-";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Re-export ProviderName from ai_provider for convenience
export type { ProviderName } from "./ai_provider.js";
