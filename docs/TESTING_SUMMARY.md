# Testing Summary - GitHub Issue Automation

## Yes, You Can Test Locally! ✅

The automation can be fully tested on your local machine before deploying to GitHub Actions.

## Quick Answer

**5-Minute Local Test:**

```bash
# 1. Setup
cd scripts
npm install
cp .env.example .env

# 2. Add your AWS credentials to .env
# Edit .env file with your keys

# 3. Load and test
export $(cat .env | xargs)
npm run test:local
```

## What Was Created for Testing

### 1. Test Script (`test-local.ts`)
- Tests label validation
- Tests issue classification with 4 sample issues
- Tests duplicate detection (if GitHub token provided)
- Comprehensive output with pass/fail indicators

### 2. Shell Script (`test.sh`)
- Automated setup and testing
- Checks prerequisites
- Validates environment variables
- Runs full test suite

### 3. Documentation
- **LOCAL_TESTING_QUICKSTART.md** - 5-minute quick start
- **.github/LOCAL_TESTING.md** - Complete testing guide
- **.env.example** - Environment variable template

### 4. npm Scripts
```json
{
  "test:local": "npm run build && node dist/test-local.js"
}
```

## Testing Options

### Option 1: Full Automated Test (Recommended)

```bash
cd scripts
./test.sh
```

**Tests:**
- ✅ Label validation
- ✅ AWS Bedrock classification
- ✅ Duplicate detection (optional)

**Cost:** ~$0.02 per run

### Option 2: Component Testing

Test individual parts without full integration:

```bash
# Test label validation only (free)
node -e "
import('./dist/assign_labels.js').then(m => {
  import('./dist/data_models.js').then(d => {
    const taxonomy = new d.LabelTaxonomy();
    const valid = m.validateLabels(['auth', 'cli', 'fake'], taxonomy);
    console.log('Valid labels:', valid);
  });
});
"

# Test classification only (~$0.005)
node -e "
import('./dist/bedrock_classifier.js').then(m => {
  import('./dist/data_models.js').then(d => {
    const taxonomy = new d.LabelTaxonomy();
    m.classifyIssue('Test', 'Description', taxonomy)
      .then(r => console.log(r));
  });
});
"
```

### Option 3: Mock Testing (Free)

Test logic without API calls:

```typescript
// Create mock-test.ts
import { validateLabels } from "./assign_labels.js";
import { LabelTaxonomy } from "./data_models.js";

const taxonomy = new LabelTaxonomy();
const result = validateLabels(["auth", "cli", "invalid"], taxonomy);
console.log("Valid:", result); // ["auth", "cli"]
```

### Option 4: GitHub Actions Local Testing

Use [act](https://github.com/nektos/act) to run workflows locally:

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run workflow
act issues -e test-event.json
```

## What Gets Tested

### ✅ Label Validation
- Tests that only valid labels are assigned
- Tests filtering of invalid labels
- **Cost:** Free (no API calls)

### ✅ Issue Classification
- Tests AWS Bedrock integration
- Tests with 4 different issue types
- Tests prompt construction
- Tests response parsing
- **Cost:** ~$0.02 (4 API calls)

### ✅ Duplicate Detection (Optional)
- Tests GitHub API integration
- Tests semantic similarity
- Tests comment generation
- **Cost:** ~$0.01 + GitHub API calls

### ✅ Error Handling
- Tests retry logic
- Tests graceful degradation
- Tests error logging

## Prerequisites

### Required
- Node.js 20+
- AWS credentials with Bedrock access
- AWS Bedrock Claude Sonnet 4 model access (inference profile: us.anthropic.claude-sonnet-4-20250514-v1:0)

### Optional
- GitHub personal access token (for duplicate detection)
- Docker (for act/GitHub Actions local testing)

## Setup Steps

### 1. Install Dependencies
```bash
cd scripts
npm install
```

### 2. Configure Environment
```bash
# Copy template
cp .env.example .env

# Edit .env with your credentials
nano .env  # or your preferred editor
```

### 3. Load Environment
```bash
export $(cat .env | xargs)
```

### 4. Build
```bash
npm run build
```

### 5. Test
```bash
npm run test:local
```

## Expected Output

```
╔════════════════════════════════════════════════════════════╗
║         GitHub Issue Automation - Local Testing           ║
╚════════════════════════════════════════════════════════════╝

📋 Environment Check:
   AWS_ACCESS_KEY_ID: ✅ Set
   AWS_SECRET_ACCESS_KEY: ✅ Set
   AWS_REGION: us-east-1 (default)
   GITHUB_TOKEN: ⚠️  Not set (optional)

=== Testing Label Validation ===

✅ Valid labels: 3/3 valid
✅ Mixed valid and invalid: 2/2 valid
✅ All invalid: 0/0 valid
✅ Empty array: 0/0 valid

=== Testing Issue Classification ===

Issue: "Authentication fails when using SSO"
✅ Recommended labels: auth, os: mac, os: windows
   Reasoning: Issue relates to authentication...

Issue: "IDE crashes on startup"
✅ Recommended labels: ide, os: linux, theme:unexpected-error
   Reasoning: IDE crash issue on Linux...

Issue: "Autocomplete not working in terminal"
✅ Recommended labels: autocomplete, terminal, cli, os: mac
   Reasoning: Terminal autocomplete issue...

Issue: "Slow performance when opening large files"
✅ Recommended labels: ide, theme:ide-performance, theme:slow-unresponsive
   Reasoning: Performance issue with large files...

=== Testing Duplicate Detection ===

⚠️  Skipping duplicate detection test (GITHUB_TOKEN not set)
   Set GITHUB_TOKEN to test duplicate detection

✅ All tests completed!
```

## Cost Breakdown

### Per Test Run
- Label validation: **Free**
- Classification (4 issues): **~$0.02**
- Duplicate detection: **~$0.01**
- **Total: ~$0.03 per full test**

### Development Testing
- 10 test runs: **~$0.30**
- 50 test runs: **~$1.50**
- 100 test runs: **~$3.00**

### Cost Optimization
1. Use mock functions during development
2. Test label validation first (free)
3. Test classification with 1 issue initially
4. Run full tests only when needed

## Troubleshooting

### Common Issues

**1. "AWS credentials not set"**
```bash
# Check variables
env | grep AWS

# Reload from .env
export $(cat .env | xargs)
```

**2. "Module not found"**
```bash
npm run clean
npm install
npm run build
```

**3. "UnrecognizedClientException"**
```bash
# Verify credentials
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --region us-east-1
```

**4. "Rate limit exceeded"**
```bash
# Check rate limit
gh api rate_limit

# Or with curl
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit
```

## Testing Checklist

Before deploying to production:

- [ ] Local tests pass
- [ ] Label validation works
- [ ] Classification returns correct labels
- [ ] Duplicate detection works (if using)
- [ ] Error handling works
- [ ] AWS costs are acceptable
- [ ] All environment variables documented
- [ ] Test with real repository issues

## Next Steps

After successful local testing:

1. ✅ Verify all tests pass
2. ✅ Check AWS costs
3. ✅ Review classification accuracy
4. 📝 Document any custom configurations
5. 🚀 Deploy to GitHub Actions
6. 📊 Monitor production usage

## Documentation Links

- **Quick Start**: `LOCAL_TESTING_QUICKSTART.md`
- **Full Guide**: `.github/LOCAL_TESTING.md`
- **Setup Guide**: `.github/AUTOMATION_SETUP.md`
- **Deployment**: `.github/QUICKSTART.md`
- **Technical**: `scripts/README.md`

## Support

Need help with testing?

1. Check the troubleshooting section
2. Review error messages carefully
3. Test components individually
4. Verify environment variables
5. Check AWS/GitHub credentials

## Summary

**Yes, you can test locally!** 

The system includes:
- ✅ Comprehensive test script
- ✅ Automated test runner
- ✅ Component-level testing
- ✅ Mock testing options
- ✅ Cost-effective testing
- ✅ Complete documentation

**Get started:** `cd scripts && npm run test:local`

---

*Testing is fast, easy, and costs less than $0.05 per run!*
