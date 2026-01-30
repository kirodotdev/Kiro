# Architecture

## Overview

```
User Query
    ↓
[Intent Classifier]
    ↓
[Knowledge Base Search] ← MCP: knowledge-base-server
    ↓
[Answer Generator]
    ↓
[Confidence Check]
    ↓
[Auto-Ticket Creation] ← MCP: ticketing-server
    ↓
[Response Formatter]
    ↓
User Response
```

## Components

### 1. Workflow Engine (Dify-like)

- **Node Types**: start, end, llm, tool, condition, code
- **Execution**: Sequential with conditional branching
- **Context**: Shared state across nodes
- **Interpolation**: Template variables `{{variable}}`

### 2. MCP Servers

#### Knowledge Base Server
- **Tools**: search_knowledge_base, add_to_knowledge_base
- **Backend**: Vector database (ChromaDB/Pinecone)
- **Features**: Semantic search, metadata filtering

#### Ticketing Server
- **Tools**: create_ticket, update_ticket, search_tickets
- **Integrations**: GitHub Issues, Jira, Linear
- **Features**: Auto-labeling, priority assignment

### 3. Agent Logic

**Decision Flow**:
1. Classify intent (question/issue/request)
2. Search knowledge base
3. Generate answer
4. Check confidence
5. Create ticket if needed
6. Format response

**Auto-Ticketing Triggers**:
- Low confidence answer (< 0.7)
- No KB results found
- Explicit issue reported
- User requests escalation

## Data Flow

```json
{
  "input": {
    "user_query": "How do I reset my password?",
    "user_context": {"user_id": "123", "session": "abc"}
  },
  "kb_search": {
    "results": [...],
    "count": 3,
    "top_score": 0.92
  },
  "answer": {
    "response": "To reset your password...",
    "confidence": 0.95
  },
  "ticket": null,
  "output": {
    "response": "To reset your password...",
    "ticket_id": null
  }
}
```

## Extensibility

- Add new MCP servers for integrations
- Customize workflow nodes
- Implement custom conditions
- Add notification channels
