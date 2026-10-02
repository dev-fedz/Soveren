import assert from 'assert';
import { ActivityTracker } from '../src/agent/activityTracker.js';

console.log('--- Running Workspace Task Isolation Tests ---');

// Test 1: Task session is tied to specific workspace
const tracker = new ActivityTracker();
const projectWs = '/Users/fedz/projects/my-app';

const session = tracker.startSession('Build Feature A', { provider: 'Ollama', name: 'qwen2.5-coder:7b' }, projectWs);
assert.strictEqual(session.workspace, projectWs, 'Session workspace should match project path');
assert.strictEqual(session.taskTitle, 'Build Feature A');

tracker.startActivity({
  type: 'reasoning',
  title: 'Thought for 1s',
  model: { provider: 'Ollama', name: 'gemma4:31b-cloud' },
});
assert.strictEqual(tracker.getSession().activities.length, 1, 'Should have 1 activity');

// Test 2: New Task / Reset Session clears activities and resets to idle
const resetSession = tracker.resetSession('Task Workflow', projectWs);
assert.strictEqual(resetSession.activities.length, 0, 'Reset session should have 0 activities');
assert.strictEqual(resetSession.status, 'idle', 'Reset session should be idle');
assert.strictEqual(resetSession.changedFiles.length, 0, 'Reset session should have 0 changed files');
assert.strictEqual(resetSession.workspace, projectWs, 'Reset session preserves target workspace');

// Test 3: Closing project (clearing workspace) resets session to global with 0 activities
const globalSession = tracker.resetSession('Task Workflow', '__global__');
assert.strictEqual(globalSession.workspace, '__global__');
assert.strictEqual(globalSession.activities.length, 0);

console.log('✓ All Workspace Task Isolation Tests Passed!');
