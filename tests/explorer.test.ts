import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getProjectStructure } from '../backend/src/fileSystem.js';

async function runExplorerTests() {
  console.log('--- Running Explorer File Tree Tests ---');

  // Create temporary mock directory structure
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'explorer-test-'));

  try {
    // Create folders
    await fs.mkdir(path.join(tmpDir, 'src'));
    await fs.mkdir(path.join(tmpDir, 'assets'));
    await fs.mkdir(path.join(tmpDir, '.github'));
    await fs.mkdir(path.join(tmpDir, '.git')); // Should be ignored
    await fs.mkdir(path.join(tmpDir, 'node_modules')); // Should be ignored

    // Create files
    await fs.writeFile(path.join(tmpDir, '.env'), 'PORT=3000');
    await fs.writeFile(path.join(tmpDir, '.gitignore'), 'node_modules\n');
    await fs.writeFile(path.join(tmpDir, '.DS_Store'), 'junk'); // Should be ignored
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test Project');
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');

    // Create nested files and folders in src
    await fs.mkdir(path.join(tmpDir, 'src', 'components'));
    await fs.writeFile(path.join(tmpDir, 'src', '.env.local'), 'SECRET=123');
    await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'console.log("hello");');
    await fs.writeFile(path.join(tmpDir, 'src', 'App.tsx'), 'export default function App() {}');

    // Test getProjectStructure
    const tree = await getProjectStructure(tmpDir);

    console.log('Root children:', tree.children.map((c: any) => `${c.name} (${c.type})`));

    // 1. Verify hidden files exist (.env, .gitignore)
    const envFile = tree.children.find((c: any) => c.name === '.env');
    assert.ok(envFile, '.env must be present in tree');
    assert.strictEqual(envFile.type, 'file');

    const gitignoreFile = tree.children.find((c: any) => c.name === '.gitignore');
    assert.ok(gitignoreFile, '.gitignore must be present in tree');

    const dotGithubFolder = tree.children.find((c: any) => c.name === '.github');
    assert.ok(dotGithubFolder, '.github folder must be present in tree');
    assert.strictEqual(dotGithubFolder.type, 'folder');

    // 2. Verify previously ignored entries are now included (node_modules, .git, .DS_Store)
    const gitDir = tree.children.find((c: any) => c.name === '.git');
    assert.ok(gitDir, '.git must be present in tree');
    assert.strictEqual(gitDir.type, 'folder');

    const nodeModulesDir = tree.children.find((c: any) => c.name === 'node_modules');
    assert.ok(nodeModulesDir, 'node_modules must be present in tree');
    assert.strictEqual(nodeModulesDir.type, 'folder');

    const dsStore = tree.children.find((c: any) => c.name === '.DS_Store');
    assert.ok(dsStore, '.DS_Store must be present in tree');
    assert.strictEqual(dsStore.type, 'file');

    // 3. Verify folders first, then files
    const firstNonFolderIndex = tree.children.findIndex((c: any) => c.type !== 'folder');
    const folderAfterFile = tree.children.slice(firstNonFolderIndex).find((c: any) => c.type === 'folder');
    assert.strictEqual(folderAfterFile, undefined, 'All folders must precede files in children list');

    // 4. Verify nested directory (src) also has folders first, then files, including hidden files
    const srcNode = tree.children.find((c: any) => c.name === 'src');
    assert.ok(srcNode);
    console.log('src children:', srcNode.children.map((c: any) => `${c.name} (${c.type})`));

    assert.strictEqual(srcNode.children[0].name, 'components', 'Subfolder components should be first');
    assert.strictEqual(srcNode.children[0].type, 'folder');

    const nestedEnv = srcNode.children.find((c: any) => c.name === '.env.local');
    assert.ok(nestedEnv, '.env.local must be present in nested folder');

    console.log('✓ All explorer tree tests passed successfully!');
  } finally {
    // Clean up temp dir
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

runExplorerTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
