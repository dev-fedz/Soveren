import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { detectIntent } from '../backend/src/intent.js';
import { workspaceManager } from '../backend/src/workspace.js';
import { WorkspaceContext } from '../src/context/workspaceContext.js';
import { ReadFileTool } from '../src/tools/read-file.js';
import { WriteFileTool } from '../src/tools/write-file.js';
import { EditFileTool } from '../src/tools/edit-file.js';

async function runTests() {
  console.log('--- Running Intent Detection Tests ---');

  // 1. Normal Chat
  const chat1 = detectIntent('Hi', false);
  assert.strictEqual(chat1.intent, 'CHAT', 'Hi should be CHAT');

  const chat2 = detectIntent('Explain React hooks', false);
  assert.strictEqual(chat2.intent, 'CHAT', 'Explain React hooks should be CHAT');

  const chat3 = detectIntent('What framework should I use for a dashboard?', false);
  assert.strictEqual(chat3.intent, 'CHAT', 'What framework should I use for a dashboard? should be CHAT');

  const chat4 = detectIntent('What is dependency injection?', true);
  assert.strictEqual(chat4.intent, 'CHAT', 'Informational question with active workspace should be CHAT');

  // 2. New Project
  const new1 = detectIntent('Build a React app', false);
  assert.strictEqual(new1.intent, 'NEW_PROJECT', 'Build a React app should be NEW_PROJECT');

  const new2 = detectIntent('Create a todo application', false);
  assert.strictEqual(new2.intent, 'NEW_PROJECT', 'Create a todo application should be NEW_PROJECT');

  const new3 = detectIntent('Start a new Next.js project', false);
  assert.strictEqual(new3.intent, 'NEW_PROJECT', 'Start a new Next.js project should be NEW_PROJECT');

  const new4 = detectIntent('Build me a SaaS dashboard', false);
  assert.strictEqual(new4.intent, 'NEW_PROJECT', 'Build me a SaaS dashboard should be NEW_PROJECT');

  // Follow-up conversation transition
  const history = [
    { role: 'user', content: 'What framework should I use for a dashboard?' },
    { role: 'agent', content: 'React, Vue, and Svelte are all great options for building a dashboard.' },
  ];
  const followUp = detectIntent('Okay, build it with React', false, history);
  assert.strictEqual(followUp.intent, 'NEW_PROJECT', 'Follow-up "Okay, build it with React" should be NEW_PROJECT');

  // 3. Existing Project
  const ex1 = detectIntent('Fix the login bug', false);
  assert.strictEqual(ex1.intent, 'EXISTING_PROJECT', 'Fix the login bug should be EXISTING_PROJECT');

  const ex2 = detectIntent('Add authentication', false);
  assert.strictEqual(ex2.intent, 'EXISTING_PROJECT', 'Add authentication should be EXISTING_PROJECT');

  const ex3 = detectIntent('Refactor the API', false);
  assert.strictEqual(ex3.intent, 'EXISTING_PROJECT', 'Refactor the API should be EXISTING_PROJECT');

  const ex4 = detectIntent('Fix the navbar', false);
  assert.strictEqual(ex4.intent, 'EXISTING_PROJECT', 'Fix the navbar should be EXISTING_PROJECT');

  const ex5 = detectIntent('Add a settings page', true);
  assert.strictEqual(ex5.intent, 'EXISTING_PROJECT', 'Add a settings page with active workspace should be EXISTING_PROJECT');

  console.log('✓ All Intent Detection tests passed!');

  console.log('\n--- Running Workspace Manager Tests ---');

  // Project name sanitization
  assert.strictEqual(
    workspaceManager.sanitizeProjectName('Task Management App!!!'),
    'task-management-app',
    'Project name should be sanitized to kebab-case without symbols'
  );
  assert.strictEqual(
    workspaceManager.sanitizeProjectName('Next.js E-commerce 2026'),
    'nextjs-e-commerce-2026',
    'Dots should be stripped and spaces converted to single hyphens'
  );

  // Project name generation
  const generated = workspaceManager.generateProjectName('Build me a task management app');
  assert.strictEqual(generated, 'task-management-app', 'Generated name should match');

  // Test temporary workspace directory creation & selection
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-test-'));
  try {
    // Select workspace
    const selectedState = await workspaceManager.select(tempDir);
    assert.strictEqual(selectedState.path, tempDir);
    assert.strictEqual(selectedState.initialized, true);
    assert.strictEqual(WorkspaceContext.getRoot(), tempDir);
    assert.strictEqual(WorkspaceContext.hasActiveWorkspace(), true);

    // Create new project within parent
    const createdState = await workspaceManager.create(tempDir, 'my-test-app');
    assert.strictEqual(createdState.name, 'my-test-app');
    assert.strictEqual(createdState.initialized, true);
    const expectedAppPath = path.join(tempDir, 'my-test-app');
    assert.strictEqual(createdState.path, expectedAppPath);
    assert.strictEqual(WorkspaceContext.getRoot(), expectedAppPath);

    // Existing directory detection: attempting to create again should not overwrite
    const existingCheck = await workspaceManager.create(tempDir, 'my-test-app');
    assert.strictEqual(existingCheck.initialized, false, 'Existing directory should return initialized=false');

    // Path security
    assert.strictEqual(workspaceManager.validatePathSecurity(path.join(expectedAppPath, 'src/App.tsx')), true);
    assert.strictEqual(workspaceManager.validatePathSecurity('/etc/passwd'), false);
    assert.strictEqual(workspaceManager.validatePathSecurity(path.join(tempDir, '../outside')), false);

    console.log('✓ All Workspace Manager tests passed!');

    console.log('\n--- Running Tools with WorkspaceContext Tests ---');

    // Test WriteFileTool
    const writeTool = new WriteFileTool();
    const writeRes = await writeTool.execute({
      path: 'src/index.ts',
      content: 'console.log("Hello workspace!");\nconst value = 42;\n',
    });
    assert.strictEqual(writeRes.success, true);
    const writtenFile = path.join(expectedAppPath, 'src/index.ts');
    const writtenContent = await fs.readFile(writtenFile, 'utf8');
    assert.strictEqual(writtenContent.includes('Hello workspace!'), true);

    // Test ReadFileTool
    const readTool = new ReadFileTool();
    const readRes = await readTool.execute({ path: 'src/index.ts' });
    assert.strictEqual(readRes.success, true);
    assert.strictEqual(readRes.content.includes('const value = 42;'), true);

    // Test EditFileTool
    const editTool = new EditFileTool();
    const editRes = await editTool.execute({
      path: 'src/index.ts',
      searchString: 'const value = 42;',
      replaceString: 'const value = 100;',
    });
    assert.strictEqual(editRes.success, true);
    const updatedContent = await fs.readFile(writtenFile, 'utf8');
    assert.strictEqual(updatedContent.includes('const value = 100;'), true);

    // Test Traversal Protection
    const hackRes = await writeTool.execute({
      path: '../../outside.txt',
      content: 'hacked',
    });
    assert.strictEqual(hackRes.success, false);
    assert.strictEqual(hackRes.error?.includes('Access denied'), true);

    const hackReadRes = await readTool.execute({
      path: '../../../../etc/hosts',
    });
    assert.strictEqual(hackReadRes.success, false);
    assert.strictEqual(hackReadRes.error?.includes('Access denied'), true);

    console.log('✓ All Tools & Security tests passed!');

    // Clear workspace
    workspaceManager.clear();
    assert.strictEqual(workspaceManager.isActive(), false);
    assert.strictEqual(WorkspaceContext.hasActiveWorkspace(), false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  console.log('\n========================================');
  console.log('ALL WORKSPACE & INTENT TESTS PASSED! 🎉');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
