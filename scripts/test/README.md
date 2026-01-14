# Test Files

This directory contains all test files for the GitHub issue automation system.

## Test Files

### Unit Tests
- **data_models.test.ts** - Tests for label taxonomy and data models

### Integration Tests
- **test-local.ts** - Local testing script for full automation workflow
- **test-workflows.ts** - Comprehensive workflow component testing
- **test-prompt-injection.ts** - Tests for prompt injection protection
- **test-sanitization-integration.ts** - Tests for input sanitization

### Test Runner
- **test.sh** - Automated test setup and execution script

## Running Tests

### Quick Test (from scripts directory)
```bash
cd scripts
npm run test:local
```

### Full Test Suite
```bash
cd scripts
npm test
```

### Using Test Script
```bash
cd scripts
./test/test.sh
```

### Individual Tests
```bash
cd scripts
npm run build

# Run specific test
node dist/test/test-local.js
node dist/test/test-workflows.js
node dist/test/test-prompt-injection.js
node dist/test/test-sanitization-integration.js
```

## Test Results

See **TEST_RESULTS.md** for detailed test results and status.

## Prerequisites

- Node.js 20+
- AWS credentials with Bedrock access
- Environment variables set (see `.env.example`)

## Documentation

For detailed testing documentation, see:
- `docs/TESTING_SUMMARY.md` - Complete testing guide
- `docs/LOCAL_TESTING_QUICKSTART.md` - Quick start guide
- `.github/LOCAL_TESTING.md` - Detailed local testing
