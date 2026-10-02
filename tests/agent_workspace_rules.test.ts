import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import { WorkspaceContext } from '../src/context/workspaceContext.js';
import { ReadFileTool } from '../src/tools/read-file.js';
import { ReadFileRangeTool } from '../src/tools/read-file-range.js';
import { ListDirectoryTool } from '../src/tools/list-directory.js';
import { WriteFileTool } from '../src/tools/write-file.js';
import { EditFileTool } from '../src/tools/edit-file.js';
import { SearchFilesTool } from '../src/tools/search.js';
import { workspaceManager } from '../backend/src/workspace.js';
import { Agent } from '../src/agent/agent.js';

async function runRuleTests() {
  console.log('================================================================');
  console.log('Testing Rule 1 & Rule 2 Enforcement for Agentic AI');
  console.log('Rule 1: Prohibit reading agent root project (/app / planner-agent)');
  console.log('Rule 2: Opened project is absolute priority; other local machine dirs only if explicitly allowed');
  console.log('================================================================\n');

  // Test 1: WorkspaceContext.isAgentRoot detection
  console.log('Test 1: Agent Root Detection');
  assert.strictEqual(WorkspaceContext.isAgentRoot('/app'), true, '/app must be detected as agent root');
  assert.strictEqual(WorkspaceContext.isAgentRoot('/app/package.json'), true, '/app/package.json must be detected as agent root');
  assert.strictEqual(WorkspaceContext.isAgentRoot('/app/src/agent/agent.ts'), true, 'files in /app must be detected as agent root');
  assert.strictEqual(WorkspaceContext.isAgentRoot('/host/Desktop/projects/personal/withgod'), false, 'user project must not be detected as agent root');
  assert.strictEqual(WorkspaceContext.isAgentRoot('/projects/withgod'), false, 'local machine project must not be detected as agent root');
  console.log('✅ PASS: isAgentRoot correctly classifies agent root vs user projects\n');

  // Test 2: Rule 1 - Tools rejecting access to agent root
  console.log('Test 2: Tool Protection against Agent Root Access');
  const readTool = new ReadFileTool();
  const readRes = await readTool.execute({ path: '/app/package.json' });
  assert.strictEqual(readRes.success, false, 'read_file must return success: false for agent root');
  assert.match(readRes.error || '', /Access denied: Reading the root project of the AI agent is strictly prohibited/);

  const rangeTool = new ReadFileRangeTool();
  const rangeRes = await rangeTool.execute({ path: '/app/package.json', startLine: 1, endLine: 10 });
  assert.strictEqual(rangeRes.success, false, 'read_file_range must return success: false for agent root');
  assert.match(rangeRes.error || '', /Access denied: Reading the root project of the AI agent is strictly prohibited/);

  const listTool = new ListDirectoryTool();
  const listRes = await listTool.execute({ path: '/app' });
  assert.strictEqual(listRes.success, false, 'list_directory must return success: false for agent root');
  assert.match(listRes.error || '', /Access denied: Reading the root project of the AI agent is strictly prohibited/);

  const writeTool = new WriteFileTool();
  const writeRes = await writeTool.execute({ path: '/app/test.txt', content: 'hack' });
  assert.strictEqual(writeRes.success, false, 'write_file must return success: false for agent root');
  assert.match(writeRes.error || '', /Access denied: Reading the root project of the AI agent is strictly prohibited/);

  const editTool = new EditFileTool();
  const editRes = await editTool.execute({ path: '/app/package.json', edits: [{ oldText: 'foo', newText: 'bar' }] });
  assert.strictEqual(editRes.success, false, 'edit_file must return success: false for agent root');
  assert.match(editRes.error || '', /Access denied: Reading the root project of the AI agent is strictly prohibited/);

  const searchTool = new SearchFilesTool();
  // With no workspace or with root as /app
  WorkspaceContext.setWorkspace('');
  const searchNoWs = await searchTool.execute({ query: 'WorkspaceContext' });
  assert.strictEqual(searchNoWs.success, false);
  assert.match(searchNoWs.error || '', /No project is currently opened/);

  // workspaceManager select must reject agent root
  await assert.rejects(
    async () => await workspaceManager.select('/app'),
    (err: any) => {
      assert.match(err.message, /Access denied: Reading or selecting the AI agent's root project is strictly prohibited/);
      return true;
    },
    'workspaceManager.select must reject agent root'
  );
  console.log('✅ PASS: All inspection and workspace tools strictly enforce Rule 1\n');

  // Test 3: Rule 2 - Opened Project Priority & Other Local Machine Directory Access
  console.log('Test 3: Rule 2 - Opened Project Priority and Local Machine Access Rules');
  const userProjectPath = '/host/Desktop/projects/personal/withgod';
  
  // Set opened project
  WorkspaceContext.setWorkspace(userProjectPath);
  assert.strictEqual(WorkspaceContext.getRoot(), userProjectPath);
  assert.strictEqual(WorkspaceContext.hasActiveWorkspace(), true);

  // Relative path or path inside opened project must pass
  const accessInWorkspace = WorkspaceContext.validatePathAccess('package.json', false);
  assert.strictEqual(accessInWorkspace.allowed, true);
  assert.strictEqual(accessInWorkspace.resolvedPath, path.join(userProjectPath, 'package.json'));

  // Path outside opened project without explicit user request must be blocked under Rule 2 priority
  const otherLocalPath = '/host/Desktop/projects/personal/other-project/file.ts';
  const accessWithoutExplicit = WorkspaceContext.validatePathAccess(otherLocalPath, false);
  assert.strictEqual(accessWithoutExplicit.allowed, false);
  assert.match(accessWithoutExplicit.error || '', /The opened project is the priority to read/);

  // Path outside opened project WITH explicit user request on local machine is allowed
  const accessWithExplicit = WorkspaceContext.validatePathAccess(otherLocalPath, true);
  assert.strictEqual(accessWithExplicit.allowed, true);
  assert.strictEqual(accessWithExplicit.resolvedPath, otherLocalPath);

  // Even with explicit request, accessing agent root is strictly forbidden
  const accessExplicitAgentRoot = WorkspaceContext.validatePathAccess('/app/package.json', true);
  assert.strictEqual(accessExplicitAgentRoot.allowed, false);
  assert.match(accessExplicitAgentRoot.error || '', /strictly prohibited/);

  console.log('✅ PASS: Rule 2 guarantees priority to opened project and limits other directories\n');

  // Test 4: Agent Conversational Refusal of Root Project
  console.log('Test 4: Agent Chat Response when user or prompt asks to read root project');
  const dummyProvider: any = {
    chat: async () => ({ content: 'mock' }),
    complete: async () => 'mock',
  };
  const agent = new Agent(dummyProvider);

  const response1 = await agent.processRequest('read root project files', () => {});
  assert.match(response1, /prohibited to prevent confusion/i);
  assert.match(response1, /local machine/i);

  const response2 = await agent.processRequest('inspect the files in /app', () => {});
  assert.match(response2, /prohibited to prevent confusion/i);

  console.log('✅ PASS: Agent conversational replies correctly refuse reading root project\n');

  console.log('================================================================');
  console.log('All Workspace Rules (Rule 1 & Rule 2) Passed Successfully!');
  console.log('================================================================');
}

runRuleTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
