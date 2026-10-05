import assert from 'assert';

// 1. Test task message review sanitization logic
function sanitizeTaskMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    const reviewTags = { ...(msg.fileReviewTags || {}) };
    let changedFiles = Array.isArray(msg.changedFiles) ? [...msg.changedFiles] : undefined;

    if (changedFiles && changedFiles.length > 0) {
      const reviewed = changedFiles.filter((f: any) => f && (f.status === 'accepted' || f.status === 'rejected'));
      for (const rf of reviewed) {
        if (rf.path) {
          reviewTags[rf.path] = rf.status;
        }
      }
    }

    if (changedFiles && Object.keys(reviewTags).length > 0) {
      changedFiles = changedFiles.filter((f: any) => {
        if (!f || !f.path) return false;
        const isReviewed = Object.keys(reviewTags).some(
          (p) => p === f.path || p.endsWith(f.path) || f.path.endsWith(p)
        );
        return !isReviewed;
      });
      if (changedFiles.length === 0) changedFiles = undefined;
    }

    return {
      ...msg,
      changedFiles,
      fileReviewTags: Object.keys(reviewTags).length > 0 ? reviewTags : undefined,
    };
  });
}

function updateMessageListWithFileReview(
  msgList: any[],
  filePath: string,
  status: 'accepted' | 'rejected'
): any[] {
  return msgList.map((msg) => {
    const hasFile = msg.changedFiles?.some(
      (f: any) => f.path === filePath || f.path.endsWith(filePath) || filePath.endsWith(f.path)
    );
    if (!hasFile) return msg;
    const remaining = (msg.changedFiles || []).filter(
      (f: any) => f.path !== filePath && !f.path.endsWith(filePath) && !filePath.endsWith(f.path)
    );
    const updatedTags = { ...(msg.fileReviewTags || {}), [filePath]: status };
    return {
      ...msg,
      changedFiles: remaining.length > 0 ? remaining : undefined,
      fileReviewTags: updatedTags,
    };
  });
}

function updateMessageListWithBulkReview(
  msgList: any[],
  paths: string[],
  status: 'accepted' | 'rejected'
): any[] {
  return msgList.map((msg) => {
    const hasAny = msg.changedFiles?.some(
      (f: any) => paths.length === 0 || paths.some((p: string) => f.path === p || f.path.endsWith(p) || p.endsWith(f.path))
    );
    if (!hasAny) return msg;
    const remaining = (msg.changedFiles || []).filter(
      (f: any) => paths.length > 0 && !paths.some((p: string) => f.path === p || f.path.endsWith(p) || p.endsWith(f.path))
    );
    const updatedTags = { ...(msg.fileReviewTags || {}) };
    const affectedFiles = paths.length > 0 ? paths : (msg.changedFiles || []).map((f: any) => f.path);
    for (const p of affectedFiles) {
      updatedTags[p] = status;
    }
    return {
      ...msg,
      changedFiles: remaining.length > 0 ? remaining : undefined,
      fileReviewTags: updatedTags,
    };
  });
}

async function runTests() {
  console.log('--- Testing Task History Review Persistence ---');

  // Test 1: Active message with a changed file
  const initialMessages = [
    { role: 'user', content: 'delete content of task.md' },
    {
      role: 'agent',
      content: 'The content of task.md has been successfully deleted.',
      changedFiles: [
        { path: 'task.md', additions: 0, deletions: 1165, status: 'pending' },
      ],
    },
  ];

  // Test 2: Accepting single change
  const acceptedMsgs = updateMessageListWithFileReview(initialMessages, 'task.md', 'accepted');
  const agentMsg = acceptedMsgs[1];
  assert.strictEqual(agentMsg.changedFiles, undefined, 'changedFiles should be undefined when all files accepted');
  assert.deepStrictEqual(agentMsg.fileReviewTags, { 'task.md': 'accepted' });
  console.log('✓ Accepting change cleanly removes file from changedFiles and adds accepted tag');

  // Test 3: Rejecting change
  const rejectedMsgs = updateMessageListWithFileReview(initialMessages, 'task.md', 'rejected');
  const agentMsgRej = rejectedMsgs[1];
  assert.strictEqual(agentMsgRej.changedFiles, undefined, 'changedFiles should be undefined when all files rejected');
  assert.deepStrictEqual(agentMsgRej.fileReviewTags, { 'task.md': 'rejected' });
  console.log('✓ Rejecting change cleanly removes file from changedFiles and adds rejected tag');

  // Test 4: Bulk accept
  const bulkAcceptedMsgs = updateMessageListWithBulkReview(initialMessages, ['task.md'], 'accepted');
  assert.strictEqual(bulkAcceptedMsgs[1].changedFiles, undefined);
  assert.deepStrictEqual(bulkAcceptedMsgs[1].fileReviewTags, { 'task.md': 'accepted' });
  console.log('✓ Bulk accept cleanly updates tags and clears changedFiles');

  // Test 5: Sanitization of legacy/stored tasks with already accepted/rejected files
  const legacyStoredMessages = [
    { role: 'user', content: 'delete task.md' },
    {
      role: 'agent',
      content: 'The content of task.md has been successfully deleted.',
      changedFiles: [
        { path: 'task.md', additions: 0, deletions: 1165, status: 'accepted' },
      ],
    },
  ];
  const sanitized = sanitizeTaskMessages(legacyStoredMessages);
  assert.strictEqual(sanitized[1].changedFiles, undefined, 'Sanitized messages should remove accepted files from changedFiles');
  assert.deepStrictEqual(sanitized[1].fileReviewTags, { 'task.md': 'accepted' });
  console.log('✓ Sanitizing legacy tasks converts status:accepted into review tag and removes from changedFiles');

  console.log('\n✅ All Task History Review Persistence Tests Passed!\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
