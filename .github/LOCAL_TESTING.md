# Local Testing Guide

Test the GitHub issue automation on your local machine before deploying to production.

## Prerequisites

- Node.js 20+ installed
- AWS credentials with Bedrock access
- (Optional) GitHub personal access token

## Quick Start

### 1. Install Dependencies

```bash
cd scripts
npm install
```

### 2. Set Environment Variables

```bash
# Required for classification
export AWS_ACCESS_KEY_ID="your-aws-access-key"
export AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
export AWS_REGION="us-east-1"  # optional, defaults to us-east-1

# Optional for duplicate detection
export GITHUB_TOKEN="your-github-token"
export REPOSITORY_OWNER="your-username"
export REPOSITORY_NAME="your-repo"
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Run Tests

```bash
node dist/test-local.js
```

## What Gets Tested

The local test script will:

1. ✅ **Label Validation** - Test label validation logic
2. ✅ **Issue Classification** - Test AWS Bedrock classification with sample issues
3. ✅ **Duplicate Detection** - Test duplicate detection (if GITHUB_TOKEN is set)

## Test Individual Components

### Test Classification Only

```bash
# Create a test file
cat > test-classify.ts << 'EOF'
import { LabelTaxonomy } from "./data_models.js";
import { classifyIssue } from "./bedrock_classifier.js";

async function test() {
  const taxonomy = new LabelTaxonomy();
  const result = await classifyIssue(
    "IDE crashes on startup",
    "The IDE crashes when I open it on Windows 11",
    taxonomy
  );
  console.log("Labels:", result.recommended_labels);
  console.log("Reasoning:", result.reasoning);
}

test();
EOF

# Build and run
npm run build
node dist/test-classify.js
```

### Test Duplicate Detection

```bash
# Set required variables
export GITHUB_TOKEN="your-token"
export REPOSITORY_OWNER="kirodotdev"
export REPOSITORY_NAME="kiro"

# Create test file
cat > test-duplicates.ts << 'EOF'
import { detectDuplicates } from "./detect_duplicates.js";

async function test() {
  const duplicates = await detectDuplicates(
    "Authentication error",
    "I'm getting an auth error when logging in",
    process.env.REPOSITORY_OWNER!,
    process.env.REPOSITORY_NAME!,
    999999,
    process.env.GITHUB_TOKEN!
  );
  console.log(`Found ${duplicates.length} duplicates`);
  duplicates.forEach(d => {
    console.log(`- #${d.issue_number}: ${d.similarity_score}`);
  });
}

test();
EOF

npm run build
node dist/test-duplicates.js
```

### Test Full Triage Flow

```bash
# Set all required variables
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export GITHUB_TOKEN="your-token"
export REPOSITORY_OWNER="your-username"
export REPOSITORY_NAME="your-repo"
export ISSUE_NUMBER="123"
export ISSUE_TITLE="Test issue title"
export ISSUE_BODY="Test issue description"

# Run triage
npm run build
node dist/triage_issue.js
```

**⚠️ Warning:** This will actually modify the issue in your repository!

## Mock Testing (No API Calls)

To test without making real API calls, create mock versions:

### Mock Bedrock Classifier

```typescript
// test-mock-classify.ts
import { ClassificationResult, LabelTaxonomy } from "./data_models.js";

function mockClassifyIssue(
  title: string,
  body: string,
  taxonomy: LabelTaxonomy
): ClassificationResult {
  // Simple keyword-based classification
  const labels: string[] = [];
  
  if (title.toLowerCase().includes("auth")) labels.push("auth");
  if (title.toLowerCase().includes("cli")) labels.push("cli");
  if (title.toLowerCase().includes("crash")) labels.push("theme:unexpected-error");
  if (body.toLowerCase().includes("mac")) labels.push("os: mac");
  if (body.toLowerCase().includes("windows")) labels.push("os: windows");
  
  return {
    recommended_labels: labels,
    confidence_scores: {},
    reasoning: "Mock classification based on keywords",
  };
}

// Test it
const taxonomy = new LabelTaxonomy();
const result = mockClassifyIssue(
  "Auth error on CLI",
  "Getting authentication errors on macOS",
  taxonomy
);
console.log("Mock labels:", result.recommended_labels);
```

## Testing Workflows Locally

### Using Act (GitHub Actions Locally)

Install [act](https://github.com/nektos/act):

```bash
# macOS
brew install act

# Linux
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

Run workflows locally:

```bash
# Test issue triage workflow
act issues -e test-event.json

# Test scheduled workflows
act schedule
```

Create `test-event.json`:

```json
{
  "issue": {
    "number": 1,
    "title": "Test issue",
    "body": "Test description",
    "labels": []
  },
  "repository": {
    "name": "test-repo",
    "owner": {
      "login": "test-owner"
    }
  }
}
```

**Note:** Act requires Docker to be installed.

## Debugging

### Enable Verbose Logging

Add debug logging to any script:

```typescript
// At the top of the file
const DEBUG = true;

function debug(...args: any[]) {
  if (DEBUG) console.log("[DEBUG]", ...args);
}

// Use throughout code
debug("Calling Bedrock API with:", { title, body });
```

### Check API Responses

Log full API responses:

```typescript
// In bedrock_classifier.ts
const response = await client.send(command);
const responseBody = new TextDecoder().decode(response.body);
console.log("Raw Bedrock response:", responseBody);
```

### Test Error Handling

Simulate errors:

```typescript
// Test retry logic
async function testRetry() {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error("Simulated error");
    }
    return "Success";
  };
  
  const result = await retryWithBackoff(fn);
  console.log(`Succeeded after ${attempts} attempts:`, result);
}
```

## Cost Estimation

### AWS Bedrock Costs

When testing locally, you'll incur AWS costs:

- **Input tokens**: ~$0.003 per 1K tokens
- **Output tokens**: ~$0.015 per 1K tokens
- **Typical test**: ~500 input + 200 output tokens = ~$0.005

**10 test runs ≈ $0.05**

### Minimize Costs

1. Use mock functions for development
2. Test with small batches
3. Cache results during development
4. Use AWS Free Tier if available

## Common Issues

### "Module not found" errors

**Problem:** Import errors with `.js` extensions

**Solution:**
```bash
# Clean and rebuild
npm run clean
npm run build
```

### AWS authentication errors

**Problem:** `UnrecognizedClientException`

**Solution:**
```bash
# Verify credentials
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --region us-east-1
```

### TypeScript compilation errors

**Problem:** Type errors or compilation failures

**Solution:**
```bash
# Check TypeScript version
npx tsc --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Rate limiting

**Problem:** GitHub API rate limit exceeded

**Solution:**
```bash
# Check rate limit
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# Wait for reset or use different token
```

## Best Practices

### 1. Use Test Repository

Create a dedicated test repository:
- Prevents accidental modifications to production issues
- Allows unlimited testing
- Can be deleted after testing

### 2. Test Incrementally

Test components in order:
1. Label validation (no API calls)
2. Classification (AWS API only)
3. Duplicate detection (GitHub API only)
4. Full triage (both APIs)

### 3. Monitor Costs

Check AWS costs regularly:
```bash
# View Bedrock usage
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://bedrock-filter.json
```

### 4. Use Environment Files

Create `.env` file (don't commit!):
```bash
# .env
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
GITHUB_TOKEN=your-token
REPOSITORY_OWNER=your-username
REPOSITORY_NAME=test-repo
```

Load with:
```bash
export $(cat .env | xargs)
```

## Automated Testing

### Unit Tests (Future)

```bash
# Run unit tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Integration Tests

Create integration test suite:

```typescript
// test-integration.ts
describe("Issue Automation", () => {
  it("should classify issues correctly", async () => {
    // Test implementation
  });
  
  it("should detect duplicates", async () => {
    // Test implementation
  });
});
```

## Cleanup

After testing:

```bash
# Remove test issues (if created)
gh issue list --label "test" --json number --jq '.[].number' | \
  xargs -I {} gh issue close {}

# Clear environment variables
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset GITHUB_TOKEN

# Clean build artifacts
npm run clean
```

## Next Steps

Once local testing is successful:

1. ✅ Verify all components work
2. ✅ Check AWS costs are acceptable
3. ✅ Test error handling
4. 🚀 Deploy to GitHub Actions
5. 📊 Monitor production usage

## Support

For issues with local testing:
- Check the troubleshooting section above
- Review error messages carefully
- Test components individually
- Verify environment variables are set correctly

---

**Happy Testing! 🧪**
