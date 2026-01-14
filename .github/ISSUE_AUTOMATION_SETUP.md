# Issue Automation Setup Guide

This guide walks you through setting up the automated issue management system for your repository.

## Quick Start

### Step 1: AWS Setup

1. **Create an IAM User** for the automation:
   ```bash
   aws iam create-user --user-name github-issue-automation
   ```

2. **Create and attach the policy**:
   
   Save this as `bedrock-policy.json`:
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
   
   Apply the policy:
   ```bash
   aws iam create-policy --policy-name BedrockInvokeModel --policy-document file://bedrock-policy.json
   aws iam attach-user-policy --user-name github-issue-automation --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/BedrockInvokeModel
   ```

3. **Create access keys**:
   ```bash
   aws iam create-access-key --user-name github-issue-automation
   ```
   
   Save the `AccessKeyId` and `SecretAccessKey` - you'll need these for GitHub Secrets.

4. **Enable Bedrock Model Access**:
   - Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/)
   - Navigate to "Model access" in the left sidebar
   - Click "Manage model access"
   - Find "Claude Sonnet 4.5" and request access
   - Wait for approval (usually instant for most accounts)

### Step 2: GitHub Secrets Setup

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

| Name | Value | Example |
|------|-------|---------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key ID | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret access key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | AWS region (optional) | `us-east-1` |

### Step 3: Create Repository Labels

You can create labels using the GitHub CLI or web interface.

**Using GitHub CLI:**

```bash
# Install GitHub CLI if needed: https://cli.github.com/

# Feature/Component Labels
gh label create "auth" --color "0075ca" --description "Authentication and authorization"
gh label create "autocomplete" --color "0075ca" --description "Autocomplete functionality"
gh label create "chat" --color "0075ca" --description "Chat features"
gh label create "cli" --color "0075ca" --description "Command-line interface"
gh label create "extensions" --color "0075ca" --description "Extensions and plugins"
gh label create "hooks" --color "0075ca" --description "Agent hooks"
gh label create "ide" --color "0075ca" --description "IDE features"
gh label create "mcp" --color "0075ca" --description "Model Context Protocol"
gh label create "models" --color "0075ca" --description "AI models"
gh label create "powers" --color "0075ca" --description "Powers system"
gh label create "specs" --color "0075ca" --description "Specifications"
gh label create "ssh" --color "0075ca" --description "SSH functionality"
gh label create "steering" --color "0075ca" --description "Steering files"
gh label create "sub-agents" --color "0075ca" --description "Sub-agents"
gh label create "terminal" --color "0075ca" --description "Terminal features"
gh label create "ui" --color "0075ca" --description "User interface"
gh label create "usability" --color "0075ca" --description "Usability improvements"
gh label create "trusted-commands" --color "0075ca" --description "Trusted commands"
gh label create "pricing" --color "0075ca" --description "Pricing and billing"
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
gh label create "pending-maintainer-response" --color "fbca04" --description "Waiting for maintainer response"
gh label create "pending-response" --color "fbca04" --description "Waiting for user response"
gh label create "pending-triage" --color "fbca04" --description "Needs triage"
gh label create "duplicate" --color "cfd3d7" --description "Duplicate issue"
gh label create "question" --color "d876e3" --description "Question"

# Special Labels
gh label create "Autonomous agent" --color "1d76db" --description "Autonomous agent feature"
gh label create "Inline chat" --color "1d76db" --description "Inline chat feature"
gh label create "on boarding" --color "1d76db" --description "Onboarding experience"
```

**Using the Web Interface:**

1. Go to your repository
2. Click **Issues** → **Labels**
3. Click **New label**
4. Enter the label name, description, and color
5. Click **Create label**
6. Repeat for all labels listed above

### Step 4: Install Dependencies

```bash
cd scripts
npm install
```

This will create a `package-lock.json` file that should be committed to the repository.

### Step 5: Test the Setup

1. **Build the TypeScript code**:
   ```bash
   cd scripts
   npm run build
   ```

2. **Create a test issue** in your repository

3. **Check the Actions tab** to see if the Issue Triage workflow runs

4. **Verify the issue** has labels assigned and a "pending-triage" label

### Step 6: Manual Testing (Optional)

You can test the workflows manually:

**Test Duplicate Closer:**
```bash
cd scripts
export GITHUB_TOKEN="your_github_token"
export GITHUB_REPOSITORY="owner/repo"
export GITHUB_REPOSITORY_OWNER="owner"
npm run build
node dist/close_duplicates.js
```

**Test Stale Issue Closer:**
```bash
cd scripts
export GITHUB_TOKEN="your_github_token"
export GITHUB_REPOSITORY="owner/repo"
export GITHUB_REPOSITORY_OWNER="owner"
npm run build
node dist/close_stale.js
```

## Verification Checklist

- [ ] AWS IAM user created with Bedrock permissions
- [ ] AWS Bedrock model access enabled for Claude Sonnet 4.5
- [ ] GitHub Secrets configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
- [ ] All repository labels created
- [ ] Dependencies installed (`npm install` in `scripts`)
- [ ] TypeScript compiled successfully (`npm run build`)
- [ ] Test issue created and automatically labeled
- [ ] Workflows visible in Actions tab

## Monitoring

### Check Workflow Status

1. Go to the **Actions** tab in your repository
2. Look for recent workflow runs
3. Click on a run to see detailed logs

### View Workflow Summaries

Each workflow creates a summary showing:
- Issues processed
- Labels assigned
- Duplicates found
- Any errors

### Enable Notifications

To get notified of workflow failures:

1. Go to **Settings** → **Notifications**
2. Enable "Actions" notifications
3. Choose your notification preferences

## Customization

### Adjust Duplicate Threshold

Edit `scripts/detect_duplicates.ts`:

```typescript
const SIMILARITY_THRESHOLD = 0.80; // Change to 0.70 for more matches, 0.90 for fewer
```

### Change Closure Timings

**Duplicate closure** (`scripts/close_duplicates.ts`):
```typescript
const DAYS_THRESHOLD = 3; // Change to desired number of days
```

**Stale issue closure** (`scripts/close_stale.ts`):
```typescript
const DAYS_THRESHOLD = 7; // Change to desired number of days
```

### Modify Workflow Schedule

Edit the cron expression in `.github/workflows/close-duplicates.yml` and `.github/workflows/close-stale.yml`:

```yaml
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC
    # Examples:
    # - cron: '0 */6 * * *'  # Every 6 hours
    # - cron: '0 0 * * 1'    # Every Monday
```

## Troubleshooting

### Workflow doesn't run

**Check:**
- Workflows are enabled in repository settings
- The `.github/workflows/` directory is in the default branch
- YAML syntax is valid

### AWS authentication fails

**Check:**
- Secrets are correctly named (case-sensitive)
- AWS credentials are valid and not expired
- IAM policy is attached to the user
- Bedrock model access is enabled

### Labels not assigned

**Check:**
- Labels exist in the repository (exact name match required)
- Bedrock API is responding (check workflow logs)
- Issue content is not empty

### High AWS costs

**Optimize:**
- Reduce `DAYS_TO_SEARCH` in duplicate detection
- Increase `BATCH_SIZE` to reduce API calls
- Consider limiting automation to specific issue types

## Support

If you encounter issues:

1. Check the workflow logs in the Actions tab
2. Review the troubleshooting section in `scripts/README.md`
3. Open an issue with the `question` label

## Next Steps

Once setup is complete:

1. Monitor the first few automated triages
2. Adjust thresholds based on results
3. Customize label taxonomy if needed
4. Set up monitoring and alerts
5. Document any custom configurations for your team
