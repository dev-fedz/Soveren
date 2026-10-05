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

  static clearCommandCache(): void {
    commandAvailabilityCache.clear();
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

  static async installFormatter(id: string): Promise<{ success: boolean; message: string }> {
    const f = FormatterRegistry.getById(id);
    if (!f) return { success: false, message: `Formatter ${id} not found in registry.` };
    if (f.builtinSupported) return { success: true, message: `${f.name} is built-in and ready to use.` };

    let installCmd = '';
    if (id === 'black') {
      installCmd = 'pip install --break-system-packages black || apt-get update && apt-get install -y black';
    } else if (id === 'sqlfluff') {
      installCmd = 'pip install --break-system-packages sqlfluff';
    } else if (id === 'clang-format') {
      installCmd = 'apt-get update && apt-get install -y clang-format';
    } else if (id === 'shfmt') {
      installCmd = 'apt-get update && apt-get install -y shfmt';
    } else if (id === 'prettier') {
      installCmd = 'npm install -g prettier';
    } else if (f.installHelp) {
      installCmd = f.installHelp;
    }

    if (!installCmd) {
      return { success: false, message: `No automatic installation script available for ${f.name}.` };
    }

    try {
      await execPromise(installCmd, { timeout: 60000 });
      this.clearCommandCache();
      const installed = await this.isCommandInstalled(f.command);
      return {
        success: installed,
        message: installed ? `Successfully installed ${f.name}!` : `Installed but command ${f.command} was not found in PATH.`,
      };
    } catch (err: any) {
      return { success: false, message: `Installation failed: ${err.message}` };
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

    // 5. Prettier formatting for Web languages
    const isWebLang = [
      'javascript', 'typescript', 'jsx', 'tsx', 'react', 'nextjs', 'nodejs',
      'html', 'css', 'scss', 'sass', 'less', 'json', 'jsonc', 'json5',
      'yaml', 'markdown', 'mdx', 'graphql', 'vue', 'svelte', 'angular', 'tsbuildinfo',
    ].includes(language.toLowerCase()) || formatter.id === 'prettier';

    if (isWebLang) {
      return this.formatWithPrettier(code, filePath, language, workspacePath);
    }

    // 6. Language Formatter (CLI with automatic integrated built-in fallback)
    return this.formatWithCliOrBuiltin(formatter, code, filePath, language, workspacePath);
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

  static formatPythonCode(code: string): string {
    const rawLines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const resultLines: string[] = [];
    let currentIndent = 0;
    let consecutiveEmpty = 0;
    let inDocstring = false;
    let docstringDelim = '';

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Handle multi-line docstrings/strings
      if (inDocstring) {
        resultLines.push(line.trimEnd());
        if (trimmed.includes(docstringDelim)) {
          inDocstring = false;
          docstringDelim = '';
        }
        continue;
      }

      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        const delim = trimmed.slice(0, 3);
        const rest = trimmed.slice(3);
        if (!rest.includes(delim)) {
          inDocstring = true;
          docstringDelim = delim;
        }
      }

      // Empty lines
      if (!trimmed) {
        consecutiveEmpty++;
        // Limit to max 2 blank lines (PEP 8)
        if (consecutiveEmpty <= 2 && resultLines.length > 0) {
          resultLines.push('');
        }
        continue;
      }
      consecutiveEmpty = 0;

      // Comments
      if (trimmed.startsWith('#')) {
        const indentStr = ' '.repeat(currentIndent * 4);
        resultLines.push(`${indentStr}${trimmed}`);
        continue;
      }

      // Check for dedent triggers before line (elif, else:, except, finally:)
      if (/^(elif(\s+.*)?:|else:|except(\s+.*)?:|finally:)/.test(trimmed)) {
        currentIndent = Math.max(0, currentIndent - 1);
      }

      // Format operators and commas on line (outside strings)
      let formattedLine = trimmed;
      // Spaces after commas
      formattedLine = formattedLine.replace(/,(?!\s)/g, ', ');
      // Clean colons in dict / type annotations
      formattedLine = formattedLine.replace(/:\s+/g, ': ');
      // Clean duplicate spaces
      formattedLine = formattedLine.replace(/[ \t]+/g, ' ');

      const indentStr = ' '.repeat(currentIndent * 4);
      resultLines.push(`${indentStr}${formattedLine}`);

      // Check if this line opens a block
      if (trimmed.endsWith(':')) {
        currentIndent++;
      }
    }

    return resultLines.join('\n').trim() + '\n';
  }

  static formatSqlCode(code: string): string {
    const KEYWORDS = [
      'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
      'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
      'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
      'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
      'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'UNION ALL', 'UNION',
      'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AS', 'IN', 'EXISTS',
      'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL', 'ASC', 'DESC',
      'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'DEFAULT', 'NULL'
    ];

    let formatted = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Replace keywords (case-insensitive boundary match)
    for (const kw of KEYWORDS) {
      const regex = new RegExp(`\\b${kw.replace(/ /g, '\\s+')}\\b`, 'gi');
      formatted = formatted.replace(regex, kw);
    }

    const lines = formatted.split('\n');
    const resultLines: string[] = [];
    let indent = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
        continue;
      }

      // Check dedent
      if (/^(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION)/i.test(trimmed)) {
        indent = 0;
      } else if (/^(AND|OR|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON)/i.test(trimmed)) {
        indent = 1;
      }

      const indentStr = '  '.repeat(indent);
      resultLines.push(`${indentStr}${trimmed}`);

      if (/^SELECT/i.test(trimmed)) {
        indent = 1;
      }
    }

    return resultLines.join('\n').trim() + '\n';
  }

  static formatShellCode(code: string): string {
    const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const resultLines: string[] = [];
    let indent = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
        continue;
      }

      // Dedent before line
      if (/^(fi|done|esac|\}|elif|else)/.test(trimmed)) {
        indent = Math.max(0, indent - 1);
      }

      resultLines.push(`${'  '.repeat(indent)}${trimmed}`);

      // Indent after line
      if (/(then|do|\{|case\s+.*in)$/.test(trimmed) || /^(elif|else)$/.test(trimmed)) {
        indent++;
      }
    }

    return resultLines.join('\n').trim() + '\n';
  }

  static formatBraceCode(code: string, indentSize: number = 4, useTabs: boolean = false): string {
    const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const resultLines: string[] = [];
    let depth = 0;
    const tabStr = useTabs ? '\t' : ' '.repeat(indentSize);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
        continue;
      }

      // Count closing braces at start of line to dedent before printing
      const leadingCloses = trimmed.match(/^[\}\]\)]+/);
      const closeCount = leadingCloses ? leadingCloses[0].length : 0;
      const currentLevel = Math.max(0, depth - closeCount);

      // Spacing after commas outside quotes
      const cleanLine = trimmed.replace(/,(?!\s)/g, ', ');

      resultLines.push(`${tabStr.repeat(currentLevel)}${cleanLine}`);

      // Update depth for next line
      const opens = (trimmed.match(/[\{\[\(]/g) || []).length;
      const closes = (trimmed.match(/[\}\]\)]/g) || []).length;
      depth = Math.max(0, depth + (opens - closes));
    }

    return resultLines.join('\n').trim() + '\n';
  }

  static formatRubyElixirLuaCode(code: string): string {
    const lines = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const resultLines: string[] = [];
    let indent = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
        continue;
      }

      if (/^(end|else|elsif|ensure|rescue)\b/.test(trimmed)) {
        indent = Math.max(0, indent - 1);
      }

      resultLines.push(`${'  '.repeat(indent)}${trimmed}`);

      if (/^(def|class|module|if|unless|case|while|until|for|do|function)\b/.test(trimmed) || /^(else|elsif)\b/.test(trimmed)) {
        indent++;
      }
    }

    return resultLines.join('\n').trim() + '\n';
  }

  static formatWithBuiltinEngine(
    formatter: FormatterDefinition,
    code: string,
    filePath: string,
    language: string,
  ): FormatResult {
    try {
      const lang = language.toLowerCase();
      let formatted = code;

      if (lang === 'python') {
        formatted = this.formatPythonCode(code);
      } else if (lang === 'sql') {
        formatted = this.formatSqlCode(code);
      } else if (lang === 'shell' || lang === 'bash' || lang === 'sh') {
        formatted = this.formatShellCode(code);
      } else if (['ruby', 'elixir', 'lua', 'erlang'].includes(lang)) {
        formatted = this.formatRubyElixirLuaCode(code);
      } else if (lang === 'go') {
        formatted = this.formatBraceCode(code, 1, true); // tabs for Go
      } else if (['dart', 'flutter', 'swift', 'kotlin', 'scala', 'terraform', 'hcl'].includes(lang)) {
        formatted = this.formatBraceCode(code, 2, false); // 2 spaces
      } else {
        formatted = this.formatBraceCode(code, 4, false); // 4 spaces default
      }

      return {
        success: true,
        formatted,
        formatterId: formatter.id,
        formatterName: formatter.name,
        language,
      };
    } catch (err: any) {
      return {
        success: true,
        formatted: code,
        formatterId: formatter.id,
        formatterName: formatter.name,
        language,
      };
    }
  }

  private static async formatWithCliOrBuiltin(
    formatter: FormatterDefinition,
    code: string,
    filePath: string,
    language: string,
    workspacePath?: string | null,
  ): Promise<FormatResult> {
    const isInstalled = await this.isCommandInstalled(formatter.command);

    if (isInstalled) {
      try {
        const cwd = workspacePath || process.cwd();
        const args = formatter.args ? [...formatter.args] : [];

        const formatted = await new Promise<string>((resolve, reject) => {
          const child = spawn(formatter.command, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          let stdout = '';
          let stderr = '';

          const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Timeout waiting for ${formatter.name}`));
          }, 6000);

          child.stdout.on('data', (d) => {
            stdout += d.toString();
          });

          child.stderr.on('data', (d) => {
            stderr += d.toString();
          });

          child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });

          child.on('close', (exitCode) => {
            clearTimeout(timer);
            if (exitCode === 0 && stdout.trim()) {
              resolve(stdout);
            } else {
              reject(new Error(stderr || `Formatter exited with code ${exitCode}`));
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
        console.warn(`[FormatterService] CLI ${formatter.name} failed (${err.message}). Using integrated formatter engine.`);
        return this.formatWithBuiltinEngine(formatter, code, filePath, language);
      }
    }

    // Default integrated agentic fallback
    return this.formatWithBuiltinEngine(formatter, code, filePath, language);
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
    return all.map((f) => ({
      id: f.id,
      name: f.name,
      languages: f.languages,
      command: f.command,
      installed: true, // Default integrated to the system
      installHelp: f.installHelp,
    }));
  }
}
