# AGENTS.md

## 0. Agent scope & identity

You are an AI coding agent working inside this repository only.

Your primary goals:
- Implement features and fixes as requested.
- Preserve existing architecture and public contracts.
- Maintain reliability, security, and performance.

You must:
- Prefer small, reviewable changes.
- Explain non-trivial decisions in comments or commit messages.
- Ask for clarification when a change would break explicit constraints below.

## 1. Project overview

**Purpose of this repo:**
- Public-facing GitHub repository for Kiro, an agentic IDE built by AWS
- Contains public documentation (README, contributing guidelines, user docs)
- Houses TypeScript automation scripts for GitHub issue management using AWS Bedrock AI

**Core domains / bounded contexts:**
- Issue Triage: Automatic classification and labeling of new issues using Claude Sonnet 4.5
- Duplicate Detection: Semantic similarity analysis to find duplicate issues
- Stale Issue Management: Auto-closing issues pending user response after 7 days
- Duplicate Closure: Auto-closing confirmed duplicates after 3 days

**Critical invariants:**
- All new issues must receive the `pending-triage` label by default
- Duplicate detection threshold must remain at 0.80 similarity score
- Input sanitization must be applied to all user-provided content before AI processing
- Prompt injection patterns must be detected and redacted
- Label assignments must be validated against the defined taxonomy

## 2. Environment & assumptions

**Runtime:**
- Node.js: 20.x (as specified in GitHub Actions workflows)
- TypeScript: ^5.3.3 (ES2022 target, strict mode)

**Package manager:**
- npm (stay consistent, do not switch to yarn or pnpm)

**Local services:**
- None required for local development
- AWS Bedrock access required for AI classification (Claude Sonnet 4.5)
- GitHub API access required for issue management

**Network access:**
- Scripts require internet access to communicate with AWS Bedrock and GitHub APIs
- Do not assume internet access for other purposes

## 3. Setup & commands

Always use these commands when working with the project. All commands run from the `scripts/` directory:

**Install dependencies:**
```bash
cd scripts && npm install
```

**Build TypeScript:**
```bash
cd scripts && npm run build
```

**Run unit tests:**
```bash
cd scripts && npm test
```

**Run local integration test:**
```bash
cd scripts && npm run test:local
```

**Clean build artifacts:**
```bash
cd scripts && npm run clean
```

**Rule:** Before you propose final changes, run `npm run build` and `npm test` from the `scripts/` directory to ensure compilation succeeds and tests pass.

## 4. Repository & architecture map

**High-level structure:**
```
/                           — Repository root (docs, README, contributing guidelines)
├── .github/workflows/      — GitHub Actions for issue automation
├── scripts/                — TypeScript automation code (core logic)
│   ├── data_models.ts      — Interfaces and classes (LabelTaxonomy, etc.)
│   ├── bedrock_classifier.ts — AWS Bedrock AI integration
│   ├── assign_labels.ts    — GitHub label assignment logic
│   ├── detect_duplicates.ts — Semantic duplicate detection
│   ├── retry_utils.ts      — Exponential backoff retry logic
│   ├── rate_limit_utils.ts — GitHub API rate limiting
│   ├── workflow_summary.ts — GitHub Actions summary generation
│   ├── triage_issue.ts     — Main triage orchestration script
│   ├── close_duplicates.ts — Duplicate issue closer script
│   ├── close_stale.ts      — Stale issue closer script
│   └── test/               — Test files
├── docs/                   — User-facing documentation
├── assets/                 — Images and branding
└── .kiro/                  — Kiro IDE configuration (specs, steering)
```

**Key entrypoints:**
- Main triage script: `scripts/triage_issue.ts`
- Duplicate closer: `scripts/close_duplicates.ts`
- Stale issue closer: `scripts/close_stale.ts`
- GitHub Actions: `.github/workflows/issue-triage.yml`, `.github/workflows/close-stale.yml`, `.github/workflows/close-duplicates.yml`

## 5. Coding conventions

**Language:**
- TypeScript strict mode: true (do not weaken typings)
- ES2022 target with ES modules (`"type": "module"` in package.json)

**Style:**
- Quotes: double quotes for strings
- Semicolons: required
- Import order: Node.js built-ins, external packages, local modules
- All imports must use `.js` extension for ES module compatibility (e.g., `import { LabelTaxonomy } from "./data_models.js"`)
- Prefer pure functions where possible; side effects in main scripts and handlers
- Use named exports for functions and classes

**Error handling:**
- Use try/catch blocks with detailed error logging
- Implement retry logic with exponential backoff for external API calls (use `retryWithBackoff` from `retry_utils.ts`)
- Return boolean success indicators rather than throwing for non-critical failures
- Log errors with context (issue number, step name, etc.)

**Logging:**
- Use `console.log` for informational messages
- Use `console.error` for error messages
- Use `console.warn` for warnings
- Do not log secrets, tokens, or PII

## 6. Testing strategy

When you change code:
- Always add or update tests covering:
  - Happy path scenarios
  - Relevant edge cases
  - Regressions you are fixing

**Test locations:**
- Unit tests: `scripts/test/*.test.ts`
- Integration tests: `scripts/test/test-*.ts` (non-.test.ts files)

**Test patterns:**
- Test files use `.test.ts` suffix for Jest discovery
- Use `describe` and `it` blocks for test organization
- Use `beforeEach` for test setup

**Commands:**
- Unit tests: `cd scripts && npm test`
- Local integration: `cd scripts && npm run test:local`

If tests fail, fix them or revert the change. Do not silence or delete failing tests without explicit justification.

## 7. Workflow rules

**Branching:**
- Use branches like `feature/...`, `fix/...`, `chore/...`

**Commits:**
- Keep commits small and focused
- Use conventional commit format:
  - `feat: add new label category`
  - `fix: correct duplicate detection threshold`
  - `chore: update dependencies`
  - `docs: improve README`

**Pull requests:**
- Title format: `[scope] short description` (e.g., `[scripts] fix retry logic`)
- PR must include:
  - Summary of changes
  - Risks and mitigations
  - How to test (commands + steps)

## 8. Safety, secrets & destructive operations

**Never hardcode secrets, tokens, or passwords.**

**Do not read or modify:**
- `.env*` files or `scripts/.env.example` (except to document new required variables)
- GitHub Secrets configuration
- AWS credentials in any form

**Required environment variables (set externally, never committed):**
- `GITHUB_TOKEN` — GitHub API access
- `AWS_ACCESS_KEY_ID` — AWS Bedrock access
- `AWS_SECRET_ACCESS_KEY` — AWS Bedrock access
- `AWS_REGION` — AWS region (defaults to us-east-1)

**Destructive operations are forbidden unless explicitly requested:**
- Closing issues programmatically (only via the designated scripts)
- Removing labels from issues
- Modifying GitHub repository settings
- Altering AWS IAM policies or Bedrock configurations

**Security requirements:**
- All user input (issue titles, bodies) must be sanitized before AI processing
- Prompt injection patterns must be detected and redacted
- Input length limits must be enforced (title: 500 chars, body: 10,000 chars)

If you are unsure whether a change might be destructive, ask before proceeding.

## 9. Tooling & integrations

**AWS Bedrock:**
- Model: Claude Sonnet 4.5 (`us.anthropic.claude-sonnet-4-20250514-v1:0`)
- Used for issue classification and duplicate detection
- Always use `retryWithBackoff` for API calls

**GitHub API (Octokit):**
- Used for issue management (labels, comments, closing)
- Always use `retryWithBackoff` for API calls
- Respect rate limits using utilities in `rate_limit_utils.ts`

**GitHub Actions:**
- Workflows trigger on issue events and schedules
- Node.js 20 runtime
- Secrets provided via GitHub Secrets

Do not introduce new external services or tools without clear justification and minimal footprint.

## 10. Constraints / do-not-touch areas

**Do not change, unless a task explicitly requires it:**

**Label taxonomy (in `data_models.ts`):**
- The `LabelTaxonomy` class defines all valid labels
- Adding/removing labels affects classification and validation
- Changes require coordination with GitHub repository label configuration

**AI model configuration:**
- Model ID: `us.anthropic.claude-sonnet-4-20250514-v1:0`
- Temperature: 0.3
- Max tokens: 2048
- Similarity threshold: 0.8

**Threshold values:**
- Duplicate closure: 3 days
- Stale issue closure: 7 days
- Duplicate similarity: 0.80

**Security patterns:**
- Input sanitization functions in `bedrock_classifier.ts` and `detect_duplicates.ts`
- Prompt injection detection patterns
- Input length limits

**Generated or vendor files — do not manually edit:**
- `scripts/dist/` (compiled output)
- `scripts/package-lock.json` (unless updating dependencies via npm)
- `scripts/node_modules/`

## 11. Performance & resource guidelines

**Performance-critical paths:**
- Bedrock API calls (10-15 seconds per issue classification)
- Duplicate detection batch processing (5-10 seconds per batch of 10)
- GitHub API rate limits (respect limits, use batching)

**Optimization strategies already in place:**
- Batch processing for duplicate detection (BATCH_SIZE = 10)
- Retry logic with exponential backoff (max 3 retries, 1-8 second delays)
- Rate limit monitoring for GitHub API

**Guidelines:**
- Avoid algorithms worse than O(n log n) for processing issue lists
- Be mindful of additional Bedrock API calls (each costs time and money)
- When modifying duplicate detection, consider the 90-day search window and batch size

If a task touches Bedrock integration or batch processing, summarize your reasoning and trade-offs.

## 12. Monorepo & nested AGENTS.md

This repository is not a monorepo. There are no nested AGENTS.md files currently in use.

**Rule:** If nested AGENTS.md files are added in the future, follow the instructions of the closest AGENTS.md to the file you are editing.

**Global constraints that always apply regardless of location:**
- Security requirements (input sanitization, no hardcoded secrets)
- Secrets handling (environment variables only)
- Destructive operation restrictions

## 13. Multi-agent / personas

If you are a specialized agent, follow your persona rules in addition to this file:

**@dev-agent:**
- Focus on implementation and tests
- Ensure all changes compile and pass tests

**@test-agent:**
- Focus on test coverage and edge cases
- Do not change runtime code unless fixing test flakiness

**@security-agent:**
- Focus on security review and hardening
- Verify input sanitization and prompt injection protection
- Minimize functional changes

**Priority ordering:** security > correctness > convenience

## 14. Definition of Done (checklist)

Before considering a task complete, ensure:

- [ ] Code compiles: `cd scripts && npm run build` succeeds
- [ ] Tests pass: `cd scripts && npm test` succeeds
- [ ] No constraints from section 10 are violated
- [ ] New/changed behavior is covered by tests
- [ ] Input sanitization is applied to any new user input handling
- [ ] Retry logic is used for any new external API calls
- [ ] Changes are documented (PR description, code comments)
- [ ] No secrets or sensitive data added to the repo
- [ ] Import statements use `.js` extension for ES module compatibility

If any item is not satisfied, the task is not done.
