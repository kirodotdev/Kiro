<div align="left">
  <img src="assets/kiro-icon.png" alt="Kiro" width="120" height="120">
  
  # Kiro
  
  Kiro is an agentic IDE that helps you go from prototype to production with spec-driven development, agent hooks, and natural language coding assistance. Build faster with AI-powered features that understand your entire codebase, turn prompts into structured specs, and automate repetitive tasks.
  
</div>

## Core Capabilities


## Node.js Development Setup

If you are contributing to Kiro using Node.js:

- Make sure you have [Node.js](https://nodejs.org/) installed.
- Run `npm install` to install dependencies.
- Note: There are currently no test or build scripts defined in `package.json`. You may add these as needed for your contributions.

## Manual Process Kill Feature

If a terminal command hangs and Ctrl+C does not work, you can manually kill the process using the `processManager.js` utility:

1. Open `processManager.js` in the project root.
2. Use the `runCommand(command, args)` function to start a process (e.g., `runCommand('npm', ['start'])`).
3. If the process hangs, call `killRunningProcess()` to terminate it.

This helps prevent stuck processes without closing the terminal window. You can further integrate this feature into your main application as needed.

## Troubleshooting

If you encounter errors such as missing `package.json` or npm install failures:

- Ensure you are in the correct project directory.
- If `package.json` is missing, run `npm init -y` to create one.
- For other npm errors, check the error message and refer to the [npm documentation](https://docs.npmjs.com/).

## Platform Support

Kiro is available as a standalone desktop application for:
- **macOS**
- **Windows** 
- **Linux**

## Getting Started

### Download & Install
Download the Kiro desktop application directly from our website -  **[kiro.dev](https://kiro.dev)**

### First Project

Get started with Kiro by following our comprehensive **[first project guide](https://kiro.dev/docs/getting-started/first-project/)**. This hands-on tutorial walks you through Kiro's essential features.

**What you'll learn:**
- Setting up steering files for project-specific guidance
- Creating and managing specs for structured development
- Configuring hooks to automate your workflow
- Connecting MCP servers for external integrations


### One-Click Migration
Import your VS Code setup including extensions and settings during the initial setup process.

## Documentation

**[📚 View Documentation →](https://docs.kiro.dev)**

- **[Getting Started](https://docs.kiro.dev/getting-started)** - Installation and first project setup
- **[Chat](https://docs.kiro.dev/chat)** - Contextual conversations and code generation
- **[Specs](https://docs.kiro.dev/specs)** - Structured feature development
- **[Hooks](https://docs.kiro.dev/hooks)** - Workflow automation with intelligent triggers
- **[Steering](https://docs.kiro.dev/steering)** - Project-specific AI guidance
- **[MCP](https://docs.kiro.dev/mcp)** - External tool and service connections
- **[Troubleshooting](https://docs.kiro.dev/reference/troubleshooting)** - Troubleshooting and privacy information

## Issue Reporting
We welcome feedback and issue reports to help improve Kiro. Please use this repository to:
- Report bugs and technical issues
- Request new features
- Share feedback on existing functionality
- Discuss improvements and enhancements

## Support
For additional support beyond issue reporting:
- Join our community [discord server](https://discord.gg/kirodotdev) for quick help and discussions with other developers
- For billing-related questions, please contact our support team through [AWS Billing Support](https://support.aws.amazon.com/#/contacts/kiro).
- If you are an existing AWS customer with a paid support plan, for technical issues or general assistance, reach out via [AWS Support](https://support.console.aws.amazon.com/support/home#/).

## Security
If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public github issue.

## Code of Conduct
This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.


---
©2025 Amazon.com, Inc. or its affiliates (collectively, "Amazon"). All Rights Reserved.
