# Implementation Plan: GitHub Issue Automation

## Overview

This implementation plan breaks down the GitHub issue automation system into discrete, manageable tasks. The system will be built incrementally using TypeScript, starting with core infrastructure, then adding AI-powered classification, duplicate detection, and finally the automated lifecycle management workflows.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Create `scripts/` directory for TypeScript modules
  - Create `package.json` with dependencies: @aws-sdk/client-bedrock-runtime, @octokit/rest, fast-check (for testing)
  - Create `tsconfig.json` for TypeScript configuration
  - Set up Node.js environment configuration
  - _Requirements: 5.1, 5.2_

- [ ] 2. Implement core data models
  - [x] 2.1 Create data models module (`data_models.ts`)
    - Implement `ClassificationResult` interface
    - Implement `DuplicateMatch` interface
    - Implement `LabelTaxonomy` interface with all label categories
    - Implement `IssueData` interface
    - Export DEFAULT_LABEL_TAXONOMY constant
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 2.2 Write unit tests for data models
    - Test interface type checking
    - Test DEFAULT_LABEL_TAXONOMY contains all required labels
    - Test edge cases (empty values, undefined handling)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 3. Implement Bedrock Classifier module
  - [x] 3.1 Create Bedrock integration (`bedrock_classifier.ts`)
    - Implement AWS Bedrock client initialization with credentials
    - Implement prompt construction with label taxonomy
    - Implement `classifyIssue()` function with API call
    - Implement response parsing to `ClassificationResult`
    - _Requirements: 1.1, 5.1, 5.2, 5.5_

  - [x] 3.2 Add retry logic with exponential backoff
    - Implement retry wrapper for API calls
    - Configure exponential backoff (1s, 2s, 4s)
    - Handle ThrottlingException and connection errors
    - _Requirements: 5.3, 8.3_

  - [x] 3.3 Add error handling and logging
    - Log all API calls and responses
    - Handle authentication errors
    - Handle malformed responses with fallback
    - Continue gracefully on failure
    - _Requirements: 5.4, 8.1, 8.2_

  - [ ]* 3.4 Write property test for Bedrock API invocation
    - **Property 1: Bedrock API Invocation**
    - **Validates: Requirements 1.1, 5.5**
    - Generate random issue data, verify API called with correct parameters

  - [ ]* 3.5 Write property test for retry behavior
    - **Property 16: Retry with Exponential Backoff**
    - **Validates: Requirements 5.3, 8.3**
    - Simulate API failures, verify retry logic

  - [ ]* 3.6 Write property test for graceful API failure
    - **Property 17: Graceful API Failure**
    - **Validates: Requirements 5.4**
    - Simulate exhausted retries, verify system continues

- [ ] 4. Implement Label Assignment module
  - [x] 4.1 Create label assignment logic (`assign_labels.ts`)
    - Implement label validation against taxonomy
    - Implement GitHub API integration for adding labels
    - Filter out invalid labels from AI recommendations
    - Always add "pending-triage" label
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 6.6_

  - [x] 4.2 Add error handling for label assignment
    - Handle GitHub API errors gracefully
    - Log failures and continue
    - Implement retry logic for transient failures
    - _Requirements: 1.6, 8.3_

  - [ ]* 4.3 Write property test for valid label assignment
    - **Property 2: Valid Label Assignment**
    - **Validates: Requirements 1.2, 1.3, 1.4, 6.6**
    - Generate random classification results, verify only valid labels assigned

  - [ ]* 4.4 Write property test for pending triage label
    - **Property 3: Pending Triage Label**
    - **Validates: Requirements 1.5**
    - Generate random issues, verify pending-triage always added

  - [ ]* 4.5 Write property test for graceful label assignment failure
    - **Property 4: Graceful Label Assignment Failure**
    - **Validates: Requirements 1.6**
    - Simulate failures, verify system continues without crashing

- [ ] 5. Checkpoint - Core classification working
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Duplicate Detection module
  - [x] 6.1 Create duplicate detection logic (`detect_duplicates.ts`)
    - Implement function to fetch existing open issues
    - Filter issues to last 90 days for performance
    - Implement Bedrock-based semantic similarity analysis
    - Process issues in batches of 10
    - Return matches with similarity > 0.80
    - _Requirements: 2.1, 2.2_

  - [x] 6.2 Implement duplicate comment generation
    - Format comment with duplicate issue links
    - Include similarity scores in comment
    - Sort duplicates by similarity (highest first)
    - _Requirements: 2.5_

  - [x] 6.3 Add duplicate label assignment logic
    - Add "duplicate" label when matches found
    - Skip labeling when no matches found
    - _Requirements: 2.3, 2.4_

  - [ ]* 6.4 Write property test for duplicate detection invocation
    - **Property 5: Duplicate Detection Invocation**
    - **Validates: Requirements 2.1**
    - Generate random issues, verify duplicate detection called

  - [ ]* 6.5 Write property test for high confidence duplicate commenting
    - **Property 6: High Confidence Duplicate Commenting**
    - **Validates: Requirements 2.2, 2.5**
    - Generate random similarity scores, verify comments when score > 0.80

  - [ ]* 6.6 Write property test for duplicate label assignment
    - **Property 7: Duplicate Label Assignment**
    - **Validates: Requirements 2.3**
    - Generate random duplicate results, verify label added

  - [ ]* 6.7 Write property test for no false duplicate marking
    - **Property 8: No False Duplicate Marking**
    - **Validates: Requirements 2.4**
    - Generate low-similarity results, verify no duplicate marking

- [ ] 7. Implement Issue Triage Workflow
  - [x] 7.1 Create issue triage workflow file (`.github/workflows/issue-triage.yml`)
    - Configure trigger on `issues: opened` event
    - Set up Node.js environment with dependencies
    - Configure AWS credentials from GitHub Secrets
    - Add job to fetch issue details
    - _Requirements: 7.1_

  - [x] 7.2 Add workflow steps for classification and labeling
    - Call Bedrock Classifier with issue data
    - Parse classification results
    - Call Label Assignment module
    - Handle errors and log to workflow summary
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 7.3 Add workflow steps for duplicate detection
    - Call Duplicate Detector with issue data
    - Post duplicate comment if matches found
    - Add duplicate label if applicable
    - Handle errors gracefully
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 7.4 Write property test for comprehensive error logging
    - **Property 20: Comprehensive Error Logging**
    - **Validates: Requirements 8.1, 8.2**
    - Generate random errors, verify logs contain required information

- [ ] 8. Checkpoint - Issue triage workflow complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement Duplicate Closer Workflow
  - [x] 9.1 Create duplicate closer script (`close_duplicates.ts`)
    - Query all open issues with "duplicate" label
    - Check label application date using GitHub API
    - Filter issues where label age >= 3 days
    - Close filtered issues with closing comment
    - Reference original issue in comment
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 9.2 Add logic to handle label removal
    - Check if duplicate label still present before closing
    - Skip issues where label was removed
    - _Requirements: 3.3_

  - [x] 9.3 Create duplicate closer workflow file (`.github/workflows/close-duplicates.yml`)
    - Configure daily cron schedule (midnight UTC)
    - Add manual trigger (workflow_dispatch)
    - Set up Node.js environment
    - Call close_duplicates.ts script
    - _Requirements: 7.2_

  - [ ]* 9.4 Write property test for duplicate closure timing
    - **Property 9: Duplicate Closure Timing**
    - **Validates: Requirements 3.1**
    - Generate random label ages, verify closure at correct threshold

  - [ ]* 9.5 Write property test for duplicate closure comment
    - **Property 10: Duplicate Closure Comment**
    - **Validates: Requirements 3.2, 3.4**
    - Generate random closures, verify comment content

  - [ ]* 9.6 Write property test for duplicate label removal prevention
    - **Property 11: Duplicate Label Removal Prevention**
    - **Validates: Requirements 3.3**
    - Generate issues with removed labels, verify no closure

- [ ] 10. Implement Stale Issue Workflow
  - [x] 10.1 Create stale issue handler script (`close_stale.ts`)
    - Query all open issues with "pending-response" label
    - Check last activity date (comments, label changes)
    - Filter issues with no activity for 7+ days
    - Close filtered issues with closing comment
    - Include reopening instructions in comment
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 10.2 Add logic to handle activity and label removal
    - Reset timer when new comments added
    - Skip issues where label was removed
    - _Requirements: 4.3, 4.4_

  - [x] 10.3 Create stale issue workflow file (`.github/workflows/close-stale.yml`)
    - Configure daily cron schedule (midnight UTC)
    - Add manual trigger (workflow_dispatch)
    - Set up Node.js environment
    - Call close_stale.ts script
    - _Requirements: 7.3_

  - [ ]* 10.4 Write property test for stale issue closure timing
    - **Property 12: Stale Issue Closure Timing**
    - **Validates: Requirements 4.1**
    - Generate random inactivity periods, verify closure threshold

  - [ ]* 10.5 Write property test for stale closure comment
    - **Property 13: Stale Closure Comment**
    - **Validates: Requirements 4.2, 4.5**
    - Generate random closures, verify comment content

  - [ ]* 10.6 Write property test for activity reset
    - **Property 14: Activity Reset**
    - **Validates: Requirements 4.3**
    - Generate issues with new comments, verify no closure

  - [ ]* 10.7 Write property test for pending response label removal prevention
    - **Property 15: Pending Response Label Removal Prevention**
    - **Validates: Requirements 4.4**
    - Generate issues with removed labels, verify no closure

- [ ] 11. Implement rate limiting and batch processing
  - [x] 11.1 Add rate limit handling to all GitHub API calls
    - Check rate limit headers before API calls
    - Pause and wait when approaching limits
    - Resume after rate limit resets
    - _Requirements: 7.5_

  - [x] 11.2 Implement batch processing for workflows
    - Process issues in configurable batch sizes
    - Add delays between batches
    - Track progress across batches
    - _Requirements: 7.4_

  - [ ]* 11.3 Write property test for batch processing
    - **Property 18: Batch Processing**
    - **Validates: Requirements 7.4**
    - Generate random issue batches, verify batching behavior

  - [ ]* 11.4 Write property test for rate limit handling
    - **Property 19: Rate Limit Handling**
    - **Validates: Requirements 7.5**
    - Simulate rate limits, verify pausing behavior

- [ ] 12. Implement workflow error handling and summaries
  - [x] 12.1 Add workflow run summary generation
    - Create summary for successful runs
    - Create detailed summary for failures
    - Include issue numbers and error messages
    - _Requirements: 8.4_

  - [x] 12.2 Implement fault isolation for batch processing
    - Wrap individual issue processing in try-catch
    - Continue processing on individual failures
    - Track failed issues in summary
    - _Requirements: 8.5_

  - [ ]* 12.3 Write property test for workflow summary on critical failure
    - **Property 21: Workflow Summary on Critical Failure**
    - **Validates: Requirements 8.4**
    - Simulate critical failures, verify summary creation

  - [ ]* 12.4 Write property test for fault isolation
    - **Property 22: Fault Isolation**
    - **Validates: Requirements 8.5**
    - Generate batch with failures, verify workflow continues

- [ ] 13. Create documentation and configuration
  - [x] 13.1 Create README for workflows
    - Document required GitHub Secrets (AWS credentials)
    - Document workflow triggers and schedules
    - Document manual workflow execution
    - Include troubleshooting guide

  - [x] 13.2 Create configuration template
    - Document AWS IAM permissions required
    - Document Bedrock model access requirements
    - Provide example GitHub Secrets setup
    - Include label creation instructions

  - [x] 13.3 Add workflow monitoring and alerting
    - Configure workflow failure notifications
    - Add health check for scheduled workflows
    - Document monitoring best practices

- [ ] 14. Final checkpoint - Integration testing
  - Run all unit tests and property tests
  - Test issue triage workflow end-to-end
  - Test duplicate closer workflow with test issues
  - Test stale issue workflow with test issues
  - Verify all error handling paths
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All TypeScript code should follow best practices and use strict mode
- Use type annotations throughout for better code quality
- AWS credentials must be stored in GitHub Secrets, never in code
