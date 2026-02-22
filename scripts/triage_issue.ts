/**
 * Main Issue Triage Script
 * Orchestrates classification, labeling, and duplicate detection
 */

import { Octokit } from "@octokit/rest";
import { LabelTaxonomy, ClassificationResult } from "./data_models.js";
import { classifyIssue } from "./bedrock_classifier.js";
import { assignLabels, addDuplicateLabel } from "./assign_labels.js";
import {
  detectDuplicates,
  postDuplicateComment,
} from "./detect_duplicates.js";
import { createSummary, logError, WorkflowSummary } from "./workflow_summary.js";
import { retryWithBackoff } from "./retry_utils.js";
import {
  generateAcknowledgmentComment,
  getFallbackComment,
} from "./bedrock_comment_generator.js";
import { printUsageSummary } from "./model_costs.js";

/**
 * Post initial acknowledgment comment on new issue
 */
async function postAcknowledgmentComment(
  owner: string,
  repo: string,
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  classification: ClassificationResult,
  githubToken: string
): Promise<boolean> {
  try {
    const client = new Octokit({ auth: githubToken });

    console.log(`Generating acknowledgment comment for issue #${issueNumber}...`);
    
    let comment: string;
    try {
      comment = await generateAcknowledgmentComment(
        owner,
        repo,
        issueNumber,
        issueTitle,
        issueBody,
        classification,
        githubToken
      );
    } catch {
      console.warn("Failed to generate comment with Bedrock, using fallback");
      comment = getFallbackComment();
    }

    console.log(`Posting acknowledgment comment to issue #${issueNumber}`);

    await retryWithBackoff(async () => {
      await client.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment,
      });
    });

    console.log(`Successfully posted acknowledgment comment to issue #${issueNumber}`);
    return true;
  } catch (error) {
    console.error(
      `Error posting acknowledgment comment to issue #${issueNumber}:`,
      error
    );
    return false;
  }
}

async function main() {
  const summary: WorkflowSummary = {
    success: true,
    totalProcessed: 1,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    // Get environment variables
    const issueNumber = parseInt(process.env.ISSUE_NUMBER || "0");
    const issueTitle = process.env.ISSUE_TITLE || "";
    const issueBody = process.env.ISSUE_BODY || "";
    const owner = process.env.REPOSITORY_OWNER || "";
    const repo = process.env.REPOSITORY_NAME || "";
    const githubToken = process.env.GITHUB_TOKEN || "";

    if (!issueNumber || !owner || !repo || !githubToken) {
      console.error("Missing required environment variables");
      logError(summary.errors, "initialization", "Missing required environment variables");
      summary.success = false;
      summary.failureCount = 1;
      createSummary(summary);
      process.exit(1);
    }

    console.log(`\n=== Triaging Issue #${issueNumber} ===`);
    console.log(`Title: ${issueTitle}`);
    console.log(`Repository: ${owner}/${repo}\n`);

    const taxonomy = new LabelTaxonomy();

    // Step 1: Detect duplicates
    console.log("Step 1: Detecting duplicate issues...");
    let duplicates = [];
    let isDuplicate = false;
    
    try {
      duplicates = await detectDuplicates(
        issueTitle,
        issueBody,
        owner,
        repo,
        issueNumber,
        githubToken
      );

      if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} potential duplicate(s)`);
        isDuplicate = true;

        // Post duplicate comment
        console.log("\nStep 2: Posting duplicate comment...");
        try {
          const commentPosted = await postDuplicateComment(
            owner,
            repo,
            issueNumber,
            duplicates,
            githubToken
          );

          if (commentPosted) {
            // Add duplicate label (and remove pending-triage)
            console.log("\nStep 3: Adding duplicate label...");
            try {
              await addDuplicateLabel(owner, repo, issueNumber, githubToken);
              console.log("Skipping classification and label assignment for duplicate issue");
            } catch (error) {
              console.error("Failed to add duplicate label:", error);
              logError(summary.errors, "duplicate_label", error, issueNumber);
            }
          }
        } catch (error) {
          console.error("Failed to post duplicate comment:", error);
          logError(summary.errors, "duplicate_comment", error, issueNumber);
        }
      } else {
        console.log("No duplicates detected");
      }
    } catch (error) {
      console.error("Duplicate detection failed:", error);
      logError(summary.errors, "duplicate_detection", error, issueNumber);
    }

    // Only classify and assign labels if NOT a duplicate
    if (!isDuplicate) {
      // Step 2: Classify issue using Bedrock
      console.log("\nStep 2: Classifying issue with AI provider...");
      let classification;
      try {
        classification = await classifyIssue(issueTitle, issueBody, taxonomy);

        if (classification.error) {
          console.error(`Classification error: ${classification.error}`);
          console.log("Continuing with manual triage (pending-triage label only)");
          logError(summary.errors, "classification", classification.error, issueNumber);
        } else {
          console.log(
            `Recommended labels: ${classification.recommended_labels.join(", ")}`
          );
          console.log(`Reasoning: ${classification.reasoning}`);
        }
      } catch (error) {
        console.error("Classification failed:", error);
        logError(summary.errors, "classification", error, issueNumber);
        classification = {
          recommended_labels: [],
          confidence_scores: {},
          reasoning: "",
          error: String(error),
        };
      }

      // Step 3: Assign labels
      console.log("\nStep 3: Assigning labels...");
      try {
        const labelsAssigned = await assignLabels(
          owner,
          repo,
          issueNumber,
          classification.recommended_labels,
          githubToken,
          taxonomy
        );

        if (!labelsAssigned) {
          console.error("Failed to assign labels, but continuing...");
          logError(summary.errors, "label_assignment", "Failed to assign labels", issueNumber);
        }
      } catch (error) {
        console.error("Label assignment failed:", error);
        logError(summary.errors, "label_assignment", error, issueNumber);
      }

      // Step 4: Post acknowledgment comment
      console.log("\nStep 4: Posting acknowledgment comment...");
      try {
        await postAcknowledgmentComment(
          owner,
          repo,
          issueNumber,
          issueTitle,
          issueBody,
          classification,
          githubToken
        );
      } catch (error) {
        console.error("Failed to post acknowledgment comment:", error);
        logError(summary.errors, "acknowledgment_comment", error, issueNumber);
        // Continue even if comment fails
      }
    }

    console.log("\n=== Triage Complete ===\n");

    // Update summary
    if (summary.errors.length === 0) {
      summary.successCount = 1;
    } else {
      summary.failureCount = 1;
      summary.success = false;
    }

    createSummary(summary);
    printUsageSummary();
    process.exit(summary.success ? 0 : 1);
  } catch (error) {
    console.error("\n=== Triage Failed ===");
    console.error("Error:", error);
    logError(summary.errors, "main", error);
    summary.success = false;
    summary.failureCount = 1;
    createSummary(summary);
    printUsageSummary();
    process.exit(1);
  }
}

main();
