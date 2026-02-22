/**
 * Test the complete triage workflow on a real GitHub issue
 * This simulates the GitHub Actions workflow locally
 */

import { Octokit } from "@octokit/rest";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         Real Issue Triage Test (Local Simulation)         ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log("");

async function testRealIssue() {
  const issueNumber = process.env.TEST_ISSUE_NUMBER;
  const githubToken = process.env.GITHUB_TOKEN || "";
  const owner = process.env.REPOSITORY_OWNER || "kirodotdev";
  const repo = process.env.REPOSITORY_NAME || "Kiro";

  if (!issueNumber) {
    console.error("❌ TEST_ISSUE_NUMBER environment variable is required");
    console.log("");
    console.log("Usage:");
    console.log("  export TEST_ISSUE_NUMBER=5044");
    console.log("  npm run build && node dist/test/test-real-issue.js");
    process.exit(1);
  }

  if (!githubToken) {
    console.error("❌ GITHUB_TOKEN environment variable is required");
    process.exit(1);
  }

  console.log(`Repository: ${owner}/${repo}`);
  console.log(`Issue Number: #${issueNumber}`);
  console.log("");

  // Fetch the issue details from GitHub
  console.log("Fetching issue details from GitHub...");
  const client = new Octokit({ auth: githubToken });

  try {
    const { data: issue } = await client.issues.get({
      owner,
      repo,
      issue_number: parseInt(issueNumber),
    });

    console.log("✅ Issue fetched successfully");
    console.log("");
    console.log("─".repeat(60));
    console.log(`Title: ${issue.title}`);
    console.log(`State: ${issue.state}`);
    console.log(`Labels: ${issue.labels.map((l: any) => l.name).join(", ") || "none"}`);
    console.log(`Created: ${issue.created_at}`);
    console.log(`URL: ${issue.html_url}`);
    console.log("─".repeat(60));
    console.log("");

    // Set environment variables for the triage script
    process.env.ISSUE_NUMBER = issueNumber;
    process.env.ISSUE_TITLE = issue.title;
    process.env.ISSUE_BODY = issue.body || "";
    process.env.REPOSITORY_OWNER = owner;
    process.env.REPOSITORY_NAME = repo;

    console.log("🚀 Running triage workflow...");
    console.log("");
    console.log("═".repeat(60));
    console.log("");

    // Import and run the triage script
    // Note: This will execute the actual triage workflow
    await import("../triage_issue.js");

    console.log("");
    console.log("═".repeat(60));
    console.log("");
    console.log("✅ Triage workflow completed!");
    console.log("");
    console.log("Check the issue on GitHub to see the results:");
    console.log(`   ${issue.html_url}`);

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.status === 404) {
      console.log("");
      console.log("Issue not found. Please check:");
      console.log(`  - Issue #${issueNumber} exists in ${owner}/${repo}`);
      console.log("  - You have access to the repository");
    }
    process.exit(1);
  }
}

testRealIssue().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
