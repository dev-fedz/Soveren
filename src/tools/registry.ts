import { LLMProvider, Message } from '../llm/types.js';

export interface ToolResult {
  content: string;
  success: boolean;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  execute(input: any): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions() {
    return this.getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }));
  }
}

export const toolRegistry = new ToolRegistry();
