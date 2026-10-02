import { AutonomousDebugLoop } from '../src/agent/debugLoop.js';
import { browserAutomationEngine } from '../src/browser/browserAutomation.js';
import { artifactManager } from '../src/artifacts/artifactManager.js';
import { globalWorkspaceState } from '../src/workspace/workspaceState.js';
import { agentPermissionManager } from '../src/permissions/agentPermissionManager.js';
import { initializeToolsAndSkills } from '../src/tools/init.js';
import { WorkspaceContext } from '../src/context/workspaceContext.js';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

async function runTest() {
  console.log('=== Test Suite 5: Autonomous Debug Loop (Scenario 1 & Retry Bounds) ===');
  const tempDir = path.join(process.cwd(), '.tmp_test_debug_loop');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  WorkspaceContext.setWorkspace(tempDir);

  await initializeToolsAndSkills();

  // We set up a dynamic mock HTTP server whose behavior can change when files are fixed
  let isBackendFixed = false;
  let serverHtmlVersion = 'v1_broken';

  const mockServer = http.createServer((req, res) => {
    // Route 1: API forgot-password
    if (req.url === '/api/auth/forgot-password' && req.method === 'POST') {
      if (!isBackendFixed) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database connection failed: missing SMTP_RELAY_HOST' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password reset link sent to your email' }));
      }
      return;
    }

    // Route 2: Frontend HTML
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (serverHtmlVersion === 'v1_broken') {
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Forgot Password</title></head>
          <body>
            <h1>Reset Your Password</h1>
            <form id="forgot-pwd-form" action="/api/auth/forgot-password" method="POST">
              <input type="email" id="email-input" name="email" placeholder="Enter your email" />
              <!-- Buggy button id and attribute in v1 -->
              <button type="button" id="reset-button-buggy">Send Reset Link</button>
            </form>
            <div id="result-status"></div>
          </body>
        </html>
      `);
    } else {
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Forgot Password</title></head>
          <body>
            <h1>Reset Your Password</h1>
            <form id="forgot-pwd-form" action="/api/auth/forgot-password" method="POST">
              <input type="email" id="email-input" name="email" placeholder="Enter your email" />
              <!-- Fixed button in v2 -->
              <button type="submit" id="reset-submit-btn">Send Reset Link</button>
            </form>
            <div id="result-status">Password reset link sent successfully! Check your inbox.</div>
          </body>
        </html>
      `);
    }
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = mockServer.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`Mock server running on ${baseUrl}`);

  try {
    // =========================================================================
    // SCENARIO 1: Full Autonomous Debug Loop (Implement -> Test -> Fail -> Inspect -> Fix -> Retest -> Verify)
    // =========================================================================
    console.log('\n--- 1. Testing Full Autonomous Debug Loop (Scenario 1: Forgot Password) ---');
    const taskId = 'task_forgot_password_debug';
    const componentPath = path.join(tempDir, 'ForgotPassword.tsx');

    let fixApplied = false;

    const loopResult = await AutonomousDebugLoop.run({
      taskId,
      serviceUrl: `${baseUrl}/forgot-password`,
      maxIterations: 3,

      // Step 1: Initial Implementation
      implement: async () => {
        fs.writeFileSync(componentPath, '// ForgotPassword Component v1 (broken button handler)', 'utf8');
        globalWorkspaceState.dispatchAction({
          type: 'create_file',
          path: 'ForgotPassword.tsx',
        });
        const st = globalWorkspaceState.getState();
        if (st.activeSurface !== 'code' || st.activeFilePath !== 'ForgotPassword.tsx') {
          throw new Error('Implementation step did not switch surface to code');
        }
        if (st.fileBadges['ForgotPassword.tsx'] !== 'created') {
          throw new Error('File badge was not marked as created');
        }
      },

      // Step 2 & 4: Automated Test execution
      test: async () => {
        // Run multi-step automated browser test
        const testRes = await browserAutomationEngine.runAutomationTest({
          taskId,
          name: 'Forgot Password Submission Test',
          steps: [
            { action: 'navigate', url: `${baseUrl}/forgot-password` },
            { action: 'type', selector: 'input#email-input', value: 'user@example.com' },
            { action: 'click', selector: 'button#reset-submit-btn' },
            { action: 'wait', timeoutMs: 50 },
            { action: 'assert', value: 'Check your inbox' },
          ],
        });

        // Simulate network error record if broken
        if (!isBackendFixed) {
          browserAutomationEngine.logConsole('error', 'POST /api/auth/forgot-password 500 (Internal Server Error)');
          browserAutomationEngine.recordNetworkRequest({
            method: 'POST',
            url: `${baseUrl}/api/auth/forgot-password`,
            status: 500,
            durationMs: 40,
            type: 'fetch',
            responsePayload: JSON.stringify({ error: 'Database connection failed: missing SMTP_RELAY_HOST' }),
          });
        }

        return {
          success: testRes.success,
          error: testRes.steps.find((s) => s.status === 'failed')?.error,
          failureScreenshotId: testRes.failureScreenshotId,
        };
      },

      // Step 3: Diagnose failure evidence
      diagnose: async (log) => {
        console.log(`  [Diagnosing] Test failed with: "${log.message}"`);
        if (log.screenshotPath) {
          console.log(`  [Diagnosing] Analyzed failure screenshot: ${log.screenshotPath}`);
        }
        return 'Button selector mismatch and server 500 error';
      },

      // Step 4: Fix code
      fix: async (diagnosis, iteration) => {
        console.log(`  [Applying Fix on Iteration ${iteration}] Updating component & server state`);
        // Fix frontend HTML and server backend
        serverHtmlVersion = 'v2_fixed';
        isBackendFixed = true;
        fixApplied = true;

        fs.writeFileSync(componentPath, '// ForgotPassword Component v2 (fixed button and API route)', 'utf8');
        globalWorkspaceState.dispatchAction({
          type: 'modify_file',
          path: 'ForgotPassword.tsx',
        });
        const st = globalWorkspaceState.getState();
        if (st.fileBadges['ForgotPassword.tsx'] !== 'modified') {
          throw new Error('File badge was not marked as modified after fix');
        }
      },
    });

    if (!loopResult.success) {
      throw new Error(`Expected autonomous debug loop to succeed, but failed with: ${JSON.stringify(loopResult.escalation)}`);
    }

    if (loopResult.iterations !== 2) {
      throw new Error(`Expected loop to succeed on iteration 2, got iteration ${loopResult.iterations}`);
    }

    if (!fixApplied) {
      throw new Error('Fix was not applied during autonomous debug loop');
    }

    // Verify inspect log contains screenshot evidence
    const inspectLogs = loopResult.logs.filter((l) => l.phase === 'inspect');
    if (inspectLogs.length === 0 || !inspectLogs[0].screenshotArtifactId) {
      throw new Error('Expected inspect log to have captured failure screenshot artifact');
    }

    const failureScreenshot = artifactManager.getArtifact(inspectLogs[0].screenshotArtifactId);
    if (!failureScreenshot || !fs.existsSync(failureScreenshot.path)) {
      throw new Error('Failure screenshot artifact file was not found on disk');
    }

    console.log(`✓ Scenario 1 passed autonomously on iteration ${loopResult.iterations}!`);
    console.log(`✓ Failure screenshot verified: ${failureScreenshot.id} (${failureScreenshot.path})`);
    console.log(`✓ Workspace visually tracked changes: code -> browser -> images -> code -> browser`);

    // =========================================================================
    // SCENARIO 2: Retry Bounds & Failure Escalation (Prevent Infinite Loops)
    // =========================================================================
    console.log('\n--- 2. Testing Retry Limits & Structured Failure Escalation ---');
    const unresolvableTaskId = 'task_unresolvable_bug';
    let attemptedIterations = 0;

    const escalationResult = await AutonomousDebugLoop.run({
      taskId: unresolvableTaskId,
      serviceUrl: `${baseUrl}/forgot-password`,
      maxIterations: 2, // Strictly capped at 2 iterations
      implement: async () => {},
      test: async () => {
        attemptedIterations++;
        // Capture screenshot of persistent failure
        const art = await artifactManager.saveArtifact(unresolvableTaskId, 'screenshot', 'Persistent Failure', {
          fileName: 'persistent_error.svg',
          content: '<svg><text>Persistent 502 Bad Gateway</text></svg>',
        });
        browserAutomationEngine.logConsole('error', 'CRITICAL: Upstream payment gateway timed out (504 Gateway Timeout)');
        return {
          success: false,
          error: 'Element assertion timeout after 5000ms',
          failureScreenshotId: art.id,
        };
      },
      fix: async () => {
        // Fix that doesn't resolve the external gateway error
      },
    });

    if (escalationResult.success) {
      throw new Error('Unresolvable loop was expected to fail');
    }

    if (escalationResult.iterations !== 2 || attemptedIterations !== 2) {
      throw new Error(`Expected exactly 2 iterations executed, got ${attemptedIterations}`);
    }

    if (!escalationResult.escalation) {
      throw new Error('Expected structured escalation report upon reaching max iterations');
    }

    const { escalation } = escalationResult;
    if (!escalation.attempted || !escalation.failed || !escalation.evidence || !escalation.requiredFromUser) {
      throw new Error(`Escalation report is missing required fields: ${JSON.stringify(escalation)}`);
    }

    console.log('✓ Loop respected maxIterations limit (no infinite loop)');
    console.log('✓ Escalation Report:');
    console.log(`   - Attempted: ${escalation.attempted}`);
    console.log(`   - Failed: ${escalation.failed}`);
    console.log(`   - Evidence: ${escalation.evidence.join(' | ')}`);
    console.log(`   - Required From User: ${escalation.requiredFromUser}`);

    // =========================================================================
    // SCENARIO 3: Human-In-The-Loop Permission Pausing During Autonomous Loop
    // =========================================================================
    console.log('\n--- 3. Testing Human-In-The-Loop Permission Request During Debug Loop ---');
    const permTaskId = 'task_protected_db_migration';
    let permissionRequested = false;

    const permHandler = (req: any) => {
      permissionRequested = true;
      console.log(`  [HITL Event] Permission requested: "${req.title}" (${req.explanation})`);
      setTimeout(async () => {
        await agentPermissionManager.respond(req.id, true, { adminApproved: true });
        console.log('  [HITL Event] User approved permission request!');
      }, 50);
    };
    agentPermissionManager.on('permission_requested', permHandler);

    let loopRanWithApproval = false;
    const hitlResult = await AutonomousDebugLoop.run({
      taskId: permTaskId,
      maxIterations: 2,
      requireHumanPermission: true,
      implement: async () => {},
      test: async () => {
        if (!loopRanWithApproval) {
          return { success: false, error: 'Database schema migration required' };
        }
        return { success: true };
      },
      fix: async () => {
        loopRanWithApproval = true;
      },
    });

    agentPermissionManager.off('permission_requested', permHandler);

    if (!permissionRequested) {
      throw new Error('Human permission was not requested during debug loop');
    }
    if (!hitlResult.success) {
      throw new Error('HITL debug loop was expected to succeed after approval');
    }
    console.log('✓ Autonomous debug loop paused for human approval and resumed smoothly to verify pass!');

    console.log('\n✅ All Autonomous Debug Loop tests passed successfully!\n');
  } finally {
    mockServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
