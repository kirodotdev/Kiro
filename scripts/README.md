# GitHub Issue Automation Scripts

TypeScript modules for automated GitHub issue management using AWS Bedrock AI.

## Architecture

```
scripts/
├── data_models.ts          # Data structures and interfaces
├── bedrock_classifier.ts   # AWS Bedrock integration for classification
├── assign_labels.ts        # Label assignment logic
├── detect_duplicates.ts    # Duplicate detection using AI
├── retry_utils.ts          # Retry logic with exponential backoff
├── rate_limit_utils.ts     # GitHub API rate limit handling
├── workflow_summary.ts     # Workflow summary generation
├── triage_issue.ts         # Main triage orchestration script
├── close_duplicates.ts     # Duplicate closer script
└── close_stale.ts          # Stale issue closer script
```

## Modules

### Core Data Models (`data_models.ts`)

Defines the data structures used throughout the system:

- `ClassificationResult` - AI classification output
- `DuplicateMatch` - Duplicate issue information
- `LabelTaxonomy` - Complete label taxonomy
- `IssueData` - GitHub issue data

### Bedrock Classifier (`bedrock_classifier.ts`)

Integrates with AWS Bedrock Claude Sonnet 4.5 for issue classification:

```typescript
async function classifyIssue(
  issueTitle: string,
  issueBody: string,
  labelTaxonomy: LabelTaxonomy
): Promise<ClassificationResult>
```

**Features:**
- Constructs prompts with label taxonomy
- Parses AI responses
- Handles errors gracefully
- Uses retry logic for reliability

### Label Assignment (`assign_labels.ts`)

Assigns labels to GitHub issues with validation:

```typescript
async function assignLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  recommendedLabels: string[],
  githubToken: string,
  taxonomy: LabelTaxonomy
): Promise<boolean>
```

**Features:**
- Validates labels against taxonomy
- Filters out invalid labels
- Always adds "pending-triage" label
- Handles GitHub API errors

### Duplicate Detection (`detect_duplicates.ts`)

Detects duplicate issues using semantic similarity:

```typescript
async function detectDuplicates(
  newTitle: string,
  newBody: string,
  owner: string,
  repo: string,
  currentIssueNumber: number,
  githubToken: string
): Promise<DuplicateMatch[]>
```

**Features:**
- Fetches existing open issues (last 90 days)
- Processes in batches of 10
- Uses AI for semantic similarity
- Returns matches with score > 0.80
- Generates formatted comments

### Retry Utilities (`retry_utils.ts`)

Provides retry logic with exponential backoff:

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T>
```

**Configuration:**
- Max retries: 3
- Base delay: 1 second
- Max delay: 8 seconds
- Retryable errors: ThrottlingException, ServiceUnavailable, etc.

### Rate Limit Utilities (`rate_limit_utils.ts`)

Handles GitHub API rate limiting:

```typescript
async function checkRateLimit(client: Octokit): Promise<void>

async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  delayMs?: number
): Promise<R[]>
```

**Features:**
- Monitors rate limit status
- Pauses when approaching limits
- Processes items in batches
- Adds delays between batches

### Workflow Summary (`workflow_summary.ts`)

Generates workflow run summaries:

```typescript
function createSummary(summary: WorkflowSummary): void

function logError(
  errors: WorkflowSummary["errors"],
  step: string,
  error: any,
  issueNumber?: number
): void
```

**Features:**
- Creates formatted summaries
- Tracks success/failure counts
- Logs detailed error information
- Writes to GitHub Actions summary

## Main Scripts

### Issue Triage (`triage_issue.ts`)

Orchestrates the complete triage process:

1. Classifies issue using Bedrock
2. Assigns labels
3. Detects duplicates
4. Posts duplicate comments
5. Adds duplicate label if needed

**Environment Variables:**
- `ISSUE_NUMBER` - Issue number to triage
- `ISSUE_TITLE` - Issue title
- `ISSUE_BODY` - Issue body
- `REPOSITORY_OWNER` - Repository owner
- `REPOSITORY_NAME` - Repository name
- `GITHUB_TOKEN` - GitHub API token
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (optional)

### Close Duplicates (`close_duplicates.ts`)

Closes issues marked as duplicate for 3+ days:

1. Fetches issues with "duplicate" label
2. Checks label application date
3. Closes issues older than threshold
4. Posts closing comment

**Environment Variables:**
- `REPOSITORY_OWNER` - Repository owner
- `REPOSITORY_NAME` - Repository name
- `GITHUB_TOKEN` - GitHub API token

### Close Stale (`close_stale.ts`)

Closes inactive issues with "pending-response" label:

1. Fetches issues with "pending-response" label
2. Checks last activity date
3. Closes issues inactive for 7+ days
4. Posts closing comment

**Environment Variables:**
- `REPOSITORY_OWNER` - Repository owner
- `REPOSITORY_NAME` - Repository name
- `GITHUB_TOKEN` - GitHub API token

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Clean

```bash
npm run clean
```

### Local Testing

You can test scripts locally by setting environment variables:

```bash
export ISSUE_NUMBER=123
export ISSUE_TITLE="Test issue"
export ISSUE_BODY="Test description"
export REPOSITORY_OWNER="owner"
export REPOSITORY_NAME="repo"
export GITHUB_TOKEN="your-token"
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"

node dist/triage_issue.js
```

## Configuration

### Thresholds

**Duplicate Closure:**
```typescript
// close_duplicates.ts
const DAYS_THRESHOLD = 3;
```

**Stale Issues:**
```typescript
// close_stale.ts
const DAYS_THRESHOLD = 7;
```

**Duplicate Similarity:**
```typescript
// detect_duplicates.ts
const SIMILARITY_THRESHOLD = 0.8;
```

**Batch Size:**
```typescript
// detect_duplicates.ts
const BATCH_SIZE = 10;
```

**Search Window:**
```typescript
// detect_duplicates.ts
const DAYS_TO_SEARCH = 90;
```

### Bedrock Configuration

```typescript
// bedrock_classifier.ts
const MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0"; // Inference profile
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.3;
const TOP_P = 0.9;
```

## Error Handling

All modules implement comprehensive error handling:

1. **Retry Logic** - Automatic retries with exponential backoff
2. **Graceful Degradation** - Continue processing on non-critical errors
3. **Detailed Logging** - Log all errors with context
4. **Fault Isolation** - Individual failures don't stop batch processing
5. **Workflow Summaries** - Track and report all errors

## Testing

### Unit Tests

(To be implemented)

```bash
npm test
```

### Integration Tests

Test against a real repository:

1. Create a test repository
2. Set up AWS credentials
3. Run workflows manually
4. Verify results

## Performance

### Optimization Strategies

1. **Batch Processing** - Process issues in batches to reduce API calls
2. **Rate Limit Handling** - Proactively check and respect rate limits
3. **Caching** - Fetch existing issues once per run
4. **Parallel Processing** - Process batches in parallel where possible
5. **Filtering** - Only compare against recent issues (90 days)

### Expected Performance

- **Issue Triage**: 10-15 seconds per issue
- **Duplicate Detection**: 5-10 seconds per batch of 10 issues
- **Duplicate Closure**: 2-3 seconds per issue
- **Stale Issue Closure**: 2-3 seconds per issue

## Security

### Best Practices

1. **Never commit credentials** - Use environment variables
2. **Least privilege** - IAM policies grant only necessary permissions
3. **Secure secrets** - Store in GitHub Secrets
4. **Audit logs** - Monitor AWS CloudTrail
5. **Dependency scanning** - Regular `npm audit`

### Credentials

Required credentials:
- AWS Access Key ID (Bedrock access)
- AWS Secret Access Key
- GitHub Token (automatically provided in workflows)

## Troubleshooting

### Common Issues

**TypeScript compilation errors:**
```bash
npm run clean
npm install
npm run build
```

**Module not found errors:**
- Ensure all imports use `.js` extension (for ES modules)
- Check `tsconfig.json` module resolution

**AWS authentication errors:**
- Verify credentials are set correctly
- Check IAM permissions
- Ensure Bedrock model access is approved

**GitHub API errors:**
- Check token permissions
- Verify rate limits
- Ensure labels exist

## Contributing

When adding new features:

1. Follow existing code structure
2. Add comprehensive error handling
3. Include logging for debugging
4. Update documentation
5. Test thoroughly

## License

See repository LICENSE file.
