import path from 'path';
import fs from 'fs';

export interface ProjectDirectoryInfo {
  name: string;
  relativePath: string;
  role: 'backend' | 'frontend' | 'mobile' | 'fullstack' | 'library' | 'other';
  technologies: string[];
  keyFiles: string[];
}

export class WorkspaceContext {
  private static workspaceRoot: string | null = null;
  private static workspaceName: string | null = null;

  private static get isDocker(): boolean {
    return process.env.DOCKER === 'true';
  }

  /**
   * Translate a host-system path to the Docker-mounted equivalent.
   * Docker-compose mounts:
   *   ${PROJECTS_DIR:-..}:/projects
   *   ${HOME}:/host
   * So /Users/user/Desktop/projects/myapp → /projects/myapp
   * And /Users/user/somefile → /host/somefile
   */
  private static translatePathForDocker(hostPath: string): string {
    if (!this.isDocker || !hostPath) return hostPath;

    // Already a Docker-internal path
    if (
      hostPath.startsWith('/projects/') ||
      hostPath.startsWith('/app/') ||
      hostPath.startsWith('/host/') ||
      hostPath.startsWith('/mnt/') ||
      hostPath === '/projects' ||
      hostPath === '/host' ||
      hostPath === '/mnt'
    ) {
      return hostPath;
    }

    // Try to extract the project name from common host path patterns
    // e.g. /Users/fedz/Desktop/projects/personal/withgod → /projects/withgod
    const projectsMatch = hostPath.match(/\/projects\/(?:personal\/)?(.+)$/);
    if (projectsMatch) {
      const candidatePath = `/projects/${projectsMatch[1]}`;
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    // Fall back: try /host prefix (HOME is mounted at /host)
    const hostHome = process.env.HOST_HOME || '';
    if (hostHome && hostPath.startsWith(hostHome)) {
      const relative = hostPath.slice(hostHome.length);
      const candidatePath = `/host${relative}`;
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    // If the path doesn't exist and we're in Docker, try /projects/ scan
    if (!fs.existsSync(hostPath)) {
      const basename = path.basename(hostPath);
      const candidatePath = `/projects/${basename}`;
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    return hostPath;
  }

  /**
   * Check if a path resolves to the AI agent's own root project (e.g. /app or planner-agent repo).
   * RULE 1: Reading the root project of the agentic AI is strictly PROHIBITED.
   */
  static isAgentRoot(targetPath: string): boolean {
    if (!targetPath) return false;
    const resolved = path.resolve(targetPath);
    if (this.isDocker) {
      return resolved === '/app' || resolved.startsWith('/app/');
    }
    const cwd = process.cwd();
    return resolved === cwd || resolved.startsWith(cwd + path.sep);
  }

  /**
   * Check if a path is on the user's local machine (and NOT the agent's root project).
   */
  static isLocalMachine(targetPath: string): boolean {
    if (!targetPath) return false;
    const resolved = path.resolve(targetPath);
    if (this.isAgentRoot(resolved)) return false;
    if (this.isDocker) {
      return (
        resolved.startsWith('/host') ||
        resolved.startsWith('/projects') ||
        resolved.startsWith('/mnt')
      );
    }
    return true;
  }

  static setWorkspace(dirPath: string | null, name?: string | null): void {
    if (dirPath) {
      const resolved = path.resolve(dirPath);
      const translated = this.translatePathForDocker(resolved);
      if (this.isAgentRoot(translated)) {
        console.warn(`[WorkspaceContext] Prohibited attempt to set workspace to agent root (${translated}). Rejected.`);
        this.workspaceRoot = null;
        this.workspaceName = null;
        return;
      }
      this.workspaceRoot = translated;
      this.workspaceName = name || path.basename(this.workspaceRoot);
    } else {
      this.workspaceRoot = null;
      this.workspaceName = null;
    }
  }

  static getRoot(): string {
    return this.workspaceRoot || '';
  }

  static getName(): string | null {
    return this.workspaceName;
  }

  static hasActiveWorkspace(): boolean {
    return this.workspaceRoot !== null && !this.isAgentRoot(this.workspaceRoot);
  }

  static resolvePath(relativePath: string): string {
    const root = this.getRoot();
    if (path.isAbsolute(relativePath)) {
      // In Docker, translate absolute host paths to container paths
      const translated = this.translatePathForDocker(relativePath);
      return path.resolve(translated);
    }
    if (root) {
      return path.resolve(root, relativePath);
    }
    const cwdCandidate = path.resolve(process.cwd(), relativePath);
    if (fs.existsSync(cwdCandidate)) {
      return cwdCandidate;
    }
    const defaultBase = this.isDocker ? '/host' : process.cwd();
    return path.resolve(defaultBase, relativePath);
  }

  static isWithinWorkspace(targetPath: string): boolean {
    const root = this.getRoot();
    if (!root) return false;
    const resolved = this.resolvePath(targetPath);
    if (this.isAgentRoot(resolved)) return false;
    const relative = path.relative(root, resolved);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * Validate whether accessing targetPath is allowed according to the core agent rules:
   * Rule 1: Reading its root project (where the agentic AI is) is PROHIBITED.
   * Rule 2: The opened project is the priority to read. Only if the user asks to read other
   *         directories in the local machine can that be done if allowed.
   */
  static validatePathAccess(targetPath: string, isExplicitUserRequest = false): { allowed: boolean; error?: string; resolvedPath: string } {
    const resolved = this.resolvePath(targetPath);

    // Rule 1: Accessing the agent's root project is strictly prohibited
    if (this.isAgentRoot(resolved)) {
      return {
        allowed: false,
        resolvedPath: resolved,
        error: "Access denied: Reading the root project of the AI agent is strictly prohibited to prevent confusion. Only directories from the local machine may be accessed, prioritizing the opened project.",
      };
    }

    // Rule 2: Opened project is the priority
    if (this.hasActiveWorkspace()) {
      if (this.isWithinWorkspace(resolved)) {
        return { allowed: true, resolvedPath: resolved };
      }

      // If outside the opened project, allowed only if it is on the local machine AND explicitly requested
      if (this.isLocalMachine(resolved) && isExplicitUserRequest) {
        return { allowed: true, resolvedPath: resolved };
      }

      return {
        allowed: false,
        resolvedPath: resolved,
        error: `Access denied: Path "${targetPath}" is outside the currently opened project (${this.getName() || 'workspace'}). The opened project is the priority to read. Accessing other directories on the local machine requires explicit user specification.`,
      };
    }

    // If no active workspace is opened:
    if (this.isLocalMachine(resolved) && isExplicitUserRequest) {
      return { allowed: true, resolvedPath: resolved };
    }

    return {
      allowed: false,
      resolvedPath: resolved,
      error: 'Access denied: No project is currently opened. Please open a project from your local machine to inspect or read files.',
    };
  }

  /**
   * Inspect all top-level project folders in the active workspace and classify their roles.
   */
  static getProjectDirectories(rootPath?: string): ProjectDirectoryInfo[] {
    const root = rootPath || this.getRoot();
    const projects: ProjectDirectoryInfo[] = [];

    try {
      if (!fs.existsSync(root)) return [];
      const entries = fs.readdirSync(root, { withFileTypes: true });
      const dirs = entries.filter(e =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        e.name !== 'node_modules' &&
        e.name !== 'dist' &&
        e.name !== 'build' &&
        e.name !== 'venv' &&
        e.name !== 'venv_new' &&
        e.name !== '__pycache__'
      );

      for (const d of dirs) {
        const dirPath = path.join(root, d.name);
        const tech: string[] = [];
        const keyFiles: string[] = [];
        let role: ProjectDirectoryInfo['role'] = 'other';

        const hasManagePy = fs.existsSync(path.join(dirPath, 'manage.py'));
        const hasRequirements = fs.existsSync(path.join(dirPath, 'requirements.txt'));
        const hasPipfile = fs.existsSync(path.join(dirPath, 'Pipfile'));
        const hasPyproject = fs.existsSync(path.join(dirPath, 'pyproject.toml'));
        const hasDockerCompose = fs.existsSync(path.join(dirPath, 'docker-compose.yml')) || fs.existsSync(path.join(dirPath, 'docker-compose.yaml'));
        const hasDockerfile = fs.existsSync(path.join(dirPath, 'Dockerfile'));
        const hasGoMod = fs.existsSync(path.join(dirPath, 'go.mod'));
        const hasCargoToml = fs.existsSync(path.join(dirPath, 'Cargo.toml'));
        const hasPomXml = fs.existsSync(path.join(dirPath, 'pom.xml'));
        const hasAppJson = fs.existsSync(path.join(dirPath, 'app.json'));

        if (hasDockerCompose) keyFiles.push('docker-compose.yml');
        if (hasDockerfile) keyFiles.push('Dockerfile');
        if (hasManagePy) keyFiles.push('manage.py');

        // Check package.json
        const packageJsonPath = path.join(dirPath, 'package.json');
        let pkg: any = null;
        if (fs.existsSync(packageJsonPath)) {
          keyFiles.push('package.json');
          try {
            pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          } catch {}
        }

        // Backend detection
        if (hasManagePy) {
          role = 'backend';
          tech.push('Django (Python)');
        } else if (hasRequirements || hasPipfile || hasPyproject) {
          if (/(?:^|[-_])(be|backend|api|server)(?:[-_]|$)/i.test(d.name)) {
            role = 'backend';
          }
          tech.push('Python');
        } else if (hasGoMod) {
          role = 'backend';
          tech.push('Go');
        } else if (hasCargoToml) {
          role = 'backend';
          tech.push('Rust');
        } else if (hasPomXml) {
          role = 'backend';
          tech.push('Java/Maven');
        }

        // Node-based frontend / mobile / backend detection
        if (pkg) {
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          if (deps['react-native'] || deps['expo'] || hasAppJson) {
            role = 'mobile';
            tech.push(deps['expo'] ? 'Expo / React Native' : 'React Native');
          } else if (deps['next']) {
            role = 'frontend';
            tech.push('Next.js (React)');
          } else if (deps['vite'] || deps['@vitejs/plugin-react'] || deps['@vitejs/plugin-vue']) {
            role = 'frontend';
            tech.push('Vite');
          } else if (deps['express'] || deps['fastify'] || deps['@nestjs/core'] || deps['koa']) {
            role = 'backend';
            tech.push(deps['@nestjs/core'] ? 'NestJS' : 'Express/Node.js');
          } else if (deps['react'] || deps['vue'] || deps['svelte']) {
            role = 'frontend';
            tech.push('React / Frontend');
          } else if (pkg.scripts && (pkg.scripts.dev || pkg.scripts.start)) {
            tech.push('Node.js');
          }
        }

        // Folder name hints if not yet determined
        if (role === 'other') {
          if (/(?:^|[-_])(be|backend|server|api)(?:[-_]|$)/i.test(d.name)) {
            role = 'backend';
          } else if (/(?:^|[-_])(fe|frontend|client|ui|web)(?:[-_]|$)/i.test(d.name)) {
            role = 'frontend';
          } else if (/(?:^|[-_])(mobile|app|native)(?:[-_]|$)/i.test(d.name)) {
            role = 'mobile';
          }
        }

        if (hasDockerCompose) tech.push('Docker Compose');

        projects.push({
          name: d.name,
          relativePath: d.name,
          role,
          technologies: tech,
          keyFiles,
        });
      }
    } catch {
      // ignore
    }

    return projects;
  }

  /**
   * Find a specific project directory by role (e.g. 'backend' or 'frontend').
   */
  static findProjectDirectoryByRole(role: 'backend' | 'frontend' | 'mobile', command?: string): string | null {
    const projects = this.getProjectDirectories();
    
    // 1. If command mentions docker-compose, prefer folder with docker-compose.yml
    if (command && /docker-?compose/i.test(command)) {
      const composeProject = projects.find(p => p.keyFiles.includes('docker-compose.yml'));
      if (composeProject) return composeProject.relativePath;
    }

    // 2. If command mentions manage.py, prefer folder with manage.py
    if (command && /manage\.py/i.test(command)) {
      const manageProject = projects.find(p => p.keyFiles.includes('manage.py'));
      if (manageProject) return manageProject.relativePath;
    }

    // 3. Match by identified role
    const matched = projects.find(p => p.role === role);
    if (matched) return matched.relativePath;

    // 4. Match by naming conventions
    if (role === 'backend') {
      const fallback = projects.find(p => /(?:^|[-_])(be|backend|server|api)(?:[-_]|$)/i.test(p.name));
      if (fallback) return fallback.relativePath;
    } else if (role === 'frontend') {
      const fallback = projects.find(p => /(?:^|[-_])(fe|frontend|client|ui|web)(?:[-_]|$)/i.test(p.name));
      if (fallback) return fallback.relativePath;
    } else if (role === 'mobile') {
      const fallback = projects.find(p => /(?:^|[-_])(mobile|app|native)(?:[-_]|$)/i.test(p.name));
      if (fallback) return fallback.relativePath;
    }

    return null;
  }

  /**
   * Formatted workspace summary for system prompts.
   */
  static getWorkspaceStructureSummary(): string {
    const projects = this.getProjectDirectories();
    if (projects.length === 0) {
      return '- Root Workspace: ' + path.basename(this.getRoot());
    }

    return projects.map(p => {
      const roleLabel = p.role.toUpperCase();
      const techStr = p.technologies.length > 0 ? ` (${p.technologies.join(', ')})` : '';
      const filesStr = p.keyFiles.length > 0 ? ` [Key files: ${p.keyFiles.join(', ')}]` : '';
      return `- ${p.relativePath}/ -> ${roleLabel}${techStr}${filesStr}`;
    }).join('\n');
  }
}
