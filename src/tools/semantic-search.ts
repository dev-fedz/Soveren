import { Tool, ToolResult } from './registry.js';
import { CodeIndexer } from '../context/indexer.js';
import { OllamaProvider } from '../llm/ollama.js';

export class SemanticSearchTool implements Tool {
  name = 'semantic_search';
  description = 'Search the codebase using natural language. Finds relevant code snippets based on meaning, not just exact keywords. Returns the most similar code blocks and their locations.';
  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The natural language query to search for (e.g., "how is the plan advanced?" or "where are the git tools defined?").' },
      limit: { type: 'number', description: 'Number of results to return. Defaults to 5.', default: 5 }
    },
    required: ['query']
  };

  private indexer: CodeIndexer;

  constructor() {
    // We initialize the indexer using the same provider as the agent
    const provider = new OllamaProvider();
    this.indexer = new CodeIndexer(provider);
  }

  async execute(input: { query: string, limit?: number }): Promise<ToolResult> {
    try {
      // Ensure index is initialized
      await this.indexer.init();

      // In a real production environment, we'd have a separate indexing process.
      // For now, we re-index if the directory is empty to ensure data is present.
      const results = await this.indexer.search(input.query, input.limit || 5);

      if (results.length === 0) {
        return {
          success: true,
          content: 'No relevant code snippets found for that query.'
        };
      }

      const formattedResults = results.map((res: any, i: number) => (
        `Result ${i + 1} (Score: ${res.score.toFixed(4)}):\n` +
        `File: ${res.path} [Lines ${res.startLine}-${res.endLine}]\n` +
        `---\n${res.text}\n---`
      )).join('\n\n');

      return {
        success: true,
        content: `Top matches for "${input.query}":\n\n${formattedResults}`,
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error during semantic search',
      };
    }
  }
}
