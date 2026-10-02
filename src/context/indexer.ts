import lancedb from '@lancedb/lancedb';
import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import { OllamaProvider } from '../llm/ollama.js';

export class CodeIndexer {
  private db: any;
  private table: any;
  private provider: OllamaProvider;
  private indexDir = path.join(process.cwd(), '.agent_index');

  constructor(provider: OllamaProvider) {
    this.provider = provider;
  }

  async init() {
    this.db = await lancedb.connect(this.indexDir);

    // Define the schema for our code chunks
    const data = [
      {
        vector: new Float32Array(1024).fill(0), // Initial dummy vector to set dimension
        text: '',
        path: '',
        startLine: 0,
        endLine: 0
      }
    ];

    // Create table if it doesn't exist
    try {
      this.table = await this.db.createTable('code_chunks', data, { writeMode: 'overwrite' });
      // Remove the dummy data
      await this.table.delete(`vector = ${data[0].vector[0]}`);
    } catch (e) {
      this.table = await this.db.openTable('code_chunks');
    }
  }

  async indexCodebase() {
    const files = await glob('src/**/*.{ts,js,tsx,jsx,json,md}');
    console.log(`Indexing ${files.length} files...`);

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf8');
      const chunks = this.chunkCode(content);

      const embeddings = await Promise.all(
        chunks.map(async (chunk) => {
          const vector = await this.provider.generateEmbedding(chunk.text);
          return {
            vector,
            text: chunk.text,
            path: filePath,
            startLine: chunk.startLine,
            endLine: chunk.endLine
          };
        })
      );

      await this.table.add(embeddings);
    }
    console.log('Indexing complete.');
  }

  private chunkCode(content: string): { text: string, startLine: number, endLine: number }[] {
    const lines = content.split('\n');
    const chunks: { text: string, startLine: number, endLine: number }[] = [];

    // Simple chunking: group every 20 lines
    const chunkSize = 20;
    for (let i = 0; i < lines.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, lines.length);
      chunks.push({
        text: lines.slice(i, end).join('\n'),
        startLine: i + 1,
        endLine: end
      });
    }
    return chunks;
  }

  async search(query: string, limit = 5) {
    const queryVector = await this.provider.generateEmbedding(query);
    const results = await this.table
      .search(queryVector)
      .limit(limit)
      .execute();

    return results.map((res: any) => ({
      text: res.text,
      path: res.path,
      startLine: res.startLine,
      endLine: res.endLine,
      score: res._distance
    }));
  }
}
