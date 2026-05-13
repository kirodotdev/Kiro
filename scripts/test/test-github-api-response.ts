/**
 * Diagnostic test to check GitHub API response structure
 */

import { Octokit } from "@octokit/rest";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         GitHub API Response Structure Test                ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log("");

async function testGitHubAPIResponse() {
  const owner = process.env.REPOSITORY_OWNER || "kirodotdev";
  const repo = process.env.REPOSITORY_NAME || "Kiro";
  const githubToken = process.env.GITHUB_TOKEN || "";

  if (!githubToken) {
    console.error("❌ GITHUB_TOKEN environment variable is required");
    process.exit(1);
  }

  const client = new Octokit({ auth: githubToken });

  console.log(`Repository: ${owner}/${repo}`);
  console.log("");

  try {
    console.log("Fetching first 5 open issues...");
    const { data: issues } = await client.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: 5,
      sort: "created",
      direction: "desc",
    });

    console.log(`✅ Fetched ${issues.length} issues`);
    console.log("");

    if (issues.length > 0) {
      console.log("Analyzing first issue structure:");
      console.log("─".repeat(60));
      const firstIssue = issues[0] as any;
      
      console.log(`Issue #${firstIssue.number}: ${firstIssue.title}`);
      console.log("");
      console.log("Available fields:");
      console.log(`  - number: ${firstIssue.number}`);
      console.log(`  - title: ${firstIssue.title}`);
      console.log(`  - state: ${firstIssue.state}`);
      console.log(`  - labels: ${(firstIssue.labels || []).map((l: any) => l.name).join(", ")}`);
      console.log(`  - type: ${firstIssue.type || "NOT AVAILABLE"}`);
      console.log(`  - pull_request: ${firstIssue.pull_request ? "YES" : "NO"}`);
      console.log("");
      
      console.log("Full issue object keys:");
      console.log(Object.keys(firstIssue).sort().join(", "));
      console.log("");

      if (!firstIssue.type) {
        console.log("⚠️  The 'type' field is NOT available in the API response");
        console.log("");
        console.log("Possible reasons:");
        console.log("  1. GitHub issue types are not configured for this repository");
        console.log("  2. The Octokit library version doesn't support issue types yet");
        console.log("  3. Issue types require a specific API version header");
        console.log("");
        console.log("Alternative approach:");
        console.log("  - Use labels instead of types for filtering");
        console.log("  - Or check if issues have specific labels like 'bug' or 'feature'");
      } else {
        console.log("✅ The 'type' field IS available!");
        console.log(`   Type value: ${firstIssue.type}`);
      }
    } else {
      console.log("⚠️  No open issues found in repository");
    }

  } catch (error) {
    console.error("❌ Error fetching issues:", error);
  }
}

testGitHubAPIResponse()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
