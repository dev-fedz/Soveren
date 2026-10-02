import assert from 'assert';
import { FormatterRegistry, FormatterService } from '../src/formatter/index.js';

async function runTests() {
  console.log('--- Running Formatter Registry & Service Tests ---');

  // 1. Language Detection
  console.log('Test 1: Language Detection');
  assert.strictEqual(FormatterRegistry.detectLanguage('server.py'), 'python');
  assert.strictEqual(FormatterRegistry.detectLanguage('App.tsx'), 'tsx');
  assert.strictEqual(FormatterRegistry.detectLanguage('main.go'), 'go');
  assert.strictEqual(FormatterRegistry.detectLanguage('lib.rs'), 'rust');
  assert.strictEqual(FormatterRegistry.detectLanguage('Server.java'), 'java');
  assert.strictEqual(FormatterRegistry.detectLanguage('main.cpp'), 'cpp');
  assert.strictEqual(FormatterRegistry.detectLanguage('config.json'), 'json');
  assert.strictEqual(FormatterRegistry.detectLanguage('deploy.yaml'), 'yaml');
  assert.strictEqual(FormatterRegistry.detectLanguage('script.sh'), 'shell');
  assert.strictEqual(FormatterRegistry.detectLanguage('query.sql'), 'sql');
  console.log('✓ Language detection passed');

  // 2. Default Formatter Resolution
  console.log('Test 2: Formatter Resolution');
  const pyFormatter = FormatterRegistry.resolveDefaultFormatter('foo.py');
  assert.strictEqual(pyFormatter?.id, 'black');

  const tsFormatter = FormatterRegistry.resolveDefaultFormatter('bar.ts');
  assert.strictEqual(tsFormatter?.id, 'prettier');

  const goFormatter = FormatterRegistry.resolveDefaultFormatter('main.go');
  assert.strictEqual(goFormatter?.id, 'gofmt');

  const rustFormatter = FormatterRegistry.resolveDefaultFormatter('lib.rs');
  assert.strictEqual(rustFormatter?.id, 'rustfmt');

  const cppFormatter = FormatterRegistry.resolveDefaultFormatter('engine.cpp');
  assert.strictEqual(cppFormatter?.id, 'clang-format');

  const javaFormatter = FormatterRegistry.resolveDefaultFormatter('App.java');
  assert.strictEqual(javaFormatter?.id, 'google-java-format');
  console.log('✓ Formatter resolution passed');

  // 3. Prettier Formatting (TypeScript)
  console.log('Test 3: Prettier Built-in Formatting for TypeScript');
  const uglyTs = 'const   x:number=   10;   function  test( ) {return   x*2;}';
  const tsRes = await FormatterService.format({
    code: uglyTs,
    filePath: 'test.ts',
    language: 'typescript',
  });
  assert.strictEqual(tsRes.success, true);
  assert.ok(tsRes.formatted.includes('const x: number = 10;'));
  assert.ok(tsRes.formatted.includes('function test() {'));
  console.log('✓ Prettier TypeScript formatting passed');

  // 4. Prettier Formatting (JSON)
  console.log('Test 4: Prettier Built-in Formatting for JSON');
  const uglyJson = '{"a":1,"b":   [2, 3],  "c":  {"nested": true}}';
  const jsonRes = await FormatterService.format({
    code: uglyJson,
    filePath: 'data.json',
    language: 'json',
  });
  assert.strictEqual(jsonRes.success, true);
  assert.ok(jsonRes.formatted.includes('"a": 1'));
  console.log('✓ Prettier JSON formatting passed');

  // 5. Django Template Preservation
  console.log('Test 5: Django Template Syntax Preservation in HTML');
  const djangoHtml = `<div>
{% if user.is_authenticated %}
    <h1>Hello {{ user.username }}</h1>
{% endif %}
</div>`;
  const djangoRes = await FormatterService.format({
    code: djangoHtml,
    filePath: 'template.html',
    language: 'django',
  });
  assert.strictEqual(djangoRes.success, true);
  assert.ok(djangoRes.formatted.includes('{% if user.is_authenticated %}'));
  assert.ok(djangoRes.formatted.includes('{{ user.username }}'));
  assert.ok(djangoRes.formatted.includes('{% endif %}'));
  console.log('✓ Django template tags preserved');

  // 6. Graceful Syntax Error Handling
  console.log('Test 6: Graceful Syntax Error Handling (Code Preserved)');
  const brokenTs = 'const foo = { unclosed';
  const brokenRes = await FormatterService.format({
    code: brokenTs,
    filePath: 'broken.ts',
    language: 'typescript',
  });
  assert.strictEqual(brokenRes.success, false);
  assert.strictEqual(brokenRes.formatted, brokenTs, 'Original code must be preserved when formatting fails');
  assert.ok(brokenRes.error !== undefined);
  console.log('✓ Syntax error handled gracefully with code preserved');

  // 7. Formatter Unavailability Handling
  console.log('Test 7: Unavailable Formatter Handling');
  // Python with black (if black is not installed on system)
  const isBlackInstalled = await FormatterService.isCommandInstalled('black');
  const pyCode = 'def hello(name):\n    return f"Hello, {name}"\n';
  const pyRes = await FormatterService.format({
    code: pyCode,
    filePath: 'script.py',
    language: 'python',
  });

  if (!isBlackInstalled) {
    assert.strictEqual(pyRes.success, false);
    assert.strictEqual(pyRes.unavailable, true);
    assert.strictEqual(pyRes.formatterId, 'black');
    assert.strictEqual(pyRes.installHelp, 'pip install black');
    assert.strictEqual(pyRes.formatted, pyCode, 'Code must not be lost when formatter is unavailable');
    console.log('✓ Formatter unavailable scenario correctly handled');
  } else {
    assert.strictEqual(pyRes.success, true);
    console.log('✓ Black CLI formatted successfully');
  }

  // 8. Formatter Configuration Updates
  console.log('Test 8: Formatter Configuration Management');
  FormatterService.updateConfig({
    formatOnSave: true,
    formatters: { python: 'none' },
    disabledLanguages: ['python'],
  });
  const config = FormatterService.getConfig();
  assert.strictEqual(config.formatOnSave, true);
  assert.ok(config.disabledLanguages.includes('python'));

  // With python disabled, format should return original code with formatterId 'none'
  const disabledRes = await FormatterService.format({
    code: pyCode,
    filePath: 'script.py',
    language: 'python',
  });
  assert.strictEqual(disabledRes.formatterId, 'none');
  assert.strictEqual(disabledRes.formatted, pyCode);

  // Reset config
  FormatterService.updateConfig({
    formatOnSave: false,
    formatters: {},
    disabledLanguages: [],
  });
  console.log('✓ Formatter configuration verified');

  // 9. TSX / React TypeScript formatting
  console.log('Test 9: TSX / React TypeScript Formatting');
  const tsxCode = `export const Button=({label,onClick}:{label:string,onClick:()=>void})=><button onClick={onClick} className={"btn"}>{label}</button>;`;
  const tsxRes = await FormatterService.format({
    code: tsxCode,
    filePath: 'Button.tsx',
    language: 'tsx',
  });
  assert.strictEqual(tsxRes.success, true);
  assert.strictEqual(tsxRes.formatterId, 'prettier');
  assert.ok(tsxRes.formatted.includes('export const Button = ({'));
  console.log('✓ TSX formatting passed');

  // 10. Dockerfile formatting
  console.log('Test 10: Dockerfile Formatting');
  const rawDocker = `from node:20-alpine
workdir /app
copy package*.json ./
run npm install && \\
npm cache clean --force

expose 3000
cmd ["npm", "start"]
`;
  const dockerRes = await FormatterService.format({
    code: rawDocker,
    filePath: 'Dockerfile',
  });
  assert.strictEqual(dockerRes.success, true);
  assert.strictEqual(dockerRes.formatterId, 'dockfmt');
  assert.ok(dockerRes.formatted.includes('FROM node:20-alpine'));
  assert.ok(dockerRes.formatted.includes('WORKDIR /app'));
  assert.ok(dockerRes.formatted.includes('COPY package*.json ./'));
  assert.ok(dockerRes.formatted.includes('EXPOSE 3000'));
  assert.ok(dockerRes.formatted.includes('CMD ["npm", "start"]'));
  assert.ok(dockerRes.formatted.includes('    npm cache clean --force')); // Indented continuation line
  console.log('✓ Dockerfile formatting passed');

  // 11. .tsbuildinfo JSON formatting
  console.log('Test 11: .tsbuildinfo JSON Formatting');
  const rawBuildInfo = '{"program":{"fileInfos":{"index.ts":{"version":"12345"}},"root":[["index.ts"]]},"version":"5.4.5"}';
  const buildInfoRes = await FormatterService.format({
    code: rawBuildInfo,
    filePath: 'tsconfig.tsbuildinfo',
  });
  assert.strictEqual(buildInfoRes.success, true);
  assert.strictEqual(buildInfoRes.formatterId, 'prettier');
  assert.ok(buildInfoRes.formatted.includes('"program": {'));
  assert.ok(buildInfoRes.formatted.includes('"version": "12345"'));
  console.log('✓ .tsbuildinfo JSON formatting passed');

  // 12. .lock Formatting (JSON lockfile vs Text lockfile)
  console.log('Test 12: .lock Formatting');
  const jsonLock = '{"name":"my-app","lockfileVersion":3,"packages":{"":{"name":"my-app"}}}';
  const jsonLockRes = await FormatterService.format({
    code: jsonLock,
    filePath: 'package-lock.json',
  });
  assert.strictEqual(jsonLockRes.success, true);
  assert.ok(jsonLockRes.formatted.includes('"lockfileVersion": 3'));

  const textLock = `package1@^1.0.0:   \n  version "1.0.1"   \n  resolved "https://registry..."   \n`;
  const textLockRes = await FormatterService.format({
    code: textLock,
    filePath: 'yarn.lock',
  });
  assert.strictEqual(textLockRes.success, true);
  assert.ok(textLockRes.formatted.includes('package1@^1.0.0:\n  version "1.0.1"'));
  console.log('✓ .lock formatting passed');

  // 13. Plaintext .txt Formatting
  console.log('Test 13: Plaintext .txt Formatting');
  const rawText = 'Line 1 with trailing spaces   \n\n\n\nLine 2 after empty lines   \n';
  const textRes = await FormatterService.format({
    code: rawText,
    filePath: 'notes.txt',
  });
  assert.strictEqual(textRes.success, true);
  assert.strictEqual(textRes.formatterId, 'textfmt');
  assert.ok(textRes.formatted.includes('Line 1 with trailing spaces\n\nLine 2 after empty lines\n'));
  console.log('✓ Plaintext .txt formatting passed');

  // 14. .env Dotenv Formatting
  console.log('Test 14: .env Dotenv Formatting');
  const rawEnv = `# Server config  \nPORT = 3000   \n\n\n\nDATABASE_URL = postgres://localhost:5432/db  \nexport SECRET_KEY = "my-secret-key"  \n`;
  const envRes = await FormatterService.format({
    code: rawEnv,
    filePath: '.env',
  });
  assert.strictEqual(envRes.success, true);
  assert.strictEqual(envRes.formatterId, 'textfmt');
  assert.ok(envRes.formatted.includes('PORT=3000'));
  assert.ok(envRes.formatted.includes('DATABASE_URL=postgres://localhost:5432/db'));
  assert.ok(envRes.formatted.includes('export SECRET_KEY="my-secret-key"'));
  assert.ok(envRes.formatted.includes('# Server config'));
  console.log('✓ .env Dotenv formatting passed');

  console.log('\n========================================');
  console.log('ALL FORMATTER TESTS PASSED! 🎉');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
