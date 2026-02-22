/**
 * Agent Modes — Role Definitions & System Prompts
 *
 * Each agent operates in a specific mode that determines its behaviour,
 * system prompt, and what kind of output it produces.
 *
 * Modes:
 *   - analyser  — Deep-scans the project: structure, deps, patterns, issues
 *   - planner   — Turns an analysis into a prioritised, actionable task list
 *   - coder     — Implements a single task from the plan as code changes
 *   - ask       — Interactive Q&A about the codebase (uses analysis context)
 *
 * The modes chain together in a pipeline:
 *   User Goal → Analyser → Planner → Coder(s)
 *
 * Every mode's output is a structured JSON envelope so the next stage
 * in the pipeline can parse it deterministically.
 */

// ────────────────────────────────────────────────────────────────────────────
// Mode definitions
// ────────────────────────────────────────────────────────────────────────────

/** All supported agent modes. */
export type AgentMode = "analyser" | "planner" | "coder" | "ask";

export const ALL_MODES: readonly AgentMode[] = [
  "analyser",
  "planner",
  "coder",
  "ask",
] as const;

/** Human-readable metadata for each mode. */
export interface ModeDefinition {
  mode: AgentMode;
  displayName: string;
  icon: string;
  description: string;
  /** The system prompt injected before user messages */
  systemPrompt: string;
  /** Expected JSON output schema description */
  outputSchema: string;
}

// ────────────────────────────────────────────────────────────────────────────
// System prompts — the core personality of each mode
// ────────────────────────────────────────────────────────────────────────────

const ANALYSER_SYSTEM_PROMPT = `You are the **Project Analyser** agent.

Your job is to perform a deep, comprehensive analysis of a software project.
You will receive the project's file tree, selected file contents, and a user goal.

Preferred output format — a JSON object like:

{
  "projectName": "<name>",
  "summary": "<overview>",
  "tech": {
    "languages": [...],
    "frameworks": [...],
    "buildTools": [...],
    "packageManager": "npm" | "yarn" | "pnpm"
  },
  "structure": {
    "entryPoints": [...],
    "keyDirectories": { ... },
    "configFiles": [...]
  },
  "patterns": {
    "architecture": "<description>",
    "conventions": [...],
    "codeStyle": "<notes>"
  },
  "dependencies": {
    "production": { ... },
    "dev": { ... }
  },
  "issues": [
    { "severity": "high" | "medium" | "low", "area": "<file/area>", "description": "<what>" }
  ],
  "strengths": [...],
  "relevantToGoal": "<how the project relates to the user's goal>"
}

Guidance:
- Be as thorough as you think the situation needs.
- Include any observations you find useful — bugs, missing tests, security concerns, strengths, whatever matters.
- The "relevantToGoal" field connects your analysis to what the user actually wants.
- Feel free to add extra fields or commentary if you think it helps.
- You may include explanations alongside or outside the JSON if context is useful.`;

const PLANNER_SYSTEM_PROMPT = `You are the **Project Planner** agent.

You receive a project analysis JSON (from the Analyser) and a user goal.
Your job is to break the goal down into a concrete, ordered list of tasks
that Coder agents can implement. You also act as a **Dispatcher** — deciding
task sizing, grouping, and which tasks can run in parallel.

Preferred output format — a JSON object like:

{
  "goal": "<the user's original goal>",
  "approach": "<strategy overview>",
  "tasks": [
    {
      "id": 1,
      "title": "<short title>",
      "description": "<detailed description of what to do>",
      "files": ["<file paths to create or modify>"],
      "dependencies": [],
      "priority": "critical" | "high" | "medium" | "low",
      "estimatedComplexity": "trivial" | "small" | "medium" | "large" | "epic",
      "acceptanceCriteria": ["<criterion 1>", ...]
    }
  ],
  "taskOrder": [1, 2, 3, ...],
  "parallelGroups": [[1, 2], [3], [4, 5]],
  "risks": [
    { "risk": "<description>", "mitigation": "<strategy>" }
  ],
  "estimatedTotalEffort": "<low/medium/high>"
}

Guidance:
- Size tasks however you see fit — a task can touch as many files as makes sense.
- Use "dependencies" to express ordering constraints between tasks.
- Use "parallelGroups" to show which tasks can be dispatched to coders simultaneously.
- Be specific in "files" — use real paths.
- "estimatedComplexity" drives model selection: large/epic tasks get more powerful models.
- Feel free to add extra fields, notes, or commentary if useful.`;

const CODER_SYSTEM_PROMPT = `You are the **Coder** agent.

You receive a task (from the Planner) plus project context/analysis.
Your job is to produce the code changes needed to implement that task.

Preferred output format — a JSON object like:

{
  "taskId": <number>,
  "taskTitle": "<title>",
  "status": "completed" | "partial" | "blocked",
  "changes": [
    {
      "file": "<relative file path>",
      "action": "create" | "modify" | "delete",
      "content": "<full file content for create, or null for delete>",
      "diff": "<unified diff patch for modify, or null>",
      "description": "<what this change does>"
    }
  ],
  "testFiles": [
    {
      "file": "<test file path>",
      "content": "<full test file content>"
    }
  ],
  "notes": "<any implementation notes, trade-offs, or follow-ups>",
  "acceptanceMet": {
    "<criterion>": true | false
  }
}

Guidance:
- Write production-quality code — complete implementations, not stubs.
- Follow the project's existing conventions when you can see them.
- Include tests if the task warrants them.
- If blocked, explain why in "notes" — the orchestrator will handle re-routing.
- You can include commentary or explanations alongside the JSON if helpful.
- Touch as many files as the task requires — there's no artificial limit.`;

const ASK_SYSTEM_PROMPT = `You are the **Ask** agent — a knowledgeable assistant for this project.

You receive project analysis context and a user question.
Answer based on the project's actual code and structure.

Preferred output format — a JSON object like:

{
  "question": "<the user's original question>",
  "answer": "<your detailed answer>",
  "relevantFiles": ["<file paths relevant to the answer>"],
  "codeExamples": [
    { "file": "<path>", "snippet": "<code snippet>", "explanation": "<why>" }
  ],
  "followUpSuggestions": ["<suggestion 1>", "<suggestion 2>"]
}

Guidance:
- Prefer grounding your answer in the actual codebase when possible.
- Reference specific files and line numbers where relevant.
- If you're unsure about something, say so and explain your reasoning.
- Feel free to include additional context, explanations, or alternative approaches.`;

// ────────────────────────────────────────────────────────────────────────────
// Mode registry
// ────────────────────────────────────────────────────────────────────────────

export const MODE_DEFINITIONS: ReadonlyMap<AgentMode, ModeDefinition> = new Map<AgentMode, ModeDefinition>([
  [
    "analyser",
    {
      mode: "analyser",
      displayName: "Analyser",
      icon: "🔍",
      description: "Deep-scans the project: structure, dependencies, patterns, issues",
      systemPrompt: ANALYSER_SYSTEM_PROMPT,
      outputSchema: "ProjectAnalysis JSON",
    },
  ],
  [
    "planner",
    {
      mode: "planner",
      displayName: "Planner",
      icon: "📋",
      description: "Creates prioritised, actionable task lists from analysis",
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      outputSchema: "TaskPlan JSON",
    },
  ],
  [
    "coder",
    {
      mode: "coder",
      displayName: "Coder",
      icon: "💻",
      description: "Implements a single task as production-ready code changes",
      systemPrompt: CODER_SYSTEM_PROMPT,
      outputSchema: "CodeChanges JSON",
    },
  ],
  [
    "ask",
    {
      mode: "ask",
      displayName: "Ask",
      icon: "❓",
      description: "Interactive Q&A about the codebase using analysis context",
      systemPrompt: ASK_SYSTEM_PROMPT,
      outputSchema: "Answer JSON",
    },
  ],
]);

/** Get the system prompt for a mode. */
export function getSystemPrompt(mode: AgentMode): string {
  const def = MODE_DEFINITIONS.get(mode);
  if (!def) throw new Error(`Unknown agent mode: ${mode}`);
  return def.systemPrompt;
}

/**
 * Get the system prompt for a mode, enhanced with an agent's skill fragments.
 * This is the preferred method when building prompts for a specific agent.
 */
export function getEnhancedSystemPrompt(mode: AgentMode, skillPromptFragment?: string): string {
  const base = getSystemPrompt(mode);
  if (!skillPromptFragment) return base;
  return base + skillPromptFragment;
}

/** Get the mode definition (or undefined). */
export function getModeDefinition(mode: AgentMode): ModeDefinition | undefined {
  return MODE_DEFINITIONS.get(mode);
}

/** Validate that a string is a valid AgentMode. */
export function isValidMode(value: string): value is AgentMode {
  return ALL_MODES.includes(value as AgentMode);
}

// ────────────────────────────────────────────────────────────────────────────
// Analysis & Plan output types (for type-safe pipeline handoff)
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectAnalysis {
  projectName: string;
  summary: string;
  tech: {
    languages: string[];
    frameworks: string[];
    buildTools: string[];
    packageManager: string;
  };
  structure: {
    entryPoints: string[];
    keyDirectories: Record<string, string>;
    configFiles: string[];
  };
  patterns: {
    architecture: string;
    conventions: string[];
    codeStyle: string;
  };
  dependencies: {
    production: Record<string, string>;
    dev: Record<string, string>;
  };
  issues: Array<{
    severity: "high" | "medium" | "low";
    area: string;
    description: string;
  }>;
  strengths: string[];
  relevantToGoal: string;
}

export interface PlannedTask {
  id: number;
  title: string;
  description: string;
  files: string[];
  dependencies: number[];
  priority: "critical" | "high" | "medium" | "low";
  estimatedComplexity: "trivial" | "small" | "medium" | "large" | "epic";
  acceptanceCriteria: string[];
}

export interface TaskPlan {
  goal: string;
  approach: string;
  tasks: PlannedTask[];
  taskOrder: number[];
  parallelGroups: number[][];
  risks: Array<{ risk: string; mitigation: string }>;
  estimatedTotalEffort: string;
}

export interface CodeChange {
  file: string;
  action: "create" | "modify" | "delete";
  content: string | null;
  diff: string | null;
  description: string;
}

export interface CoderOutput {
  taskId: number;
  taskTitle: string;
  status: "completed" | "partial" | "blocked";
  changes: CodeChange[];
  testFiles: Array<{ file: string; content: string }>;
  notes: string;
  acceptanceMet: Record<string, boolean>;
}

export interface AskOutput {
  question: string;
  answer: string;
  relevantFiles: string[];
  codeExamples: Array<{ file: string; snippet: string; explanation: string }>;
  followUpSuggestions: string[];
}
