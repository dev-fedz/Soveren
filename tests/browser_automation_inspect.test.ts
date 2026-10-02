import { browserAutomationEngine } from '../src/browser/browserAutomation.js';
import { artifactManager } from '../src/artifacts/artifactManager.js';
import { initializeToolsAndSkills } from '../src/tools/init.js';
import { toolRegistry } from '../src/tools/registry.js';
import { WorkspaceContext } from '../src/context/workspaceContext.js';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

async function runTest() {
  console.log('=== Test Suite 2: Browser Automation & Developer Inspect Telemetry ===');
  const tempDir = path.join(process.cwd(), '.tmp_test_browser');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  WorkspaceContext.setWorkspace(tempDir);

  await initializeToolsAndSkills();

  // Spin up an in-process HTTP mock server to serve realistic HTML
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>App Login</title></head>
        <body>
          <h1>Welcome to Application</h1>
          <form id="login-form" action="/login" method="POST">
            <input type="email" name="email" placeholder="Email address" value="" />
            <input type="password" name="password" placeholder="Password" value="" />
            <button type="submit" id="login-btn">Sign In</button>
          </form>
          <div id="status-message">Welcome back to Dashboard</div>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = mockServer.address() as any;
  const testBaseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`Mock test server running on ${testBaseUrl}`);

  try {
    // 1. Test Navigation & State
    console.log('\n--- 1. Testing Browser Navigation & Semantic Interaction ---');
    const navResult = await browserAutomationEngine.navigate(`${testBaseUrl}/login`);
    if (!navResult.success) throw new Error(`Navigation failed: ${navResult.title}`);
    console.log(`✓ Navigated to: ${browserAutomationEngine.getCurrentUrl()} (title: "${navResult.title}")`);

    // Test Typing into semantic element
    const typeResult = await browserAutomationEngine.type('input[type="email"]', 'testuser@example.com');
    if (!typeResult.success) throw new Error(`Type element failed: ${typeResult.error}`);
    console.log('✓ Successfully typed email into input[type="email"]');

    // Test Clicking semantic element
    const clickResult = await browserAutomationEngine.click('button[type="submit"]');
    if (!clickResult.success) throw new Error(`Click element failed: ${clickResult.error}`);
    console.log('✓ Successfully clicked button[type="submit"]');

    // 2. Test DOM Inspection
    console.log('\n--- 2. Testing DOM Inspection ---');
    const domTree = await browserAutomationEngine.inspectDOM('form');
    if (!domTree || domTree.tag !== 'form') {
      throw new Error(`Expected form DOM tree, got ${JSON.stringify(domTree)}`);
    }
    if (!domTree.children || domTree.children.length === 0) {
      throw new Error('Expected form to have input/button children');
    }
    console.log(`✓ DOM Inspection returned structured node: <${domTree.tag}> with ${domTree.children.length} children`);

    // 3. Test Developer Inspect Telemetry (Console, Network, Performance, Memory, Storage, Security)
    console.log('\n--- 3. Testing Inspect Sub-Panels Telemetry ---');
    
    // Emit simulated console error & log
    browserAutomationEngine.logConsole('info', 'Rendering login component');
    browserAutomationEngine.logConsole('error', 'Failed to load user avatar: 404 Not Found');

    const consoleLogs = browserAutomationEngine.getConsoleLogs();
    if (consoleLogs.length < 2) throw new Error(`Expected at least 2 console logs, got ${consoleLogs.length}`);
    const errorLogs = browserAutomationEngine.getConsoleLogs('error');
    if (errorLogs.length === 0 || !errorLogs[0].text.includes('404')) {
      throw new Error('Failed to retrieve filtered console error logs');
    }
    console.log(`✓ Console telemetry captured ${consoleLogs.length} logs including filtered errors`);

    // Record simulated network requests
    browserAutomationEngine.recordNetworkRequest({
      method: 'GET',
      url: `${testBaseUrl}/api/auth/status`,
      status: 200,
      type: 'fetch',
      durationMs: 42,
    });
    browserAutomationEngine.recordNetworkRequest({
      method: 'POST',
      url: `${testBaseUrl}/api/login`,
      status: 500,
      type: 'fetch',
      durationMs: 125,
      responsePayload: JSON.stringify({ error: 'Internal Server Error' }),
    });

    const networkReqs = browserAutomationEngine.getNetworkRequests();
    if (networkReqs.length < 2) throw new Error(`Expected at least 2 network requests, got ${networkReqs.length}`);
    const failedReqs = networkReqs.filter(r => r.status && r.status >= 400);
    if (failedReqs.length !== 1 || failedReqs[0].status !== 500) {
      throw new Error(`Expected 1 failed network request (status 500), got ${failedReqs.length}`);
    }
    console.log(`✓ Network telemetry captured ${networkReqs.length} requests with 1 status 500 failure`);

    // Performance & Memory
    const perf = browserAutomationEngine.getPerformanceMetrics();
    if (!perf.navigationTiming || typeof perf.navigationTiming.domContentLoaded !== 'number') {
      throw new Error('Missing navigation timing metrics in performance telemetry');
    }
    console.log(`✓ Performance metrics available (domContentLoaded: ${perf.navigationTiming.domContentLoaded}ms)`);

    const mem = browserAutomationEngine.getMemoryMetrics();
    if (mem.usedHeapBytes <= 0) throw new Error('Invalid memory metrics');
    console.log(`✓ Memory metrics available (usedHeap: ${(mem.usedHeapBytes / (1024 * 1024)).toFixed(1)}MB)`);

    // Storage & Security
    browserAutomationEngine.setLocalStorageItem('session_token', 'jwt_test_sample_xyz');
    const storage = browserAutomationEngine.getStorageData();
    if (storage.localStorage['session_token'] !== 'jwt_test_sample_xyz') {
      throw new Error('Failed to retrieve localStorage items');
    }
    console.log('✓ Storage telemetry captured localStorage item');

    const security = browserAutomationEngine.getSecurityData();
    if (!security.protocol) throw new Error('Missing security protocol data');
    console.log(`✓ Security telemetry retrieved (protocol: ${security.protocol})`);

    // 4. Test Screenshot Capture & Artifact Association
    console.log('\n--- 4. Testing Screenshot Capture & Artifact Management ---');
    const taskId = 'task_debug_auth_flow';
    const screenshotArtifact = await browserAutomationEngine.takeScreenshot(taskId, 'login_page_preview');
    if (!screenshotArtifact || !screenshotArtifact.path) {
      throw new Error('Screenshot artifact creation failed');
    }
    if (!fs.existsSync(screenshotArtifact.path)) {
      throw new Error(`Screenshot artifact file does not exist on disk at ${screenshotArtifact.path}`);
    }
    console.log(`✓ Screenshot captured and saved to disk: ${screenshotArtifact.path}`);

    const taskArtifacts = artifactManager.getArtifactsForTask(taskId);
    if (taskArtifacts.length === 0 || taskArtifacts[0].id !== screenshotArtifact.id) {
      throw new Error('ArtifactManager failed to retrieve screenshot by taskId');
    }
    console.log(`✓ ArtifactManager verified task artifact association for ${taskId}`);

    // 5. Test Automated Multi-Step Test Runner (Passing Flow)
    console.log('\n--- 5. Testing Automated Multi-Step Test Runner (Passing Scenario) ---');
    const passTestResult = await browserAutomationEngine.runAutomationTest({
      taskId,
      name: 'User Login Verification Test',
      steps: [
        { action: 'navigate', url: `${testBaseUrl}/login` },
        { action: 'type', selector: 'input[type="email"]', value: 'admin@bioeight.com' },
        { action: 'type', selector: 'input[type="password"]', value: 'adminpassword' },
        { action: 'click', selector: 'button[type="submit"]' },
        { action: 'wait', timeoutMs: 50 },
        { action: 'assert', value: 'Dashboard' },
      ],
    });

    if (!passTestResult.success) {
      console.log('Failed step results:', passTestResult.steps);
      throw new Error(`Automated test was expected to pass, but failed: ${passTestResult.steps.find(s => s.status === 'failed')?.error}`);
    }
    if (passTestResult.steps.length !== 6) {
      throw new Error(`Expected 6 executed test steps, got ${passTestResult.steps.length}`);
    }
    console.log(`✓ Automated test passed completely with all ${passTestResult.steps.length} steps verified!`);

    // 6. Test Automated Multi-Step Test Runner with Failure & Auto-Screenshot Capture
    console.log('\n--- 6. Testing Automated Multi-Step Test Runner (Failing Scenario & Failure Screenshot) ---');
    const failTestResult = await browserAutomationEngine.runAutomationTest({
      taskId,
      name: 'Failing Flow With Non-Existent Element',
      steps: [
        { action: 'navigate', url: `${testBaseUrl}/login` },
        { action: 'click', selector: 'button#non_existent_submit_btn' },
      ],
    });

    if (failTestResult.success) {
      throw new Error('Expected test to fail on missing selector');
    }
    if (!failTestResult.failureScreenshotId) {
      throw new Error('Expected automated failure screenshot to be captured');
    }
    const failScreenshot = artifactManager.getArtifact(failTestResult.failureScreenshotId);
    if (!failScreenshot) {
      throw new Error('Failed to find failure screenshot in artifact manager');
    }
    console.log(`✓ Automated failure screenshot captured: ${failScreenshot.id} (${failScreenshot.path})`);

    // 7. Test Inspect Tools in ToolRegistry
    console.log('\n--- 7. Testing Inspect Tools via Tool Registry ---');
    const inspectConsoleTool = toolRegistry.getTool('inspect_console')!;
    const consoleRes = await inspectConsoleTool.execute({ level: 'error' });
    if (!consoleRes.success || !consoleRes.content.includes('404')) {
      throw new Error('inspect_console tool execution failed');
    }
    console.log('✓ inspect_console tool executed successfully');

    const inspectNetworkTool = toolRegistry.getTool('inspect_network')!;
    const networkRes = await inspectNetworkTool.execute({ status: 500 });
    if (!networkRes.success || !networkRes.content.includes('500')) {
      throw new Error('inspect_network tool execution failed');
    }
    console.log('✓ inspect_network tool executed successfully');

    console.log('\n✅ All Browser Automation & Inspect tests passed successfully!\n');
  } finally {
    mockServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
