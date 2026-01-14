# AWS Bedrock Model ID Fix Summary

## Issue Resolved

The GitHub issue automation system was using an incorrect AWS Bedrock model ID format that caused API errors.

## Problem

**Original (Incorrect) Model ID:**
```typescript
const MODEL_ID = "anthropic.claude-sonnet-4-20250514";
```

**Error:**
```
ValidationException: The provided model identifier is invalid.
```

## Solution

**Updated (Correct) Model ID:**
```typescript
const MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0";
```

## What Changed

### 1. Code Files Updated
- `scripts/bedrock_classifier.ts` - Updated MODEL_ID constant
- `scripts/detect_duplicates.ts` - Updated MODEL_ID constant

### 2. Documentation Files Updated
- `.github/AUTOMATION_SETUP.md` - Added inference profile explanation
- `.github/QUICKSTART.md` - Updated model ID references
- `.github/ISSUE_AUTOMATION_SETUP.md` - Updated IAM policy
- `.github/IMPLEMENTATION_SUMMARY.md` - Updated model configuration
- `scripts/README.md` - Updated code examples
- `.github/workflows/README.md` - Updated setup instructions
- `.kiro/specs/github-issue-automation/requirements.md` - Updated requirement 5
- `.kiro/specs/github-issue-automation/design.md` - Added inference profile notes
- `TESTING_SUMMARY.md` - Updated prerequisites

### 3. TypeScript Fixes
- `scripts/close_duplicates.ts` - Added type guard for label events
- `scripts/close_stale.ts` - Added type guard for label events

## Understanding AWS Bedrock Inference Profiles

### What are Inference Profiles?

Inference profiles are AWS Bedrock's recommended way to invoke foundation models. They provide:

1. **Cross-Region Routing** - Automatically route requests to available regions
2. **Higher Throughput** - Better performance and availability
3. **Simplified Management** - Single ID works across regions

### Format

```
{region}.{provider}.{model-name}-{version}:{profile-version}
```

**Example:**
```
us.anthropic.claude-sonnet-4-20250514-v1:0
```

**Components:**
- `us` - Region prefix (US regions)
- `anthropic` - Model provider
- `claude-sonnet-4-20250514` - Model name and date
- `v1:0` - Profile version

### Direct Model ID vs Inference Profile

| Aspect | Direct Model ID | Inference Profile |
|--------|----------------|-------------------|
| Format | `anthropic.claude-sonnet-4-20250514` | `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| Availability | Single region | Cross-region |
| Throughput | Standard | Higher |
| Recommended | ❌ No | ✅ Yes |

## IAM Policy Update

The IAM policy resource ARN was updated to support all Claude Sonnet 4 versions:

**Before:**
```json
"Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-20250514"
```

**After:**
```json
"Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-*"
```

This allows the policy to work with any Claude Sonnet 4 model version.

## Testing Results

### Before Fix
```
❌ ValidationException: The provided model identifier is invalid.
```

### After Fix
```
✅ Issue: "Authentication fails when using SSO"
✅ Recommended labels: auth, os: mac, os: windows
   Reasoning: Issue relates to authentication...

✅ Issue: "IDE crashes on startup"
✅ Recommended labels: ide, os: linux, theme:unexpected-error
   Reasoning: IDE crash issue on Linux...

✅ Issue: "Autocomplete not working in terminal"
✅ Recommended labels: autocomplete, terminal, cli, os: mac
   Reasoning: Terminal autocomplete issue...

✅ Issue: "Slow performance when opening large files"
✅ Recommended labels: ide, theme:ide-performance, theme:slow-unresponsive
   Reasoning: Performance issue with large files...

✅ All tests completed!
```

## How to Find Available Inference Profiles

### Using AWS CLI

```bash
# List all available inference profiles
aws bedrock list-inference-profiles --region us-east-1

# Filter for Claude Sonnet 4
aws bedrock list-inference-profiles --region us-east-1 \
  --query 'inferenceProfileSummaries[?contains(inferenceProfileName, `claude-sonnet-4`)]'
```

### Using AWS Console

1. Go to AWS Bedrock console
2. Navigate to "Inference profiles" in the left sidebar
3. Find "Claude Sonnet 4" in the list
4. Copy the inference profile ID

## Migration Guide

If you're using the old model ID format, here's how to migrate:

### Step 1: Update Code

```typescript
// Old
const MODEL_ID = "anthropic.claude-sonnet-4-20250514";

// New
const MODEL_ID = "us.anthropic.claude-sonnet-4-20250514-v1:0";
```

### Step 2: Update IAM Policy

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

### Step 3: Test

```bash
cd scripts
npm run build
npm run test:local
```

### Step 4: Deploy

```bash
git add .
git commit -m "fix: update to AWS Bedrock inference profile ID"
git push
```

## Benefits of This Fix

1. ✅ **Working API Calls** - No more validation errors
2. ✅ **Better Performance** - Cross-region routing and higher throughput
3. ✅ **Future-Proof** - Using AWS recommended approach
4. ✅ **Higher Availability** - Automatic failover across regions
5. ✅ **Consistent Documentation** - All docs updated with correct format

## Additional Resources

- [AWS Bedrock Inference Profiles Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html)
- [AWS Bedrock API Reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/welcome.html)
- [Anthropic Claude Models on AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude.html)

## Support

If you encounter issues with the model ID:

1. Verify you have access to Claude Sonnet 4 in AWS Bedrock
2. Check that your AWS region supports inference profiles
3. Ensure your IAM policy allows `bedrock:InvokeModel` action
4. Test with the AWS CLI to verify access
5. Review the error messages in workflow logs

## Summary

The system now uses the correct AWS Bedrock inference profile ID format (`us.anthropic.claude-sonnet-4-20250514-v1:0`) instead of the direct model ID. All code and documentation has been updated to reflect this change. Testing confirms the system is working correctly with proper label classification and duplicate detection.

---

**Status:** ✅ Fixed and Tested
**Date:** January 14, 2026
**Impact:** All API calls now working correctly
