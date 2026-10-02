import assert from 'assert';
import { getChatHistory, appendChatMessage } from '../backend/src/server.js';
import { workspaceManager } from '../backend/src/workspace.js';
import { Agent } from '../src/agent/agent.js';
import { LLMProvider, Message } from '../src/llm/types.js';

class MockLLMProvider implements LLMProvider {
  async chat(messages: Message[]): Promise<Message> {
    return { role: 'assistant', content: 'Mock response' };
  }
}

async function runTests() {
  console.log('--- Testing In-Memory Chat Cache Per Project & Normal Chat ---');

  // Clear workspace
  workspaceManager.clear();
  const mockAgent = new Agent(new MockLLMProvider());

  const projA = '/tmp/test_project_alpha';
  const projB = '/tmp/test_project_beta';

  // 1. Initial State: Normal Chat (No Project)
  console.log('Test 1: Global chat memory isolation');
  appendChatMessage({ role: 'user', content: 'Hello agent, what can you do?' }, '__global__');
  appendChatMessage({ role: 'agent', content: 'I am your AI coding assistant.' }, '__global__');

  const globalChat = getChatHistory('__global__');
  assert.strictEqual(globalChat.length, 2);
  assert.strictEqual(globalChat[0].content, 'Hello agent, what can you do?');

  // Verify Project A is empty
  const initialProjAChat = getChatHistory(projA);
  assert.strictEqual(initialProjAChat.length, 0, 'Scenario 1: Project A chat should be empty initially (new conversation)');

  // 2. Scenario 1: Open Project A
  console.log('Test 2: Open Project A and record conversation');
  appendChatMessage({ role: 'user', content: 'Can you inspect index.ts in Alpha?' }, projA);
  appendChatMessage({ role: 'agent', content: 'Sure, index.ts has 5 functions.' }, projA);

  const projAChat = getChatHistory(projA);
  assert.strictEqual(projAChat.length, 2);
  assert.strictEqual(projAChat[0].content, 'Can you inspect index.ts in Alpha?');

  // 3. Scenario 2: Close Project A -> Switch back to normal chat
  console.log('Test 3: Close project -> Normal chat is preserved and isolated');
  const globalAfterClose = getChatHistory('__global__');
  assert.strictEqual(globalAfterClose.length, 2);
  assert.strictEqual(globalAfterClose[0].content, 'Hello agent, what can you do?');
  assert.ok(!globalAfterClose.some(m => m.content.includes('Alpha')), 'Global chat must not contain Project A messages');

  // Add another message to normal chat
  appendChatMessage({ role: 'user', content: 'Tell me a joke.' }, '__global__');
  const updatedGlobal = getChatHistory('__global__');
  assert.strictEqual(updatedGlobal.length, 3);

  // 4. Open Project B
  console.log('Test 4: Open Project B -> Empty initial chat, isolated from A and Global');
  const projBChatInitial = getChatHistory(projB);
  assert.strictEqual(projBChatInitial.length, 0, 'Scenario 1: Project B has no chat yet, fresh conversation');

  appendChatMessage({ role: 'user', content: 'Build a Next.js app in Beta' }, projB);
  const projBChat = getChatHistory(projB);
  assert.strictEqual(projBChat.length, 1);
  assert.strictEqual(projBChat[0].content, 'Build a Next.js app in Beta');

  // 5. Reopen Project A -> Pulls previous chat conversation
  console.log('Test 5: Reopen Project A -> Pulls previous chat conversation');
  const reopenedProjAChat = getChatHistory(projA);
  assert.strictEqual(reopenedProjAChat.length, 2);
  assert.strictEqual(reopenedProjAChat[0].content, 'Can you inspect index.ts in Alpha?');

  // 6. Test Agent ContextManager multi-workspace memory
  console.log('Test 6: Agent ContextManager isolation');
  mockAgent.setWorkspace('__global__');
  mockAgent.setWorkspaceHistory([
    { role: 'user', content: 'Global message' }
  ], '__global__');

  mockAgent.setWorkspace(projA);
  mockAgent.setWorkspaceHistory([
    { role: 'user', content: 'Project Alpha message' }
  ], projA);

  assert.strictEqual(mockAgent.getWorkspaceHistory('__global__')[0].content, 'Global message');
  assert.strictEqual(mockAgent.getWorkspaceHistory(projA)[0].content, 'Project Alpha message');

  console.log('✓ All In-Memory Chat Cache Per Project tests passed successfully! 🎉');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
