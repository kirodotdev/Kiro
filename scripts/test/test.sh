#!/bin/bash

# Local Testing Script for GitHub Issue Automation
# This script helps you test the automation locally

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    GitHub Issue Automation - Local Testing Setup          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from .github/scripts directory"
    echo "   cd .github/scripts && ./test.sh"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Please install Node.js 20+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Warning: Node.js version is $NODE_VERSION, but 20+ is recommended"
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Check environment variables
echo "📋 Checking environment variables..."
echo ""

if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "❌ AWS_ACCESS_KEY_ID is not set"
    echo ""
    echo "Please set your AWS credentials:"
    echo "  export AWS_ACCESS_KEY_ID='your-access-key'"
    echo "  export AWS_SECRET_ACCESS_KEY='your-secret-key'"
    echo "  export AWS_REGION='us-east-1'  # optional"
    echo ""
    exit 1
fi

if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ AWS_SECRET_ACCESS_KEY is not set"
    exit 1
fi

echo "✅ AWS credentials are set"

if [ -z "$AWS_REGION" ]; then
    echo "ℹ️  AWS_REGION not set, will use default: us-east-1"
    export AWS_REGION="us-east-1"
else
    echo "✅ AWS_REGION: $AWS_REGION"
fi

if [ -z "$GITHUB_TOKEN" ]; then
    echo "⚠️  GITHUB_TOKEN not set (optional for duplicate detection)"
else
    echo "✅ GITHUB_TOKEN is set"
fi

echo ""

# Install dependencies
echo "📦 Installing dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "   Dependencies already installed"
fi
echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
echo ""

# Run tests
echo "🧪 Running tests..."
echo ""
node dist/test/test-local.js

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Testing Complete!                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "💡 Next steps:"
echo "   1. Review the test results above"
echo "   2. Check AWS costs in AWS Console"
echo "   3. If tests pass, deploy to GitHub Actions"
echo ""
echo "📚 Documentation:"
echo "   - Local testing: .github/LOCAL_TESTING.md"
echo "   - Full setup: .github/AUTOMATION_SETUP.md"
echo "   - Quick start: .github/QUICKSTART.md"
echo ""
