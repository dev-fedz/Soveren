import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { FormatterDefinition, FormatRequest, FormatResult, FormatterConfig } from './types.js';
import { FormatterRegistry } from './registry.js';

const execPromise = promisify(exec);

// Cache for command availability to avoid repeated 'which' lookups
const commandAvailabilityCache = new Map<string, boolean>();

export class FormatterService {
  private static userConfig: FormatterConfig = {
    formatOnSave: false,
    formatters: {},
    disabledLanguages: [],
  };

  static getConfig(): FormatterConfig {
    return { ...this.userConfig };
  }

  static updateConfig(partial: Partial<FormatterConfig>): FormatterConfig {
    this.userConfig = {
      ...this.userConfig,
      ...partial,
      formatters: {
        ...this.userConfig.formatters,
        ...(partial.formatters || {}),
      },
    };
    return this.getConfig();
  }

  static async isCommandInstalled(command: string): Promise<boolean> {
    if (commandAvailabilityCache.has(command)) {
      return commandAvailabilityCache.get(command)!;
    }

    try {
      const isWin = process.platform === 'win32';
      const checkCmd = isWin ? `where ${command}` : `which ${command}`;
      await execPromise(checkCmd);
      commandAvailabilityCache.set(command, true);
      return true;
    } catch {
      commandAvailabilityCache.set(command, false);
      return false;
    }
  }

  static resolveFormatter(
    filePath: string,
    explicitLanguage?: string,
    workspacePath?: string | null,
  ): { formatter?: FormatterDefinition; language: string } {
    const detected = FormatterRegistry.detectLanguage(filePath);
    const language = explicitLanguage || (detected !== 'plaintext' ? detected : 'plaintext');

    // 1. Check if language is disabled
    if (this.userConfig.disabledLanguages.includes(language)) {
      return { formatter: undefined, language };
    }

    // 2. User preference override
    const preferredId = this.userConfig.formatters[language];
    if (preferredId) {
      if (preferredId === 'none') {
        return { formatter: undefined, language };
      }
      const preferred = FormatterRegistry.getById(preferredId);
      if (preferred) return { formatter: preferred, language };
    }

    // 3. Built-in registry default
    let def: FormatterDefinition | undefined;
    // If filePath has an extension, resolve by file first
    if (filePath && filePath !== 'untitled' && path.extname(filePath)) {
      def = FormatterRegistry.resolveDefaultFormatter(filePath);
    }
    // Otherwise or if not found, resolve by language
    if (!def && language && language !== 'plaintext') {
      const byLang = FormatterRegistry.getFormattersForLanguage(language);
      if (byLang.length > 0) def = byLang[0];
    }
    // Fallback to filePath if language didn't match
    if (!def && filePath && filePath !== 'untitled') {
      def = FormatterRegistry.resolveDefaultFormatter(filePath);
    }
    return { formatter: def, language };
  }

  static async format(request: FormatRequest): Promise<FormatResult> {
    const { code, filePath = 'untitled', language: explicitLanguage, workspacePath } = request;
    const { formatter, language } = this.resolveFormatter(filePath, explicitLanguage, workspacePath);

    if (!formatter) {
      return {
        success: true,
        formatted: code,
        formatterId: 'none',
        formatterName: 'None',
        language,
      };
    }

    // 1. Dockerfile Formatter
    if (formatter.id === 'dockfmt' || language === 'dockerfile') {
      return this.formatDockerfile(code, filePath);
    }

    // 2. Lockfile Formatter (.lock, package-lock.json, yarn.lock, Cargo.lock)
    if (language === 'lockfile' || path.extname(filePath) === '.lock') {
      return this.formatLockfile(code, filePath);
    }

    // 3. Dotenv Formatter (.env, .env.local, .env.example)
    if (language === 'dotenv' || path.basename(filePath).startsWith('.env')) {
      return this.formatDotenv(code, filePath);
    }

    // 4. Plaintext & General Text / Ignore files (.txt, .log, .gitignore)
    if (formatter.id === 'textfmt' || language === 'plaintext' || language === 'ignore' || language === 'properties') {
      return this.formatTextFile(code, filePath, language);
    }

    // 5. Builtin Prettier formatting (.ts, .tsx, .js, .jsx, .json, .tsbuildinfo, html, css, yaml, md)
    if (formatter.builtinSupported || formatter.id === 'prettier') {
      return this.formatWithPrettier(code, filePath, language, workspacePath);
    }

    // 6. CLI Formatter
    return this.formatWithCli(formatter, code, filePath, language, workspacePath);
  }

  static formatDockerfile(code: string, filePath: string): FormatResult {
    try {
      const INSTRUCTIONS = [
        'FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV',
        'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR',
        'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'
      ];

      const lines = code.split(/\r?\n/);
      const formattedLines: string[] = [];
      let inContinuation = false;
      let consecutiveEmpty = 0;

      for (const line of lines) {
        const trimmed = line.trimEnd();

        // Empty line handling
        if (!trimmed.trim()) {
          consecutiveEmpty++;
          if (consecutiveEmpty <= 1 && formattedLines.length > 0) {
            formattedLines.push('');
          }
          inContinuation = false;
          continue;
        }
        consecutiveEmpty = 0;

        // Comments
        if (trimmed.trimStart().startsWith('#')) {
          formattedLines.push(trimmed);
          inContinuation = false;
          continue;
        }

        // Line continuation indent
        if (inContinuation) {
          const continuationLine = /^\s+/.test(trimmed) ? trimmed : `    ${trimmed}`;
          formattedLines.push(continuationLine);
          inContinuation = trimmed.endsWith('\\');
          continue;
        }

        // Check if starts with a known Dockerfile instruction
        const match = trimmed.match(/^([a-zA-Z]+)(\s+.*|$)/);
        if (match) {
          const keyword = match[1].toUpperCase();
          if (INSTRUCTIONS.includes(keyword)) {
            const rest = match[2] || '';
            formattedLines.push(`${keyword}${rest}`);
            inContinuation = trimmed.endsWith('\\');
            continue;
          }
        }

        formattedLines.push(trimmed);
        inContinuation = trimmed.endsWith('\\');
      }

      const formatted = formattedLines.join('\n').trim() + '\n';
      return {
        success: true,
        formatted,
        formatterId: 'dockfmt',
        formatterName: 'Dockerfile Formatter',
        language: 'dockerfile',
      };
    } catch (err: any) {
      return {
        success: false,
        formatted: code,
        formatterId: 'dockfmt',
        formatterName: 'Dockerfile Formatter',
        language: 'dockerfile',
        error: err.message,
      };
    }
  }

  static formatLockfile(code: string, filePath: string): FormatResult {
    try {
      // 1. If JSON lockfile (package-lock.json, composer.lock, skills-lock.json, or JSON content)
      const trimmed = code.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(code);
          const formatted = JSON.stringify(parsed, null, 2) + '\n';
          return {
            success: true,
            formatted,
            formatterId: 'prettier',
            formatterName: 'JSON Formatter',
            language: 'json',
          };
        } catch {
          // Not JSON, continue to text normalization
        }
      }

      // 2. Text lockfile (yarn.lock, Cargo.lock, poetry.lock, etc.)
      const lines = code.split(/\r?\n/).map((l) => l.trimEnd());
      const formatted = lines.join('\n').trim() + '\n';
      return {
        success: true,
        formatted,
        formatterId: 'textfmt',
        formatterName: 'Lockfile Formatter',
        language: 'lockfile',
      };
    } catch (err: any) {
      return {
        success: false,
        formatted: code,
        formatterId: 'textfmt',
        formatterName: 'Lockfile Formatter',
        language: 'lockfile',
        error: err.message,
      };
    }
  }

  static formatDotenv(code: string, filePath: string): FormatResult {
    try {
      const lines = code.split(/\r?\n/);
      const formattedLines: string[] = [];
      let consecutiveEmpty = 0;

      for (const line of lines) {
        const trimmed = line.trimEnd();

        if (!trimmed.trim()) {
          consecutiveEmpty++;
          if (consecutiveEmpty <= 1 && formattedLines.length > 0) {
            formattedLines.push('');
          }
          continue;
        }
        consecutiveEmpty = 0;

        // Comments
        if (trimmed.trimStart().startsWith('#')) {
          formattedLines.push(trimmed);
          continue;
        }

        // Format KEY = VALUE to KEY=VALUE
        const envMatch = trimmed.match(/^(\s*(?:export\s+)?[A-Za-z_0-9\.\-]+)\s*=\s*(.*)$/);
        if (envMatch) {
          formattedLines.push(`${envMatch[1].trim()}=${envMatch[2].trim()}`);
        } else {
          formattedLines.push(trimmed);
        }
      }

      const formatted = formattedLines.join('\n').trim() + '\n';
      return {
        success: true,
        formatted,
        formatterId: 'textfmt',
        formatterName: 'Dotenv Formatter',
        language: 'dotenv',
      };
    } catch (err: any) {
      return {
        success: false,
        formatted: code,
        formatterId: 'textfmt',
        formatterName: 'Dotenv Formatter',
        language: 'dotenv',
        error: err.message,
      };
    }
  }

  static formatTextFile(code: string, filePath: string, language: string = 'plaintext'): FormatResult {
    try {
      const lines = code.split(/\r?\n/).map((l) => l.trimEnd());
      const formattedLines: string[] = [];
      let consecutiveEmpty = 0;

      for (const line of lines) {
        if (!line.trim()) {
          consecutiveEmpty++;
          if (consecutiveEmpty <= 1 && formattedLines.length > 0) {
            formattedLines.push('');
          }
          continue;
        }
        consecutiveEmpty = 0;
        formattedLines.push(line);
      }

      const formatted = formattedLines.join('\n').trim() + '\n';
      return {
        success: true,
        formatted,
        formatterId: 'textfmt',
        formatterName: 'Text Formatter',
        language,
      };
    } catch (err: any) {
      return {
        success: false,
        formatted: code,
        formatterId: 'textfmt',
        formatterName: 'Text Formatter',
        language,
        error: err.message,
      };
    }
  }

  private static async formatWithPrettier(
    code: string,
    filePath: string,
    language: string,
    workspacePath?: string | null,
  ): Promise<FormatResult> {
    try {
      const prettier = await import('prettier');

      // Determine parser from language or filename
      let parser: string | undefined;
      const ext = path.extname(filePath).toLowerCase();

      switch (language) {
        case 'javascript':
        case 'nodejs':
          parser = 'babel';
          break;
        case 'jsx':
        case 'react':
          parser = 'babel';
          break;
        case 'typescript':
          parser = 'typescript';
          break;
        case 'tsx':
          parser = 'typescript';
          break;
        case 'html':
        case 'django':
          parser = 'html';
          break;
        case 'css':
          parser = 'css';
          break;
        case 'scss':
        case 'sass':
          parser = 'scss';
          break;
        case 'less':
          parser = 'less';
          break;
        case 'json':
        case 'tsbuildinfo':
          parser = 'json';
          break;
        case 'jsonc':
        case 'json5':
          parser = 'json5';
          break;
        case 'yaml':
          parser = 'yaml';
          break;
        case 'markdown':
          parser = 'markdown';
          break;
        case 'mdx':
          parser = 'mdx';
          break;
        case 'graphql':
          parser = 'graphql';
          break;
        case 'vue':
          parser = 'vue';
          break;
        default:
          if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts') parser = 'typescript';
          else if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') parser = 'babel';
          else if (ext === '.json' || ext === '.tsbuildinfo') parser = 'json';
          else if (ext === '.json5') parser = 'json5';
          else if (ext === '.html' || ext === '.htm') parser = 'html';
          else if (ext === '.css') parser = 'css';
          else if (ext === '.md' || ext === '.markdown') parser = 'markdown';
          else if (ext === '.mdx') parser = 'mdx';
          else if (ext === '.yml' || ext === '.yaml') parser = 'yaml';
          else if (ext === '.graphql' || ext === '.gql') parser = 'graphql';
          break;
      }

      // Check for project prettier configuration if workspace exists
      let projectOptions: any = {};
      try {
        if (workspacePath) {
          const config = await prettier.default.resolveConfig(filePath || workspacePath);
          if (config) projectOptions = config;
        }
      } catch {
        // Fall back to default prettier options
      }

      const options = {
        ...projectOptions,
        parser,
        filepath: filePath,
      };

      // Django template tag protection if Django HTML
      let preprocessedCode = code;
      const djangoTokens: { placeholder: string; original: string }[] = [];

      if (language === 'django' || (ext === '.html' && code.includes('{%'))) {
        // Preserve {% ... %} and {{ ... }}
        preprocessedCode = code.replace(/(\{%.*?%\}|\{\{.*?\}\})/gs, (match, p1, offset) => {
          const placeholder = `__DJ_TAG_${djangoTokens.length}__`;
          djangoTokens.push({ placeholder, original: match });
          return placeholder;
        });
      }

      let formatted = await prettier.default.format(preprocessedCode, options);

      // Restore Django tags
      for (const token of djangoTokens) {
        formatted = formatted.replaceAll(token.placeholder, token.original);
      }

      return {
        success: true,
        formatted,
        formatterId: 'prettier',
        formatterName: 'Prettier',
        language,
      };
    } catch (err: any) {
      console.warn(`[FormatterService] Prettier failed: ${err.message}`);
      return {
        success: false,
        formatted: code, // Never destroy or replace user code
        formatterId: 'prettier',
        formatterName: 'Prettier',
        language,
        error: err.message,
        syntaxError: true,
      };
    }
  }

  private static async formatWithCli(
    formatter: FormatterDefinition,
    code: string,
    filePath: string,
    language: string,
    workspacePath?: string | null,
  ): Promise<FormatResult> {
    const isInstalled = await this.isCommandInstalled(formatter.command);

    if (!isInstalled) {
      return {
        success: false,
        formatted: code, // Keep original source code
        formatterId: formatter.id,
        formatterName: formatter.name,
        language,
        unavailable: true,
        installHelp: formatter.installHelp,
        error: `${formatter.name} is required to format this ${language} file but is not installed on the system.`,
      };
    }

    try {
      const cwd = workspacePath || process.cwd();
      const args = formatter.args ? [...formatter.args] : [];

      // Replace stdin placeholder if any
      const formatted = await new Promise<string>((resolve, reject) => {
        const child = spawn(formatter.command, args, {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => {
          stdout += d.toString();
        });

        child.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        child.on('error', (err) => {
          reject(err);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(stderr || `Formatter exited with code ${code}`));
          }
        });

        child.stdin.write(code);
        child.stdin.end();
      });

      return {
        success: true,
        formatted,
        formatterId: formatter.id,
        formatterName: formatter.name,
        language,
      };
    } catch (err: any) {
      console.warn(`[FormatterService] CLI ${formatter.name} failed: ${err.message}`);
      return {
        success: false,
        formatted: code, // Preserve user source code
        formatterId: formatter.id,
        formatterName: formatter.name,
        language,
        error: err.message,
        syntaxError: true,
      };
    }
  }

  static async getInstalledStatus(): Promise<
    {
      id: string;
      name: string;
      languages: string[];
      command: string;
      installed: boolean;
      installHelp?: string;
    }[]
  > {
    const all = FormatterRegistry.getAll();
    const results = await Promise.all(
      all.map(async (f) => {
        const installed = f.builtinSupported ? true : await this.isCommandInstalled(f.command);
        return {
          id: f.id,
          name: f.name,
          languages: f.languages,
          command: f.command,
          installed,
          installHelp: f.installHelp,
        };
      }),
    );
    return results;
  }
}
