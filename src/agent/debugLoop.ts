import { globalWorkspaceState } from '../workspace/workspaceState.js';
import { browserAutomationEngine } from '../browser/browserAutomation.js';
import { artifactManager } from '../artifacts/artifactManager.js';
import { agentPermissionManager } from '../permissions/agentPermissionManager.js';

export interface DebugLoopIterationLog {
  iteration: number;
  phase: 'implement' | 'test' | 'inspect' | 'diagnose' | 'fix' | 'verify' | 'escalate';
  success: boolean;
  message: string;
  screenshotArtifactId?: string;
  screenshotPath?: string;
  consoleErrors?: string[];
  networkErrors?: Array<{ url: string; status: number; method: string }>;
}

export interface DebugLoopResult {
  success: boolean;
  iterations: number;
  logs: DebugLoopIterationLog[];
  escalation?: {
    attempted: string;
    failed: string;
    evidence: string[];
    requiredFromUser?: string;
  };
}

export interface DebugLoopConfig {
  taskId: string;
  maxIterations?: number;
  serviceUrl?: string;
  implement: () => Promise<void>;
  test: () => Promise<{ success: boolean; error?: string; failureScreenshotId?: string }>;
  diagnose?: (iterationLog: Partial<DebugLoopIterationLog>) => Promise<string>;
  fix: (diagnosis: string, iteration: number) => Promise<void>;
  requireHumanPermission?: boolean;
}

export class AutonomousDebugLoop {
  /**
   * Executes the full autonomous debug loop:
   * implement -> build/start -> health check/open browser -> test ->
   * if fail: inspect (console/network/screenshot) -> diagnose -> fix -> retest -> verify
   * with configurable retry limits and structured failure escalation.
   */
  static async run(config: DebugLoopConfig): Promise<DebugLoopResult> {
    const maxIterations = config.maxIterations || 3;
    const logs: DebugLoopIterationLog[] = [];
    let currentIteration = 1;

    globalWorkspaceState.setAgentStatus('working');

    // 1. Initial Implementation
    await config.implement();
    logs.push({
      iteration: 0,
      phase: 'implement',
      success: true,
      message: 'Initial implementation completed',
    });

    while (currentIteration <= maxIterations) {
      // 2. Open browser / navigate
      if (config.serviceUrl) {
        globalWorkspaceState.dispatchAction({
          type: 'open_browser',
          serviceId: 'app_service',
          url: config.serviceUrl,
        });
      }

      // 3. Test
      logs.push({
        iteration: currentIteration,
        phase: 'test',
        success: false,
        message: `Running automated test iteration ${currentIteration}`,
      });

      const testResult = await config.test();

      if (testResult.success) {
        // Success! Verified
        logs.push({
          iteration: currentIteration,
          phase: 'verify',
          success: true,
          message: `Verification succeeded on iteration ${currentIteration}`,
        });
        globalWorkspaceState.setAgentStatus('idle');
        return {
          success: true,
          iterations: currentIteration,
          logs,
        };
      }

      // 4. Test failed -> INSPECT & CAPTURE EVIDENCE
      const consoleErrors = browserAutomationEngine.getConsoleLogs('error').map((l) => l.text);
      const networkErrors = browserAutomationEngine
        .getNetworkRequests()
        .filter((r) => r.status && r.status >= 400)
        .map((r) => ({ url: r.url, status: r.status!, method: r.method }));

      let screenshotPath: string | undefined;
      if (testResult.failureScreenshotId) {
        const art = artifactManager.getArtifact(testResult.failureScreenshotId);
        if (art) {
          screenshotPath = art.path;
          // Workspace visually follows: open failure screenshot in Images tab
          globalWorkspaceState.dispatchAction({
            type: 'open_image',
            path: art.path,
          });
        }
      } else {
        // Workspace visually follows: focus console in Inspect tab
        globalWorkspaceState.dispatchAction({
          type: 'focus_console',
        });
      }

      logs.push({
        iteration: currentIteration,
        phase: 'inspect',
        success: false,
        message: `Test failed: ${testResult.error || 'Assertion failure'}. Evidence captured.`,
        screenshotArtifactId: testResult.failureScreenshotId,
        screenshotPath,
        consoleErrors,
        networkErrors,
      });

      // 5. DIAGNOSE
      let diagnosis = `Iteration ${currentIteration} failure: ${testResult.error || 'Unknown error'}`;
      if (config.diagnose) {
        diagnosis = await config.diagnose(logs[logs.length - 1]);
      } else {
        if (networkErrors.length > 0) {
          diagnosis = `Network endpoint failure: ${networkErrors[0].method} ${networkErrors[0].url} returned ${networkErrors[0].status}`;
        } else if (consoleErrors.length > 0) {
          diagnosis = `Console error detected: ${consoleErrors[0]}`;
        }
      }

      logs.push({
        iteration: currentIteration,
        phase: 'diagnose',
        success: true,
        message: `Diagnosed root cause: ${diagnosis}`,
      });

      // Check if human permission is needed
      if (config.requireHumanPermission) {
        const permRes = await agentPermissionManager.requestPermission({
          type: 'confirmation',
          title: 'Approval Required to Proceed with Fix',
          explanation: `Diagnosis: ${diagnosis}. Please approve applying automated fix.`,
        });
        if (!permRes.approved) {
          globalWorkspaceState.setAgentStatus('idle');
          return {
            success: false,
            iterations: currentIteration,
            logs,
            escalation: {
              attempted: `Diagnosed issue on iteration ${currentIteration}`,
              failed: 'User denied permission to apply fix',
              evidence: [diagnosis],
              requiredFromUser: 'Manual intervention or approval to proceed',
            },
          };
        }
      }

      // If max iterations reached, stop before next fix
      if (currentIteration >= maxIterations) {
        break;
      }

      // 6. FIX
      logs.push({
        iteration: currentIteration,
        phase: 'fix',
        success: true,
        message: `Applying automated fix for: ${diagnosis}`,
      });
      await config.fix(diagnosis, currentIteration);

      currentIteration++;
    }

    // Escalation after max iterations reached
    const evidenceList: string[] = [];
    const lastInspect = logs.filter((l) => l.phase === 'inspect').pop();
    if (lastInspect?.screenshotPath) evidenceList.push(`Screenshot evidence: ${lastInspect.screenshotPath}`);
    if (lastInspect?.consoleErrors?.length) evidenceList.push(...lastInspect.consoleErrors.map((e) => `Console: ${e}`));
    if (lastInspect?.networkErrors?.length) evidenceList.push(...lastInspect.networkErrors.map((n) => `Network: ${n.method} ${n.url} (${n.status})`));

    globalWorkspaceState.setAgentStatus('idle');

    return {
      success: false,
      iterations: currentIteration,
      logs,
      escalation: {
        attempted: `Executed ${currentIteration} automated fix-and-test iterations for task ${config.taskId}`,
        failed: `Automated testing did not pass within limit of ${maxIterations} iterations`,
        evidence: evidenceList,
        requiredFromUser: 'Please inspect the application state or provide missing configuration / credentials',
      },
    };
  }
}
