import { exec } from 'child_process';
import { promisify } from 'util';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import crypto from 'crypto';

const execPromise = promisify(exec);

export const isDocker = fsSync.existsSync('/.dockerenv') || !!process.env.DOCKER;

// --- Types ---

export type ServiceStatus = 'starting' | 'running' | 'stopped' | 'unavailable';

export interface ServiceDiagnosticData {
  processStatus: 'running' | 'stopped' | 'unknown';
  listeningAddress: string;
  httpStatus?: string;
  httpStatusCode?: number;
  previewReady: boolean;
  previewUrl: string;
  lastChecked: number;
  error?: string;
}

export interface DetectedService {
  id: string;
  projectPath: string;
  processId?: number;
  command?: string;
  framework?: string;
  name: string;
  host: string;
  port: number;
  targetHost?: string;
  internalPort?: number;
  externalPort?: number;
  url: string;
  proxyUrl?: string;
  protocol: 'http' | 'https';
  hasUI: boolean;
  status: ServiceStatus;
  lastSeen: number;
  previousPorts: number[];
  containerId?: string;
  containerName?: string;
  isDockerContainer?: boolean;
  serviceType?: 'web' | 'api' | 'unknown';
  diagnostics?: ServiceDiagnosticData;
}

export interface ProjectHint {
  framework: string;
  name?: string;
  defaultPort?: number;
  configFile: string;
}

// --- Constants ---

const DEV_SERVER_PROCESSES = new Set([
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun',
  'python', 'python3', 'django', 'uvicorn', 'gunicorn',
  'ruby', 'rails', 'php', 'php-fpm',
  'next', 'vite', 'webpack',
]);

const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)\/?/gi;

const FRAMEWORK_INDICATORS: Record<string, { configFiles: string[]; defaultPort: number; displayName: string }> = {
  react: { configFiles: ['package.json'], defaultPort: 3000, displayName: 'React' },
  vite: { configFiles: ['vite.config.ts', 'vite.config.js', 'vite.config.mts'], defaultPort: 5173, displayName: 'Vite' },
  next: { configFiles: ['next.config.ts', 'next.config.js', 'next.config.mjs'], defaultPort: 3000, displayName: 'Next.js' },
  vue: { configFiles: ['vue.config.js', 'vue.config.ts'], defaultPort: 8080, displayName: 'Vue' },
  nuxt: { configFiles: ['nuxt.config.ts', 'nuxt.config.js'], defaultPort: 3000, displayName: 'Nuxt' },
  angular: { configFiles: ['angular.json'], defaultPort: 4200, displayName: 'Angular' },
  svelte: { configFiles: ['svelte.config.js', 'svelte.config.ts'], defaultPort: 5173, displayName: 'Svelte' },
  astro: { configFiles: ['astro.config.mjs', 'astro.config.ts'], defaultPort: 4321, displayName: 'Astro' },
  django: { configFiles: ['manage.py'], defaultPort: 8000, displayName: 'Django' },
  flask: { configFiles: ['app.py', 'wsgi.py'], defaultPort: 5000, displayName: 'Flask' },
  fastapi: { configFiles: ['main.py'], defaultPort: 8000, displayName: 'FastAPI' },
  rails: { configFiles: ['Gemfile', 'config/routes.rb'], defaultPort: 3000, displayName: 'Rails' },
  laravel: { configFiles: ['artisan'], defaultPort: 8000, displayName: 'Laravel' },
  express: { configFiles: ['server.js', 'server.ts', 'app.js', 'app.ts'], defaultPort: 3000, displayName: 'Express' },
};

// --- Utility Functions ---

/**
 * Generate a stable service ID from project path, framework, and command.
 * This ensures port changes don't create duplicate services.
 */
export function generateServiceId(projectPath: string, framework?: string, command?: string): string {
  const parts = [projectPath, framework || 'unknown', command || 'unknown'];
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return hash.substring(0, 12);
}

/**
 * Normalize host addresses to localhost for display.
 */
export function normalizeHost(host: string): string {
  if (host === '0.0.0.0' || host === '127.0.0.1' || host === '::1') {
    return 'localhost';
  }
  return host;
}

/**
 * Build a normalized URL from components.
 */
export function buildServiceUrl(protocol: 'http' | 'https', host: string, port: number): string {
  const normalizedHost = normalizeHost(host);
  return `${protocol}://${normalizedHost}:${port}`;
}

/**
 * Extract URLs from terminal output text.
 */
export function parseUrlsFromOutput(output: string): Array<{ url: string; host: string; port: number; protocol: 'http' | 'https' }> {
  const results: Array<{ url: string; host: string; port: number; protocol: 'http' | 'https' }> = [];
  const seen = new Set<number>();

  let match: RegExpExecArray | null;
  const regex = new RegExp(URL_PATTERN.source, 'gi');
  while ((match = regex.exec(output)) !== null) {
    const port = parseInt(match[1], 10);
    if (!seen.has(port) && port > 0 && port < 65536) {
      seen.add(port);
      const protocol = match[0].startsWith('https') ? 'https' as const : 'http' as const;
      const hostMatch = match[0].match(/\/\/([\w.:]+):/);
      const rawHost = hostMatch ? hostMatch[1] : 'localhost';
      results.push({
        url: buildServiceUrl(protocol, rawHost, port),
        host: normalizeHost(rawHost),
        port,
        protocol,
      });
    }
  }

  return results;
}

// --- Process Inspection ---

// --- Process Inspection ---

export interface ListeningProcess {
  pid: number;
  command: string;
  host: string;
  port: number;
  cwd?: string;
  isDockerContainer?: boolean;
  containerId?: string;
  containerName?: string;
  targetHost?: string;
}

/**
 * Query running Docker containers via Docker socket (/var/run/docker.sock).
 */
export async function queryDockerContainers(): Promise<any[]> {
  return new Promise((resolve) => {
    if (!fsSync.existsSync('/var/run/docker.sock')) {
      resolve([]);
      return;
    }

    const options: http.RequestOptions = {
      socketPath: '/var/run/docker.sock',
      path: '/containers/json',
      method: 'GET',
      headers: {
        'Host': 'docker',
      },
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const containers = JSON.parse(data);
          resolve(Array.isArray(containers) ? containers : []);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

/**
 * Discover running services inside sibling Docker containers on the host.
 */
export async function discoverDockerContainers(workspacePath?: string | null): Promise<ListeningProcess[]> {
  const results: ListeningProcess[] = [];
  if (!fsSync.existsSync('/var/run/docker.sock')) {
    return results;
  }

  try {
    const containers = await queryDockerContainers();
    for (const c of containers) {
      const names: string[] = c.Names || [];
      const isSelf = names.some(n => n.includes('planner-agent'));
      if (isSelf) continue;

      const ports: Array<{ PrivatePort?: number; PublicPort?: number; Type?: string }> = c.Ports || [];
      for (const p of ports) {
        const publicPort = p.PublicPort;
        if (!publicPort || publicPort < 80 || publicPort === 5001 || publicPort === 5173) continue;

        const workingDir = c.Labels?.['com.docker.compose.project.working_dir'] || '';
        const project = c.Labels?.['com.docker.compose.project'] || '';
        const serviceLabel = c.Labels?.['com.docker.compose.service'] || '';

        // If workspacePath is provided, verify it belongs to this workspace
        if (workspacePath) {
          const wsBase = path.basename(workspacePath).toLowerCase();
          const pLower = (project || '').toLowerCase();
          const wLower = (workingDir || '').toLowerCase();
          const wsLower = workspacePath.toLowerCase();

          const matchesProject = pLower && (pLower === wsBase || wsBase.includes(pLower) || pLower.includes(wsBase));
          const matchesWorkingDir = wLower && (
            wLower.startsWith(wsLower) ||
            wsLower.startsWith(wLower) ||
            wLower.includes(wsBase)
          );
          const mounts = (c.Mounts || []).map((m: any) => (m.Source || '').toLowerCase());
          const matchesMounts = mounts.some((src: string) => src.includes(wsBase));

          if (!matchesProject && !matchesWorkingDir && !matchesMounts) {
            continue;
          }
        }

        const cmd = c.Command || '';
        const targetHost = isDocker ? 'host.docker.internal' : '127.0.0.1';

        results.push({
          pid: 0,
          command: cmd || `${serviceLabel || 'docker-service'}`,
          host: '0.0.0.0',
          port: publicPort,
          cwd: workingDir || workspacePath || undefined,
          isDockerContainer: true,
          containerId: c.Id,
          containerName: (names[0] || '').replace(/^\//, ''),
          targetHost,
        });
      }
    }
  } catch (error) {
    console.warn('[ServiceDiscovery] Failed to query docker containers:', (error as Error).message);
  }

  return results;
}

/**
 * Discover processes listening on TCP ports (macOS via lsof, Linux via ss, and Docker).
 */
export async function discoverListeningProcesses(workspacePath?: string | null): Promise<ListeningProcess[]> {
  const results: ListeningProcess[] = [];
  const platform = process.platform;

  try {
    let output: string;

    if (platform === 'darwin') {
      // macOS: use lsof
      const { stdout } = await execPromise('lsof -i -P -n -sTCP:LISTEN 2>/dev/null', { timeout: 10000 });
      output = stdout;
    } else if (platform === 'linux') {
      // Linux: use ss
      const { stdout } = await execPromise('ss -tlnp 2>/dev/null', { timeout: 10000 });
      output = stdout;
    } else {
      // Windows or unknown: try netstat
      const { stdout } = await execPromise('netstat -tlnp 2>/dev/null || netstat -ano 2>/dev/null', { timeout: 10000 });
      output = stdout;
    }

    if (platform === 'darwin') {
      // Parse lsof output
      const lines = output.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;

        const command = parts[0].toLowerCase();
        const pid = parseInt(parts[1], 10);
        const nameField = parts[8] || '';

        // Extract host:port from the NAME field
        const addrMatch = nameField.match(/([\d.*:]+):(\d+)$/);
        if (!addrMatch) continue;

        const host = addrMatch[1] === '*' ? '0.0.0.0' : addrMatch[1];
        const port = parseInt(addrMatch[2], 10);

        if (isNaN(pid) || isNaN(port) || port < 1024) continue; // Skip system ports

        results.push({ pid, command, host, port });
      }
    } else if (platform === 'linux') {
      // Parse ss output
      const lines = output.split('\n').filter(l => l.trim());
      for (const line of lines.slice(1)) { // Skip header
        const parts = line.split(/\s+/);
        if (parts.length < 5) continue;

        const localAddr = parts[3] || '';
        const addrMatch = localAddr.match(/([\d.*:]+):(\d+)$/);
        if (!addrMatch) continue;

        const host = addrMatch[1] === '*' ? '0.0.0.0' : addrMatch[1];
        const port = parseInt(addrMatch[2], 10);

        // Extract PID and command from the process field (may contain spaces e.g. "next-server (v14.2.35)")
        const processField = parts.slice(5).join(' ');
        const pidMatch = processField.match(/pid=(\d+)/);
        const cmdMatch = processField.match(/\("([^",]+)/);

        const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
        const command = cmdMatch ? cmdMatch[1].toLowerCase() : 'unknown';

        if (isNaN(port) || port < 1024) continue;

        results.push({ pid, command, host, port });
      }
    }
  } catch (error) {
    // Silently fail — this is a best-effort scan
    console.warn('[ServiceDiscovery] Failed to scan listening processes:', (error as Error).message);
  }

  // Also query Docker containers if socket is mounted
  try {
    const dockerProcs = await discoverDockerContainers(workspacePath);
    for (const dp of dockerProcs) {
      // Avoid duplicate ports if already found
      if (!results.some(r => r.port === dp.port)) {
        results.push(dp);
      }
    }
  } catch { /* best effort */ }

  return results;
}

/**
 * Get the working directory of a process by PID.
 */
export async function getProcessCwd(pid: number): Promise<string | null> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execPromise(`lsof -p ${pid} -Fn 2>/dev/null | grep '^ncwd' | head -1`, { timeout: 5000 });
      const cwd = stdout.trim().replace(/^ncwd/, '');
      return cwd || null;
    } else if (process.platform === 'linux') {
      const cwd = await fs.readlink(`/proc/${pid}/cwd`);
      return cwd || null;
    }
  } catch {
    // Process may have exited
  }
  return null;
}

/**
 * Get the full command line of a process by PID.
 */
export async function getProcessCommand(pid: number): Promise<string | null> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execPromise(`ps -p ${pid} -o command= 2>/dev/null`, { timeout: 5000 });
      return stdout.trim() || null;
    } else if (process.platform === 'linux') {
      const cmdline = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8');
      return cmdline.replace(/\0/g, ' ').trim() || null;
    }
  } catch {
    // Process may have exited
  }
  return null;
}

// --- Framework Detection ---

/**
 * Detect framework from a process command string.
 */
export function detectFrameworkFromCommand(command: string): string | undefined {
  const cmd = command.toLowerCase();

  if (cmd.includes('next') && (cmd.includes('dev') || cmd.includes('start'))) return 'next';
  if (cmd.includes('vite')) return 'vite';
  if (cmd.includes('nuxt')) return 'nuxt';
  if (cmd.includes('angular') || cmd.includes('ng serve')) return 'angular';
  if (cmd.includes('svelte') || cmd.includes('sveltekit')) return 'svelte';
  if (cmd.includes('astro')) return 'astro';
  if (cmd.includes('django') || cmd.includes('manage.py') || cmd.includes('runserver')) return 'django';
  if (cmd.includes('uvicorn') || cmd.includes('fastapi')) return 'fastapi';
  if (cmd.includes('gunicorn')) return 'django'; // Often Django
  if (cmd.includes('flask')) return 'flask';
  if (cmd.includes('rails')) return 'rails';
  if (cmd.includes('artisan')) return 'laravel';
  if (cmd.includes('webpack') && cmd.includes('serve')) return 'react'; // CRA uses webpack-dev-server
  if (cmd.includes('react-scripts')) return 'react';
  if (cmd.includes('vue-cli-service')) return 'vue';

  return undefined;
}

/**
 * Scan a directory for project configuration files to identify potential frameworks.
 */
export async function scanProjectConfigs(workspacePath: string): Promise<ProjectHint[]> {
  const hints: ProjectHint[] = [];

  // Check each framework's config files
  for (const [frameworkKey, config] of Object.entries(FRAMEWORK_INDICATORS)) {
    for (const configFile of config.configFiles) {
      try {
        const fullPath = path.join(workspacePath, configFile);
        await fs.access(fullPath);

        let name: string | undefined;

        // Try to extract project name from package.json
        if (configFile === 'package.json') {
          try {
            const content = JSON.parse(await fs.readFile(fullPath, 'utf8'));
            name = content.name;

            // Detect framework from dependencies
            const deps = { ...content.dependencies, ...content.devDependencies };
            if (deps['react'] || deps['react-dom']) {
              if (deps['next']) {
                hints.push({
                  framework: 'next',
                  name,
                  defaultPort: 3000,
                  configFile: fullPath,
                });
                continue;
              }
              hints.push({
                framework: 'react',
                name,
                defaultPort: 3000,
                configFile: fullPath,
              });
              // Check if using Vite
              if (deps['vite']) {
                hints.push({
                  framework: 'vite',
                  name,
                  defaultPort: 5173,
                  configFile: fullPath,
                });
              }
              continue;
            }
            if (deps['vue']) {
              hints.push({
                framework: 'vue',
                name,
                defaultPort: 8080,
                configFile: fullPath,
              });
              continue;
            }
            if (deps['@angular/core']) {
              hints.push({
                framework: 'angular',
                name,
                defaultPort: 4200,
                configFile: fullPath,
              });
              continue;
            }
            if (deps['svelte']) {
              hints.push({
                framework: 'svelte',
                name,
                defaultPort: 5173,
                configFile: fullPath,
              });
              continue;
            }
          } catch { /* ignore parse errors */ }
        }

        hints.push({
          framework: frameworkKey,
          name,
          defaultPort: config.defaultPort,
          configFile: fullPath,
        });
        break; // Found config for this framework
      } catch {
        // File doesn't exist, skip
      }
    }
  }

  // Also scan subdirectories one level deep (e.g., frontend/, backend/)
  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;

      const subDir = path.join(workspacePath, entry.name);
      const subHints = await scanProjectConfigsShallow(subDir, entry.name);
      hints.push(...subHints);
    }
  } catch { /* ignore readdir errors */ }

  return hints;
}

/**
 * Shallow config scan for a subdirectory.
 */
async function scanProjectConfigsShallow(dirPath: string, dirName: string): Promise<ProjectHint[]> {
  const hints: ProjectHint[] = [];

  // Check for package.json
  try {
    const pkgPath = path.join(dirPath, 'package.json');
    const content = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    const deps = { ...content.dependencies, ...content.devDependencies };
    const name = content.name || dirName;

    if (deps['react'] || deps['react-dom']) {
      const framework = deps['next'] ? 'next' : (deps['vite'] ? 'vite' : 'react');
      const defaultPort = framework === 'next' ? 3000 : (framework === 'vite' ? 5173 : 3000);
      hints.push({ framework, name, defaultPort, configFile: pkgPath });
    } else if (deps['vue']) {
      hints.push({ framework: 'vue', name, defaultPort: 8080, configFile: pkgPath });
    } else if (deps['@angular/core']) {
      hints.push({ framework: 'angular', name, defaultPort: 4200, configFile: pkgPath });
    } else if (deps['svelte']) {
      hints.push({ framework: 'svelte', name, defaultPort: 5173, configFile: pkgPath });
    }
  } catch { /* no package.json or parse error */ }

  // Check for manage.py (Django)
  try {
    await fs.access(path.join(dirPath, 'manage.py'));
    hints.push({ framework: 'django', name: dirName, defaultPort: 8000, configFile: path.join(dirPath, 'manage.py') });
  } catch { /* not Django */ }

  return hints;
}

// --- Reachability & UI Probing ---

/**
 * Determine reachability of a service port and identify the correct internal host
 * (127.0.0.1 for local/container processes, host.docker.internal for host-published docker services).
 */
export async function determineServiceReachability(
  port: number,
  protocol: 'http' | 'https' = 'http',
  preferredHost?: string,
): Promise<{ reachable: boolean; targetHost: string; statusCode?: number }> {
  const hostsToTry: string[] = [];
  if (preferredHost) {
    hostsToTry.push(preferredHost);
  }
  if (!hostsToTry.includes('127.0.0.1')) {
    hostsToTry.push('127.0.0.1');
  }
  if (isDocker && !hostsToTry.includes('host.docker.internal')) {
    hostsToTry.push('host.docker.internal');
  }

  for (const h of hostsToTry) {
    const reachable = await new Promise<{ ok: boolean; statusCode?: number }>((resolve) => {
      const client = protocol === 'https' ? https : http;
      const timeout = setTimeout(() => resolve({ ok: false }), 2000);

      try {
        const req = client.get({
          hostname: h,
          port,
          path: '/',
          timeout: 2000,
          rejectUnauthorized: false,
          headers: {
            'Host': `localhost:${port}`,
            'User-Agent': 'AI-Native-Editor-Discovery/1.0',
            'Accept': '*/*',
          },
        }, (res) => {
          clearTimeout(timeout);
          res.resume();
          // Any HTTP status code (even 404, 403, 302, 500) indicates an active HTTP server on this port
          resolve({ ok: true, statusCode: res.statusCode });
        });

        req.on('error', () => {
          clearTimeout(timeout);
          resolve({ ok: false });
        });

        req.on('timeout', () => {
          req.destroy();
          clearTimeout(timeout);
          resolve({ ok: false });
        });
      } catch {
        clearTimeout(timeout);
        resolve({ ok: false });
      }
    });

    if (reachable.ok) {
      return { reachable: true, targetHost: h, statusCode: reachable.statusCode };
    }
  }

  return { reachable: false, targetHost: '127.0.0.1' };
}

/**
 * Probe a URL to determine if it serves a browser-accessible UI.
 * Handles targetHost (internal container-to-host or container-to-container routing),
 * preserves Host headers for Django/framework compatibility, and follows redirects.
 */
export async function probeServiceUI(
  url: string,
  targetHost?: string,
  port?: number,
  redirectCount = 0,
): Promise<{ hasUI: boolean; title?: string; finalUrl?: string }> {
  if (redirectCount > 3) {
    return { hasUI: true };
  }

  return new Promise((resolve) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      resolve({ hasUI: false });
      return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const actualHost = targetHost || (parsedUrl.hostname === 'localhost' ? '127.0.0.1' : parsedUrl.hostname);
    const actualPort = port || parseInt(parsedUrl.port, 10) || (isHttps ? 443 : 80);

    const timeout = setTimeout(() => {
      resolve({ hasUI: false });
    }, 3000);

    try {
      const req = client.get({
        hostname: actualHost,
        port: actualPort,
        path: parsedUrl.pathname + parsedUrl.search,
        timeout: 3000,
        rejectUnauthorized: false,
        headers: {
          'Host': `localhost:${actualPort}`,
          'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
          'User-Agent': 'AI-Native-Editor-Discovery/1.0',
        },
      }, (res) => {
        clearTimeout(timeout);

        const contentType = (res.headers['content-type'] || '').toLowerCase();
        const statusCode = res.statusCode || 0;
        const location = res.headers['location'];

        // Handle redirect (e.g. Django /admin -> /admin/login/?next=/admin/)
        if (statusCode >= 300 && statusCode < 400 && location) {
          res.resume();
          let nextUrl = location;
          if (location.startsWith('/')) {
            nextUrl = `${parsedUrl.protocol}//${parsedUrl.host}${location}`;
          }
          probeServiceUI(nextUrl, targetHost, actualPort, redirectCount + 1).then(resolve);
          return;
        }

        // HTML content → has UI
        if (statusCode >= 200 && statusCode < 400 && (contentType.includes('text/html') || contentType === '')) {
          let body = '';
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            if (body.length > 8192) {
              res.destroy();
            }
          });
          res.on('end', () => {
            const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch?.[1]?.trim();
            resolve({ hasUI: true, title, finalUrl: url });
          });
          res.on('error', () => resolve({ hasUI: true, finalUrl: url }));
          return;
        }

        // JSON on root → likely API
        if (contentType.includes('application/json')) {
          res.resume();
          resolve({ hasUI: false });
          return;
        }

        res.resume();
        resolve({ hasUI: statusCode >= 200 && statusCode < 400, finalUrl: url });
      });

      req.on('error', () => {
        clearTimeout(timeout);
        resolve({ hasUI: false });
      });

      req.on('timeout', () => {
        req.destroy();
        clearTimeout(timeout);
        resolve({ hasUI: false });
      });
    } catch {
      clearTimeout(timeout);
      resolve({ hasUI: false });
    }
  });
}

/**
 * Check if a service URL is reachable (health check).
 */
export async function isServiceReachable(url: string, targetHost?: string, port?: number): Promise<boolean> {
  return new Promise((resolve) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      resolve(false);
      return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const actualHost = targetHost || (parsedUrl.hostname === 'localhost' ? '127.0.0.1' : parsedUrl.hostname);
    const actualPort = port || parseInt(parsedUrl.port, 10) || (isHttps ? 443 : 80);

    const timeout = setTimeout(() => {
      resolve(false);
    }, 2000);

    try {
      const req = client.get({
        hostname: actualHost,
        port: actualPort,
        path: parsedUrl.pathname + parsedUrl.search,
        timeout: 2000,
        rejectUnauthorized: false,
        headers: {
          'Host': `localhost:${actualPort}`,
          'User-Agent': 'AI-Native-Editor-Discovery/1.0',
        },
      }, (res) => {
        clearTimeout(timeout);
        res.resume();
        resolve(true);
      });

      req.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        clearTimeout(timeout);
        resolve(false);
      });
    } catch {
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

/**
 * Check known API documentation endpoints for backend services.
 */
export async function probeAPIDocsUI(
  baseUrl: string,
  targetHost?: string,
  port?: number,
): Promise<{ hasDocsUI: boolean; docsPath?: string; title?: string }> {
  const docsPaths = ['/admin/', '/admin', '/docs', '/swagger', '/api-docs'];

  for (const docsPath of docsPaths) {
    try {
      const result = await probeServiceUI(`${baseUrl}${docsPath}`, targetHost, port);
      if (result.hasUI) {
        return { hasDocsUI: true, docsPath, title: result.title };
      }
    } catch { /* continue */ }
  }

  return { hasDocsUI: false };
}

// --- Display Name Generation ---

/**
 * Generate a display name for a detected service.
 */
export function generateServiceName(
  framework?: string,
  projectName?: string,
  port?: number,
): string {
  if (projectName && framework) {
    const frameworkConfig = framework ? FRAMEWORK_INDICATORS[framework] : null;
    const frameworkName = frameworkConfig?.displayName || framework;
    // If project name is generic, use framework
    if (projectName === 'frontend' || projectName === 'backend' || projectName === 'app') {
      return `${frameworkName} (${projectName})`;
    }
    return titleCase(projectName);
  }

  if (framework) {
    const config = FRAMEWORK_INDICATORS[framework];
    return config?.displayName || titleCase(framework);
  }

  if (projectName) {
    return titleCase(projectName);
  }

  if (port) {
    return `localhost:${port}`;
  }

  return 'Unknown Service';
}

function titleCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
