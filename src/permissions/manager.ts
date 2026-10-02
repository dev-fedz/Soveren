export enum PermissionLevel {
  SAFE = 'SAFE',
  ASK = 'ASK',
  DANGEROUS = 'DANGEROUS',
  BLOCKED = 'BLOCKED',
}

export class PermissionManager {
  /**
   * When true, ASK-level commands are auto-approved without throwing.
   * Set to true for headless/server mode where there is no TTY to prompt.
   */
  private static headlessMode = false;

  static setHeadlessMode(enabled: boolean): void {
    this.headlessMode = enabled;
  }

  static isHeadless(): boolean {
    return this.headlessMode;
  }

  private static safeCommands = new Set([
    'ls', 'pwd', 'echo', 'which', 'find', 'git status', 'git diff', 'git log', 'git branch',
    'cat', 'head', 'tail', 'grep', 'rg', 'npm test', 'node -v', 'npm -v', 'tsc --version',
    'docker', 'docker compose', 'docker-compose',
  ]);

  private static blockedCommands = new Set([
    'rm -rf /', 'mkfs', 'dd if=/dev/zero'
  ]);

  /**
   * Safe command prefixes — any command starting with these is considered safe.
   */
  private static safePrefixes = [
    'ls', 'pwd', 'echo', 'which', 'find', 'cat', 'head', 'tail', 'grep', 'rg', 'wc',
    'git status', 'git diff', 'git log', 'git branch',
    'node -v', 'npm -v', 'tsc --version',
    'docker compose', 'docker-compose', 'docker ps', 'docker inspect', 'docker images',
    'docker compose ps', 'docker compose up', 'docker compose down', 'docker compose build',
    'docker compose stop', 'docker compose logs', 'docker compose exec', 'docker compose run',
    'npm install', 'npm ci', 'npm run', 'npm test', 'npm start', 'npm exec',
    'npx', 'yarn', 'pnpm',
    'pip install', 'pip list', 'python', 'python3',
    'cargo build', 'cargo test', 'cargo run',
    'go build', 'go test', 'go run',
    'make', 'cmake',
    'mkdir', 'touch', 'cp', 'mv',
    'du', 'df', 'free', 'top', 'ps',
    'curl', 'wget',
    'lsof', 'ss', 'netstat',
  ];

  static async requestPermission(command: string): Promise<boolean> {
    const level = this.getPermissionLevel(command);

    if (level === PermissionLevel.SAFE) {
      return true;
    }

    if (level === PermissionLevel.BLOCKED) {
      return false;
    }

    // In headless mode, auto-approve ASK-level commands
    if (this.headlessMode && level === PermissionLevel.ASK) {
      console.log(`[PermissionManager] Auto-approving ASK-level command (headless mode): ${command}`);
      return true;
    }

    // For ASK and DANGEROUS, we need user input.
    // Throw a special error that the Agent loop can catch and then prompt the user.
    throw new PermissionRequiredError(command, level);
  }

  static getPermissionLevel(command: string): PermissionLevel {
    const trimmed = command.trim();
    const baseCommand = trimmed.split(' ')[0];
    
    if (this.blockedCommands.has(trimmed) || this.blockedCommands.has(baseCommand)) {
      return PermissionLevel.BLOCKED;
    }
    
    // Check exact match in safe set
    if (this.safeCommands.has(baseCommand) || this.safeCommands.has(trimmed)) {
      return PermissionLevel.SAFE;
    }

    // Check prefix-based safe matching
    for (const prefix of this.safePrefixes) {
      if (trimmed.startsWith(prefix + ' ') || trimmed === prefix) {
        return PermissionLevel.SAFE;
      }
    }

    // Heuristics for DANGEROUS
    if (trimmed.includes('rm -rf') || trimmed.includes('sudo ') || trimmed.includes('mkdir -p /')) {
      return PermissionLevel.DANGEROUS;
    }

    return PermissionLevel.ASK;
  }
}

export class PermissionRequiredError extends Error {
  constructor(public command: string, public level: PermissionLevel | string) {
    super(`Permission required for command: ${command} (Level: ${level})`);
    this.name = 'PermissionRequiredError';
  }
}
