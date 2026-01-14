/**
 * Main Issue Triage Script
 * Orchestrates classification, labeling, and duplicate detection
 */

import { LabelTaxonomy } from "./data_models.js";
import { classifyIssue } from "./bedrock_classifier.js";
import { assignLabels, addDuplicateLabel } from "./assign_labels.js";
import {
  detectDuplicates,
  postDuplicateComment,
} from "./detect_duplicates.js";
import { createSummary, logError, WorkflowSummary } from "./workflow_summary.js";

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

    // Step 1: Classify issue using Bedrock
    console.log("Step 1: Classifying issue with AWS Bedrock...");
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

    // Step 2: Assign labels
    console.log("\nStep 2: Assigning labels...");
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

    // Step 3: Detect duplicates
    console.log("\nStep 3: Detecting duplicate issues...");
    let duplicates = [];
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

        // Post duplicate comment
        console.log("\nStep 4: Posting duplicate comment...");
        try {
          const commentPosted = await postDuplicateComment(
            owner,
            repo,
            issueNumber,
            duplicates,
            githubToken
          );

          if (commentPosted) {
            // Add duplicate label
            console.log("\nStep 5: Adding duplicate label...");
            try {
              await addDuplicateLabel(owner, repo, issueNumber, githubToken);
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

    console.log("\n=== Triage Complete ===\n");

    // Update summary
    if (summary.errors.length === 0) {
      summary.successCount = 1;
    } else {
      summary.failureCount = 1;
      summary.success = false;
    }

    createSummary(summary);
    process.exit(summary.success ? 0 : 1);
  } catch (error) {
    console.error("\n=== Triage Failed ===");
    console.error("Error:", error);
    logError(summary.errors, "main", error);
    summary.success = false;
    summary.failureCount = 1;
    createSummary(summary);
    process.exit(1);
  }
}

main();
