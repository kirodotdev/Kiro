// Dify-like Workflow Engine
import { readFileSync } from 'fs';

interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'llm' | 'tool' | 'condition' | 'code';
  data: any;
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

interface WorkflowDefinition {
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export class WorkflowEngine {
  private workflow: WorkflowDefinition;
  private context: Map<string, any> = new Map();

  constructor(workflowPath: string) {
    const content = readFileSync(workflowPath, 'utf-8');
    this.workflow = JSON.parse(content);
  }

  async execute(inputs: Record<string, any>): Promise<any> {
    // Initialize context with inputs
    Object.entries(inputs).forEach(([key, value]) => {
      this.context.set(key, value);
    });

    // Find start node
    const startNode = this.workflow.nodes.find(n => n.type === 'start');
    if (!startNode) throw new Error('No start node found');

    // Execute workflow
    return await this.executeNode(startNode.id);
  }

  private async executeNode(nodeId: string): Promise<any> {
    const node = this.workflow.nodes.find(n => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);

    let result: any;

    switch (node.type) {
      case 'start':
        result = this.context;
        break;
      case 'llm':
        result = await this.executeLLMNode(node);
        break;
      case 'tool':
        result = await this.executeToolNode(node);
        break;
      case 'condition':
        result = await this.executeConditionNode(node);
        break;
      case 'code':
        result = await this.executeCodeNode(node);
        break;
      case 'end':
        return this.formatOutput(node);
    }

    // Store result in context
    this.context.set(nodeId, result);

    // Find next node(s)
    const nextEdges = this.workflow.edges.filter(e => e.from === nodeId);
    
    for (const edge of nextEdges) {
      if (!edge.condition || this.evaluateCondition(edge.condition)) {
        return await this.executeNode(edge.to);
      }
    }

    return result;
  }

  private async executeLLMNode(node: WorkflowNode): Promise<any> {
    const prompt = this.interpolate(node.data.prompt);
    // Call LLM API (OpenAI, Anthropic, etc.)
    return { response: "LLM response", confidence: 0.85 };
  }

  private async executeToolNode(node: WorkflowNode): Promise<any> {
    const [provider, server, tool] = node.data.tool.split('.');
    const inputs = this.interpolateObject(node.data.inputs);
    
    // Call MCP tool
    return { success: true, data: {} };
  }

  private async executeConditionNode(node: WorkflowNode): Promise<boolean> {
    return this.evaluateCondition(node.data.condition);
  }

  private async executeCodeNode(node: WorkflowNode): Promise<any> {
    const fn = new Function('context', node.data.code);
    return fn(Object.fromEntries(this.context));
  }

  private interpolate(template: string): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const value = this.resolveContextPath(key.trim());
      return value !== undefined ? String(value) : '';
    });
  }

  private interpolateObject(obj: any): any {
    if (typeof obj === 'string') return this.interpolate(obj);
    if (Array.isArray(obj)) return obj.map(item => this.interpolateObject(item));
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObject(value);
      }
      return result;
    }
    return obj;
  }

  private resolveContextPath(path: string): any {
    const parts = path.split('.');
    let value: any = Object.fromEntries(this.context);
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }

  private evaluateCondition(condition: string): boolean {
    const interpolated = this.interpolate(condition);
    try {
      return new Function('return ' + interpolated)();
    } catch {
      return false;
    }
  }

  private formatOutput(node: WorkflowNode): any {
    const outputs: any = {};
    for (const key of node.data.outputs) {
      outputs[key] = this.context.get(key);
    }
    return outputs;
  }
}
