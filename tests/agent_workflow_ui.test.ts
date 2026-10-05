import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ActivityTracker } from '../src/agent/activityTracker';
import { WorkflowRouter } from '../src/agent/workflowRouter';
import { settingsManager } from '../src/config/settingsManager';
import { Agent } from '../src/agent/agent';
import { WorkspaceContext } from '../src/context/workspaceContext';

const TEST_DIR = path.resolve(process.cwd(), 'tmp_test_workflow');

async function runTests() {
  console.log('--- Running Agent Workflow & Activity UI Tests (Sections 30-62) ---');

  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  const tracker = new ActivityTracker();

  // Test 1: Session Lifecycle & Task Header (Section 50, 51)
  console.log('Test 1: Session Lifecycle & Task Header');
  const session = tracker.startSession('Refactor Search Architecture');
  assert.strictEqual(session.taskTitle, 'Refactor Search Architecture');
  assert.strictEqual(session.status, 'planning');
  assert.strictEqual(session.activities.length, 0);
  console.log('✓ Session initialized with correct task header and planning status');

  // Test 2: Planning Activity with Model Badge (Section 46, 47)
  console.log('Test 2: Planning Activity with Model Badge');
  const planAct = tracker.startActivity('planning', '📋 Planning', {
    description: 'Analyzing project structure and determining implementation steps...',
    model: { provider: 'Ollama', name: 'gemma4:31b-cloud' },
  });
  assert.strictEqual(planAct.status, 'running');
  assert.strictEqual(planAct.model?.name, 'gemma4:31b-cloud');

  tracker.completeActivity(planAct.id, {
    description: '5 implementation steps determined',
  });
  const completedPlan = tracker.getSession().activities.find((a) => a.id === planAct.id);
  assert.strictEqual(completedPlan?.status, 'completed');
  assert.strictEqual(completedPlan?.description, '5 implementation steps determined');
  console.log('✓ Planning activity completed with model badge and step count');

  // Test 3: Safe Reasoning Activity (Section 45)
  console.log('Test 3: Safe Reasoning Activity');
  const reasonAct = tracker.startActivity('reasoning', '🧠 Thought for 1s', {
    description: 'Analyzing existing tool architecture before modifying the search implementation.',
    model: { provider: 'Ollama', name: 'gemma4:31b-cloud' },
  });
  tracker.completeActivity(reasonAct.id);
  const completedReason = tracker.getSession().activities.find((a) => a.id === reasonAct.id);
  assert.strictEqual(completedReason?.status, 'completed');
  assert.strictEqual(completedReason?.model?.name, 'gemma4:31b-cloud');
  assert.strictEqual(completedReason?.model?.provider, 'Ollama');
  assert.strictEqual(
    completedReason?.description,
    'Analyzing existing tool architecture before modifying the search implementation.'
  );
  console.log('✓ Safe reasoning summary recorded with gemma4:31b-cloud model badge');

  // Test 4: File Exploration Activity (Section 33)
  console.log('Test 4: File Exploration Activity');
  const exploreAct = tracker.startActivity('exploring', '📄 Explored 3 files', {
    file: {
      path: 'src/agent/agent.ts',
      exploredFiles: ['src/agent/agent.ts', 'src/tools/search.ts', 'backend/src/server.ts'],
    },
  });
  tracker.completeActivity(exploreAct.id);
  const completedExplore = tracker.getSession().activities.find((a) => a.id === exploreAct.id);
  assert.strictEqual(completedExplore?.file?.exploredFiles?.length, 3);
  console.log('✓ File exploration recorded with expandable list of explored files');

  // Test 5: Real File Change & Diff Calculation (Section 35, 36, 37)
  console.log('Test 5: Real File Change & Diff Calculation');
  const targetFile = path.join(TEST_DIR, 'search.ts');
  const originalCode = 'function search(query: string) {\n  return false;\n}\n';
  const modifiedCode = 'function search(query: string) {\n  const results = performSearch(query);\n  return results.length > 0;\n}\n';

  fs.writeFileSync(targetFile, originalCode, 'utf-8');

  // Test review_after_task approval mode
  tracker.setApprovalMode('review_after_task');
  const changedFile = tracker.recordFileChange(targetFile, originalCode, modifiedCode);
  fs.writeFileSync(targetFile, modifiedCode, 'utf-8');

  assert.ok(targetFile.endsWith(changedFile.path), 'Path should match relative workspace path');
  assert.ok(changedFile.additions > 0, 'Should have positive additions count');
  assert.ok(changedFile.diff?.includes('+'), 'Diff should contain added lines');
  assert.strictEqual(changedFile.status, 'pending');

  const sessAfterEdit = tracker.getSession();
  assert.strictEqual(sessAfterEdit.changedFiles.length, 1);
  assert.strictEqual(sessAfterEdit.pendingChanges.length, 1);
  console.log(`✓ Real file change recorded: +${changedFile.additions} -${changedFile.deletions}`);

  // Test 6: Command Execution and Grouping (Section 41, 42)
  console.log('Test 6: Command Execution and Grouping');
  const cmdAct = tracker.startActivity('command', '▶ Running 2 commands', {
    command: {
      command: 'npm run typecheck && npm test',
      commands: [
        { command: 'npm run typecheck', status: 'completed', exitCode: 0, duration: 1.2 },
        { command: 'npm test', status: 'running' },
      ],
    },
  });
  tracker.completeActivity(cmdAct.id, {
    title: '✓ Commands completed',
    command: {
      command: 'npm run typecheck && npm test',
      exitCode: 0,
      duration: 3.5,
      commands: [
        { command: 'npm run typecheck', status: 'completed', exitCode: 0, duration: 1.2 },
        { command: 'npm test', status: 'completed', exitCode: 0, duration: 2.3 },
      ],
      stdout: 'PASS tests/agent_tools.test.ts\n8 tests passed, 0 failed',
    },
  });
  const completedCmd = tracker.getSession().activities.find((a) => a.id === cmdAct.id);
  assert.strictEqual(completedCmd?.command?.commands?.length, 2);
  assert.strictEqual(completedCmd?.command?.exitCode, 0);
  console.log('✓ Grouped command execution recorded with expandable sub-items and exit codes');

  // Test 7: Test Activity (Section 43)
  console.log('Test 7: Test Activity');
  const testAct = tracker.startActivity('test', '✓ Tests passed', {
    status: 'completed',
    model: { provider: 'Ollama', name: 'qwen2.5-coder:7b' },
    test: {
      testFile: 'tests/agent_tools.test.ts',
      passed: 8,
      failed: 0,
      output: 'All tests passed successfully',
    },
  });
  const completedTest = tracker.getSession().activities.find((a) => a.id === testAct.id);
  assert.strictEqual(completedTest?.test?.passed, 8);
  assert.strictEqual(completedTest?.test?.failed, 0);
  console.log('✓ Dedicated test activity verified with passed/failed counts and model indicator');

  // Test 8: Accept / Reject Changes on Disk (Section 38, 39)
  console.log('Test 8: Accept / Reject Changes on Disk');
  // First reject the change -> original content must be restored on disk!
  await tracker.rejectChange(changedFile.path);
  const diskRestored = fs.readFileSync(targetFile, 'utf-8');
  assert.strictEqual(diskRestored, originalCode, 'Reject change MUST restore original content on disk');

  const sessAfterReject = tracker.getSession();
  const fileState = sessAfterReject.changedFiles.find((f) => f.path === changedFile.path);
  assert.strictEqual(fileState?.status, 'rejected');
  assert.strictEqual(sessAfterReject.pendingChanges.length, 0);
  console.log('✓ Reject change correctly reverted file on disk to original state');

  // Re-apply and accept
  tracker.recordFileChange(targetFile, originalCode, modifiedCode);
  fs.writeFileSync(targetFile, modifiedCode, 'utf-8');
  await tracker.acceptChange(changedFile.path);
  assert.strictEqual(fs.readFileSync(targetFile, 'utf-8'), modifiedCode);
  const sessAfterAccept = tracker.getSession();
  assert.strictEqual(sessAfterAccept.changedFiles.find((f) => f.path === changedFile.path)?.status, 'accepted');
  console.log('✓ Accept change preserved modified content on disk and marked accepted');

  // Test 9: Cancel / Stop Preservation (Section 52, 53)
  console.log('Test 9: Cancel / Stop Preservation');
  tracker.startSession('Ongoing Coding Task');
  tracker.startActivity('editing', '✏ Editing search.ts', {
    file: { path: targetFile, additions: 10, deletions: 2 },
  });
  assert.strictEqual(tracker.isAborted(), false);
  tracker.abort();
  assert.strictEqual(tracker.isAborted(), true);
  assert.strictEqual(tracker.getSession().status, 'idle');
  // Completed activities and changes must still be preserved
  assert.ok(tracker.getSession().activities.length > 0);
  console.log('✓ Stop/Cancel aborts agent while preserving all recorded activities and state');

  // Test 10: Multi-Model Workflow Routing (Section 47, 59, 60)
  console.log('Test 10: Multi-Model Workflow Routing');
  const router = new WorkflowRouter();
  const planModel = router.resolveModelForPhase('planning');
  const reasonModel = router.resolveModelForPhase('reasoning');
  const codeModel = router.resolveModelForPhase('coding');
  const reviewModel = router.resolveModelForPhase('review');
  const testModel = router.resolveModelForPhase('testing');

  assert.strictEqual(planModel, 'gemma4:31b-cloud');
  assert.strictEqual(reasonModel, 'gemma4:31b-cloud');
  assert.strictEqual(codeModel, 'qwen2.5-coder:7b');
  assert.strictEqual(reviewModel, 'qwen2.5-coder:7b');
  assert.strictEqual(testModel, 'qwen2.5-coder:7b');

  // Overriding routing
  router.setWorkflowRouting({
    planningModel: 'claude-3-7-sonnet-20250219',
    codingModel: 'gpt-4o',
  });
  assert.strictEqual(router.resolveModelForPhase('planning'), 'claude-3-7-sonnet-20250219');
  assert.strictEqual(router.resolveModelForPhase('coding'), 'gpt-4o');
  console.log('✓ Workflow routing correctly assigns default and custom models per phase');

  // Test 11: Actual Thoughts & Reasoning Extraction
  console.log('Test 11: Actual Thoughts & Reasoning Extraction');
  const agentInstance = new Agent();
  const agentAny = agentInstance as any;

  // 11.1 Native thinking extraction
  const nativeThinking = 'In the history, the user asked about Django.\n- The user might be testing responsiveness.\n- Formulating polite response.';
  const extractedNative = agentAny.extractActualReasoning('Hello there!', nativeThinking);
  assert.strictEqual(extractedNative, nativeThinking, 'Should preserve full native thinking content');

  // 11.2 <think> tag extraction
  const thinkContent = '<think>\nReviewing project workspace and dependencies.\n- Need to inspect package.json first.\n- Avoid premature file modifications.\n</think>\n[read_file: {"path": "package.json"}]';
  const extractedThink = agentAny.extractActualReasoning(thinkContent);
  assert.ok(extractedThink?.includes('- Need to inspect package.json first.'), 'Should extract full <think> content');
  assert.ok(extractedThink?.includes('- Avoid premature file modifications.'), 'Should preserve all bullet points');

  // 11.3 Contextual reasoning synthesis
  const synth = agentAny.synthesizeContextualReasoning('inspect package.json', '[read_file: {"path": "package.json"}]', 'planner-agent');
  assert.ok(synth.includes('- Active workspace is "planner-agent"'), 'Should reflect workspace context');
  assert.ok(synth.includes('inspecting "package.json"'), 'Should reflect tool decision and target file');
  console.log('✓ Actual thoughts and reasoning extraction verified');

  // Cleanup test files
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  console.log('\n======================================================');
  console.log('ALL AGENT WORKFLOW & UI TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
