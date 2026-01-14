# GitHub Issue Automation Workflows

This directory contains automated workflows for managing GitHub issues using AWS Bedrock AI.

## Overview

The automation system provides:
- **Automatic Label Assignment** - AI-powered classification of issues
- **Duplicate Detection** - Semantic similarity analysis to find duplicate issues
- **Duplicate Closure** - Automatic closure of confirmed duplicates after 3 days
- **Stale Issue Management** - Closure of inactive issues after 7 days

## Workflows

### 1. Issue Triage (`issue-triage.yml`)

**Trigger:** When a new issue is opened

**What it does:**
1. Analyzes the issue title and body using AWS Bedrock Claude Sonnet 4.5
2. Assigns relevant labels from the predefined taxonomy
3. Detects potential duplicate issues
4. Posts a comment if duplicates are found
5. Adds the "duplicate" label if applicable

**Required Secrets:**
- `AWS_ACCESS_KEY_ID` - AWS access key with Bedrock permissions
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key
- `AWS_REGION` (optional) - AWS region, defaults to us-east-1
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### 2. Close Duplicates (`close-duplicates.yml`)

**Trigger:** Daily at midnight UTC (or manual)

**What it does:**
1. Finds all open issues with the "duplicate" label
2. Checks how long the label has been applied
3. Closes issues where the label has been present for 3+ days
4. Posts a closing comment with reference to the original issue

**Manual Trigger:**
```bash
gh workflow run close-duplicates.yml
```

### 3. Close Stale Issues (`close-stale.yml`)

**Trigger:** Daily at midnight UTC (or manual)

**What it does:**
1. Finds all open issues with the "pending-response" label
2. Checks the last activity date (comments or label changes)
3. Closes issues with no activity for 7+ days
4. Posts a closing comment explaining the inactivity

**Manual Trigger:**
```bash
gh workflow run close-stale.yml
```

## Setup Instructions

### 1. AWS Bedrock Access

Ensure you have access to AWS Bedrock with the Claude Sonnet 4.5 model:

1. Enable Bedrock in your AWS account
2. Request access to the Claude Sonnet 4 model
3. Create an IAM user with the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-*"
    }
  ]
}
```

**Note:** The system uses inference profile ID `us.anthropic.claude-sonnet-4-20250514-v1:0` for cross-region routing and higher throughput.

### 2. GitHub Secrets

Add the following secrets to your repository:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `AWS_ACCESS_KEY_ID` - Your AWS access key ID
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret access key
   - (Optional) `AWS_REGION` - AWS region, defaults to us-east-1

### 3. Labels

Create the following labels in your repository:

**Feature/Component Labels:**
- auth, autocomplete, chat, cli, extensions, hooks, ide, mcp, models, powers, specs, ssh, steering, sub-agents, terminal, ui, usability, trusted-commands, pricing, documentation, dependencies, compaction

**OS-Specific Labels:**
- os: linux, os: mac, os: windows

**Theme Labels:**
- theme:account, theme:agent-latency, theme:agent-quality, theme:context-limit-issue, theme:ide-performance, theme:slow-unresponsive, theme:ssh-wsl, theme:unexpected-error

**Workflow Labels:**
- pending-maintainer-response, pending-response, pending-triage, duplicate, question

**Special Labels:**
- Autonomous agent, Inline chat, on boarding

You can create labels manually or use the GitHub CLI:

```bash
gh label create "pending-triage" --color "fbca04" --description "Awaiting maintainer review"
gh label create "duplicate" --color "cfd3d7" --description "This issue is a duplicate"
gh label create "pending-response" --color "d4c5f9" --description "Awaiting response from issue author"
# ... add more labels as needed
```

### 4. Install Dependencies

The workflows automatically install dependencies, but for local development:

```bash
cd scripts
npm install
npm run build
```

## Troubleshooting

### Workflow Fails with AWS Authentication Error

**Problem:** `UnrecognizedClientException` or authentication errors

**Solution:**
1. Verify AWS credentials are correctly set in GitHub Secrets
2. Ensure the IAM user has Bedrock permissions
3. Check that the AWS region is correct

### No Labels Are Applied

**Problem:** Issues are created but no labels are added

**Solution:**
1. Check the workflow run logs for errors
2. Verify the labels exist in the repository
3. Ensure the Bedrock API is responding correctly

### Duplicate Detection Not Working

**Problem:** Duplicates are not being detected

**Solution:**
1. Check that there are existing open issues to compare against
2. Verify AWS Bedrock access is working
3. Review the similarity threshold (currently 0.80)

### Rate Limiting Issues

**Problem:** Workflows fail due to GitHub API rate limits

**Solution:**
1. The workflows include rate limit handling
2. For high-volume repositories, consider adjusting batch sizes
3. Check the rate limit status: `gh api rate_limit`

## Monitoring

### Workflow Run Summaries

Each workflow generates a summary visible in the Actions tab:
- Total issues processed
- Success/failure counts
- Detailed error information

### Logs

View detailed logs for each workflow run:
1. Go to Actions tab
2. Select the workflow
3. Click on a specific run
4. Expand the steps to see detailed logs

## Customization

### Adjusting Thresholds

Edit the TypeScript files in `scripts/`:

**Duplicate closure threshold (default: 3 days):**
```typescript
// In close_duplicates.ts
const DAYS_THRESHOLD = 3;
```

**Stale issue threshold (default: 7 days):**
```typescript
// In close_stale.ts
const DAYS_THRESHOLD = 7;
```

**Duplicate similarity threshold (default: 0.80):**
```typescript
// In detect_duplicates.ts
const SIMILARITY_THRESHOLD = 0.8;
```

### Modifying Schedules

Edit the cron expressions in the workflow files:

```yaml
on:
  schedule:
    - cron: "0 0 * * *"  # Daily at midnight UTC
```

## Support

For issues or questions:
1. Check the workflow run logs
2. Review the troubleshooting section
3. Open an issue in the repository
