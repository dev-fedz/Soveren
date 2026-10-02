import { documentService } from '../src/documents/documentService.js';
import { artifactManager } from '../src/artifacts/artifactManager.js';
import { globalWorkspaceState } from '../src/workspace/workspaceState.js';
import { initializeToolsAndSkills } from '../src/tools/init.js';
import { toolRegistry } from '../src/tools/registry.js';
import { WorkspaceContext } from '../src/context/workspaceContext.js';
import * as path from 'path';
import * as fs from 'fs';

async function runTest() {
  console.log('=== Test Suite 4: Images & Documents Modules ===');
  const tempDir = path.join(process.cwd(), '.tmp_test_media');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  WorkspaceContext.setWorkspace(tempDir);

  await initializeToolsAndSkills();

  // 1. Test Images Module & Tooling
  console.log('\n--- 1. Testing Images Module & Artifact Viewer ---');
  const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#2563eb"/><text x="20" y="100" fill="white">Test SVG</text></svg>`;
  const svgFile = path.join(tempDir, 'logo.svg');
  fs.writeFileSync(svgFile, sampleSvg, 'utf8');

  // Verify FileTypeRegistry routing
  const imgViewer = globalWorkspaceState.resolveSurfaceForFile('logo.svg');
  if (imgViewer !== 'images') throw new Error(`Expected 'images', got '${imgViewer}'`);
  console.log('✓ FileTypeRegistry routed logo.svg to Images surface');

  // Execute open_image tool
  const openImageTool = toolRegistry.getTool('open_image')!;
  const imgRes = await openImageTool.execute({ path: 'logo.svg' });
  if (!imgRes.success) throw new Error(`open_image tool failed: ${imgRes.error}`);
  
  const stateAfterImg = globalWorkspaceState.getState();
  if (stateAfterImg.activeSurface !== 'images' || stateAfterImg.activeImagePath !== 'logo.svg') {
    throw new Error('open_image did not activate Images surface or update activeImagePath');
  }
  console.log('✓ open_image tool activated Images surface with active path');

  // Save screenshot artifact and verify retrieval
  const taskId = 'task_feature_branding';
  const screenshotArtifact = await artifactManager.saveArtifact(taskId, 'screenshot', 'Branding Preview', {
    fileName: 'branding_preview.svg',
    content: sampleSvg,
  });
  if (!screenshotArtifact || !screenshotArtifact.id) throw new Error('Failed to create screenshot artifact');
  console.log(`✓ Screenshot artifact created: ${screenshotArtifact.id} (${screenshotArtifact.path})`);

  // 2. Test Documents Module: CSV Spreadsheets
  console.log('\n--- 2. Testing Docs Module: CSV Spreadsheet Table View & Pagination ---');
  const csvRows = ['id,name,role,department', '1,Alice,Engineer,Core', '2,Bob,Product Manager,Design', '3,Charlie,Designer,Creative'];
  for (let i = 4; i <= 60; i++) {
    csvRows.push(`${i},User_${i},Developer,Engineering`);
  }
  const csvFile = path.join(tempDir, 'employees.csv');
  fs.writeFileSync(csvFile, csvRows.join('\n'), 'utf8');

  // Read CSV via DocumentService with pagination
  const csvPage1 = await documentService.readDocument(csvFile, { page: 1, pageSize: 20 });
  if (!csvPage1.success || csvPage1.format !== 'CSV') {
    throw new Error(`Failed to read CSV: ${csvPage1.error}`);
  }
  if (csvPage1.totalPages < 3) {
    throw new Error(`Expected multiple pages for 60 rows, got ${csvPage1.totalPages}`);
  }
  if (!csvPage1.content.includes('Alice') || !csvPage1.content.includes('role')) {
    throw new Error('CSV Page 1 missing header or rows');
  }
  console.log(`✓ CSV paginated correctly: Page 1 of ${csvPage1.totalPages} (20 rows per page)`);

  // 3. Test Documents Module: Markdown & Plain Text
  console.log('\n--- 3. Testing Docs Module: Markdown & Text Viewer ---');
  const mdContent = `# Architecture Specification\n\n## Overview\nThe system uses Docker and Next.js.\n\n## Authentication\nEndpoints:\n- POST /api/auth/login\n- POST /api/auth/logout\n`;
  const mdFile = path.join(tempDir, 'spec.md');
  fs.writeFileSync(mdFile, mdContent, 'utf8');

  const mdRes = await documentService.readDocument(mdFile);
  if (!mdRes.success || mdRes.format !== 'MD' || !mdRes.content.includes('Architecture Specification')) {
    throw new Error(`Failed to read Markdown: ${mdRes.error}`);
  }
  console.log('✓ Markdown read and formatted successfully');

  // 4. Test Targeted Document Search (Preventing Context Window Exhaustion)
  console.log('\n--- 4. Testing Targeted Search in Documents ---');
  const searchRes = await documentService.searchDocument(mdFile, 'Authentication');
  if (!searchRes.success || searchRes.matches.length === 0) {
    throw new Error('Failed to find keyword matches in document');
  }
  const match = searchRes.matches[0];
  if (!match.snippet.toLowerCase().includes('authentication')) {
    throw new Error(`Search snippet did not contain query: ${match.snippet}`);
  }
  console.log(`✓ Targeted search found ${searchRes.matches.length} matches with snippet: "${match.snippet.trim()}"`);

  // 5. Test Document Structure Inspection
  console.log('\n--- 5. Testing Document Structure Extraction ---');
  const structure = await documentService.getDocumentStructure(mdFile);
  if (!structure.success || structure.sections.length < 2) {
    throw new Error('Failed to extract document sections/headings');
  }
  console.log(`✓ Extracted ${structure.sections.length} document sections: ${structure.sections.map(s => s.title).join(', ')}`);

  // 6. Test Document Tools in ToolRegistry
  console.log('\n--- 6. Testing Document Tools via Tool Registry ---');
  const openDocTool = toolRegistry.getTool('open_document')!;
  const openDocRes = await openDocTool.execute({ path: 'spec.md', page: 1 });
  if (!openDocRes.success) throw new Error(`open_document tool failed: ${openDocRes.error}`);

  const stateAfterDoc = globalWorkspaceState.getState();
  if (stateAfterDoc.activeSurface !== 'docs' || stateAfterDoc.activeDocPath !== 'spec.md') {
    throw new Error('open_document tool did not update workspace state to Docs surface');
  }
  console.log('✓ open_document tool navigated to Docs surface');

  const readDocTool = toolRegistry.getTool('read_document')!;
  const readToolRes = await readDocTool.execute({ path: 'employees.csv', page: 1, pageSize: 5 });
  if (!readToolRes.success || !readToolRes.content.includes('Alice')) {
    throw new Error(`read_document tool execution failed: ${readToolRes.error}`);
  }
  console.log('✓ read_document tool executed with pagination');

  const searchDocTool = toolRegistry.getTool('search_document')!;
  const searchToolRes = await searchDocTool.execute({ path: 'spec.md', query: 'Endpoints' });
  if (!searchToolRes.success || !searchToolRes.content.includes('/api/auth/login')) {
    throw new Error(`search_document tool failed: ${searchToolRes.error}`);
  }
  console.log('✓ search_document tool executed targeted search');

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('\n✅ All Images & Documents Module tests passed successfully!\n');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
