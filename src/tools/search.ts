import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './registry.js';
import { WorkspaceContext } from '../context/workspaceContext.js';

const execFilePromise = promisify(execFile);

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.agents',
  'venv',
  'venv_new',
  '__pycache__',
]);

const BINARY_EXTENSIONS = new Set([
  'apk', 'aab', 'ipa', 'exe', 'bin', 'so', 'dylib', 'dll',
  'zip', 'tar', 'gz', '7z', 'rar',
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'mp4', 'mov', 'pdf',
  'sql', 'sqlite', 'sqlite3', 'db', 'pyc',
]);

const RG_EXCLUSIONS = [
  '--max-filesize', '500K',
  '-g', '!*.apk',
  '-g', '!*.aab',
  '-g', '!*.ipa',
  '-g', '!*.zip',
  '-g', '!*.tar',
  '-g', '!*.gz',
  '-g', '!*.sql',
  '-g', '!*.sqlite*',
  '-g', '!*.db',
  '-g', '!*.pyc',
  '-g', '!node_modules/**',
  '-g', '!.git/**',
  '-g', '!dist/**',
  '-g', '!build/**',
  '-g', '!.next/**',
  '-g', '!venv/**',
];

function createPatternMatcher(searchTerm: string): (str: string) => boolean {
  try {
    const regex = new RegExp(searchTerm, 'i');
    return (str: string) => regex.test(str);
  } catch {
    const lower = searchTerm.toLowerCase();
    return (str: string) => str.toLowerCase().includes(lower);
  }
}

async function nodeFallbackSearch(
  root: string,
  searchTerm: string,
  extension?: string
): Promise<{ matchingPaths: string[]; contentMatches: string[] }> {
  const matchingPaths: string[] = [];
  const contentMatches: string[] = [];
  const matcher = createPatternMatcher(searchTerm);

  async function walk(dir: string, depth = 0) {
    if (depth > 6 || matchingPaths.length + contentMatches.length >= 60) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matchingPaths.length + contentMatches.length >= 60) break;
      const name = entry.name;
      if (name.startsWith('.') && name !== '.env' && name !== '.env.example') {
        if (entry.isDirectory()) continue;
      }

      const fullPath = path.join(dir, name);
      const relPath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        if (matcher(name) || matcher(relPath)) {
          matchingPaths.push(`${relPath}/`);
        }
        await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(name).slice(1).toLowerCase();
        if (extension && ext !== extension.toLowerCase()) continue;

        // Check filename / path match
        if (matcher(name) || matcher(relPath)) {
          matchingPaths.push(relPath);
        }

        // Check content match for text files
        if (BINARY_EXTENSIONS.has(ext)) continue;

        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.size > 0 && stat.size < 300 * 1024) {
            const content = await fs.promises.readFile(fullPath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (matcher(lines[i])) {
                contentMatches.push(`${relPath}:${i + 1}:${lines[i].trim()}`);
                if (contentMatches.length >= 30) break;
              }
            }
          }
        } catch {
          // ignore unreadable
        }
      }
    }
  }

  try {
    await walk(root);
  } catch {
    // ignore
  }

  return { matchingPaths, contentMatches };
}

export class SearchFilesTool implements Tool {
  name = 'search_files';
  description = 'Search for text patterns, filenames, or directory names across workspace files using ripgrep (rg) with automatic fallback.';
  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The text pattern, regex, or filename to search for.' },
      pattern: { type: 'string', description: 'Alternative alias for query.' },
      extension: { type: 'string', description: 'Optional file extension to filter by (e.g., "ts", "py").' }
    },
  };

  async execute(input: { query?: string; pattern?: string; extension?: string }): Promise<ToolResult> {
    try {
      const searchTerm = input.query || input.pattern || '';
      if (!searchTerm) {
        return {
          success: false,
          content: '',
          error: 'Parameter "query" or "pattern" is required for search_files.',
        };
      }

      const root = WorkspaceContext.getRoot();
      if (!root || !WorkspaceContext.hasActiveWorkspace()) {
        return {
          success: false,
          content: '',
          error: 'Access denied: No project is currently opened. Please open a project from your local machine to search files.',
        };
      }
      if (WorkspaceContext.isAgentRoot(root)) {
        return {
          success: false,
          content: '',
          error: "Access denied: Searching the AI agent's root project is strictly prohibited to prevent confusion.",
        };
      }
      const matcher = createPatternMatcher(searchTerm);
      const matchingPaths: string[] = [];
      const contentMatches: string[] = [];

      // 1. Fast Directory & File Path Search using ripgrep or directory scan
      try {
        // Check top-level directories in root
        const rootEntries = await fs.promises.readdir(root, { withFileTypes: true });
        for (const entry of rootEntries) {
          if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
            if (matcher(entry.name)) {
              matchingPaths.push(`${entry.name}/`);
            }
          }
        }

        // List files with rg (super fast with exclusions)
        const rgFilesArgs = ['--files', ...RG_EXCLUSIONS];
        if (input.extension) {
          rgFilesArgs.push('-g', `*.${input.extension}`);
        }
        const { stdout: filesStdout } = await execFilePromise('rg', rgFilesArgs, {
          cwd: root,
          timeout: 4000,
        });

        if (filesStdout) {
          const allFiles = filesStdout.split(/\r?\n/).filter(Boolean);
          for (const filePath of allFiles) {
            if (matcher(filePath)) {
              matchingPaths.push(filePath);
              if (matchingPaths.length >= 35) break;
            }
          }
        }
      } catch {
        // ripgrep --files failed or not available, will use fallback below if needed
      }

      // 2. Ripgrep Content Search
      try {
        const rgContentArgs = ['--vimgrep', '--max-count', '30', ...RG_EXCLUSIONS];
        if (input.extension) {
          rgContentArgs.push('-g', `*.${input.extension}`);
        }
        rgContentArgs.push(searchTerm, '.');

        const { stdout: contentStdout } = await execFilePromise('rg', rgContentArgs, {
          cwd: root,
          timeout: 5000,
        });

        if (contentStdout && contentStdout.trim()) {
          const lines = contentStdout.trim().split(/\r?\n/);
          for (const l of lines) {
            contentMatches.push(l);
            if (contentMatches.length >= 35) break;
          }
        }
      } catch {
        // ripgrep search produced no output or timed out
      }

      // 3. Fallback to pure Node.js walk if ripgrep found nothing
      if (matchingPaths.length === 0 && contentMatches.length === 0) {
        const fallback = await nodeFallbackSearch(root, searchTerm, input.extension);
        matchingPaths.push(...fallback.matchingPaths);
        contentMatches.push(...fallback.contentMatches);
      }

      // Format combined results
      const sections: string[] = [];
      if (matchingPaths.length > 0) {
        const uniquePaths = Array.from(new Set(matchingPaths)).slice(0, 30);
        sections.push(`Matching files & directories (${uniquePaths.length}):\n${uniquePaths.map(p => `  • ${p}`).join('\n')}`);
      }
      if (contentMatches.length > 0) {
        const uniqueContent = Array.from(new Set(contentMatches)).slice(0, 30);
        sections.push(`Matching content in files (${uniqueContent.length}):\n${uniqueContent.join('\n')}`);
      }

      if (sections.length > 0) {
        return {
          success: true,
          content: sections.join('\n\n'),
        };
      }

      return {
        success: true,
        content: `No files or content matching "${searchTerm}" found in workspace.`,
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Error executing search',
      };
    }
  }
}
