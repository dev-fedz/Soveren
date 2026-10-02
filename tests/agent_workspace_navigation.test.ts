import { globalWorkspaceState } from '../src/workspace/workspaceState.js';
import { initializeToolsAndSkills } from '../src/tools/init.js';
import { toolRegistry } from '../src/tools/registry.js';
import { WorkspaceContext } from '../src/context/workspaceContext.js';
import * as path from 'path';
import * as fs from 'fs';

async function runTest() {
  console.log('=== Test Suite 1: Agent Workspace Navigation & File Badges ===');
  const tempDir = path.join(process.cwd(), '.tmp_test_nav');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  WorkspaceContext.setWorkspace(tempDir);

  await initializeToolsAndSkills();

  // 1. Verify FileTypeRegistry routing
  console.log('\n--- 1. Testing File Type Routing ---');
  const codeViewer = globalWorkspaceState.resolveSurfaceForFile('src/components/Login.tsx');
  if (codeViewer !== 'code') throw new Error(`Expected 'code', got '${codeViewer}'`);
  console.log('✓ .tsx routed to Code surface');

  const imgViewer = globalWorkspaceState.resolveSurfaceForFile('assets/logo.png');
  if (imgViewer !== 'images') throw new Error(`Expected 'images', got '${imgViewer}'`);
  console.log('✓ .png routed to Images surface');

  const docViewer = globalWorkspaceState.resolveSurfaceForFile('docs/api_spec.pdf');
  if (docViewer !== 'docs') throw new Error(`Expected 'docs', got '${docViewer}'`);
  console.log('✓ .pdf routed to Docs surface');

  const csvViewer = globalWorkspaceState.resolveSurfaceForFile('data/users.csv');
  if (csvViewer !== 'docs') throw new Error(`Expected 'docs', got '${csvViewer}'`);
  console.log('✓ .csv routed to Docs surface');

  // 2. Test Workspace State Subscriptions and Action Dispatching
  console.log('\n--- 2. Testing Action Dispatching & Surface Switching ---');
  const capturedActions: any[] = [];
  const unsubscribeAction = globalWorkspaceState.onAction((act) => {
    capturedActions.push(act);
  });

  // Action: create_file
  globalWorkspaceState.dispatch({
    type: 'create_file',
    path: 'src/components/ForgotPassword.tsx',
    content: 'export const ForgotPassword = () => <div>Reset</div>;',
  });

  let state = globalWorkspaceState.getState();
  if (state.activeSurface !== 'code') throw new Error(`Expected activeSurface 'code', got ${state.activeSurface}`);
  if (state.activeFilePath !== 'src/components/ForgotPassword.tsx') throw new Error(`Unexpected activeFilePath: ${state.activeFilePath}`);
  if (state.fileBadges['src/components/ForgotPassword.tsx'] !== 'created') throw new Error(`Expected 'created' badge for ForgotPassword.tsx`);
  console.log('✓ create_file activated Code surface and marked badge as created');

  // Action: open_browser
  globalWorkspaceState.dispatch({
    type: 'open_browser',
    serviceId: 'frontend-3000',
    url: 'http://localhost:3000/login',
  });

  state = globalWorkspaceState.getState();
  if (state.activeSurface !== 'browser') throw new Error(`Expected activeSurface 'browser', got ${state.activeSurface}`);
  if (state.activeBrowserService !== 'frontend-3000') throw new Error(`Unexpected service: ${state.activeBrowserService}`);
  if (state.activeBrowserUrl !== 'http://localhost:3000/login') throw new Error(`Unexpected url: ${state.activeBrowserUrl}`);
  console.log('✓ open_browser activated Browser surface');

  // Action: open_inspector
  globalWorkspaceState.dispatch({
    type: 'open_inspector',
    panel: 'network',
  });

  state = globalWorkspaceState.getState();
  if (state.activeSurface !== 'inspect') throw new Error(`Expected activeSurface 'inspect', got ${state.activeSurface}`);
  if (state.activeInspectPanel !== 'network') throw new Error(`Expected inspect panel 'network', got ${state.activeInspectPanel}`);
  console.log('✓ open_inspector activated Inspect surface with network panel');

  // Action: open_image
  globalWorkspaceState.dispatch({
    type: 'open_image',
    path: 'screenshots/login_failed.png',
  });

  state = globalWorkspaceState.getState();
  if (state.activeSurface !== 'images') throw new Error(`Expected activeSurface 'images', got ${state.activeSurface}`);
  if (state.activeImagePath !== 'screenshots/login_failed.png') throw new Error(`Unexpected image path: ${state.activeImagePath}`);
  console.log('✓ open_image activated Images surface');

  // Action: open_document
  globalWorkspaceState.dispatch({
    type: 'open_document',
    path: 'docs/architecture.docx',
    page: 2,
  });

  state = globalWorkspaceState.getState();
  if (state.activeSurface !== 'docs') throw new Error(`Expected activeSurface 'docs', got ${state.activeSurface}`);
  if (state.activeDocPath !== 'docs/architecture.docx') throw new Error(`Unexpected doc path: ${state.activeDocPath}`);
  console.log('✓ open_document activated Docs surface');

  // 3. Test Navigation Agent Tools from Registry
  console.log('\n--- 3. Testing Navigation Agent Tools ---');
  const openFileTool = toolRegistry.getTool('open_file')!;
  const testFileRel = 'test_sample.ts';
  const testFileAbs = path.join(tempDir, testFileRel);
  fs.writeFileSync(testFileAbs, 'console.log("hello world");');

  const openRes = await openFileTool.execute({ path: testFileRel, line: 1 });
  if (!openRes.success) throw new Error(`open_file failed: ${openRes.error}`);
  state = globalWorkspaceState.getState();
  if (state.activeSurface !== 'code' || state.activeFilePath !== testFileRel) {
    throw new Error('open_file did not update workspace state to code surface');
  }
  console.log('✓ open_file tool correctly navigated to file');

  const deleteFileTool = toolRegistry.getTool('delete_file')!;
  const delRes = await deleteFileTool.execute({ path: testFileRel });
  if (!delRes.success) throw new Error(`delete_file failed: ${delRes.error}`);
  state = globalWorkspaceState.getState();
  if (state.fileBadges[testFileRel] !== 'deleted') {
    throw new Error(`Expected 'deleted' badge for ${testFileRel}, got ${state.fileBadges[testFileRel]}`);
  }
  console.log('✓ delete_file tool set badge to deleted');

  unsubscribeAction();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('\n✅ All Agent Workspace Navigation tests passed successfully!\n');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
