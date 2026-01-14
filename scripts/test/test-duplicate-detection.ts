/**
 * Dedicated test for duplicate detection functionality
 */

import { detectDuplicates } from "../detect_duplicates.js";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║         Duplicate Detection Test                          ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log("");

async function testDuplicateDetection() {
  const owner = process.env.REPOSITORY_OWNER || "kirodotdev";
  const repo = process.env.REPOSITORY_NAME || "kiro";

  console.log(`Repository: ${owner}/${repo}`);
  console.log("");

  // Test cases with different types of issues
  const testCases = [
    {
      title: "Authentication error with SSO",
      body: "I'm getting an authentication error when trying to use SSO login. The error message says 'Authentication failed'. I'm on Windows 11.",
      issueNumber: 999991,
    },
    {
      title: "IDE crashes on startup",
      body: "The IDE crashes immediately when I try to open it. I'm using macOS Sonoma. Error: Unexpected error occurred.",
      issueNumber: 999992,
    },
    {
      title: "Terminal autocomplete not working",
      body: "The autocomplete feature in the integrated terminal doesn't work. I'm using the CLI on Linux Ubuntu 22.04.",
      issueNumber: 999993,
    },
    {
      title: "Slow performance with large files",
      body: "The IDE becomes very slow and unresponsive when I open files larger than 10MB. This makes it unusable for large codebases.",
      issueNumber: 999994,
    },
    {
      title: "Cannot connect to remote SSH server",
      body: "I'm unable to connect to my remote SSH server. The connection times out after 30 seconds. I've checked my SSH keys and they're correct.",
      issueNumber: 999995,
    },
  ];

  let totalDuplicates = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    console.log("─".repeat(60));
    console.log(`\nTest Issue #${testCase.issueNumber}`);
    console.log(`Title: "${testCase.title}"`);
    console.log(`Body: ${testCase.body.substring(0, 80)}...`);
    console.log("");

    try {
      const githubToken = process.env.GITHUB_TOKEN || "";
      const duplicates = await detectDuplicates(
        testCase.title,
        testCase.body,
        owner,
        repo,
        testCase.issueNumber,
        githubToken
      );

      if (duplicates.length > 0) {
        console.log(`✅ Found ${duplicates.length} potential duplicate(s):`);
        duplicates.forEach((dup) => {
          console.log(`   - #${dup.issue_number}: ${dup.issue_title}`);
          console.log(`     Similarity: ${(dup.similarity_score * 100).toFixed(1)}%`);
          console.log(`     URL: ${dup.url}`);
          console.log(`     Reasoning: ${dup.reasoning.substring(0, 100)}...`);
        });
        totalDuplicates += duplicates.length;
      } else {
        console.log("✅ No duplicates found (unique issue)");
      }
    } catch (error) {
      console.error(`❌ Error testing duplicate detection:`, error);
    }

    console.log("");
  }

  console.log("═".repeat(60));
  console.log("");
  console.log("📊 Test Summary:");
  console.log(`   Total test cases: ${totalTests}`);
  console.log(`   Total duplicates found: ${totalDuplicates}`);
  console.log(`   Average duplicates per issue: ${(totalDuplicates / totalTests).toFixed(1)}`);
  console.log("");

  console.log("💡 Insights:");
  console.log("   - Duplicate detection uses semantic similarity (AI-powered)");
  console.log("   - Threshold: 80% similarity");
  console.log("   - Compares against all open issues in repository");
  console.log("   - Provides reasoning for each match");
  console.log("");

  console.log("✅ Duplicate detection test complete!");
}

// Run test
testDuplicateDetection()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
