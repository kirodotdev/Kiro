/**
 * Duplicate Detection Module
 * Detects duplicate issues using a configurable AI provider for semantic similarity.
 *
 * Supported providers (set AI_PROVIDER env var):
 *   "bedrock"        – AWS Bedrock (default)
 *   "github-models"  – GitHub Models
 *   "openai"         – OpenAI / GitHub Copilot compatible
 */

import { Octokit } from "@octokit/rest";
import { DuplicateMatch, IssueData } from "./data_models.js";
import { createProvider, extractJsonFromText, AIProvider } from "./ai_provider.js";
import { sanitizePromptInput, MAX_TITLE_LENGTH, MAX_BODY_LENGTH } from "./sanitize.js";
import { retryWithBackoff } from "./retry_utils.js";
import { resolveModel } from "./model_costs.js";

const SIMILARITY_THRESHOLD = 0.8;
const BATCH_SIZE = 10;

/**
 * Fetch existing open issues from repository with Bug or Feature type
 * Falls back to bug/feature labels if issue types are not configured
 */
export async function fetchExistingIssues(
  owner: string,
  repo: string,
  currentIssueNumber: number,
  githubToken: string
): Promise<IssueData[]> {
  const client = new Octokit({ auth: githubToken });

  try {
    // Fetch all open issues (up to 1000 for better duplicate detection)
    // GitHub API allows max 100 per page, so we'll fetch multiple pages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Octokit returns complex union types
    const allIssues: any[] = [];
    let page = 1;
    const perPage = 100;
    const maxPages = 10; // Fetch up to 1000 issues

    while (page <= maxPages) {
      const { data: pageIssues } = await client.issues.listForRepo({
        owner,
        repo,
        state: "open",
        per_page: perPage,
        page: page,
        sort: "created",
        direction: "desc",
      });

      if (pageIssues.length === 0) {
        break; // No more issues
      }

      allIssues.push(...pageIssues);

      if (pageIssues.length < perPage) {
        break; // Last page
      }

      page++;
    }

    // Filter for Bug or Feature types, or bug/feature labels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub issue shape varies
    const filteredIssues = allIssues.filter((issue: any) => {
      // Exclude current issue and pull requests
      if (issue.number === currentIssueNumber || issue.pull_request) {
        return false;
      }

      // Check if issue has Bug or Feature type (type is an object with a name property)
      if (issue.type && typeof issue.type === 'object' && issue.type.name) {
        if (issue.type.name === "Bug" || issue.type.name === "Feature") {
          return true;
        }
      }

      // Fallback: Check for bug or feature labels
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- label can be string or object
      const labelNames = issue.labels.map((l: any) =>
        typeof l === "string" ? l.toLowerCase() : (l.name || "").toLowerCase()
      );
      return labelNames.includes("bug") || labelNames.includes("feature");
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Octokit type field not in official types
    const hasTypes = allIssues.some((i: any) => i.type && i.type.name);
    const filterMethod = hasTypes
      ? "issue types (Bug/Feature)" 
      : "labels (bug/feature)";

    console.log(
      `Filtered ${filteredIssues.length} issues with Bug/Feature type (from ${allIssues.length} total) using ${filterMethod}`
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapping untyped GitHub API response
    return filteredIssues.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      created_at: new Date(issue.created_at),
      updated_at: new Date(issue.updated_at),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- label can be string or object
      labels: issue.labels.map((l: any) =>
        typeof l === "string" ? l : l.name || ""
      ),
      url: issue.html_url,
      state: issue.state,
    }));
  } catch (error) {
    console.error("Error fetching existing issues:", error);
    return [];
  }
}

/**
 * Build prompt for duplicate detection
 */
function buildDuplicateDetectionPrompt(
  newTitle: string,
  newBody: string,
  existingIssues: IssueData[]
): string {
  const sanitizedTitle = sanitizePromptInput(newTitle, MAX_TITLE_LENGTH);
  const sanitizedBody = sanitizePromptInput(newBody, MAX_BODY_LENGTH);

  // Sanitize existing issues
  const issuesFormatted = existingIssues
    .map((issue, idx) => {
      const sanitizedIssueTitle = sanitizePromptInput(issue.title, MAX_TITLE_LENGTH);
      const sanitizedIssueBody = sanitizePromptInput(
        issue.body.substring(0, 600),
        600
      );
      return `${idx + 1}. Issue #${issue.number}: ${sanitizedIssueTitle}\n   Body: ${
        sanitizedIssueBody || "(No description)"
      }...`;
    })
    .join("\n\n");

  // Use clear delimiters to separate sections
  return `You are analyzing GitHub issues for duplicates.

===== NEW ISSUE =====
Title: ${sanitizedTitle}

Body: ${sanitizedBody || "(No description provided)"}
===== END NEW ISSUE =====

===== EXISTING ISSUES =====
${issuesFormatted}
===== END EXISTING ISSUES =====

TASK:
For each existing issue, determine if it's a duplicate of the new issue based on semantic similarity of the content.

SCORING CRITERIA:
- 1.0 = Exact duplicate (same issue, same symptoms)
- 0.8-0.99 = Very likely duplicate (same core problem, similar details)
- 0.6-0.79 = Possibly related (similar topic, different specifics)
- <0.6 = Not a duplicate (different issues)

OUTPUT FORMAT:
Return valid JSON with issues that have similarity >= 0.8:
{
  "duplicates": [
    {"issue_number": 123, "score": 0.95, "reason": "Both report the same authentication error with identical symptoms"},
    ...
  ]
}

If no duplicates found (all scores < 0.8), return: {"duplicates": []}`;
}

/**
 * Analyze batch of issues for duplicates using the configured AI provider
 */
async function analyzeBatchForDuplicates(
  newTitle: string,
  newBody: string,
  batch: IssueData[],
  provider: AIProvider
): Promise<DuplicateMatch[]> {
  const prompt = buildDuplicateDetectionPrompt(newTitle, newBody, batch);

  try {
    const response = await provider.complete(
      [{ role: "user", content: prompt }],
      { maxTokens: 2048, temperature: 0.3, topP: 0.9, model: resolveModel("duplicate"), task: "duplicate" }
    );

    // Parse the text response (works regardless of provider)
    const jsonStr = extractJsonFromText(response.text);
    interface DuplicateData {
      issue_number: number;
      score: number;
      reason?: string;
    }
    let duplicatesData: DuplicateData[] = [];

    if (jsonStr) {
      const result = JSON.parse(jsonStr);
      duplicatesData = result.duplicates || [];
    }

    // Convert to DuplicateMatch objects
    return duplicatesData
      .filter((d) => d.score >= SIMILARITY_THRESHOLD)
      .map((d) => {
        const issue = batch.find((i) => i.number === d.issue_number);
        return {
          issue_number: d.issue_number,
          issue_title: issue?.title || "",
          similarity_score: d.score,
          reasoning: d.reason || "",
          url: issue?.url || "",
        };
      });
  } catch (error) {
    console.error("Error analyzing batch for duplicates:", error);
    return [];
  }
}

/**
 * Detect duplicate issues with input validation.
 *
 * The AI provider is selected via the AI_PROVIDER env var:
 *   "bedrock"        – AWS Bedrock (default)
 *   "github-models"  – GitHub Models
 *   "openai"         – OpenAI / GitHub Copilot compatible
 */
export async function detectDuplicates(
  newTitle: string,
  newBody: string,
  owner: string,
  repo: string,
  currentIssueNumber: number,
  githubToken: string
): Promise<DuplicateMatch[]> {
  console.log(`Detecting duplicates for issue #${currentIssueNumber}`);

  if (MAX_TITLE_LENGTH > 0 && newTitle.length > MAX_TITLE_LENGTH) {
    console.warn(
      `Title length (${newTitle.length}) exceeds maximum (${MAX_TITLE_LENGTH}), will be truncated`
    );
  }
  if (MAX_BODY_LENGTH > 0 && newBody.length > MAX_BODY_LENGTH) {
    console.warn(
      `Body length (${newBody.length}) exceeds maximum (${MAX_BODY_LENGTH}), will be truncated`
    );
  }

  // Fetch existing issues
  const existingIssues = await fetchExistingIssues(
    owner,
    repo,
    currentIssueNumber,
    githubToken
  );

  if (existingIssues.length === 0) {
    console.log("No existing issues to compare against");
    return [];
  }

  console.log(`Comparing against ${existingIssues.length} existing issues`);

  // Create the configured AI provider
  const provider = createProvider();
  console.log(`Using AI provider: ${provider.name} for duplicate detection`);

  // Process in batches
  const allDuplicates: DuplicateMatch[] = [];
  for (let i = 0; i < existingIssues.length; i += BATCH_SIZE) {
    const batch = existingIssues.slice(i, i + BATCH_SIZE);
    const batchDuplicates = await analyzeBatchForDuplicates(
      newTitle,
      newBody,
      batch,
      provider
    );
    allDuplicates.push(...batchDuplicates);
  }

  // Sort by similarity score (highest first)
  allDuplicates.sort((a, b) => b.similarity_score - a.similarity_score);

  console.log(`Found ${allDuplicates.length} potential duplicates`);
  return allDuplicates;
}

/**
 * Generate duplicate comment text
 */
export function generateDuplicateComment(duplicates: DuplicateMatch[]): string {
  if (duplicates.length === 0) {
    return "";
  }

  const DUPLICATE_CLOSE_DAYS = 3;

  const duplicateList = duplicates
    .map(
      (dup) =>
        `\n- [#${dup.issue_number}: ${dup.issue_title}](${dup.url}) (${(
          dup.similarity_score * 100
        ).toFixed(0)}% similar)`
    )
    .join("");

  const comment = `🤖 **Potential Duplicate Detected**

This issue appears to be similar to:${duplicateList}

**What happens next?**
- ⏰ This issue will be automatically closed in ${DUPLICATE_CLOSE_DAYS} days
- 🏷️ If this is not a duplicate, you can prevent automatic closure by adding a comment or reacting with 👎 to this message.
- 💬 Comment on the original issue if you have additional information

**Why is this marked as duplicate?**
${duplicates[0].reasoning}`;

  return comment;
}

/**
 * Post duplicate comment to issue
 */
export async function postDuplicateComment(
  owner: string,
  repo: string,
  issueNumber: number,
  duplicates: DuplicateMatch[],
  githubToken: string
): Promise<boolean> {
  if (duplicates.length === 0) {
    return false;
  }

  try {
    const client = new Octokit({ auth: githubToken });
    const comment = generateDuplicateComment(duplicates);

    console.log(`Posting duplicate comment to issue #${issueNumber}`);

    await retryWithBackoff(async () => {
      await client.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment,
      });
    });

    console.log(`Successfully posted duplicate comment to issue #${issueNumber}`);
    return true;
  } catch (error) {
    console.error(
      `Error posting duplicate comment to issue #${issueNumber}:`,
      error
    );
    return false;
  }
}
