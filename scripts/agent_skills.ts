/**
 * Agent Skills — Composable Capability System
 *
 * Skills are composable traits that define what an agent *can do*.
 * While **modes** (analyser, planner, coder, ask) describe an agent's
 * current *role* in a pipeline, **skills** describe the agent's
 * *capabilities* — they shape system prompts, unlock tool access, and
 * let the orchestrator match the right agent to the right task.
 *
 * ── Architecture ──────────────────────────────────────────────────────
 *
 *   Skill Registry  →  per-agent skill list  →  prompt injection
 *                                             →  capability gating
 *                                             →  task matching
 *
 * ── Categories ────────────────────────────────────────────────────────
 *
 *   code           Core software development
 *   architecture   System & API design
 *   devops         Commands, Git, CI/CD, deployment
 *   memory         RAM cache & VRAM GPU processing
 *   collaboration  Multi-agent coordination & desktop sharing
 *   intelligence   AI model selection, prompt engineering, cost control
 *   analysis       Project scanning, planning, security
 *   specialisation Domain expertise (frontend, backend, data, etc.)
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Skill category grouping. */
export type SkillCategory =
  | "code"
  | "architecture"
  | "devops"
  | "memory"
  | "collaboration"
  | "intelligence"
  | "analysis"
  | "specialisation";

/** A single skill definition in the registry. */
export interface SkillDefinition {
  /** Machine identifier, e.g. "code_generation" */
  id: string;
  /** Human-readable label */
  displayName: string;
  /** Emoji icon */
  icon: string;
  /** Which category this skill belongs to */
  category: SkillCategory;
  /** Short description shown in the dashboard / API */
  description: string;
  /**
   * Additional system-prompt text injected when this skill is active.
   * The orchestrator appends these to the base mode prompt.
   */
  promptFragment: string;
  /**
   * System modules this skill requires / unlocks.
   * The runtime can check these to auto-enable features for the agent.
   *   e.g. "ram_cache", "vram_manager", "command_runner", "desktop_share"
   */
  requiredCapabilities: string[];
  /**
   * Which agent modes this skill is most useful with.
   * Empty array = compatible with all modes.
   */
  compatibleModes: string[];
  /**
   * Tags for fine-grained task → skill matching by the dispatcher.
   */
  tags: string[];
}

/** Lightweight view of an agent's skills (for API responses). */
export interface AgentSkillProfile {
  agentId: string;
  skills: string[];
  categories: SkillCategory[];
  totalSkills: number;
  capabilitySet: string[];
}

/** Score describing how well an agent matches a task. */
export interface SkillMatch {
  agentId: string;
  score: number;         // 0-100
  matchedSkills: string[];
  missingSkills: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Skill Registry — all available skills
// ────────────────────────────────────────────────────────────────────────────

export const SKILL_REGISTRY: ReadonlyMap<string, SkillDefinition> = new Map<string, SkillDefinition>([

  // ── Code ────────────────────────────────────────────────────────────────

  ["code_generation", {
    id: "code_generation",
    displayName: "Code Generation",
    icon: "✍️",
    category: "code",
    description: "Write new production-quality code from specs, descriptions, or user goals",
    promptFragment: `You have the **Code Generation** skill. Write complete, production-ready implementations — never stubs or TODOs. Follow the project's existing conventions. Produce clean, well-structured code with proper error handling.`,
    requiredCapabilities: [],
    compatibleModes: ["coder"],
    tags: ["write", "implement", "create", "build", "develop"],
  }],

  ["code_review", {
    id: "code_review",
    displayName: "Code Review",
    icon: "🔎",
    category: "code",
    description: "Review code for bugs, quality, maintainability, and best practices",
    promptFragment: `You have the **Code Review** skill. Analyse code for correctness, edge cases, performance pitfalls, naming, readability, and adherence to project conventions. Provide actionable feedback with severity ratings.`,
    requiredCapabilities: [],
    compatibleModes: ["analyser", "ask"],
    tags: ["review", "audit", "quality", "lint", "check"],
  }],

  ["refactoring", {
    id: "refactoring",
    displayName: "Refactoring",
    icon: "♻️",
    category: "code",
    description: "Restructure and improve existing code without changing behaviour",
    promptFragment: `You have the **Refactoring** skill. Restructure code for clarity, DRY, and maintainability while preserving its external behaviour. Explain each refactoring step and why it improves the code.`,
    requiredCapabilities: [],
    compatibleModes: ["coder", "analyser"],
    tags: ["refactor", "clean", "restructure", "improve", "simplify"],
  }],

  ["debugging", {
    id: "debugging",
    displayName: "Debugging",
    icon: "🐛",
    category: "code",
    description: "Diagnose and fix bugs, errors, crashes, and unexpected behaviour",
    promptFragment: `You have the **Debugging** skill. Systematically trace issues through the call chain. Identify root causes before proposing fixes. Consider edge cases and concurrent execution paths.`,
    requiredCapabilities: ["command_runner"],
    compatibleModes: ["coder", "analyser", "ask"],
    tags: ["debug", "fix", "error", "crash", "trace", "diagnose"],
  }],

  ["testing", {
    id: "testing",
    displayName: "Testing",
    icon: "🧪",
    category: "code",
    description: "Write and maintain unit, integration, and end-to-end test suites",
    promptFragment: `You have the **Testing** skill. Write thorough test suites covering happy paths, edge cases, error conditions, and boundary values. Use the project's existing test framework and conventions. Aim for high coverage without testing implementation details.`,
    requiredCapabilities: ["command_runner"],
    compatibleModes: ["coder"],
    tags: ["test", "jest", "spec", "coverage", "assert", "unit", "integration", "e2e"],
  }],

  ["documentation", {
    id: "documentation",
    displayName: "Documentation",
    icon: "📝",
    category: "code",
    description: "Write READE docs, JSDoc/TSDoc comments, architecture decision records",
    promptFragment: `You have the **Documentation** skill. Write clear, concise documentation targeting the intended audience. Include usage examples, parameter descriptions, and gotchas. Keep docs close to the code they describe.`,
    requiredCapabilities: [],
    compatibleModes: ["coder", "ask"],
    tags: ["docs", "readme", "jsdoc", "comment", "explain", "guide"],
  }],

  // ── Architecture ────────────────────────────────────────────────────────

  ["architecture_design", {
    id: "architecture_design",
    displayName: "Architecture Design",
    icon: "🏗️",
    category: "architecture",
    description: "Design system architecture, module boundaries, data flow, and scalability patterns",
    promptFragment: `You have the **Architecture Design** skill. Think in terms of modules, interfaces, data flow, and separation of concerns. Consider scalability, testability, and operational requirements. Produce architecture diagrams (as structured text) when helpful.`,
    requiredCapabilities: [],
    compatibleModes: ["analyser", "planner"],
    tags: ["architecture", "design", "system", "pattern", "module", "boundary"],
  }],

  ["api_design", {
    id: "api_design",
    displayName: "API Design",
    icon: "🔌",
    category: "architecture",
    description: "Design REST, GraphQL, or RPC APIs — routes, schemas, versioning",
    promptFragment: `You have the **API Design** skill. Design consistent, intuitive APIs following REST best practices. Consider authentication, pagination, error responses, versioning, and documentation. Produce OpenAPI-style descriptions when useful.`,
    requiredCapabilities: [],
    compatibleModes: ["planner", "coder"],
    tags: ["api", "rest", "graphql", "route", "endpoint", "schema"],
  }],

  ["database_design", {
    id: "database_design",
    displayName: "Database Design",
    icon: "🗄️",
    category: "architecture",
    description: "Design database schemas, queries, indexes, and migration strategies",
    promptFragment: `You have the **Database Design** skill. Design normalised schemas with proper indexing. Consider query patterns, data integrity, migration strategies, and performance implications. Support both SQL and NoSQL approaches.`,
    requiredCapabilities: [],
    compatibleModes: ["planner", "coder", "analyser"],
    tags: ["database", "schema", "sql", "nosql", "migration", "query", "index"],
  }],

  ["performance_optimization", {
    id: "performance_optimization",
    displayName: "Performance Optimization",
    icon: "⚡",
    category: "architecture",
    description: "Profile, benchmark, and optimise code/system performance",
    promptFragment: `You have the **Performance Optimization** skill. Profile before optimising. Measure actual bottlenecks rather than guessing. Consider algorithmic complexity, memory allocation, I/O patterns, caching, and concurrency. Always verify improvements with benchmarks.`,
    requiredCapabilities: ["command_runner", "ram_cache"],
    compatibleModes: ["analyser", "coder"],
    tags: ["performance", "speed", "optimize", "benchmark", "profile", "latency", "throughput"],
  }],

  // ── DevOps ──────────────────────────────────────────────────────────────

  ["command_execution", {
    id: "command_execution",
    displayName: "Command Execution",
    icon: "⌨️",
    category: "devops",
    description: "Run shell commands — builds, scripts, tools, system operations",
    promptFragment: `You have the **Command Execution** skill. You can run terminal commands via the command runner. Prefer precise, targeted commands. Validate outputs and handle non-zero exit codes. Chain commands when it makes sense.`,
    requiredCapabilities: ["command_runner"],
    compatibleModes: ["coder", "analyser"],
    tags: ["command", "shell", "terminal", "exec", "run", "script", "bash"],
  }],

  ["git_operations", {
    id: "git_operations",
    displayName: "Git Operations",
    icon: "🔀",
    category: "devops",
    description: "Git workflow — branching, committing, merging, rebasing, conflict resolution",
    promptFragment: `You have the **Git Operations** skill. Manage Git workflows: branch creation, clean commits with descriptive messages, merging strategies, rebase coordination, and conflict resolution. Follow the project's branching model.`,
    requiredCapabilities: ["command_runner"],
    compatibleModes: ["coder", "planner"],
    tags: ["git", "branch", "commit", "merge", "rebase", "conflict", "pr"],
  }],

  ["ci_cd", {
    id: "ci_cd",
    displayName: "CI/CD Pipeline",
    icon: "🔄",
    category: "devops",
    description: "Configure and maintain CI/CD pipelines — GitHub Actions, build automation",
    promptFragment: `You have the **CI/CD Pipeline** skill. Configure build, test, and deployment pipelines. Write GitHub Actions workflows, Dockerfiles, and build scripts. Optimise for fast feedback and reliable deployments.`,
    requiredCapabilities: ["command_runner"],
    compatibleModes: ["coder", "planner"],
    tags: ["ci", "cd", "pipeline", "github-actions", "docker", "deploy", "build"],
  }],

  ["dependency_management", {
    id: "dependency_management",
    displayName: "Dependency Management",
    icon: "📦",
    category: "devops",
    description: "Manage packages, versions, lock files, and supply chain security",
    promptFragment: `You have the **Dependency Management** skill. Manage package.json, lock files, and version resolution. Identify outdated or vulnerable dependencies. Prefer minimal, well-maintained packages.`,
    requiredCapabilities: ["command_runner"],
    compatibleModes: ["analyser", "coder"],
    tags: ["npm", "package", "dependency", "version", "upgrade", "audit", "lock"],
  }],

  // ── Memory ──────────────────────────────────────────────────────────────

  ["ram_caching", {
    id: "ram_caching",
    displayName: "RAM Cache Management",
    icon: "💾",
    category: "memory",
    description: "Leverage RAM cache for zero-latency file I/O, response caching, and write-behind",
    promptFragment: `You have the **RAM Cache Management** skill. All workspace files are pre-loaded into RAM. You can read/write cached files with zero disk I/O, cache JSON API responses for instant re-serving, and use the buffer pool for temporary allocations. Monitor memory usage against the ceiling.`,
    requiredCapabilities: ["ram_cache"],
    compatibleModes: ["coder", "analyser"],
    tags: ["ram", "cache", "memory", "buffer", "preload", "write-behind"],
  }],

  ["vram_processing", {
    id: "vram_processing",
    displayName: "VRAM GPU Processing",
    icon: "🎮",
    category: "memory",
    description: "Allocate GPU VRAM buffers for large-file processing — parse, search, hash, transform",
    promptFragment: `You have the **VRAM Processing** skill. You can allocate GPU VRAM buffers for large files, submit processing tasks (parse, search, hash, transform, compress) that run on GPU-tier memory, pin hot data to VRAM, and manage the 3-tier cache hierarchy (VRAM → RAM → Disk).`,
    requiredCapabilities: ["vram_manager"],
    compatibleModes: ["coder", "analyser"],
    tags: ["vram", "gpu", "buffer", "process", "parse", "search", "hash", "transform"],
  }],

  ["memory_optimization", {
    id: "memory_optimization",
    displayName: "Memory Optimization",
    icon: "📊",
    category: "memory",
    description: "Monitor and tune memory allocation across RAM and VRAM tiers",
    promptFragment: `You have the **Memory Optimization** skill. Monitor RAM and VRAM usage, adjust ceilings, manage eviction policies (LRU/LFU/size), promote hot data between tiers, and ensure the system stays within resource limits. Use stats endpoints to guide decisions.`,
    requiredCapabilities: ["ram_cache", "vram_manager"],
    compatibleModes: ["analyser"],
    tags: ["memory", "optimize", "evict", "tier", "ceiling", "allocate"],
  }],

  // ── Collaboration ───────────────────────────────────────────────────────

  ["delegation", {
    id: "delegation",
    displayName: "Task Delegation",
    icon: "📤",
    category: "collaboration",
    description: "Delegate sub-tasks to other agents with proper context and instructions",
    promptFragment: `You have the **Task Delegation** skill. When a task is too broad or benefits from specialisation, break it down and delegate sub-tasks to other agents. Provide clear context, acceptance criteria, and expected deliverables for each delegation.`,
    requiredCapabilities: [],
    compatibleModes: ["planner"],
    tags: ["delegate", "assign", "distribute", "dispatch"],
  }],

  ["parallel_coordination", {
    id: "parallel_coordination",
    displayName: "Parallel Coordination",
    icon: "🔗",
    category: "collaboration",
    description: "Coordinate multiple agents working in parallel on related tasks",
    promptFragment: `You have the **Parallel Coordination** skill. Manage dependency graphs between parallel tasks. Ensure agents don't create conflicting changes. Merge results and resolve integration issues when parallel work completes.`,
    requiredCapabilities: [],
    compatibleModes: ["planner"],
    tags: ["parallel", "concurrent", "coordinate", "merge", "integrate", "sync"],
  }],

  ["pipeline_orchestration", {
    id: "pipeline_orchestration",
    displayName: "Pipeline Orchestration",
    icon: "🎛️",
    category: "collaboration",
    description: "Run full Analyser → Planner → Coder pipelines end-to-end",
    promptFragment: `You have the **Pipeline Orchestration** skill. You can launch and monitor full analysis-to-code pipelines. Select appropriate models based on task complexity (Opus for hard tasks, Sonnet for simpler ones). Track pipeline progress through activity events.`,
    requiredCapabilities: [],
    compatibleModes: ["planner"],
    tags: ["pipeline", "orchestrate", "workflow", "chain", "automate"],
  }],

  ["desktop_sharing", {
    id: "desktop_sharing",
    displayName: "Desktop Sharing",
    icon: "🖥️",
    category: "collaboration",
    description: "WebRTC screen sharing, room management, and real-time chat",
    promptFragment: `You have the **Desktop Sharing** skill. You can create/join screen-sharing rooms via WebRTC, relay signalling messages between peers, manage active rooms, and facilitate real-time chat during collaboration sessions.`,
    requiredCapabilities: ["desktop_share"],
    compatibleModes: [],
    tags: ["desktop", "screen", "share", "webrtc", "collaborate", "remote", "chat"],
  }],

  // ── Intelligence ────────────────────────────────────────────────────────

  ["multi_model", {
    id: "multi_model",
    displayName: "Multi-Model Selection",
    icon: "🧠",
    category: "intelligence",
    description: "Choose the optimal AI model/provider per task — 10 providers, 37+ models",
    promptFragment: `You have the **Multi-Model Selection** skill. Select the most appropriate model for each task based on complexity, cost, and latency requirements. Route complex reasoning to Opus, fast tasks to Sonnet, and specialised tasks to domain-specific models. You have access to 10 providers and 37+ models.`,
    requiredCapabilities: [],
    compatibleModes: ["planner"],
    tags: ["model", "provider", "select", "route", "opus", "sonnet", "bedrock"],
  }],

  ["prompt_engineering", {
    id: "prompt_engineering",
    displayName: "Prompt Engineering",
    icon: "🎯",
    category: "intelligence",
    description: "Craft effective prompts, system messages, and context windows",
    promptFragment: `You have the **Prompt Engineering** skill. Craft precise, effective prompts that maximise model output quality. Structure context efficiently within token limits. Use few-shot examples, chain-of-thought, and structured output formats strategically.`,
    requiredCapabilities: [],
    compatibleModes: ["planner", "ask"],
    tags: ["prompt", "context", "tokens", "system-message", "few-shot"],
  }],

  ["cost_optimization", {
    id: "cost_optimization",
    displayName: "Cost Optimization",
    icon: "💰",
    category: "intelligence",
    description: "Minimise API costs through smart model selection and token management",
    promptFragment: `You have the **Cost Optimization** skill. Balance quality vs. cost by choosing the cheapest model that meets quality requirements. Monitor token usage per agent and per pipeline. Use cached responses when possible to avoid redundant API calls.`,
    requiredCapabilities: [],
    compatibleModes: ["planner", "analyser"],
    tags: ["cost", "budget", "tokens", "usage", "efficient", "cheap"],
  }],

  // ── Analysis ────────────────────────────────────────────────────────────

  ["project_analysis", {
    id: "project_analysis",
    displayName: "Project Analysis",
    icon: "🔍",
    category: "analysis",
    description: "Deep-scan project structure, dependencies, patterns, tech stack, and issues",
    promptFragment: `You have the **Project Analysis** skill. Perform exhaustive project scans: directory structure, entry points, frameworks, build tools, code patterns, architectural style, dependencies, and potential issues. Produce structured analysis reports.`,
    requiredCapabilities: [],
    compatibleModes: ["analyser"],
    tags: ["analyse", "scan", "structure", "pattern", "inspect"],
  }],

  ["task_planning", {
    id: "task_planning",
    displayName: "Task Planning",
    icon: "📋",
    category: "analysis",
    description: "Break goals into prioritised, sized, dependency-ordered task lists",
    promptFragment: `You have the **Task Planning** skill. Decompose high-level goals into concrete, actionable tasks with clear acceptance criteria. Size tasks, identify dependencies, create parallel execution groups, and assign priority levels. Produce structured task plans.`,
    requiredCapabilities: [],
    compatibleModes: ["planner"],
    tags: ["plan", "task", "priority", "breakdown", "decompose", "estimate"],
  }],

  ["security_audit", {
    id: "security_audit",
    displayName: "Security Audit",
    icon: "🛡️",
    category: "analysis",
    description: "Find security vulnerabilities, injection risks, auth issues, and data leaks",
    promptFragment: `You have the **Security Audit** skill. Scan for OWASP Top 10 vulnerabilities, injection risks, authentication/authorization flaws, data exposure, insecure dependencies, and configuration issues. Rate findings by severity and provide remediation guidance.`,
    requiredCapabilities: [],
    compatibleModes: ["analyser", "ask"],
    tags: ["security", "audit", "vulnerability", "injection", "auth", "owasp"],
  }],

  ["code_search", {
    id: "code_search",
    displayName: "Code Search & Navigation",
    icon: "🔦",
    category: "analysis",
    description: "Search, navigate, and trace through large codebases efficiently",
    promptFragment: `You have the **Code Search** skill. Efficiently navigate large codebases — grep across files, trace call chains, find symbol usages, identify dead code, and map module relationships. Use RAM-cached files for instant search.`,
    requiredCapabilities: ["ram_cache"],
    compatibleModes: ["analyser", "ask"],
    tags: ["search", "find", "grep", "navigate", "trace", "usage"],
  }],

  // ── Specialisation ─────────────────────────────────────────────────────

  ["frontend", {
    id: "frontend",
    displayName: "Frontend Development",
    icon: "🎨",
    category: "specialisation",
    description: "HTML, CSS, JavaScript, React/Vue/Svelte, responsive design, accessibility",
    promptFragment: `You have the **Frontend Development** specialisation. Expert in HTML5, CSS3, JavaScript/TypeScript, modern frameworks (React, Vue, Svelte), responsive design, accessibility (WCAG), browser APIs, and frontend build tools. Write semantic, performant UI code.`,
    requiredCapabilities: [],
    compatibleModes: ["coder", "analyser"],
    tags: ["frontend", "html", "css", "react", "vue", "svelte", "ui", "responsive", "a11y"],
  }],

  ["backend", {
    id: "backend",
    displayName: "Backend Development",
    icon: "⚙️",
    category: "specialisation",
    description: "Node.js, APIs, databases, auth, server architecture, microservices",
    promptFragment: `You have the **Backend Development** specialisation. Expert in Node.js, server architecture, REST/GraphQL APIs, database design, authentication, authorisation, caching, message queues, and microservices. Write scalable, secure backend code.`,
    requiredCapabilities: [],
    compatibleModes: ["coder", "analyser"],
    tags: ["backend", "server", "node", "api", "database", "auth", "microservice"],
  }],

  ["fullstack", {
    id: "fullstack",
    displayName: "Full-Stack Development",
    icon: "🌐",
    category: "specialisation",
    description: "End-to-end development spanning frontend, backend, and infrastructure",
    promptFragment: `You have the **Full-Stack Development** specialisation. Comfortable across the entire stack — frontend UI, backend services, databases, DevOps, and deployment. Understand how all layers interact and design cohesive end-to-end solutions.`,
    requiredCapabilities: [],
    compatibleModes: ["coder", "planner", "analyser"],
    tags: ["fullstack", "full-stack", "end-to-end", "stack"],
  }],

  ["devtools", {
    id: "devtools",
    displayName: "Developer Tooling",
    icon: "🛠️",
    category: "specialisation",
    description: "Build tools, linters, bundlers, formatters, IDE extensions, CLI tools",
    promptFragment: `You have the **Developer Tooling** specialisation. Expert in build systems (webpack, vite, esbuild, turbo), linters (ESLint, Prettier), test runners (Jest, Vitest), CLI frameworks, and IDE extension development. Create tools that improve developer productivity.`,
    requiredCapabilities: ["command_runner"],
    compatibleModes: ["coder", "analyser"],
    tags: ["tools", "lint", "build", "bundle", "formatter", "cli", "vscode", "ide"],
  }],

  ["data_engineering", {
    id: "data_engineering",
    displayName: "Data Engineering",
    icon: "📈",
    category: "specialisation",
    description: "Data pipelines, ETL, transformations, streaming, analytics",
    promptFragment: `You have the **Data Engineering** specialisation. Expert in data pipelines, ETL processes, stream processing, data transformations, analytics, and working with large datasets. Leverage VRAM buffers for processing large files efficiently.`,
    requiredCapabilities: ["vram_manager"],
    compatibleModes: ["coder", "analyser"],
    tags: ["data", "etl", "pipeline", "transform", "stream", "analytics", "csv", "json"],
  }],
]);

// ────────────────────────────────────────────────────────────────────────────
// Preset Skill Profiles — common agent configurations
// ────────────────────────────────────────────────────────────────────────────

export interface SkillPreset {
  id: string;
  displayName: string;
  icon: string;
  description: string;
  skills: string[];
}

export const SKILL_PRESETS: ReadonlyMap<string, SkillPreset> = new Map<string, SkillPreset>([
  ["lead_developer", {
    id: "lead_developer",
    displayName: "Lead Developer",
    icon: "👑",
    description: "Full-stack expert with architecture, code review, and team coordination",
    skills: [
      "code_generation", "code_review", "refactoring", "architecture_design",
      "api_design", "delegation", "pipeline_orchestration", "fullstack",
    ],
  }],

  ["code_machine", {
    id: "code_machine",
    displayName: "Code Machine",
    icon: "🤖",
    description: "Pure implementation agent — writes, tests, and debugs code at high velocity",
    skills: [
      "code_generation", "debugging", "testing", "refactoring",
      "command_execution", "git_operations", "fullstack",
    ],
  }],

  ["architect", {
    id: "architect",
    displayName: "Architect",
    icon: "🏛️",
    description: "System designer focused on structure, APIs, performance, and scalability",
    skills: [
      "architecture_design", "api_design", "database_design",
      "performance_optimization", "project_analysis", "security_audit",
    ],
  }],

  ["devops_engineer", {
    id: "devops_engineer",
    displayName: "DevOps Engineer",
    icon: "🚀",
    description: "Infrastructure, CI/CD, deployment, and system reliability",
    skills: [
      "command_execution", "git_operations", "ci_cd",
      "dependency_management", "performance_optimization", "ram_caching",
    ],
  }],

  ["analyst", {
    id: "analyst",
    displayName: "Analyst",
    icon: "🔬",
    description: "Deep project analysis, security audits, and codebase navigation",
    skills: [
      "project_analysis", "security_audit", "code_search", "code_review",
      "documentation", "cost_optimization",
    ],
  }],

  ["orchestrator", {
    id: "orchestrator",
    displayName: "Orchestrator",
    icon: "🎛️",
    description: "Pipeline manager — plans, delegates, coordinates parallel agents",
    skills: [
      "task_planning", "delegation", "parallel_coordination",
      "pipeline_orchestration", "multi_model", "cost_optimization",
    ],
  }],

  ["performance_specialist", {
    id: "performance_specialist",
    displayName: "Performance Specialist",
    icon: "⚡",
    description: "Memory optimization, GPU processing, and system performance tuning",
    skills: [
      "performance_optimization", "ram_caching", "vram_processing",
      "memory_optimization", "code_search", "command_execution",
    ],
  }],

  ["frontend_specialist", {
    id: "frontend_specialist",
    displayName: "Frontend Specialist",
    icon: "🎨",
    description: "UI/UX implementation, responsive design, accessibility",
    skills: [
      "code_generation", "frontend", "testing", "debugging",
      "code_review", "documentation",
    ],
  }],

  ["backend_specialist", {
    id: "backend_specialist",
    displayName: "Backend Specialist",
    icon: "⚙️",
    description: "APIs, databases, server architecture, microservices",
    skills: [
      "code_generation", "backend", "api_design", "database_design",
      "testing", "debugging", "command_execution",
    ],
  }],

  ["data_specialist", {
    id: "data_specialist",
    displayName: "Data Specialist",
    icon: "📈",
    description: "Large-file processing, data pipelines, GPU-accelerated transforms",
    skills: [
      "data_engineering", "vram_processing", "memory_optimization",
      "code_generation", "command_execution",
    ],
  }],
]);

// ────────────────────────────────────────────────────────────────────────────
// Per-agent skill storage (keyed by agent session ID)
// ────────────────────────────────────────────────────────────────────────────

const agentSkills = new Map<string, Set<string>>();

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/** Assign one or more skills to an agent. Returns the updated skill list. */
export function assignSkills(agentId: string, skillIds: string[]): string[] {
  let skills = agentSkills.get(agentId);
  if (!skills) {
    skills = new Set();
    agentSkills.set(agentId, skills);
  }
  for (const id of skillIds) {
    if (SKILL_REGISTRY.has(id)) {
      skills.add(id);
    } else {
      console.warn(`⚠️  Unknown skill "${id}" — skipped`);
    }
  }
  return [...skills];
}

/** Remove one or more skills from an agent. Returns the updated skill list. */
export function removeSkills(agentId: string, skillIds: string[]): string[] {
  const skills = agentSkills.get(agentId);
  if (!skills) return [];
  for (const id of skillIds) {
    skills.delete(id);
  }
  return [...skills];
}

/** Replace an agent's entire skill set. */
export function setSkills(agentId: string, skillIds: string[]): string[] {
  const valid = skillIds.filter((id) => SKILL_REGISTRY.has(id));
  agentSkills.set(agentId, new Set(valid));
  return valid;
}

/** Apply a preset to an agent (replaces existing skills). */
export function applyPreset(agentId: string, presetId: string): string[] {
  const preset = SKILL_PRESETS.get(presetId);
  if (!preset) throw new Error(`Unknown skill preset: ${presetId}`);
  return setSkills(agentId, preset.skills);
}

/** Get the skill IDs assigned to an agent. */
export function getAgentSkills(agentId: string): string[] {
  const skills = agentSkills.get(agentId);
  return skills ? [...skills] : [];
}

/** Get the full SkillDefinition objects for an agent's assigned skills. */
export function getAgentSkillDefinitions(agentId: string): SkillDefinition[] {
  const skills = agentSkills.get(agentId);
  if (!skills) return [];
  return [...skills]
    .map((id) => SKILL_REGISTRY.get(id))
    .filter((s): s is SkillDefinition => s !== undefined);
}

/** Get a full profile of an agent's skill configuration. */
export function getAgentProfile(agentId: string): AgentSkillProfile {
  const defs = getAgentSkillDefinitions(agentId);
  const categories = [...new Set(defs.map((d) => d.category))];
  const capabilities = [...new Set(defs.flatMap((d) => d.requiredCapabilities))];
  return {
    agentId,
    skills: defs.map((d) => d.id),
    categories,
    totalSkills: defs.length,
    capabilitySet: capabilities,
  };
}

/** Remove all skills for an agent (e.g. on session cleanup). */
export function clearAgentSkills(agentId: string): void {
  agentSkills.delete(agentId);
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt injection — merge skill prompts into mode system prompts
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the additional system prompt text for an agent based on their skills.
 * This is appended to the base mode system prompt by the orchestrator.
 */
export function buildSkillPromptFragment(agentId: string): string {
  const defs = getAgentSkillDefinitions(agentId);
  if (defs.length === 0) return "";

  const categoryGroups = new Map<SkillCategory, SkillDefinition[]>();
  for (const def of defs) {
    const group = categoryGroups.get(def.category) || [];
    group.push(def);
    categoryGroups.set(def.category, group);
  }

  let fragment = "\n\n── Agent Skills ──────────────────────────────────────────\n";
  fragment += `You have ${defs.length} active skill(s):\n\n`;

  for (const [category, skills] of categoryGroups) {
    fragment += `**${category.charAt(0).toUpperCase() + category.slice(1)}:**\n`;
    for (const skill of skills) {
      fragment += `${skill.icon} ${skill.promptFragment}\n\n`;
    }
  }

  fragment += "Use these skills as appropriate for the task at hand.\n";
  return fragment;
}

// ────────────────────────────────────────────────────────────────────────────
// Task → Agent matching — score how well an agent's skills match a task
// ────────────────────────────────────────────────────────────────────────────

/**
 * Score how well an agent's skills match a set of required tags.
 * Used by the dispatcher to assign tasks to the best-fit agent.
 *
 * @param agentId    Agent to score
 * @param taskTags   Tags describing the task (from PlannedTask or user input)
 * @returns          Score 0–100 and matched/missing skill IDs
 */
export function scoreAgentForTask(agentId: string, taskTags: string[]): SkillMatch {
  const defs = getAgentSkillDefinitions(agentId);
  const agentTags = new Set(defs.flatMap((d) => d.tags));

  const matchedSkills: string[] = [];
  const missingTags: string[] = [];

  for (const tag of taskTags) {
    const lower = tag.toLowerCase();
    if (agentTags.has(lower)) {
      // Find which skill(s) matched this tag
      for (const def of defs) {
        if (def.tags.includes(lower) && !matchedSkills.includes(def.id)) {
          matchedSkills.push(def.id);
        }
      }
    } else {
      missingTags.push(tag);
    }
  }

  // Find which skills would cover the missing tags
  const missingSkills: string[] = [];
  for (const tag of missingTags) {
    const lower = tag.toLowerCase();
    for (const [id, def] of SKILL_REGISTRY) {
      if (def.tags.includes(lower) && !matchedSkills.includes(id) && !missingSkills.includes(id)) {
        missingSkills.push(id);
      }
    }
  }

  const score = taskTags.length === 0
    ? 0
    : Math.round(((taskTags.length - missingTags.length) / taskTags.length) * 100);

  return { agentId, score, matchedSkills, missingSkills };
}

/**
 * Rank multiple agents by how well they match a task.
 * Returns agents sorted by score descending.
 */
export function rankAgentsForTask(agentIds: string[], taskTags: string[]): SkillMatch[] {
  return agentIds
    .map((id) => scoreAgentForTask(id, taskTags))
    .sort((a, b) => b.score - a.score);
}

/**
 * Find the single best agent for a task.
 * Returns null if no agents have any matching skills.
 */
export function bestAgentForTask(agentIds: string[], taskTags: string[]): SkillMatch | null {
  const ranked = rankAgentsForTask(agentIds, taskTags);
  return ranked.length > 0 && ranked[0].score > 0 ? ranked[0] : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ────────────────────────────────────────────────────────────────────────────

/** Get all skills in a category. */
export function getSkillsByCategory(category: SkillCategory): SkillDefinition[] {
  return [...SKILL_REGISTRY.values()].filter((s) => s.category === category);
}

/** Get all available categories. */
export function getAllCategories(): SkillCategory[] {
  return [...new Set([...SKILL_REGISTRY.values()].map((s) => s.category))];
}

/** Get all skill IDs. */
export function getAllSkillIds(): string[] {
  return [...SKILL_REGISTRY.keys()];
}

/** Get a single skill definition by ID. */
export function getSkillDefinition(id: string): SkillDefinition | undefined {
  return SKILL_REGISTRY.get(id);
}

/** List all presets. */
export function listPresets(): SkillPreset[] {
  return [...SKILL_PRESETS.values()];
}

/** Get a preset by ID. */
export function getPreset(id: string): SkillPreset | undefined {
  return SKILL_PRESETS.get(id);
}

/** Summary stats for the entire skills system. */
export function getSkillSystemStats() {
  const totalSkills = SKILL_REGISTRY.size;
  const totalPresets = SKILL_PRESETS.size;
  const agentsWithSkills = agentSkills.size;
  const categoryBreakdown: Record<string, number> = {};
  for (const def of SKILL_REGISTRY.values()) {
    categoryBreakdown[def.category] = (categoryBreakdown[def.category] || 0) + 1;
  }
  return {
    totalSkills,
    totalPresets,
    agentsWithSkills,
    categories: categoryBreakdown,
    allSkillIds: getAllSkillIds(),
    allPresetIds: [...SKILL_PRESETS.keys()],
  };
}
