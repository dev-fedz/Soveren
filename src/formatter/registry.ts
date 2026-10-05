import path from 'path';
import { FormatterDefinition } from './types.js';

export const FORMATTERS: FormatterDefinition[] = [
  // 1. Python & Django
  {
    id: 'black',
    name: 'Black',
    languages: ['python'],
    extensions: ['.py'],
    command: 'black',
    configFiles: ['pyproject.toml'],
    supportsStdin: true,
    args: ['-q', '-'],
    installHelp: 'pip install black',
  },

  // 2. JavaScript / TypeScript / Web Ecosystem
  {
    id: 'prettier',
    name: 'Prettier',
    languages: [
      'javascript',
      'typescript',
      'jsx',
      'tsx',
      'react',
      'nextjs',
      'nodejs',
      'html',
      'css',
      'scss',
      'sass',
      'less',
      'json',
      'jsonc',
      'yaml',
      'markdown',
      'graphql',
      'vue',
      'svelte',
      'angular',
      'tsbuildinfo',
      'mdx',
      'json5',
    ],
    extensions: [
      '.js',
      '.mjs',
      '.cjs',
      '.ts',
      '.mts',
      '.cts',
      '.jsx',
      '.tsx',
      '.html',
      '.htm',
      '.css',
      '.scss',
      '.sass',
      '.less',
      '.json',
      '.jsonc',
      '.json5',
      '.tsbuildinfo',
      '.yaml',
      '.yml',
      '.md',
      '.markdown',
      '.mdx',
      '.graphql',
      '.gql',
      '.vue',
      '.svelte',
    ],
    command: 'prettier',
    configFiles: [
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.js',
      '.prettierrc.yaml',
      '.prettierrc.yml',
      'prettier.config.js',
      'prettier.config.cjs',
      'prettier.config.mjs',
    ],
    supportsStdin: true,
    args: ['--stdin-filepath'],
    installHelp: 'npm install -g prettier',
    builtinSupported: true,
  },

  // 3. Go
  {
    id: 'gofmt',
    name: 'gofmt',
    languages: ['go'],
    extensions: ['.go'],
    command: 'gofmt',
    supportsStdin: true,
    installHelp: 'brew install go (or install Go SDK from golang.org)',
  },

  // 4. Rust
  {
    id: 'rustfmt',
    name: 'rustfmt',
    languages: ['rust'],
    extensions: ['.rs'],
    command: 'rustfmt',
    configFiles: ['rustfmt.toml', '.rustfmt.toml'],
    supportsStdin: true,
    installHelp: 'rustup component add rustfmt',
  },

  // 5. C / C++ / Objective-C
  {
    id: 'clang-format',
    name: 'clang-format',
    languages: ['c', 'cpp', 'objective-c'],
    extensions: ['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.m', '.mm'],
    command: 'clang-format',
    configFiles: ['.clang-format', '_clang-format'],
    supportsStdin: true,
    installHelp: 'brew install clang-format (macOS) or apt install clang-format (Linux)',
  },

  // 6. Java
  {
    id: 'google-java-format',
    name: 'Google Java Format',
    languages: ['java'],
    extensions: ['.java'],
    command: 'google-java-format',
    supportsStdin: true,
    args: ['-'],
    installHelp: 'brew install google-java-format',
  },

  // 7. Kotlin
  {
    id: 'ktlint',
    name: 'ktlint',
    languages: ['kotlin'],
    extensions: ['.kt', '.kts'],
    command: 'ktlint',
    configFiles: ['.editorconfig'],
    supportsStdin: true,
    args: ['--format', '-'],
    installHelp: 'brew install ktlint',
  },

  // 8. Scala
  {
    id: 'scalafmt',
    name: 'scalafmt',
    languages: ['scala'],
    extensions: ['.scala', '.sc'],
    command: 'scalafmt',
    configFiles: ['.scalafmt.conf'],
    supportsStdin: true,
    args: ['--stdin'],
    installHelp: 'brew install coursier/formulas/coursier && cs install scalafmt',
  },

  // 9. C#
  {
    id: 'csharpier',
    name: 'CSharpier',
    languages: ['csharp'],
    extensions: ['.cs'],
    command: 'dotnet-csharpier',
    configFiles: ['.editorconfig', '.csharpierrc'],
    supportsStdin: true,
    installHelp: 'dotnet tool install -g csharpier',
  },

  // 10. F#
  {
    id: 'fantomas',
    name: 'Fantomas',
    languages: ['fsharp'],
    extensions: ['.fs', '.fsi', '.fsx'],
    command: 'fantomas',
    configFiles: ['.editorconfig'],
    supportsStdin: true,
    installHelp: 'dotnet tool install -g fantomas',
  },

  // 11. Swift
  {
    id: 'swiftformat',
    name: 'SwiftFormat',
    languages: ['swift'],
    extensions: ['.swift'],
    command: 'swiftformat',
    configFiles: ['.swiftformat'],
    supportsStdin: true,
    installHelp: 'brew install swiftformat',
  },

  // 12. Dart / Flutter
  {
    id: 'dart-format',
    name: 'dart format',
    languages: ['dart', 'flutter'],
    extensions: ['.dart'],
    command: 'dart',
    args: ['format'],
    supportsStdin: true,
    installHelp: 'brew install dart (or install Flutter SDK)',
  },

  // 13. Ruby
  {
    id: 'rubocop',
    name: 'RuboCop',
    languages: ['ruby'],
    extensions: ['.rb', '.rake', 'Gemfile'],
    command: 'rubocop',
    configFiles: ['.rubocop.yml'],
    supportsStdin: true,
    args: ['-a', '--stdin', 'temp.rb'],
    installHelp: 'gem install rubocop',
  },

  // 14. PHP
  {
    id: 'php-cs-fixer',
    name: 'PHP-CS-Fixer',
    languages: ['php'],
    extensions: ['.php'],
    command: 'php-cs-fixer',
    configFiles: ['.php-cs-fixer.php', '.php-cs-fixer.dist.php'],
    supportsStdin: true,
    installHelp: 'composer global require friendsofphp/php-cs-fixer',
  },

  // 15. Lua
  {
    id: 'stylua',
    name: 'StyLua',
    languages: ['lua'],
    extensions: ['.lua'],
    command: 'stylua',
    configFiles: ['stylua.toml', '.stylua.toml'],
    supportsStdin: true,
    args: ['-'],
    installHelp: 'brew install stylua (or cargo install stylua)',
  },

  // 16. Elixir
  {
    id: 'mix-format',
    name: 'mix format',
    languages: ['elixir'],
    extensions: ['.ex', '.exs'],
    command: 'mix',
    configFiles: ['.formatter.exs'],
    supportsStdin: true,
    args: ['format', '-'],
    installHelp: 'brew install elixir',
  },

  // 17. Erlang
  {
    id: 'rebar3_format',
    name: 'rebar3_format',
    languages: ['erlang'],
    extensions: ['.erl', '.hrl'],
    command: 'rebar3',
    supportsStdin: true,
    args: ['format'],
    installHelp: 'brew install rebar3',
  },

  // 18. Shell / Bash
  {
    id: 'shfmt',
    name: 'shfmt',
    languages: ['shell', 'bash'],
    extensions: ['.sh', '.bash'],
    command: 'shfmt',
    configFiles: ['.editorconfig'],
    supportsStdin: true,
    args: ['-i', '2', '-'],
    installHelp: 'brew install shfmt',
  },

  // 19. SQL
  {
    id: 'sqlfluff',
    name: 'SQLFluff',
    languages: ['sql'],
    extensions: ['.sql'],
    command: 'sqlfluff',
    configFiles: ['.sqlfluff'],
    supportsStdin: true,
    args: ['format', '--dialect', 'ansi', '-'],
    installHelp: 'pip install sqlfluff',
  },

  // 20. Terraform / HCL
  {
    id: 'terraform-fmt',
    name: 'terraform fmt',
    languages: ['terraform', 'hcl'],
    extensions: ['.tf', '.tfvars'],
    command: 'terraform',
    supportsStdin: true,
    args: ['fmt', '-'],
    installHelp: 'brew install terraform',
  },

  // 21. Zig
  {
    id: 'zig-fmt',
    name: 'zig fmt',
    languages: ['zig'],
    extensions: ['.zig'],
    command: 'zig',
    supportsStdin: true,
    args: ['fmt', '--stdin'],
    installHelp: 'brew install zig',
  },

  // 22. OCaml
  {
    id: 'ocamlformat',
    name: 'ocamlformat',
    languages: ['ocaml'],
    extensions: ['.ml', '.mli'],
    command: 'ocamlformat',
    configFiles: ['.ocamlformat'],
    supportsStdin: true,
    args: ['-'],
    installHelp: 'opam install ocamlformat',
  },

  // 23. Clojure
  {
    id: 'cljfmt',
    name: 'cljfmt',
    languages: ['clojure'],
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    command: 'cljfmt',
    supportsStdin: true,
    installHelp: 'brew install cljfmt (or install lein-cljfmt)',
  },

  // 24. Julia
  {
    id: 'julia-formatter',
    name: 'JuliaFormatter',
    languages: ['julia'],
    extensions: ['.jl'],
    command: 'julia',
    supportsStdin: true,
    installHelp: 'julia -e \'using Pkg; Pkg.add("JuliaFormatter")\'',
  },

  // 25. R
  {
    id: 'styler',
    name: 'styler',
    languages: ['r'],
    extensions: ['.r', '.R'],
    command: 'Rscript',
    supportsStdin: true,
    installHelp: 'R -e \'install.packages("styler")\'',
  },

  // 26. Nix
  {
    id: 'nixfmt',
    name: 'nixfmt',
    languages: ['nix'],
    extensions: ['.nix'],
    command: 'nixfmt',
    supportsStdin: true,
    installHelp: 'nix-env -iA nixpkgs.nixfmt',
  },

  // 27. Dockerfile
  {
    id: 'dockfmt',
    name: 'Dockerfile Formatter',
    languages: ['dockerfile'],
    extensions: ['.dockerfile', 'dockerfile'],
    command: 'dockfmt',
    supportsStdin: true,
    installHelp: 'Built-in Dockerfile formatter active (or go install github.com/jessfraz/dockfmt@latest)',
    builtinSupported: true,
  },

  // 28. Plaintext, Lockfile, Dotenv, Ignore & Config Files
  {
    id: 'textfmt',
    name: 'Text & Config Formatter',
    languages: ['plaintext', 'lockfile', 'dotenv', 'ignore', 'properties'],
    extensions: [
      '.txt',
      '.text',
      '.log',
      '.lock',
      '.env',
      '.gitignore',
      '.dockerignore',
      '.editorconfig',
      '.properties',
      '.ini',
      '.cfg',
      '.conf',
    ],
    command: 'textfmt',
    supportsStdin: true,
    installHelp: 'Built-in text, lockfile, and config formatter active',
    builtinSupported: true,
  },
].map((f) => ({
  ...f,
  builtinSupported: true,
}));

export class FormatterRegistry {
  private static formatters: FormatterDefinition[] = [...FORMATTERS];

  static getAll(): FormatterDefinition[] {
    return this.formatters;
  }

  static getById(id: string): FormatterDefinition | undefined {
    return this.formatters.find((f) => f.id === id);
  }

  static register(formatter: FormatterDefinition): void {
    const idx = this.formatters.findIndex((f) => f.id === formatter.id);
    if (idx >= 0) {
      this.formatters[idx] = formatter;
    } else {
      this.formatters.push(formatter);
    }
  }

  static detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    // Dockerfile handling: Dockerfile, Dockerfile.dev, Dockerfile.prod, app.dockerfile
    if (basename === 'dockerfile' || basename.startsWith('dockerfile.') || ext === '.dockerfile') {
      return 'dockerfile';
    }

    // Dotenv handling: .env, .env.example, .env.local, .env.production, etc.
    if (basename === '.env' || basename.startsWith('.env.')) {
      return 'dotenv';
    }

    // Ignore files: .gitignore, .dockerignore, .npmignore, .editorconfig
    if (
      basename === '.gitignore' ||
      basename === '.dockerignore' ||
      basename === '.npmignore' ||
      basename === '.editorconfig'
    ) {
      return 'ignore';
    }

    // Special lockfiles
    if (basename === 'package-lock.json' || basename === 'skills-lock.json' || basename === 'composer.lock') {
      return 'json';
    }
    if (basename === 'pnpm-lock.yaml') {
      return 'yaml';
    }

    if (basename === 'makefile') return 'makefile';
    if (basename === 'gemfile') return 'ruby';

    switch (ext) {
      case '.tsbuildinfo':
        return 'json';
      case '.lock':
        return 'lockfile';
      case '.txt':
      case '.text':
      case '.log':
        return 'plaintext';
      case '.mdx':
        return 'mdx';
      case '.toml':
        return 'toml';
      case '.ini':
      case '.cfg':
      case '.conf':
      case '.properties':
        return 'properties';
      case '.xml':
      case '.svg':
        return 'xml';
      case '.prisma':
        return 'prisma';
      case '.py':
        return 'python';
      case '.js':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      case '.jsx':
        return 'jsx';
      case '.ts':
      case '.mts':
      case '.cts':
        return 'typescript';
      case '.tsx':
        return 'tsx';
      case '.html':
      case '.htm':
        return 'html';
      case '.css':
        return 'css';
      case '.scss':
        return 'scss';
      case '.sass':
        return 'sass';
      case '.less':
        return 'less';
      case '.json':
        return 'json';
      case '.jsonc':
        return 'jsonc';
      case '.yaml':
      case '.yml':
        return 'yaml';
      case '.md':
      case '.markdown':
        return 'markdown';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.c':
      case '.h':
        return 'c';
      case '.cpp':
      case '.cc':
      case '.cxx':
      case '.hpp':
      case '.hh':
      case '.hxx':
        return 'cpp';
      case '.m':
      case '.mm':
        return 'objective-c';
      case '.java':
        return 'java';
      case '.kt':
      case '.kts':
        return 'kotlin';
      case '.scala':
      case '.sc':
        return 'scala';
      case '.cs':
        return 'csharp';
      case '.fs':
      case '.fsi':
      case '.fsx':
        return 'fsharp';
      case '.swift':
        return 'swift';
      case '.dart':
        return 'dart';
      case '.rb':
      case '.rake':
        return 'ruby';
      case '.php':
        return 'php';
      case '.lua':
        return 'lua';
      case '.ex':
      case '.exs':
        return 'elixir';
      case '.erl':
      case '.hrl':
        return 'erlang';
      case '.sh':
      case '.bash':
        return 'shell';
      case '.sql':
        return 'sql';
      case '.tf':
      case '.tfvars':
        return 'terraform';
      case '.zig':
        return 'zig';
      case '.ml':
      case '.mli':
        return 'ocaml';
      case '.clj':
      case '.cljs':
      case '.cljc':
      case '.edn':
        return 'clojure';
      case '.jl':
        return 'julia';
      case '.r':
        return 'r';
      case '.vue':
        return 'vue';
      case '.svelte':
        return 'svelte';
      case '.graphql':
      case '.gql':
        return 'graphql';
      case '.nix':
        return 'nix';
      default:
        return 'plaintext';
    }
  }

  static getFormattersForLanguage(language: string): FormatterDefinition[] {
    const lang = language.toLowerCase();
    return this.formatters.filter((f) => f.languages.includes(lang));
  }

  static getFormattersForFile(filePath: string): FormatterDefinition[] {
    const ext = path.extname(filePath).toLowerCase();
    const lang = this.detectLanguage(filePath);
    return this.formatters.filter(
      (f) => (ext && f.extensions.includes(ext)) || f.languages.includes(lang),
    );
  }

  static resolveDefaultFormatter(filePathOrLanguage: string): FormatterDefinition | undefined {
    let matches: FormatterDefinition[];
    if (filePathOrLanguage.includes('.')) {
      matches = this.getFormattersForFile(filePathOrLanguage);
    } else {
      matches = this.getFormattersForLanguage(filePathOrLanguage);
    }
    return matches[0];
  }
}
