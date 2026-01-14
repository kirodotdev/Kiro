# Quick Start Guide

Get the GitHub issue automation up and running in 15 minutes.

## Prerequisites

- [ ] GitHub repository with admin access
- [ ] AWS account
- [ ] GitHub CLI installed (optional but recommended)

## Step 1: AWS Setup (5 minutes)

### 1.1 Enable Bedrock

1. Log in to AWS Console
2. Go to Amazon Bedrock
3. Click "Model access" in left sidebar
4. Find "Anthropic Claude Sonnet 4"
5. Click "Request model access"
6. Wait for approval (usually instant)

**Note:** The system uses inference profile ID `us.anthropic.claude-sonnet-4-20250514-v1:0` for cross-region routing and higher throughput.

### 1.2 Create IAM User

1. Go to IAM → Users → Create user
2. Name: `github-issue-automation`
3. Select "Access key - Programmatic access"
4. Click "Next"

### 1.3 Attach Policy

Create inline policy with this JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-*"
    }
  ]
}
```

### 1.4 Save Credentials

Copy and save:
- Access Key ID
- Secret Access Key

## Step 2: GitHub Setup (5 minutes)

### 2.1 Add Secrets

1. Go to repository Settings
2. Click Secrets and variables → Actions
3. Add these secrets:

| Name | Value |
|------|-------|
| `AWS_ACCESS_KEY_ID` | Your access key from Step 1.4 |
| `AWS_SECRET_ACCESS_KEY` | Your secret key from Step 1.4 |

### 2.2 Create Labels

Run this script (requires GitHub CLI):

```bash
# Save as create-labels.sh
gh label create "pending-triage" --color "fbca04" --force
gh label create "duplicate" --color "cfd3d7" --force
gh label create "pending-response" --color "fbca04" --force
gh label create "pending-maintainer-response" --color "fbca04" --force
gh label create "question" --color "d876e3" --force

# Add your most common labels
gh label create "cli" --color "0075ca" --force
gh label create "ide" --color "0075ca" --force
gh label create "documentation" --color "0075ca" --force

# Run it
chmod +x create-labels.sh
./create-labels.sh
```

Or create manually: Issues → Labels → New label

**Minimum required labels:**
- pending-triage
- duplicate
- pending-response

## Step 3: Install Dependencies (2 minutes)

```bash
cd scripts
npm install
npm run build
```

## Step 4: Test (3 minutes)

### 4.1 Test Issue Triage

1. Create a new issue in your repository
2. Go to Actions tab
3. Find "Issue Triage" workflow
4. Check the run:
   - ✅ Should complete successfully
   - ✅ Issue should have labels
   - ✅ Check workflow summary

### 4.2 Test Manual Workflows

```bash
# Test duplicate closer
gh workflow run close-duplicates.yml

# Test stale issue closer
gh workflow run close-stale.yml
```

Check Actions tab to verify they ran successfully.

## Step 5: Verify (Optional)

### Create a Duplicate

1. Create issue: "Test authentication error"
2. Create another: "Auth error when logging in"
3. Check if second issue:
   - Has "duplicate" label
   - Has comment listing first issue

### Test Stale Closure

1. Create an issue
2. Add "pending-response" label
3. Run: `gh workflow run close-stale.yml`
4. Issue should stay open (not 7 days old yet)

## Troubleshooting

### Workflow fails with AWS error

**Check:**
- Secrets are set correctly
- IAM user has Bedrock permission
- Model access is approved

**Fix:**
```bash
# Verify secrets
gh secret list

# Test AWS credentials locally
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
aws bedrock list-foundation-models --region us-east-1
```

### No labels applied

**Check:**
- Labels exist in repository
- Workflow completed successfully
- Check workflow logs for errors

**Fix:**
```bash
# List existing labels
gh label list

# Create missing labels
gh label create "pending-triage" --color "fbca04"
```

### Rate limit errors

**Check:**
```bash
gh api rate_limit
```

**Fix:**
- Wait for rate limit reset
- Reduce batch sizes in scripts
- Use GitHub App token (higher limits)

## Next Steps

### Customize Thresholds

Edit `scripts/`:

```typescript
// close_duplicates.ts - Change from 3 to 5 days
const DAYS_THRESHOLD = 5;

// close_stale.ts - Change from 7 to 14 days
const DAYS_THRESHOLD = 14;

// detect_duplicates.ts - Change from 80% to 90%
const SIMILARITY_THRESHOLD = 0.9;
```

Then rebuild:
```bash
cd scripts
npm run build
```

### Add More Labels

Add labels to `scripts/data_models.ts`:

```typescript
feature_component: string[] = [
  "auth",
  "cli",
  "your-new-label",  // Add here
  // ...
];
```

Then rebuild and create the label in GitHub.

### Adjust Schedules

Edit workflow files to change when they run:

```yaml
# .github/workflows/close-duplicates.yml
on:
  schedule:
    - cron: "0 */6 * * *"  # Every 6 hours instead of daily
```

## Monitoring

### Check Workflow Status

```bash
# List recent workflow runs
gh run list --workflow=issue-triage.yml

# View specific run
gh run view <run-id>
```

### Monitor AWS Costs

1. Go to AWS Cost Explorer
2. Filter by service: Bedrock
3. Check daily costs

**Expected:** ~$0.005 per issue

### View Logs

1. Go to Actions tab
2. Click on a workflow run
3. Expand steps to see detailed logs

## Getting Help

### Documentation
- Full setup: `.github/AUTOMATION_SETUP.md`
- Technical docs: `scripts/README.md`
- Workflow docs: `.github/workflows/README.md`

### Common Issues
- Check troubleshooting sections in docs
- Review workflow logs
- Verify all prerequisites are met

### Support
- Open an issue in the repository
- Check existing issues for solutions
- Review GitHub Actions documentation

## Success Checklist

- [x] AWS Bedrock access enabled
- [x] IAM user created with correct permissions
- [x] GitHub Secrets configured
- [x] Labels created
- [x] Dependencies installed
- [x] Test issue triaged successfully
- [x] Manual workflows tested
- [x] Monitoring set up

**🎉 You're all set!** The automation will now:
- Label new issues automatically
- Detect and mark duplicates
- Close old duplicates after 3 days
- Close stale issues after 7 days

---

**Need help?** Check the full documentation in `.github/AUTOMATION_SETUP.md`
