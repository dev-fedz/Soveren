import { agentPermissionManager } from '../src/permissions/agentPermissionManager.js';
import { globalWorkspaceState } from '../src/workspace/workspaceState.js';
import { initializeToolsAndSkills } from '../src/tools/init.js';
import { toolRegistry } from '../src/tools/registry.js';
import { WorkspaceContext } from '../src/context/workspaceContext.js';

async function runTest() {
  console.log('=== Test Suite 3: Human-in-the-Loop Permissions & Pause/Resume ===');
  WorkspaceContext.setWorkspace(process.cwd());
  await initializeToolsAndSkills();

  // 1. Verify Permission Creation and Agent Status Transition to waiting_for_user
  console.log('\n--- 1. Testing Permission Request & State Pause ---');
  let receivedEvent: any = null;
  const unsubscribe = agentPermissionManager.onRequest((req) => {
    receivedEvent = req;
  });

  const requestPromise = agentPermissionManager.requestPermission({
    type: 'credential',
    title: 'Authentication Required',
    explanation: 'The application requires database admin credentials to execute integration tests.',
    required: true,
    fields: [
      { name: 'username', label: 'Admin Username', type: 'text', placeholder: 'admin' },
      { name: 'password', label: 'Admin Password', type: 'password', placeholder: '••••••••' },
    ],
  });

  // Check state immediately
  const state = globalWorkspaceState.getState();
  if (state.status !== 'waiting_for_user') {
    throw new Error(`Expected agent status 'waiting_for_user', got '${state.status}'`);
  }
  console.log('✓ Agent execution paused with status "waiting_for_user"');

  const pendingList = agentPermissionManager.getPendingRequests();
  if (pendingList.length !== 1) {
    throw new Error(`Expected 1 pending request, got ${pendingList.length}`);
  }
  const pendingReq = pendingList[0];
  if (pendingReq.type !== 'credential' || !receivedEvent || receivedEvent.id !== pendingReq.id) {
    throw new Error('Pending request event or data mismatch');
  }
  console.log(`✓ Permission request active (id: ${pendingReq.id}, title: "${pendingReq.title}")`);

  // 2. Simulate User Providing Credentials (Resume Flow)
  console.log('\n--- 2. Testing User Response & Secure Credential Vaulting ---');
  const userSubmission = {
    username: 'admin@bioeight.com',
    password: 'super_secret_password_12345',
  };

  // User submits credentials
  agentPermissionManager.respond(pendingReq.id, true, userSubmission);

  const responseResult = await requestPromise;
  if (!responseResult.approved) {
    throw new Error('Expected permission to be approved');
  }

  // Verify that secrets are vaulted and masked from the model
  const maskedPassword = responseResult.data?.password;
  if (maskedPassword !== '••••••••') {
    throw new Error(`Expected password to be masked ('••••••••'), got '${maskedPassword}'`);
  }
  console.log('✓ Model response data masked password securely ("••••••••")');

  // Verify secure vault access for runtime execution
  const vaultedSecret = agentPermissionManager.getVaultedCredential(`${pendingReq.id}_password`);
  if (vaultedSecret !== 'super_secret_password_12345') {
    throw new Error(`Vault failed to retain unmasked secret. Got: ${vaultedSecret}`);
  }
  console.log('✓ Real secret stored securely in runtime vault without exposure');

  // Verify agent status transitioned back to working
  const resumedState = globalWorkspaceState.getState();
  if (resumedState.status !== 'working') {
    throw new Error(`Expected agent status to resume to 'working', got '${resumedState.status}'`);
  }
  console.log('✓ Agent resumed execution with status "working"');

  // 3. Test User Cancellation Flow
  console.log('\n--- 3. Testing User Denial / Cancellation Flow ---');
  const cancelPromise = agentPermissionManager.requestPermission({
    type: 'destructive_action',
    title: 'Drop Production Database Tables',
    explanation: 'Agent requests permission to truncate users table.',
    required: true,
  });

  const secondPending = agentPermissionManager.getPendingRequests();
  if (secondPending.length !== 1) throw new Error('Expected 1 pending request for cancellation test');

  agentPermissionManager.respond(secondPending[0].id, false);
  const cancelResult = await cancelPromise;
  if (cancelResult.approved) {
    throw new Error('Expected denied permission result to have approved: false');
  }
  console.log('✓ Denied permission handled properly with approved: false');

  // 4. Test request_user_input Tool in ToolRegistry
  console.log('\n--- 4. Testing request_user_input Tool via Registry ---');
  const requestTool = toolRegistry.getTool('request_user_input')!;
  if (!requestTool) throw new Error('request_user_input tool not found in registry');

  // Execute tool in async manner
  let toolResultOutput: any = null;
  const toolExecPromise = requestTool.execute({
    title: 'Verify 2FA Token',
    explanation: 'Please enter the 6-digit authenticator code.',
    type: 'otp',
    fields: [{ name: 'otp_code', label: '6-Digit Code', type: 'text' }],
  }).then((res) => {
    toolResultOutput = res;
  });

  // Wait a tick for request to register
  await new Promise((r) => setTimeout(r, 20));
  const otpPending = agentPermissionManager.getPendingRequests();
  if (otpPending.length !== 1) throw new Error('Expected OTP request to be pending');

  // Simulate user providing OTP
  agentPermissionManager.respond(otpPending[0].id, true, { otp_code: '849201' });
  await toolExecPromise;

  if (!toolResultOutput || !toolResultOutput.success) {
    throw new Error(`request_user_input tool execution failed: ${toolResultOutput?.error}`);
  }
  if (!toolResultOutput.content.includes('849201')) {
    throw new Error(`Expected tool output to contain submitted OTP, got: ${toolResultOutput.content}`);
  }
  console.log('✓ request_user_input tool completed end-to-end with user response');

  unsubscribe();
  console.log('\n✅ All Human-in-the-Loop Permission & Pause/Resume tests passed successfully!\n');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
