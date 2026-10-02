import { initializeToolsAndSkills } from '../src/tools/init.js';
import { toolRegistry } from '../src/tools/registry.js';
import { WorkspaceContext } from '../src/context/workspaceContext.js';
import { Agent } from '../src/agent/agent.js';
import { LLMProvider, Message } from '../src/llm/types.js';

class MockLLMProvider implements LLMProvider {
  private callCount = 0;

  async chat(messages: Message[]): Promise<{ content: string }> {
    this.callCount++;
    if (this.callCount === 1) {
      // First turn: model decides to use read_file tool to read package.json
      return { content: 'I will inspect the package.json to see the project configuration.\n\n[read_file: {"path": "package.json"}]' };
    }
    // Second turn: model observes the file content and responds to the user
    const lastMsg = messages[messages.length - 1];
    return { content: `I have successfully read the package.json. Here is the summary:\n${lastMsg.content.slice(0, 100)}...` };
  }
}

async function runTest() {
  console.log('--- Testing Agent Tool Registration and Execution ---');
  WorkspaceContext.setWorkspace(process.cwd());

  // 1. Initialize tools
  await initializeToolsAndSkills();

  const tools = toolRegistry.getAllTools();
  console.log(`Registered tools count: ${tools.length}`);
  if (tools.length < 15) {
    throw new Error(`Expected at least 15 tools, got ${tools.length}`);
  }

  // 2. Verify key tools exist
  const expectedTools = [
    'read_file',
    'read_file_range',
    'search_files',
    'find_symbol',
    'write_file',
    'edit_file',
    'run_command',
    'execute_command',
    'format_code',
    'git_status',
  ];

  for (const name of expectedTools) {
    const t = toolRegistry.getTool(name);
    if (!t) throw new Error(`Missing expected tool: ${name}`);
    console.log(`✓ Tool found: ${name} (${t.description.slice(0, 40)}...)`);
  }

  // 3. Test direct tool execution
  const readTool = toolRegistry.getTool('read_file')!;
  const readResult = await readTool.execute({ path: 'package.json' });
  if (!readResult.success || !readResult.content.includes('"name": "my-agent"')) {
    throw new Error('read_file failed to read package.json');
  }
  console.log('✓ read_file tool execution verified on package.json');

  // 4. Test search_files
  const searchTool = toolRegistry.getTool('search_files')!;
  const searchResult = await searchTool.execute({ pattern: 'my-agent' });
  if (!searchResult.success || !searchResult.content.includes('my-agent')) {
    throw new Error('search_files failed to find my-agent');
  }
  console.log('✓ search_files tool execution verified');

  // 5. Test execute_command / run_command
  const execTool = toolRegistry.getTool('execute_command')!;
  const execResult = await execTool.execute({ command: 'echo "TEST_OK"' });
  if (!execResult.success || !execResult.content.includes('TEST_OK')) {
    throw new Error('execute_command failed to run echo');
  }
  console.log('✓ execute_command tool execution verified');

  // 6. Test Agent end-to-end tool loop with MockLLMProvider
  const stepsRecorded: string[] = [];
  const mockProvider = new MockLLMProvider();
  const agent = new Agent(mockProvider);
  agent.isInteractive = false;

  const agentResponse = await agent.processRequest(
    'Please inspect package.json',
    (step) => stepsRecorded.push(step)
  );

  console.log('Recorded steps:', stepsRecorded);
  if (!stepsRecorded.some(s => s.includes('Calling tool: read_file'))) {
    throw new Error('Agent failed to record tool calling step');
  }

  if (!agentResponse.includes('successfully read the package.json')) {
    throw new Error(`Unexpected agent response: ${agentResponse}`);
  }
  console.log('✓ Agent end-to-end tool execution and observation loop verified!');

  console.log('\n=============================================');
  console.log('ALL AGENT TOOL REGISTRATION & EXECUTION TESTS PASSED! 🎉');
  console.log('=============================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
