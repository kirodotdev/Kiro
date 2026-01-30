import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Ticketing System MCP Server
class TicketingServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "ticketing-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_ticket",
          description: "Create a new support ticket",
          inputSchema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Ticket title",
              },
              description: {
                type: "string",
                description: "Detailed description",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                default: "medium",
              },
              labels: {
                type: "array",
                items: { type: "string" },
                description: "Ticket labels/tags",
              },
              assignee: {
                type: "string",
                description: "Optional assignee username",
              },
            },
            required: ["title", "description"],
          },
        },
        {
          name: "update_ticket",
          description: "Update an existing ticket",
          inputSchema: {
            type: "object",
            properties: {
              ticket_id: {
                type: "string",
                description: "Ticket ID",
              },
              status: {
                type: "string",
                enum: ["open", "in_progress", "resolved", "closed"],
              },
              comment: {
                type: "string",
                description: "Add a comment",
              },
            },
            required: ["ticket_id"],
          },
        },
        {
          name: "search_tickets",
          description: "Search for existing tickets",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
              status: {
                type: "string",
                description: "Filter by status",
              },
              labels: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["query"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "create_ticket":
          return await this.createTicket(args);
        case "update_ticket":
          return await this.updateTicket(args);
        case "search_tickets":
          return await this.searchTickets(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async createTicket(args: any) {
    const { title, description, priority = "medium", labels = [], assignee } = args;

    // Integrate with your ticketing system (GitHub Issues, Jira, Linear, etc.)
    const ticket = {
      id: `TICKET-${Date.now()}`,
      title,
      description,
      priority,
      labels,
      assignee,
      status: "open",
      created_at: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            ticket,
            message: `Ticket ${ticket.id} created successfully`,
          }),
        },
      ],
    };
  }

  private async updateTicket(args: any) {
    const { ticket_id, status, comment } = args;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            ticket_id,
            status,
            message: "Ticket updated successfully",
          }),
        },
      ],
    };
  }

  private async searchTickets(args: any) {
    const { query, status, labels } = args;

    const results = [
      {
        id: "TICKET-123",
        title: "Similar issue",
        status: "open",
        similarity: 0.85,
      },
    ];

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results,
            count: results.length,
          }),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Ticketing MCP server running on stdio");
  }
}

const server = new TicketingServer();
server.run().catch(console.error);
