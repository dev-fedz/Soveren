import assert from 'assert';
import {
  generateServiceId,
  normalizeHost,
  buildServiceUrl,
  parseUrlsFromOutput,
  detectFrameworkFromCommand,
  generateServiceName,
} from '../backend/src/serviceDiscovery.js';
import { ServiceManager } from '../backend/src/serviceManager.js';
import { ShellTool } from '../src/tools/shell.js';

async function runTests() {
  console.log('=== Running Browser Service Discovery & Management Tests ===\n');

  // Test 1: Service ID stability (identity must NOT depend on port)
  console.log('Test 1: Service ID stability across port changes');
  const id1 = generateServiceId('/projects/my-app', 'react', 'npm run dev');
  const id2 = generateServiceId('/projects/my-app', 'react', 'npm run dev');
  assert.strictEqual(id1, id2, 'Service IDs with identical parameters must match');

  const idDifferentApp = generateServiceId('/projects/backend', 'django', 'python manage.py runserver');
  assert.notStrictEqual(id1, idDifferentApp, 'Different apps must have different service IDs');
  console.log('  ✓ Service IDs are deterministic and project-scoped\n');

  // Test 2: Host normalization and URL construction
  console.log('Test 2: Host normalization & URL construction');
  assert.strictEqual(normalizeHost('0.0.0.0'), 'localhost');
  assert.strictEqual(normalizeHost('127.0.0.1'), 'localhost');
  assert.strictEqual(normalizeHost('::1'), 'localhost');
  assert.strictEqual(normalizeHost('example.local'), 'example.local');

  assert.strictEqual(buildServiceUrl('http', '0.0.0.0', 3000), 'http://localhost:3000');
  assert.strictEqual(buildServiceUrl('http', '127.0.0.1', 8000), 'http://localhost:8000');
  assert.strictEqual(buildServiceUrl('https', 'localhost', 443), 'https://localhost:443');
  console.log('  ✓ Host addresses normalized properly\n');

  // Test 3: Output URL parsing from various dev servers
  console.log('Test 3: URL parsing from real-world dev server output');

  const viteOutput = `
  VITE v5.2.0  ready in 240 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  `;
  const viteParsed = parseUrlsFromOutput(viteOutput);
  assert.strictEqual(viteParsed.length, 1);
  assert.strictEqual(viteParsed[0].port, 5173);
  assert.strictEqual(viteParsed[0].url, 'http://localhost:5173');

  const djangoOutput = `
  Watching for file changes with StatReloader
  Performing system checks...

  System check identified no issues (0 silenced).
  September 30, 2026 - 12:00:00
  Django version 5.0, using settings 'mysite.settings'
  Starting development server at http://127.0.0.1:8000/
  Quit the server with CONTROL-C.
  `;
  const djangoParsed = parseUrlsFromOutput(djangoOutput);
  assert.strictEqual(djangoParsed.length, 1);
  assert.strictEqual(djangoParsed[0].port, 8000);
  assert.strictEqual(djangoParsed[0].url, 'http://localhost:8000');

  const nextOutput = `
   ▲ Next.js 14.1.0
   - Local:        http://localhost:3000
   - Network:      http://192.168.1.10:3000
  `;
  const nextParsed = parseUrlsFromOutput(nextOutput);
  assert.strictEqual(nextParsed.length, 1);
  assert.strictEqual(nextParsed[0].port, 3000);

  console.log('  ✓ Vite, Django, and Next.js URLs accurately parsed from output\n');

  // Test 4: Framework detection from command lines
  console.log('Test 4: Framework detection from command lines');
  assert.strictEqual(detectFrameworkFromCommand('npm run dev -- --port 5173'), undefined); // generic npm
  assert.strictEqual(detectFrameworkFromCommand('vite --port 5173'), 'vite');
  assert.strictEqual(detectFrameworkFromCommand('npx next dev'), 'next');
  assert.strictEqual(detectFrameworkFromCommand('python manage.py runserver 8000'), 'django');
  assert.strictEqual(detectFrameworkFromCommand('uvicorn main:app --reload'), 'fastapi');
  assert.strictEqual(detectFrameworkFromCommand('flask run'), 'flask');
  assert.strictEqual(detectFrameworkFromCommand('rails server'), 'rails');
  assert.strictEqual(detectFrameworkFromCommand('php artisan serve'), 'laravel');
  console.log('  ✓ Commands correctly mapped to frameworks\n');

  // Test 5: Service display name generation
  console.log('Test 5: Service display name formatting');
  assert.strictEqual(generateServiceName('react', 'frontend', 3000), 'React (frontend)');
  assert.strictEqual(generateServiceName('django', 'backend', 8000), 'Django (backend)');
  assert.strictEqual(generateServiceName('vite', undefined, 5173), 'Vite');
  assert.strictEqual(generateServiceName(undefined, 'my-super-app', 3000), 'My Super App');
  assert.strictEqual(generateServiceName(undefined, undefined, 4000), 'localhost:4000');
  console.log('  ✓ Service names formatted intelligently\n');

  // Test 6: ServiceManager lifecycle events
  console.log('Test 6: ServiceManager lifecycle (discovery, port change, restart, stop)');
  const sm = new ServiceManager();
  sm.setWorkspace('/projects/my-workspace');

  const events: any[] = [];
  sm.on('service_event', (e) => events.push(e));

  // Report initial service from terminal output
  sm.reportServiceFromOutput('Server ready at http://localhost:3000', 'vite', 1234, 'frontend');

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'discovered');
  assert.strictEqual(events[0].service.port, 3000);
  assert.strictEqual(events[0].service.hasUI, true);

  const services = sm.getServices();
  assert.strictEqual(services.length, 1);
  assert.strictEqual(services[0].port, 3000);

  // Simulate port change (e.g. port 3000 was in use, switched to 3001)
  events.length = 0;
  sm.reportServiceFromOutput('Port 3000 in use, using http://localhost:3001', 'vite', 1234, 'frontend');

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'portChanged');
  assert.strictEqual(events[0].oldPort, 3000);
  assert.strictEqual(events[0].newPort, 3001);
  assert.strictEqual(events[0].service.port, 3001);
  assert.deepStrictEqual(events[0].service.previousPorts, [3000]);

  // Ensure service count is still 1 (no duplicates!)
  assert.strictEqual(sm.getServices().length, 1, 'Port change must update existing service, not create duplicate');

  // Add a second simultaneous service (e.g. Django backend)
  events.length = 0;
  sm.reportServiceFromOutput('Django server running at http://127.0.0.1:8000/', 'python manage.py runserver', 5678, 'backend');

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'discovered');
  assert.strictEqual(events[0].service.port, 8000);
  assert.strictEqual(sm.getServices().length, 2, 'Should track both frontend and backend services simultaneously');

  // Verify workspace clearing cleans up services
  sm.setWorkspace(null);
  assert.strictEqual(sm.getServices().length, 0, 'Workspace clear must reset all registered services');

  sm.destroy();
  console.log('  ✓ Service lifecycle & multi-app tracking verified\n');

  // Test 7: ShellTool output listener integration
  console.log('Test 7: ShellTool output listener');
  let capturedOutput = '';
  let capturedCmd = '';
  const removeListener = ShellTool.addOutputListener((output, cmd) => {
    capturedOutput = output;
    capturedCmd = cmd;
  });

  const res = await new ShellTool().execute({ command: 'echo "Ready on http://localhost:4567"' });
  assert.strictEqual(res.success, true);
  assert.ok(capturedOutput.includes('http://localhost:4567'));
  assert.ok(capturedCmd.includes('echo'));

  removeListener();
  console.log('  ✓ ShellTool output listeners successfully receive output\n');

  console.log('🎉 ALL 7 TEST SUITES PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
