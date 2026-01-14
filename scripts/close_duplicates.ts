/**
 * Duplicate Closer Script
 * Closes issues marked as duplicate for 3+ days
 */

import { Octokit } from "@octokit/rest";
import { retryWithBackoff } from "./retry_utils.js";

const DAYS_THRESHOLD = 3;

interface IssueWithTimeline {
  number: number;
  title: string;
  duplicateLabelDate: Date | null;
  hasDuplicateLabel: boolean;
}

/**
 * Get the date when duplicate label was added
 */
async function getDuplicateLabelDate(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<Date | null> {
  try {
    const { data: events } = await client.issues.listEvents({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    // Find the most recent "labeled" event for "duplicate" label
    const labelEvent = events
      .filter(
        (event) =>
          event.event === "labeled" &&
          "label" in event &&
          event.label &&
          event.label.name === "duplicate"
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

    return labelEvent ? new Date(labelEvent.created_at) : null;
  } catch (error) {
    console.error(
      `Error fetching label date for issue #${issueNumber}:`,
      error
    );
    return null;
  }
}

/**
 * Find original issue from duplicate comment
 */
async function findOriginalIssue(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<number | null> {
  try {
    const { data: comments } = await client.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    // Look for our duplicate detection comment
    const duplicateComment = comments.find((comment) =>
      comment.body?.includes("Potential Duplicate Issues Detected")
    );

    if (duplicateComment && duplicateComment.body) {
      // Extract first issue number from the comment
      const match = duplicateComment.body.match(/#(\d+):/);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return null;
  } catch (error) {
    console.error(
      `Error finding original issue for #${issueNumber}:`,
      error
    );
    return null;
  }
}

/**
 * Close duplicate issue with comment
 */
async function closeDuplicateIssue(
  client: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  originalIssue: number | null
): Promise<boolean> {
  try {
    const originalRef = originalIssue ? `#${originalIssue}` : "an existing issue";
    const comment = `This issue has been automatically closed as it appears to be a duplicate of ${originalRef}.

If you believe this is incorrect, please comment on this issue and a maintainer will review it.`;

    // Post closing comment
    await retryWithBackoff(async () => {
      await client.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment,
      });
    });

    // Close the issue
    await retryWithBackoff(async () => {
      await client.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: "closed",
      });
    });

    console.log(`✓ Closed issue #${issueNumber} as duplicate`);
    return true;
  } catch (error) {
    console.error(`Error closing issue #${issueNumber}:`, error);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const owner = process.env.REPOSITORY_OWNER || "";
    const repo = process.env.REPOSITORY_NAME || "";
    const githubToken = process.env.GITHUB_TOKEN || "";

    if (!owner || !repo || !githubToken) {
      console.error("Missing required environment variables");
      process.exit(1);
    }

    console.log(`\n=== Closing Duplicate Issues ===`);
    console.log(`Repository: ${owner}/${repo}\n`);

    const client = new Octokit({ auth: githubToken });

    // Fetch all open issues with duplicate label
    const { data: issues } = await client.issues.listForRepo({
      owner,
      repo,
      state: "open",
      labels: "duplicate",
      per_page: 100,
    });

    console.log(`Found ${issues.length} open issue(s) with duplicate label`);

    if (issues.length === 0) {
      console.log("No issues to process");
      process.exit(0);
    }

    const now = new Date();
    const thresholdMs = DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
    let closedCount = 0;
    let skippedCount = 0;

    for (const issue of issues) {
      console.log(`\nProcessing issue #${issue.number}: ${issue.title}`);

      // Check if issue still has duplicate label
      const hasDuplicateLabel = issue.labels.some(
        (label) =>
          (typeof label === "string" ? label : label.name) === "duplicate"
      );

      if (!hasDuplicateLabel) {
        console.log(`  Skipped: duplicate label was removed`);
        skippedCount++;
        continue;
      }

      // Get label date
      const labelDate = await getDuplicateLabelDate(
        client,
        owner,
        repo,
        issue.number
      );

      if (!labelDate) {
        console.log(`  Skipped: could not determine label date`);
        skippedCount++;
        continue;
      }

      const ageMs = now.getTime() - labelDate.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);

      console.log(`  Label age: ${ageDays.toFixed(1)} days`);

      if (ageMs >= thresholdMs) {
        // Find original issue
        const originalIssue = await findOriginalIssue(
          client,
          owner,
          repo,
          issue.number
        );

        // Close the issue
        const closed = await closeDuplicateIssue(
          client,
          owner,
          repo,
          issue.number,
          originalIssue
        );

        if (closed) {
          closedCount++;
        }
      } else {
        console.log(`  Skipped: not old enough (needs ${DAYS_THRESHOLD} days)`);
        skippedCount++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Closed: ${closedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Total: ${issues.length}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n=== Failed ===");
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
