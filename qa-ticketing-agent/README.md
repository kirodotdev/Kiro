# QA Answering & Auto-Ticketing Agent

An intelligent agent that answers questions from a knowledge base and automatically creates tickets when needed.

## Architecture

- **Workflow Engine**: Dify-like workflow orchestration
- **MCP Servers**: Modular tools for KB search, ticket creation, and integrations
- **Agent Logic**: Smart routing between QA and ticketing flows

## Components

1. `workflow/` - Workflow definitions (Dify-like DSL)
2. `mcp-servers/` - Custom MCP servers for tools
3. `config/` - Agent and MCP configuration
4. `docs/` - Documentation and guides

## Quick Start

1. Install dependencies: `npm install`
2. Configure MCP servers in `.kiro/settings/mcp.json`
3. Set up workflow backend
4. Run the agent

## Features

- Natural language QA from knowledge base
- Automatic ticket creation for unresolved queries
- Context-aware routing
- Multi-source knowledge integration
