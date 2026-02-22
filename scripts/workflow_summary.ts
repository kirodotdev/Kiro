/**
 * Workflow Summary Utilities
 * Generate summaries for GitHub Actions workflow runs
 */

import * as fs from "fs";

export interface WorkflowSummary {
  success: boolean;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  errors: Array<{
    issueNumber?: number;
    step: string;
    error: string;
  }>;
}

/**
 * Create workflow summary
 */
export function createSummary(summary: WorkflowSummary): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryFile) {
    console.log("GITHUB_STEP_SUMMARY not available, skipping summary generation");
    return;
  }

  let content = `## Workflow Summary\n\n`;
  content += `**Status:** ${summary.success ? "✅ Success" : "❌ Failed"}\n\n`;
  content += `### Statistics\n\n`;
  content += `- Total Processed: ${summary.totalProcessed}\n`;
  content += `- Successful: ${summary.successCount}\n`;
  content += `- Failed: ${summary.failureCount}\n`;
  content += `- Skipped: ${summary.skippedCount}\n\n`;

  if (summary.errors.length > 0) {
    content += `### Errors\n\n`;
    content += `| Issue | Step | Error |\n`;
    content += `|-------|------|-------|\n`;

    for (const error of summary.errors) {
      const issue = error.issueNumber ? `#${error.issueNumber}` : "N/A";
      const step = error.step;
      const errorMsg = error.error.substring(0, 100);
      content += `| ${issue} | ${step} | ${errorMsg} |\n`;
    }
    content += `\n`;
  }

  try {
    fs.appendFileSync(summaryFile, content);
    console.log("✓ Workflow summary generated");
  } catch (error) {
    console.error("Error writing workflow summary:", error);
  }
}

/**
 * Log error to summary
 */
export function logError(
  errors: WorkflowSummary["errors"],
  step: string,
  error: unknown,
  issueNumber?: number
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  errors.push({
    issueNumber,
    step,
    error: errorMessage,
  });

  console.error(
    `Error in ${step}${issueNumber ? ` for issue #${issueNumber}` : ""}: ${errorMessage}`
  );
}
