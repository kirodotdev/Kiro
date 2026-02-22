/**
 * Comment Generator Module
 * Generates personalized acknowledgment comments using a configurable AI provider.
 *
 * Supported providers (set AI_PROVIDER env var):
 *   "bedrock"        – AWS Bedrock (default)
 *   "github-models"  – GitHub Models
 *   "openai"         – OpenAI / GitHub Copilot compatible
 */

import { Octokit } from "@octokit/rest";
import { ClassificationResult } from "./data_models.js";
import { createProvider } from "./ai_provider.js";
import { retryWithBackoff } from "./retry_utils.js";
import { resolveModel } from "./model_costs.js";
import { sanitizePromptInput, MAX_TITLE_LENGTH, MAX_BODY_LENGTH } from "./sanitize.js";

// All configurable via env, 0 = no limit
const MAX_TOKENS = parseInt(process.env.COMMENT_MAX_TOKENS || "0", 10) || undefined;
const TEMPERATURE = parseFloat(process.env.COMMENT_TEMPERATURE || "0.7");
const MAX_COMMENTS_LENGTH = parseInt(process.env.MAX_COMMENTS_LENGTH || "0", 10);
const MAX_COMMENTS_TO_FETCH = parseInt(process.env.MAX_COMMENTS_TO_FETCH || "0", 10);

/**
 * Fetch existing comments on the issue
 */
async function fetchIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken: string
): Promise<string> {
  try {
    const client = new Octokit({ auth: githubToken });

    const { data: comments } = await retryWithBackoff(async () => {
      return await client.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: MAX_COMMENTS_TO_FETCH,
        sort: "created",
        direction: "asc",
      });
    });

    if (comments.length === 0) {
      return "(No comments yet)";
    }

    // Format comments with author and body
    const formattedComments = comments
      .map((comment, index) => {
        const author = comment.user?.login || "unknown";
        const body = comment.body || "";
        return `Comment ${index + 1} by @${author}:\n${body}`;
      })
      .join("\n\n---\n\n");

    // Truncate if too long
    if (formattedComments.length > MAX_COMMENTS_LENGTH) {
      return formattedComments.substring(0, MAX_COMMENTS_LENGTH) + "\n\n[Comments truncated for length]";
    }

    return formattedComments;
  } catch (error) {
    console.error("Error fetching issue comments:", error);
    return "(Unable to fetch comments)";
  }
}

/**
 * Build prompt for generating acknowledgment comment
 */
function buildCommentPrompt(
  issueTitle: string,
  issueBody: string,
  issueComments: string,
  labels: string
): string {
  return `You are a friendly GitHub bot for the Kiro project. Generate a welcoming acknowledgment comment for a newly triaged issue.

===== ISSUE TITLE =====
${issueTitle}
===== END ISSUE TITLE =====

===== ISSUE BODY =====
${issueBody || "(No description provided)"}
===== END ISSUE BODY =====

===== EXISTING COMMENTS =====
${issueComments}
===== END EXISTING COMMENTS =====

===== ASSIGNED LABELS =====
${labels}
===== END LABELS =====

TASK:
Write a friendly acknowledgment comment that:
1. Thanks the user for opening the issue
2. Briefly acknowledges what the issue is about, considering any discussion
3. Lets them know a maintainer will take a look

Guidance:
- Be friendly and natural in tone.
- If there are existing comments, you can reference the discussion.
- Length and style are up to you — write whatever feels appropriate for the issue.

Provide the comment text directly (no JSON wrapper needed).`;
}

/**
 * Generate acknowledgment comment using the configured AI provider.
 *
 * The provider is selected via the AI_PROVIDER env var:
 *   "bedrock"        – AWS Bedrock (default)
 *   "github-models"  – GitHub Models
 *   "openai"         – OpenAI / GitHub Copilot compatible
 */
export async function generateAcknowledgmentComment(
  owner: string,
  repo: string,
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  classification: ClassificationResult,
  githubToken: string
): Promise<string> {
  const sanitizedTitle = sanitizePromptInput(issueTitle, MAX_TITLE_LENGTH);
  const sanitizedBody = sanitizePromptInput(issueBody, MAX_BODY_LENGTH);
  const labels = classification.recommended_labels.join(", ") || "pending-triage";

  // Fetch existing comments
  const issueComments = await fetchIssueComments(owner, repo, issueNumber, githubToken);

  const provider = createProvider();
  const prompt = buildCommentPrompt(sanitizedTitle, sanitizedBody, issueComments, labels);

  console.log(`Generating acknowledgment comment with provider: ${provider.name}`);

  try {
    const response = await provider.complete(
      [{ role: "user", content: prompt }],
      { maxTokens: MAX_TOKENS, temperature: TEMPERATURE, model: resolveModel("comment"), task: "comment" }
    );

    return response.text.trim();
  } catch (error) {
    console.error(`Error generating comment with ${provider.name}:`, error);
    throw error;
  }
}

/**
 * Get fallback comment when all AI providers fail
 */
export function getFallbackComment(): string {
  return `Thank you for opening this issue! 🙏

We've received your report and our automated triage system has analyzed it. A maintainer will review it shortly.

We appreciate your contribution to making Kiro better!`;
}
