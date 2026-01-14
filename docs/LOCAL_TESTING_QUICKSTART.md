# Local Testing Quick Start

Test the GitHub issue automation on your local machine in 5 minutes.

## Prerequisites

- Node.js 20+ installed
- AWS credentials with Bedrock access

## Step 1: Setup (2 minutes)

```bash
# Navigate to scripts directory
cd scripts

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

## Step 2: Configure (1 minute)

Edit `.env` file with your credentials:

```bash
# Required
AWS_ACCESS_KEY_ID=your-actual-key
AWS_SECRET_ACCESS_KEY=your-actual-secret
AWS_REGION=us-east-1

# Optional (for duplicate detection)
GITHUB_TOKEN=your-github-token
REPOSITORY_OWNER=your-username
REPOSITORY_NAME=your-repo
```

## Step 3: Load Environment (30 seconds)

```bash
# Load environment variables
export $(cat .env | xargs)

# Verify they're set
echo $AWS_ACCESS_KEY_ID
```

## Step 4: Run Tests (1 minute)

### Option A: Using npm script (recommended)

```bash
npm run test:local
```

### Option B: Using shell script

```bash
chmod +x test.sh
./test.sh
```

### Option C: Manual

```bash
npm run build
node dist/test-local.js
```

## What You'll See

The test will:

1. ✅ **Validate labels** - Test label validation logic
2. ✅ **Classify issues** - Test AWS Bedrock with 4 sample issues
3. ✅ **Detect duplicates** - Test duplicate detection (if GITHUB_TOKEN set)

### Example Output

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
   Valid: auth, cli, os: mac
✅ Mixed valid and invalid: 2/2 valid
   Valid: auth, ide

=== Testing Issue Classification ===

Issue: "Authentication fails when using SSO"
Body: When I try to log in using SSO, I get an error message...
✅ Recommended labels: auth, os: mac, os: windows
   Reasoning: Issue relates to authentication with SSO...
   Valid labels: auth, os: mac, os: windows

Issue: "IDE crashes on startup"
Body: The IDE crashes immediately after opening...
✅ Recommended labels: ide, os: linux, theme:unexpected-error
   Reasoning: IDE crash issue on Linux...
   Valid labels: ide, os: linux, theme:unexpected-error

✅ All tests completed!

💡 Tips:
   - Set GITHUB_TOKEN to test duplicate detection
   - Set REPOSITORY_OWNER and REPOSITORY_NAME to test against your repo
   - Check AWS costs after testing (Bedrock charges per API call)
```

## Test Individual Components

### Test Classification Only

```bash
# Create a simple test
cat > test-one.ts << 'EOF'
import { LabelTaxonomy } from "./data_models.js";
import { classifyIssue } from "./bedrock_classifier.js";

const taxonomy = new LabelTaxonomy();
classifyIssue(
  "CLI crashes on macOS",
  "The command-line interface crashes when I run it",
  taxonomy
).then(result => {
  console.log("Labels:", result.recommended_labels);
  console.log("Reasoning:", result.reasoning);
});
EOF

npm run build
node dist/test-one.js
```

### Test with Your Own Issue

```bash
# Set your issue details
export ISSUE_TITLE="Your issue title here"
export ISSUE_BODY="Your issue description here"

# Run classification
node -e "
import('./dist/bedrock_classifier.js').then(m => {
  import('./dist/data_models.js').then(d => {
    const taxonomy = new d.LabelTaxonomy();
    m.classifyIssue(
      process.env.ISSUE_TITLE,
      process.env.ISSUE_BODY,
      taxonomy
    ).then(r => console.log(r));
  });
});
"
```

## Troubleshooting

### "AWS credentials not set"

```bash
# Check if variables are set
echo $AWS_ACCESS_KEY_ID

# If empty, load from .env
export $(cat .env | xargs)
```

### "Module not found"

```bash
# Rebuild
npm run clean
npm run build
```

### "UnrecognizedClientException"

```bash
# Verify AWS credentials work
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --region us-east-1
```

### "Rate limit exceeded"

```bash
# Check GitHub rate limit
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# Wait or use different token
```

## Cost Warning

⚠️ **Testing uses real AWS Bedrock API calls**

- Each test issue: ~$0.005
- Full test run (4 issues): ~$0.02
- 10 test runs: ~$0.20

To minimize costs:
- Test with fewer issues
- Use mock functions for development
- Monitor AWS costs regularly

## Next Steps

Once local testing works:

1. ✅ All tests pass
2. ✅ Labels are correct
3. ✅ Costs are acceptable
4. 🚀 Deploy to GitHub Actions

See `.github/QUICKSTART.md` for deployment instructions.

## Full Documentation

- **Local Testing Guide**: `.github/LOCAL_TESTING.md`
- **Setup Guide**: `.github/AUTOMATION_SETUP.md`
- **Quick Start**: `.github/QUICKSTART.md`
- **Technical Docs**: `scripts/README.md`

## Support

Having issues? Check:
1. Environment variables are set correctly
2. AWS credentials have Bedrock access
3. Node.js version is 20+
4. Dependencies are installed

---

**Ready to test? Run:** `npm run test:local`
