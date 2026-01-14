/**
 * Label Assignment Module
 * Assigns labels to GitHub issues with validation
 */

import { Octokit } from "@octokit/rest";
import { LabelTaxonomy } from "./data_models.js";
import { retryWithBackoff } from "./retry_utils.js";

/**
 * Create GitHub API client
 */
function createGitHubClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Validate labels against taxonomy
 */
export function validateLabels(
  recommendedLabels: string[],
  taxonomy: LabelTaxonomy
): string[] {
  const allValidLabels = taxonomy.getAllLabels();
  const validLabels = recommendedLabels.filter((label) =>
    allValidLabels.includes(label)
  );

  const invalidLabels = recommendedLabels.filter(
    (label) => !allValidLabels.includes(label)
  );

  if (invalidLabels.length > 0) {
    console.warn(`Filtered out invalid labels: ${invalidLabels.join(", ")}`);
  }

  return validLabels;
}

/**
 * Assign labels to a GitHub issue
 */
export async function assignLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  recommendedLabels: string[],
  githubToken: string,
  taxonomy: LabelTaxonomy
): Promise<boolean> {
  try {
    const client = createGitHubClient(githubToken);

    // Validate labels against taxonomy
    const validLabels = validateLabels(recommendedLabels, taxonomy);

    // Always add "pending-triage" label
    const labelsToAdd = [...new Set([...validLabels, "pending-triage"])];

    console.log(
      `Assigning labels to issue #${issueNumber}: ${labelsToAdd.join(", ")}`
    );

    // Use retry logic for GitHub API call
    await retryWithBackoff(async () => {
      await client.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: labelsToAdd,
      });
    });

    console.log(`Successfully assigned labels to issue #${issueNumber}`);
    return true;
  } catch (error) {
    console.error(`Error assigning labels to issue #${issueNumber}:`, error);
    // Log error but don't throw - continue gracefully
    return false;
  }
}

/**
 * Add duplicate label to an issue
 */
export async function addDuplicateLabel(
  owner: string,
  repo: string,
  issueNumber: number,
  githubToken: string
): Promise<boolean> {
  try {
    const client = createGitHubClient(githubToken);

    console.log(`Adding duplicate label to issue #${issueNumber}`);

    await retryWithBackoff(async () => {
      await client.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: ["duplicate"],
      });
    });

    console.log(`Successfully added duplicate label to issue #${issueNumber}`);
    return true;
  } catch (error) {
    console.error(
      `Error adding duplicate label to issue #${issueNumber}:`,
      error
    );
    return false;
  }
}
