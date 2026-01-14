# Issue Automation Setup Guide

This guide will help you set up the automated issue management system for your repository.

## Prerequisites

- GitHub repository with admin access
- AWS account with Bedrock access
- GitHub CLI (optional, for easier setup)

## Step 1: AWS Bedrock Setup

### 1.1 Enable Bedrock

1. Log in to AWS Console
2. Navigate to Amazon Bedrock
3. Select your preferred region (e.g., us-east-1)
4. Request access to the Claude Sonnet 4 model:
   - Go to "Model access"
   - Find "Anthropic Claude Sonnet 4"
   - Click "Request model access"
   - Wait for approval (usually instant)

**Note:** The system uses AWS Bedrock inference profiles. The model ID format is `us.anthropic.claude-sonnet-4-20250514-v1:0` (not the direct model ID `anthropic.claude-sonnet-4-20250514`). Inference profiles provide cross-region routing and higher throughput.

### 1.2 Create IAM User

Create a dedicated IAM user for the automation:

1. Go to IAM → Users → Create user
2. User name: `github-issue-automation`
3. Select "Access key - Programmatic access"
4. Click "Next: Permissions"

### 1.3 Attach IAM Policy

Create and attach a custom policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvokeModel",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-*"
      ]
    }
  ]
}
```

**Policy Name:** `GitHubIssueAutomationBedrockAccess`

### 1.4 Save Credentials

After creating the user, save the credentials:
- Access Key ID
- Secret Access Key

⚠️ **Important:** Store these securely - you'll need them for GitHub Secrets.

## Step 2: GitHub Repository Setup

### 2.1 Add GitHub Secrets

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add the following secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key ID | From Step 1.4 |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret access key | From Step 1.4 |
| `AWS_REGION` (optional) | `us-east-1` | AWS region for Bedrock |

### 2.2 Create Labels

The automation requires specific labels. You can create them using the GitHub CLI or manually.

#### Option A: Using GitHub CLI

Save this script as `create-labels.sh`:

```bash
#!/bin/bash

# Feature/Component Labels
gh label create "auth" --color "0075ca" --description "Authentication and authorization"
gh label create "autocomplete" --color "0075ca" --description "Autocomplete functionality"
gh label create "chat" --color "0075ca" --description "Chat features"
gh label create "cli" --color "0075ca" --description "Command-line interface"
gh label create "extensions" --color "0075ca" --description "Extensions and plugins"
gh label create "hooks" --color "0075ca" --description "Hooks functionality"
gh label create "ide" --color "0075ca" --description "IDE features"
gh label create "mcp" --color "0075ca" --description "Model Context Protocol"
gh label create "models" --color "0075ca" --description "AI models"
gh label create "powers" --color "0075ca" --description "Powers functionality"
gh label create "specs" --color "0075ca" --description "Specifications"
gh label create "ssh" --color "0075ca" --description "SSH functionality"
gh label create "steering" --color "0075ca" --description "Steering features"
gh label create "sub-agents" --color "0075ca" --description "Sub-agents"
gh label create "terminal" --color "0075ca" --description "Terminal features"
gh label create "ui" --color "0075ca" --description "User interface"
gh label create "usability" --color "0075ca" --description "Usability improvements"
gh label create "trusted-commands" --color "0075ca" --description "Trusted commands"
gh label create "pricing" --color "0075ca" --description "Pricing related"
gh label create "documentation" --color "0075ca" --description "Documentation"
gh label create "dependencies" --color "0075ca" --description "Dependencies"
gh label create "compaction" --color "0075ca" --description "Compaction features"

# OS-Specific Labels
gh label create "os: linux" --color "ededed" --description "Linux-specific issues"
gh label create "os: mac" --color "ededed" --description "macOS-specific issues"
gh label create "os: windows" --color "ededed" --description "Windows-specific issues"

# Theme Labels
gh label create "theme:account" --color "d4c5f9" --description "Account-related issues"
gh label create "theme:agent-latency" --color "d4c5f9" --description "Agent latency issues"
gh label create "theme:agent-quality" --color "d4c5f9" --description "Agent quality issues"
gh label create "theme:context-limit-issue" --color "d4c5f9" --description "Context limit issues"
gh label create "theme:ide-performance" --color "d4c5f9" --description "IDE performance issues"
gh label create "theme:slow-unresponsive" --color "d4c5f9" --description "Slow or unresponsive"
gh label create "theme:ssh-wsl" --color "d4c5f9" --description "SSH/WSL issues"
gh label create "theme:unexpected-error" --color "d4c5f9" --description "Unexpected errors"

# Workflow Labels
gh label create "pending-maintainer-response" --color "fbca04" --description "Awaiting maintainer response"
gh label create "pending-response" --color "fbca04" --description "Awaiting user response"
gh label create "pending-triage" --color "fbca04" --description "Awaiting triage"
gh label create "duplicate" --color "cfd3d7" --description "Duplicate issue"
gh label create "question" --color "d876e3" --description "Question"

# Special Labels
gh label create "Autonomous agent" --color "1d76db" --description "Autonomous agent related"
gh label create "Inline chat" --color "1d76db" --description "Inline chat related"
gh label create "on boarding" --color "1d76db" --description "Onboarding related"

echo "✓ All labels created successfully"
```

Run the script:
```bash
chmod +x create-labels.sh
./create-labels.sh
```

#### Option B: Manual Creation

Go to Issues → Labels → New label and create each label manually using the names and colors from the script above.

### 2.3 Enable Workflows

The workflows are automatically enabled when you push the code to your repository. To verify:

1. Go to Actions tab
2. You should see three workflows:
   - Issue Triage
   - Close Duplicate Issues
   - Close Stale Issues

## Step 3: Testing

### 3.1 Test Issue Triage

1. Create a new test issue
2. Go to Actions tab
3. Find the "Issue Triage" workflow run
4. Verify:
   - Labels were applied
   - No errors in the logs
   - Workflow summary shows success

### 3.2 Test Duplicate Detection

1. Create an issue with a specific title (e.g., "Test authentication error")
2. Create another issue with similar content
3. Check if the second issue:
   - Has a comment listing the first issue as a duplicate
   - Has the "duplicate" label

### 3.3 Test Manual Workflows

Test the scheduled workflows manually:

```bash
# Test duplicate closer
gh workflow run close-duplicates.yml

# Test stale issue closer
gh workflow run close-stale.yml
```

## Step 4: Monitoring

### 4.1 Workflow Runs

Monitor workflow runs in the Actions tab:
- Check for failures
- Review workflow summaries
- Investigate any errors

### 4.2 Rate Limits

Check GitHub API rate limits:
```bash
gh api rate_limit
```

### 4.3 AWS Costs

Monitor AWS Bedrock usage:
1. Go to AWS Cost Explorer
2. Filter by service: Bedrock
3. Review monthly costs

**Expected costs:**
- Claude Sonnet 4.5: ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens
- Typical issue classification: ~500 tokens input, ~200 tokens output
- Cost per issue: ~$0.005

## Troubleshooting

### Issue: Workflows not triggering

**Solution:**
1. Check that workflows are enabled in Settings → Actions
2. Verify the workflow files are in `.github/workflows/`
3. Ensure the repository has issues enabled

### Issue: AWS authentication errors

**Solution:**
1. Verify secrets are correctly set
2. Check IAM user has correct permissions
3. Ensure Bedrock model access is approved

### Issue: Labels not being applied

**Solution:**
1. Verify all labels exist in the repository
2. Check workflow logs for errors
3. Ensure GITHUB_TOKEN has write permissions

### Issue: High AWS costs

**Solution:**
1. Review the number of issues being processed
2. Consider adjusting the duplicate detection batch size
3. Monitor Bedrock usage in AWS Console

## Advanced Configuration

### Customizing Thresholds

Edit `scripts/` files:

**Duplicate closure (default: 3 days):**
```typescript
// close_duplicates.ts
const DAYS_THRESHOLD = 3;
```

**Stale issues (default: 7 days):**
```typescript
// close_stale.ts
const DAYS_THRESHOLD = 7;
```

**Duplicate similarity (default: 80%):**
```typescript
// detect_duplicates.ts
const SIMILARITY_THRESHOLD = 0.8;
```

### Customizing Schedules

Edit workflow files to change when they run:

```yaml
on:
  schedule:
    - cron: "0 0 * * *"  # Daily at midnight UTC
```

Cron examples:
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 1` - Every Monday at midnight
- `0 9 * * 1-5` - Weekdays at 9 AM

## Security Best Practices

1. **Rotate AWS credentials regularly** (every 90 days)
2. **Use least-privilege IAM policies** (only Bedrock InvokeModel)
3. **Monitor AWS CloudTrail** for suspicious activity
4. **Review workflow logs** for security issues
5. **Keep dependencies updated** (npm audit)

## Support

For issues with the automation:
1. Check workflow logs in Actions tab
2. Review this setup guide
3. Consult the troubleshooting section
4. Open an issue in the repository

## Maintenance

### Monthly Tasks
- [ ] Review AWS costs
- [ ] Check workflow success rates
- [ ] Update dependencies if needed

### Quarterly Tasks
- [ ] Rotate AWS credentials
- [ ] Review and update label taxonomy
- [ ] Audit closed duplicate/stale issues

### Annual Tasks
- [ ] Review IAM policies
- [ ] Evaluate automation effectiveness
- [ ] Consider threshold adjustments
