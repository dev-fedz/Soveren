import { EventEmitter } from 'events';
import {
  DetectedService,
  ServiceStatus,
  ServiceDiagnosticData,
  discoverListeningProcesses,
  getProcessCwd,
  getProcessCommand,
  detectFrameworkFromCommand,
  scanProjectConfigs,
  probeServiceUI,
  probeAPIDocsUI,
  isServiceReachable,
  determineServiceReachability,
  generateServiceId,
  generateServiceName,
  normalizeHost,
  buildServiceUrl,
  parseUrlsFromOutput,
  ProjectHint,
  ListeningProcess,
  isDocker,
} from './serviceDiscovery.js';
import path from 'path';

// --- Types ---

export interface ServiceEvent {
  type: 'discovered' | 'portChanged' | 'stopped' | 'restarted' | 'ready' | 'removed';
  service: DetectedService;
  oldPort?: number;
  newPort?: number;
}

// --- Service Manager ---

export class ServiceManager extends EventEmitter {
  private services: Map<string, DetectedService> = new Map();
  private projectHints: ProjectHint[] = [];
  private workspacePath: string | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private failureRecoveryTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isScanning = false;

  // Polling intervals
  private normalPollMs = 5000;
  private recoveryPollMs = 2000;
  private recoveryDurationMs = 30000;

  // --- Workspace ---

  setWorkspace(workspacePath: string | null): void {
    const changed = this.workspacePath !== workspacePath;
    this.workspacePath = workspacePath;

    if (changed) {
      // Clear existing services when workspace changes
      this.services.clear();
      this.projectHints = [];
      this.stopAllRecoveryTimers();

      if (workspacePath) {
        // Scan for project configs immediately
        this.scanProjectHints().catch(() => {});
        // Trigger immediate discovery
        this.discoverServices().catch(() => {});
      }
    }
  }

  getWorkspacePath(): string | null {
    return this.workspacePath;
  }

  // --- Service Registry ---

  getServices(): DetectedService[] {
    return Array.from(this.services.values());
  }

  getUIServices(): DetectedService[] {
    return this.getServices().filter(s => s.hasUI && s.status === 'running');
  }

  getService(serviceId: string): DetectedService | undefined {
    return this.services.get(serviceId);
  }

  // --- Monitoring ---

  startMonitoring(): void {
    if (this.pollInterval) return;

    console.log('[ServiceManager] Starting service monitoring');
    this.pollInterval = setInterval(() => {
      this.discoverServices().catch((err) => {
        console.warn('[ServiceManager] Discovery error:', err.message);
      });
    }, this.normalPollMs);

    // Immediate first scan
    this.discoverServices().catch(() => {});
  }

  stopMonitoring(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.stopAllRecoveryTimers();
    console.log('[ServiceManager] Stopped service monitoring');
  }

  // --- Event-Driven Detection (from terminal output) ---

  /**
   * Called when a URL is detected in terminal/command output.
   * This is the primary, highest-signal detection path.
   */
  reportServiceFromOutput(
    url: string,
    command: string,
    pid?: number,
    projectSubPath?: string,
  ): void {
    const parsed = parseUrlsFromOutput(url);
    if (parsed.length === 0) return;

    for (const { host, port, protocol } of parsed) {
      const framework = detectFrameworkFromCommand(command);
      const fullProjectPath = projectSubPath && this.workspacePath
        ? path.join(this.workspacePath, projectSubPath)
        : this.workspacePath || '';

      const serviceId = generateServiceId(fullProjectPath, framework, command);
      const existing = this.services.get(serviceId);

      if (existing) {
        // Same service, possibly new port
        if (existing.port !== port) {
          this.handlePortChange(existing, port, host, protocol);
        } else if (existing.status !== 'running') {
          existing.status = 'running';
          existing.lastSeen = Date.now();
          this.emitEvent({ type: 'restarted', service: existing });
        }
      } else {
        // Check if there's a service on a different port that matches by framework and project
        const existingByIdentity = (framework && framework !== 'unknown')
          ? this.findServiceByIdentity(fullProjectPath, framework)
          : undefined;
        if (existingByIdentity && existingByIdentity.port !== port) {
          this.handlePortChange(existingByIdentity, port, host, protocol);
          return;
        }

        // New service
        const hint = this.findProjectHint(framework);
        const name = generateServiceName(framework, hint?.name, port);

        const service: DetectedService = {
          id: serviceId,
          projectPath: fullProjectPath,
          processId: pid,
          command,
          framework,
          name,
          host: normalizeHost(host),
          port,
          targetHost: '127.0.0.1',
          internalPort: port,
          externalPort: port,
          url: buildServiceUrl(protocol, host, port),
          proxyUrl: `/preview/${serviceId}`,
          protocol,
          hasUI: true, // Assume UI when reported from output; will verify later
          status: 'starting',
          lastSeen: Date.now(),
          previousPorts: [],
        };

        this.services.set(serviceId, service);
        this.emitEvent({ type: 'discovered', service });

        // Resolve reachability and verify UI asynchronously
        determineServiceReachability(port, protocol).then(reach => {
          if (reach.reachable) {
            service.targetHost = reach.targetHost;
          }
          this.verifyServiceUI(service).catch(() => {});
        }).catch(() => {
          this.verifyServiceUI(service).catch(() => {});
        });
      }
    }
  }

  // --- Discovery (polling-based) ---

  async discoverServices(): Promise<DetectedService[]> {
    if (!this.workspacePath || this.isScanning) {
      return this.getServices();
    }

    this.isScanning = true;

    try {
      // 1. Get listening processes (including Docker containers)
      const processes = await discoverListeningProcesses(this.workspacePath);

      // 2. Filter to processes related to our workspace
      const workspaceProcesses = await this.filterWorkspaceProcesses(processes);

      // 3. Reconcile with existing services
      const seenServiceIds = new Set<string>();

      for (const proc of workspaceProcesses) {
        const framework = detectFrameworkFromCommand(proc.command);
        const serviceKey = proc.isDockerContainer
          ? `${proc.containerName || proc.command}-${proc.port}`
          : `${proc.command}-${proc.port}`;
        const serviceId = generateServiceId(proc.cwd || this.workspacePath!, framework, serviceKey);

        seenServiceIds.add(serviceId);

        const existing = this.services.get(serviceId);

        if (existing) {
          // Update existing service
          if (proc.targetHost) {
            existing.targetHost = proc.targetHost;
          }
          if (proc.isDockerContainer) {
            existing.isDockerContainer = true;
            existing.containerId = proc.containerId;
            existing.containerName = proc.containerName;
          }
          if (existing.port !== proc.port) {
            this.handlePortChange(existing, proc.port, proc.host, existing.protocol);
          } else {
            existing.lastSeen = Date.now();
            existing.processId = proc.pid || existing.processId;
            if (existing.status === 'unavailable' || existing.status === 'stopped') {
              existing.status = 'running';
              this.emitEvent({ type: 'restarted', service: existing });
            }
          }
        } else {
          // Check if this is an existing service that changed ports (only for known frameworks)
          const existingByIdentity = (framework && framework !== 'unknown')
            ? this.findServiceByIdentity(proc.cwd || this.workspacePath!, framework)
            : undefined;

          if (existingByIdentity && !seenServiceIds.has(existingByIdentity.id)) {
            seenServiceIds.add(existingByIdentity.id);
            if (proc.targetHost) {
              existingByIdentity.targetHost = proc.targetHost;
            }
            if (existingByIdentity.port !== proc.port) {
              this.handlePortChange(existingByIdentity, proc.port, proc.host, existingByIdentity.protocol);
            }
            continue;
          }

          // New service discovered via polling
          const hint = this.findProjectHint(framework);
          const name = generateServiceName(framework, hint?.name, proc.port);
          const targetHost = proc.targetHost || (proc.isDockerContainer && isDocker ? 'host.docker.internal' : '127.0.0.1');

          const service: DetectedService = {
            id: serviceId,
            projectPath: proc.cwd || this.workspacePath!,
            processId: proc.pid,
            command: proc.command,
            framework,
            name,
            host: normalizeHost(proc.host),
            port: proc.port,
            targetHost,
            internalPort: proc.port,
            externalPort: proc.port,
            url: buildServiceUrl('http', proc.host, proc.port),
            proxyUrl: `/preview/${serviceId}`,
            protocol: 'http',
            hasUI: false, // Will probe
            status: 'starting',
            lastSeen: Date.now(),
            previousPorts: [],
            isDockerContainer: proc.isDockerContainer,
            containerId: proc.containerId,
            containerName: proc.containerName,
          };

          this.services.set(serviceId, service);

          // Probe for UI
          await this.verifyServiceUI(service);

          if (service.hasUI || service.status === 'running') {
            this.emitEvent({ type: 'discovered', service });
          }
        }
      }

      // 4. Mark services as unavailable if not seen
      for (const [id, service] of this.services) {
        if (!seenServiceIds.has(id) && service.status === 'running') {
          // Double-check with a direct probe using targetHost before marking unavailable
          const reachable = await isServiceReachable(service.url, service.targetHost, service.port);
          if (!reachable) {
            service.status = 'unavailable';
            this.emitEvent({ type: 'stopped', service });
            this.startRecoveryMonitoring(service);
          } else {
            service.lastSeen = Date.now();
          }
        }
      }
    } catch (error) {
      console.warn('[ServiceManager] Discovery error:', (error as Error).message);
    } finally {
      this.isScanning = false;
    }

    return this.getServices();
  }

  // --- Private Helpers ---

  private async scanProjectHints(): Promise<void> {
    if (!this.workspacePath) return;

    try {
      this.projectHints = await scanProjectConfigs(this.workspacePath);
      console.log(`[ServiceManager] Found ${this.projectHints.length} project hints:`,
        this.projectHints.map(h => `${h.framework}:${h.defaultPort}`).join(', '));
    } catch (error) {
      console.warn('[ServiceManager] Failed to scan project configs:', (error as Error).message);
    }
  }

  private findProjectHint(framework?: string): ProjectHint | undefined {
    if (!framework) return undefined;
    return this.projectHints.find(h => h.framework === framework);
  }

  private findServiceByIdentity(projectPath: string, framework?: string): DetectedService | undefined {
    if (!framework || framework === 'unknown') return undefined;
    for (const service of this.services.values()) {
      // Match by project path and framework
      if (service.projectPath === projectPath && service.framework === framework) {
        return service;
      }
      // Match by project path prefix (subdirectory)
      if (service.framework === framework &&
          (service.projectPath.startsWith(projectPath) || projectPath.startsWith(service.projectPath))) {
        return service;
      }
    }
    return undefined;
  }

  private async filterWorkspaceProcesses(
    processes: ListeningProcess[],
  ): Promise<ListeningProcess[]> {
    if (!this.workspacePath) return [];

    const results: ListeningProcess[] = [];
    const devProcessNames = [
      'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun',
      'python', 'python3', 'ruby', 'php', 'django',
      'next', 'next-server', 'vite', 'webpack', 'esbuild',
      'uvicorn', 'gunicorn', 'serve', 'http-server', 'cargo', 'go'
    ];

    for (const proc of processes) {
      // Skip if it's on our own backend port (5001) or frontend port (5173)
      if (proc.port === 5001 || proc.port === 5173) continue;

      // Docker containers already passed workspace filter in discoverDockerContainers
      if (proc.isDockerContainer) {
        results.push(proc);
        continue;
      }

      // If we have a valid PID, check cwd to verify workspace membership
      if (proc.pid > 0) {
        const cwd = await getProcessCwd(proc.pid);
        if (cwd) {
          proc.cwd = cwd;
          if (cwd.startsWith(this.workspacePath)) {
            results.push(proc);
            continue;
          }
        }

        const fullCmd = await getProcessCommand(proc.pid);
        if (fullCmd && fullCmd.includes(this.workspacePath)) {
          proc.command = fullCmd;
          results.push(proc);
          continue;
        }
      }

      // Filter by dev process name
      const baseName = proc.command.split('/').pop()?.split(' ')[0] || '';
      if (!devProcessNames.some(p => baseName.includes(p))) continue;

      // If pid is 0 or unknown, but cwd matches workspace
      if (proc.cwd && proc.cwd.startsWith(this.workspacePath)) {
        results.push(proc);
      }
    }

    return results;
  }

  private handlePortChange(service: DetectedService, newPort: number, newHost: string, newProtocol: 'http' | 'https'): void {
    const oldPort = service.port;

    // Track previous port
    if (!service.previousPorts.includes(oldPort)) {
      service.previousPorts.push(oldPort);
      // Keep history manageable
      if (service.previousPorts.length > 10) {
        service.previousPorts = service.previousPorts.slice(-10);
      }
    }

    service.port = newPort;
    service.internalPort = newPort;
    service.externalPort = newPort;
    service.host = normalizeHost(newHost);
    service.protocol = newProtocol;
    service.url = buildServiceUrl(newProtocol, newHost, newPort);
    service.proxyUrl = `/preview/${service.id}`;
    service.status = 'running';
    service.lastSeen = Date.now();

    // Cancel any recovery timer for this service
    this.cancelRecoveryTimer(service.id);

    this.emitEvent({
      type: 'portChanged',
      service,
      oldPort,
      newPort,
    });

    console.log(`[ServiceManager] ${service.name} port changed: ${oldPort} → ${newPort}`);
  }

  private async verifyServiceUI(service: DetectedService): Promise<void> {
    try {
      const result = await probeServiceUI(service.url, service.targetHost, service.port);
      service.hasUI = result.hasUI;

      if (result.hasUI) {
        service.status = 'running';
        if (result.title && (!service.name || service.name === `localhost:${service.port}`)) {
          service.name = result.title;
        }
        service.proxyUrl = `/preview/${service.id}`;
        service.diagnostics = {
          processStatus: 'running',
          listeningAddress: `0.0.0.0:${service.port}`,
          httpStatus: '200 OK',
          httpStatusCode: 200,
          previewReady: true,
          previewUrl: service.proxyUrl,
          lastChecked: Date.now(),
        };
        this.emitEvent({ type: 'ready', service });
      } else {
        // Check for API docs UI (Swagger, admin, etc.)
        const docsResult = await probeAPIDocsUI(service.url, service.targetHost, service.port);
        if (docsResult.hasDocsUI && docsResult.docsPath) {
          service.hasUI = true;
          service.status = 'running';
          if (docsResult.docsPath === '/admin/' || docsResult.docsPath === '/admin') {
            service.name = docsResult.title || `${service.name} Admin`;
            service.url = `${service.url.replace(/\/+$/, '')}${docsResult.docsPath}`;
          } else if (docsResult.docsPath === '/docs') {
            service.name = docsResult.title || `${service.name} Docs`;
            service.url = `${service.url.replace(/\/+$/, '')}${docsResult.docsPath}`;
          }
          service.proxyUrl = `/preview/${service.id}${docsResult.docsPath}`;
          service.diagnostics = {
            processStatus: 'running',
            listeningAddress: `0.0.0.0:${service.port}`,
            httpStatus: '200 OK',
            httpStatusCode: 200,
            previewReady: true,
            previewUrl: service.proxyUrl,
            lastChecked: Date.now(),
          };
          this.emitEvent({ type: 'ready', service });
        } else {
          service.status = 'running';
          service.proxyUrl = `/preview/${service.id}`;
          service.diagnostics = {
            processStatus: 'running',
            listeningAddress: `0.0.0.0:${service.port}`,
            httpStatus: '200 OK',
            httpStatusCode: 200,
            previewReady: true,
            previewUrl: service.proxyUrl,
            lastChecked: Date.now(),
          };
        }
      }
    } catch {
      // Probing failed — service might still be starting
      service.status = 'starting';
    }
  }

  private startRecoveryMonitoring(service: DetectedService): void {
    // Don't create duplicate recovery timers
    if (this.failureRecoveryTimers.has(service.id)) return;

    const startTime = Date.now();
    const recoveryInterval = setInterval(async () => {
      // Check if the service came back on the same port
      const reachable = await isServiceReachable(service.url, service.targetHost, service.port);
      if (reachable) {
        service.status = 'running';
        service.lastSeen = Date.now();
        this.cancelRecoveryTimer(service.id);
        this.emitEvent({ type: 'restarted', service });
        return;
      }

      // Check if recovery period has elapsed
      if (Date.now() - startTime > this.recoveryDurationMs) {
        this.cancelRecoveryTimer(service.id);
        service.status = 'stopped';
        // Don't remove the service — it might come back on a new port via the regular poll
      }
    }, this.recoveryPollMs);

    this.failureRecoveryTimers.set(service.id, recoveryInterval);
  }

  /**
   * Explicitly report a service as stopped by port or ID.
   * Cancels recovery monitoring and immediately notifies all connected clients.
   */
  reportServiceStopped(portOrId: number | string): void {
    let matched = false;
    for (const service of this.services.values()) {
      if (service.port === portOrId || service.id === portOrId) {
        service.status = 'stopped';
        this.cancelRecoveryTimer(service.id);
        this.emitEvent({ type: 'stopped', service });
        matched = true;
      }
    }

    if (!matched && typeof portOrId === 'number') {
      const syntheticService: DetectedService = {
        id: `service-${portOrId}`,
        name: `Service :${portOrId}`,
        port: portOrId,
        url: `http://localhost:${portOrId}`,
        host: 'localhost',
        protocol: 'http',
        hasUI: true,
        status: 'stopped',
        lastSeen: Date.now(),
        previousPorts: [],
        projectPath: this.workspacePath || '',
      };
      this.emitEvent({ type: 'stopped', service: syntheticService });
    }

    this.emitServicesUpdated();
  }

  private emitServicesUpdated(): void {
    this.emit('services_updated', this.getServices());
  }

  /**
   * Register a user-entered manual URL as a proxied service.
   */
  async registerManualService(rawUrl: string, title?: string): Promise<DetectedService | null> {
    try {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `http://${rawUrl}`);
      } catch {
        return null;
      }

      const port = parseInt(parsedUrl.port, 10) || (parsedUrl.protocol === 'https:' ? 443 : 80);
      const host = parsedUrl.hostname;

      // Security check: only allow localhost / 127.0.0.1 or verified project hosts
      if (host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0' && host !== 'host.docker.internal') {
        throw new Error('Only localhost / internal project services are allowed for preview.');
      }

      // Check if existing service matches port
      for (const s of this.services.values()) {
        if (s.port === port && (s.status === 'running' || s.status === 'starting')) {
          return s;
        }
      }

      // Check reachability
      const reach = await determineServiceReachability(port, parsedUrl.protocol === 'https:' ? 'https' : 'http');
      const serviceId = generateServiceId(this.workspacePath || 'manual', 'manual', `manual-${port}`);

      const service: DetectedService = {
        id: serviceId,
        projectPath: this.workspacePath || '',
        name: title || `${host}:${port}`,
        host: normalizeHost(host),
        port,
        targetHost: reach.targetHost,
        internalPort: port,
        externalPort: port,
        url: buildServiceUrl(parsedUrl.protocol === 'https:' ? 'https' : 'http', host, port),
        proxyUrl: `/preview/${serviceId}${parsedUrl.pathname}${parsedUrl.search}`,
        protocol: parsedUrl.protocol === 'https:' ? 'https' : 'http',
        hasUI: true,
        status: reach.reachable ? 'running' : 'starting',
        lastSeen: Date.now(),
        previousPorts: [],
      };

      this.services.set(serviceId, service);
      this.verifyServiceUI(service).catch(() => {});
      this.emitEvent({ type: 'discovered', service });

      return service;
    } catch {
      return null;
    }
  }

  /**
   * Diagnostic command output for a single service.
   */
  diagnoseService(serviceId: string): { text: string; data: any } | null {
    const service = this.services.get(serviceId);
    if (!service) return null;

    const previewUrl = service.proxyUrl || `/preview/${service.id}`;
    const listening = `0.0.0.0:${service.port}`;
    const httpStatus = service.status === 'running' ? '200 OK' : (service.status === 'starting' ? 'Starting...' : 'Unavailable');
    const previewReady = service.status === 'running';

    const text = [
      `Process:`,
      service.status === 'running' ? 'running' : service.status,
      ``,
      `PID:`,
      service.processId || (service.containerId ? `docker:${service.containerName || service.containerId.slice(0, 12)}` : 'unknown'),
      ``,
      `Command:`,
      service.command || 'unknown',
      ``,
      `CWD:`,
      service.projectPath || '(workspace root)',
      ``,
      `Listening:`,
      listening,
      ``,
      `HTTP:`,
      httpStatus,
      ``,
      `Browser Preview:`,
      previewReady ? 'ready' : 'not ready',
      ``,
      `Preview URL:`,
      previewUrl,
    ].join('\n');

    const data = {
      id: service.id,
      name: service.name,
      status: service.status,
      pid: service.processId,
      containerId: service.containerId,
      containerName: service.containerName,
      command: service.command,
      cwd: service.projectPath,
      port: service.port,
      host: service.host,
      targetHost: service.targetHost,
      listening,
      httpStatus,
      previewReady,
      previewUrl,
      url: service.url,
      framework: service.framework,
    };

    return { text, data };
  }

  /**
   * Diagnostic summary for all registered services.
   */
  diagnoseAll(): Array<{ id: string; name: string; text: string; data: any }> {
    return Array.from(this.services.keys()).map(id => {
      const diag = this.diagnoseService(id)!;
      return {
        id,
        name: diag.data.name,
        text: diag.text,
        data: diag.data,
      };
    });
  }

  private cancelRecoveryTimer(serviceId: string): void {
    const timer = this.failureRecoveryTimers.get(serviceId);
    if (timer) {
      clearInterval(timer);
      this.failureRecoveryTimers.delete(serviceId);
    }
  }

  private stopAllRecoveryTimers(): void {
    for (const timer of this.failureRecoveryTimers.values()) {
      clearInterval(timer);
    }
    this.failureRecoveryTimers.clear();
  }

  private emitEvent(event: ServiceEvent): void {
    this.emit(event.type, event);
    this.emit('service_event', event);

    // Also emit the full services list on any change
    this.emit('services_updated', this.getServices());
  }

  // --- Cleanup ---

  destroy(): void {
    this.stopMonitoring();
    this.services.clear();
  }
}

// Singleton instance
export const serviceManager = new ServiceManager();
