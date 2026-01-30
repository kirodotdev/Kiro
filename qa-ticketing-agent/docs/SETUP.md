# Setup Guide

## Prerequisites

- Node.js 18+
- TypeScript
- Vector database (ChromaDB, Pinecone, or Weaviate)
- Ticketing system API access (GitHub, Jira, Linear, etc.)

## Installation

### 1. Install MCP Servers

```bash
cd mcp-servers/knowledge-base-server
npm install
npm run build

cd ../ticketing-server
npm install
npm run build
```

### 2. Configure Environment Variables

Create `.env` file:

```env
# OpenAI for embeddings and LLM
OPENAI_API_KEY=your_key_here

# Vector Database
VECTOR_DB_URL=http://localhost:8000
VECTOR_DB_API_KEY=your_key_here

# Ticketing System (choose one)
GITHUB_TOKEN=your_github_token
JIRA_API_TOKEN=your_jira_token
JIRA_BASE_URL=https://your-domain.atlassian.net
LINEAR_API_KEY=your_linear_key
```

### 3. Configure MCP in Kiro

Copy `config/mcp.json` to `.kiro/settings/mcp.json`:

```bash
mkdir -p .kiro/settings
cp config/mcp.json .kiro/settings/mcp.json
```

Update paths to absolute paths for your system.

### 4. Set Up Knowledge Base

Populate your knowledge base with documentation:

```typescript
// Example: Add documents
import { KnowledgeBaseClient } from './kb-client';

const kb = new KnowledgeBaseClient();
await kb.addDocument({
  content: "How to reset password...",
  metadata: {
    title: "Password Reset Guide",
    category: "authentication",
    tags: ["password", "security"]
  }
});
```

### 5. Configure Workflow

Edit `workflow/qa-ticketing-flow.json` to customize:
- Confidence thresholds
- Ticket creation conditions
- Response formatting
- Integration points

## Testing

Test individual MCP servers:

```bash
# Test knowledge base search
echo '{"query": "how to reset password"}' | node mcp-servers/knowledge-base-server/dist/index.js

# Test ticket creation
echo '{"title": "Test", "description": "Test ticket"}' | node mcp-servers/ticketing-server/dist/index.js
```

## Usage

The agent automatically:
1. Receives user query
2. Searches knowledge base
3. Generates answer
4. Creates ticket if confidence is low or no results found
5. Returns formatted response

## Customization

- Modify `workflow/qa-ticketing-flow.json` for different flows
- Add new MCP servers for additional integrations
- Adjust confidence thresholds in `config/agent-config.json`
