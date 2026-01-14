/**
 * Local Testing Script
 * Test the issue automation locally without GitHub Actions
 */

import { LabelTaxonomy } from "../data_models.js";
import { classifyIssue } from "../bedrock_classifier.js";
import { validateLabels } from "../assign_labels.js";
import {
  detectDuplicates,
  generateDuplicateComment,
} from "../detect_duplicates.js";

// Test data
const TEST_ISSUES = [
  {
    title: "Authentication fails when using SSO",
    body: "When I try to log in using SSO, I get an error message saying 'Authentication failed'. This happens on both Mac and Windows.",
  },
  {
    title: "IDE crashes on startup",
    body: "The IDE crashes immediately after opening. I'm on Linux Ubuntu 22.04. Error message: 'Unexpected error occurred'.",
  },
  {
    title: "Autocomplete not working in terminal",
    body: "The autocomplete feature doesn't work in the integrated terminal. I'm using the CLI on macOS.",
  },
  {
    title: "Slow performance when opening large files",
    body: "The IDE becomes very slow and unresponsive when I open files larger than 10MB. This is affecting my productivity.",
  },
];

async function testClassification() {
  console.log("\n=== Testing Issue Classification ===\n");

  const taxonomy = new LabelTaxonomy();

  for (const issue of TEST_ISSUES) {
    console.log(`\nIssue: "${issue.title}"`);
    console.log(`Body: ${issue.body.substring(0, 80)}...`);

    try {
      const result = await classifyIssue(issue.title, issue.body, taxonomy);

      if (result.error) {
        console.error(`❌ Error: ${result.error}`);
      } else {
        console.log(`✅ Recommended labels: ${result.recommended_labels.join(", ")}`);
        console.log(`   Reasoning: ${result.reasoning}`);

        // Validate labels
        const validLabels = validateLabels(result.recommended_labels, taxonomy);
        console.log(`   Valid labels: ${validLabels.join(", ")}`);
      }
    } catch (error) {
      console.error(`❌ Classification failed: ${error}`);
    }
  }
}

async function testDuplicateDetection() {
  console.log("\n\n=== Testing Duplicate Detection ===\n");

  // Check if we have required environment variables
  const githubToken = process.env.GITHUB_TOKEN;
  const owner = process.env.REPOSITORY_OWNER || "kirodotdev";
  const repo = process.env.REPOSITORY_NAME || "kiro";

  if (!githubToken) {
    console.log("⚠️  Skipping duplicate detection test (GITHUB_TOKEN not set)");
    console.log("   Set GITHUB_TOKEN to test duplicate detection");
    return;
  }

  console.log(`Repository: ${owner}/${repo}`);

  const testIssue = {
    title: "Authentication error with SSO",
    body: "I'm getting an authentication error when trying to use SSO login",
  };

  console.log(`\nTest Issue: "${testIssue.title}"`);

  try {
    const duplicates = await detectDuplicates(
      testIssue.title,
      testIssue.body,
      owner,
      repo,
      999999, // Use a high number that won't exist
      githubToken
    );

    if (duplicates.length > 0) {
      console.log(`✅ Found ${duplicates.length} potential duplicate(s):`);
      for (const dup of duplicates) {
        console.log(
          `   - #${dup.issue_number}: ${dup.issue_title} (${(
            dup.similarity_score * 100
          ).toFixed(0)}% similar)`
        );
      }

      // Test comment generation
      const comment = generateDuplicateComment(duplicates);
      console.log("\n📝 Generated comment:");
      console.log(comment.substring(0, 200) + "...");
    } else {
      console.log("✅ No duplicates found");
    }
  } catch (error) {
    console.error(`❌ Duplicate detection failed: ${error}`);
  }
}

async function testLabelValidation() {
  console.log("\n\n=== Testing Label Validation ===\n");

  const taxonomy = new LabelTaxonomy();

  const testCases = [
    {
      name: "Valid labels",
      labels: ["auth", "cli", "os: mac"],
      expected: 3,
    },
    {
      name: "Mixed valid and invalid",
      labels: ["auth", "invalid-label", "ide"],
      expected: 2,
    },
    {
      name: "All invalid",
      labels: ["fake-label", "another-fake"],
      expected: 0,
    },
    {
      name: "Empty array",
      labels: [],
      expected: 0,
    },
  ];

  for (const test of testCases) {
    const validLabels = validateLabels(test.labels, taxonomy);
    const passed = validLabels.length === test.expected;

    console.log(
      `${passed ? "✅" : "❌"} ${test.name}: ${validLabels.length}/${
        test.expected
      } valid`
    );
    if (validLabels.length > 0) {
      console.log(`   Valid: ${validLabels.join(", ")}`);
    }
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         GitHub Issue Automation - Local Testing           ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Check environment variables
  console.log("\n📋 Environment Check:");
  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? "✅ Set" : "❌ Not set"}`);
  console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? "✅ Set" : "❌ Not set"}`);
  console.log(`   AWS_REGION: ${process.env.AWS_REGION || "us-east-1 (default)"}`);
  console.log(`   GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? "✅ Set" : "⚠️  Not set (optional)"}`);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log("\n❌ AWS credentials not set. Please set:");
    console.log("   export AWS_ACCESS_KEY_ID='your-key'");
    console.log("   export AWS_SECRET_ACCESS_KEY='your-secret'");
    console.log("   export AWS_REGION='us-east-1'  # optional");
    process.exit(1);
  }

  try {
    // Run tests
    await testLabelValidation();
    await testClassification();
    await testDuplicateDetection();

    console.log("\n\n✅ All tests completed!");
    console.log("\n💡 Tips:");
    console.log("   - Set GITHUB_TOKEN to test duplicate detection");
    console.log("   - Set REPOSITORY_OWNER and REPOSITORY_NAME to test against your repo");
    console.log("   - Check AWS costs after testing (Bedrock charges per API call)");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
