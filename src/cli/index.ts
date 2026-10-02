import { Command } from 'commander';
import inquirer from 'inquirer';
import { OllamaProvider } from '../llm/ollama.js';
import { Agent } from '../agent/agent.js';
import { toolRegistry } from '../tools/registry.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadFileRangeTool } from '../tools/read-file-range.js';
import { SearchFilesTool } from '../tools/search.js';
import { SemanticSearchTool } from '../tools/semantic-search.js';
import { FindSymbolTool } from '../tools/find-symbol.js';
import { WriteFileTool } from '../tools/write-file.js';
import { LintTool } from '../tools/lint.js';
import { EditFileTool } from '../tools/edit-file.js';
import { ShellTool } from '../tools/shell.js';
import { WeatherTool } from '../tools/weather.js';
import {
  GitStatusTool,

  GitDiffTool, 
  GitLogTool, 
  GitBranchTool, 
  GitCommitTool 
} from '../tools/git.js';
import { SkillLoader } from '../skills/loader.js';
import { MCPClient, MCPToolProxy } from '../tools/mcp.js';
import chalk from 'chalk';

async function main() {
  const program = new Command();
  
  // Load Skills
  await SkillLoader.loadAll();

  // Register Native tools
  toolRegistry.registerTool(new ReadFileTool());
  toolRegistry.registerTool(new ReadFileRangeTool());
  toolRegistry.registerTool(new SearchFilesTool());
  toolRegistry.registerTool(new SemanticSearchTool());
  toolRegistry.registerTool(new FindSymbolTool());
  toolRegistry.registerTool(new WriteFileTool());
  toolRegistry.registerTool(new LintTool());
  toolRegistry.registerTool(new EditFileTool());
  toolRegistry.registerTool(new ShellTool());
  toolRegistry.registerTool(new WeatherTool());

  // Register Git tools
  toolRegistry.registerTool(new GitStatusTool());
  toolRegistry.registerTool(new GitDiffTool());
  toolRegistry.registerTool(new GitLogTool());
  toolRegistry.registerTool(new GitBranchTool());
  toolRegistry.registerTool(new GitCommitTool());

  // Setup MCP
  const mcpClient = new MCPClient();
  await mcpClient.connect('default-server', {});
  const mcpTools = await mcpClient.listTools('default-server');
  
  for (const toolDef of mcpTools) {
    if (toolDef.name === 'mcp_get_weather') continue; // Skip mock MCP weather in favor of native tool
    toolRegistry.registerTool(new MCPToolProxy(
      toolDef.name,
      toolDef.description,
      toolDef.inputSchema,
      { callTool: (name: string, args: any) => mcpClient.callTool('default-server', name, args) }
    ));
  }

  const provider = new OllamaProvider();
  const agent = new Agent(provider);

  program
    .name('myagent')
    .description('A Claude-style AI coding agent')
    .version('0.1.0');

  program
    .argument('[message]', 'Initial message to the agent')
    .action(async (message) => {
      if (message) {
        await handleMessage(message, agent);
      }
      await startInteractiveMode(agent);
    });

  program.parse();
}

async function handleMessage(text: string, agent: Agent) {
  if (text.startsWith('/')) {
    const command = text.slice(1).toLowerCase();
    switch (command) {
      case 'exit':
        process.exit(0);
      case 'clear':
        agent.clearHistory();
        console.log(chalk.yellow('\nConversation cleared.'));
        return;
      case 'help':
        console.log(chalk.cyan('\nAvailable commands:'));
        console.log('/help   - Show this help');
        console.log('/clear  - Clear conversation history');
        console.log('/exit   - Exit the agent');
        console.log('/status - Show agent status');
        console.log('/tools  - List available tools');
        console.log('/model  - Show current model');
        return;
      case 'status':
        console.log(chalk.green('\nAgent Status: Online\nProvider: Ollama'));
        return;
      case 'tools':
        const tools = toolRegistry.getAllTools();
        console.log(chalk.green('\nAvailable Tools:'));
        tools.forEach(t => console.log(`- ${t.name}: ${t.description}`));
        return;
      case 'model':
        console.log(chalk.green('\nModel: llama3 (default)'));
        return;
      default:
        console.log(chalk.red(`\nUnknown command: /${command}`));
        return;
    }
  }

  process.stdout.write(chalk.bold('Agent: '));
  
  try {
    const response = await agent.processRequest(text, async (step) => {
      process.stdout.write(`\n${chalk.dim(step)}\n`);
    });
    process.stdout.write(response + '\n');
  } catch (error: any) {
    console.log(chalk.red(`\nError: ${error.message}`));
  }
}

async function startInteractiveMode(agent: Agent) {
  while (true) {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: 'You:',
      },
    ]);

    if (!input) continue;
    await handleMessage(input, agent);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
