import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

const execPromise = promisify(exec);

export class FindSymbolTool implements Tool {
  name = 'find_symbol';
  description = 'Find the definition of a symbol (class, function, interface, or variable) in the codebase. Use this to find exactly where a piece of logic is defined.';
  inputSchema = {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'The name of the symbol to find (e.g., "Agent", "processRequest", "ToolRegistry").' }
    },
    required: ['symbol']
  };

  async execute(input: { symbol: string }): Promise<ToolResult> {
    try {
      // Regex to find declarations: class, interface, function, const, let, var
      // Matches: "class SymbolName", "function SymbolName", "const SymbolName =", etc.
      const regex = `(class|interface|function|const|let|var|async function)\\s+${input.symbol}\\b`;

      // Use rg (ripgrep) for fast search. --vimgrep gives us file:line:col:text
      const command = `rg --vimgrep "${regex}"`;

      const { stdout, stderr } = await execPromise(command, { cwd: WorkspaceContext.getRoot() });

      if (stdout) {
        return {
          success: true,
          content: `Found definitions for ${input.symbol}:\n${stdout}`,
        };
      }

      if (stderr) {
        return {
          success: false,
          content: '',
          error: stderr,
        };
      }

      return {
        success: true,
        content: `No definition found for symbol "${input.symbol}".`,
      };
    } catch (error: any) {
      // rg returns exit code 1 if no matches found
      if (error.stderr === '' && error.stdout === '') {
        return {
          success: true,
          content: `No definition found for symbol "${input.symbol}".`,
        };
      }

      // Node.js fallback regex search
      try {
        const root = WorkspaceContext.getRoot();
        const symbolRegex = new RegExp(`(class|interface|function|const|let|var|async function)\\s+${input.symbol}\\b`);
        const matches: string[] = [];
        const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'venv', 'venv_new', '__pycache__']);

        async function walk(dir: string, depth = 0) {
          if (depth > 6 || matches.length >= 20) return;
          let entries;
          try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            if (matches.length >= 20) break;
            if (entry.isDirectory()) {
              if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
              await walk(path.join(dir, entry.name), depth + 1);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name);
              if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs'].includes(ext)) continue;
              const fullPath = path.join(dir, entry.name);
              try {
                const stat = await fs.promises.stat(fullPath);
                if (stat.size > 200 * 1024) continue;
                const fileContent = await fs.promises.readFile(fullPath, 'utf8');
                const lines = fileContent.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (symbolRegex.test(lines[i])) {
                    const rel = path.relative(root, fullPath);
                    matches.push(`${rel}:${i + 1}:${lines[i].trim()}`);
                    if (matches.length >= 20) break;
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        }

        await walk(root);
        if (matches.length > 0) {
          return {
            success: true,
            content: `Found definitions for ${input.symbol}:\n${matches.join('\n')}`,
          };
        }
      } catch {
        // ignore
      }

      return {
        success: true,
        content: `No definition found for symbol "${input.symbol}".`,
      };
    }
  }
}
