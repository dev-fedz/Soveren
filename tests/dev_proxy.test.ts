import assert from 'assert';
import http from 'http';
import express from 'express';
import { createDevProxyRouter } from '../backend/src/devProxy.js';
import { serviceManager } from '../backend/src/serviceManager.js';
import { DetectedService } from '../backend/src/serviceDiscovery.js';

async function runDevProxyTests() {
  console.log('=== Running DevProxy Header & Security Tests ===\n');

  // 1. Create a mock upstream application server that sends restrictive headers
  const mockUpstream = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'",
      'Set-Cookie': 'sessionid=test12345; Path=/; HttpOnly',
      'X-Custom-Header': 'preserve-me',
    });
    res.end('<!DOCTYPE html><html><body><h1>Hello from App</h1></body></html>');
  });

  await new Promise<void>((resolve) => mockUpstream.listen(0, '127.0.0.1', () => resolve()));
  const upstreamAddress = mockUpstream.address() as any;
  const upstreamPort = upstreamAddress.port;
  console.log(`Mock upstream server running on 127.0.0.1:${upstreamPort}`);

  // 2. Set up an Express test server mounting devProxy
  const app = express();
  app.use('/dev-proxy', createDevProxyRouter());

  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));
  const proxyAddress = testServer.address() as any;
  const proxyPort = proxyAddress.port;

  // 3. Register the service in ServiceManager
  const serviceId = 'test-app-id';
  const mockService: DetectedService = {
    id: serviceId,
    projectPath: '/test/path',
    name: 'Test App',
    host: '127.0.0.1',
    port: upstreamPort,
    url: `http://127.0.0.1:${upstreamPort}`,
    protocol: 'http',
    hasUI: true,
    status: 'running',
    lastSeen: Date.now(),
    previousPorts: [],
  };

  (serviceManager as any).services.set(serviceId, mockService);

  try {
    // 4. Test request through the proxy
    console.log('Test 1: DevProxy strips X-Frame-Options and frame-ancestors');
    const proxyRes = await fetch(`http://127.0.0.1:${proxyPort}/dev-proxy/${serviceId}/`);
    assert.strictEqual(proxyRes.status, 200);

    const xFrameOptions = proxyRes.headers.get('x-frame-options');
    assert.strictEqual(xFrameOptions, null, 'X-Frame-Options header must be stripped');

    const csp = proxyRes.headers.get('content-security-policy');
    if (csp) {
      assert.ok(!csp.includes('frame-ancestors'), 'frame-ancestors directive must be removed from CSP');
      assert.ok(csp.includes("default-src 'self'"), 'Other CSP directives should be preserved');
    }

    const corsOrigin = proxyRes.headers.get('access-control-allow-origin');
    assert.strictEqual(corsOrigin, '*', 'CORS allow origin must be present for iframe communication');

    const customHeader = proxyRes.headers.get('x-custom-header');
    assert.strictEqual(customHeader, 'preserve-me', 'Custom application headers must be preserved');

    const body = await proxyRes.text();
    assert.ok(body.includes('Hello from App'), 'Upstream body must be passed through cleanly');
    console.log('  ✓ Headers correctly filtered for iframe embedding\n');

    // 5. Test 404 for unknown service
    console.log('Test 2: DevProxy rejects unregistered services (404)');
    const notFoundRes = await fetch(`http://127.0.0.1:${proxyPort}/dev-proxy/non-existent-service/`);
    assert.strictEqual(notFoundRes.status, 404);
    console.log('  ✓ Scoped to registered services only\n');

    // 6. Test 503 for stopped service
    console.log('Test 3: DevProxy handles stopped/unavailable services');
    mockService.status = 'stopped';
    const stoppedRes = await fetch(`http://127.0.0.1:${proxyPort}/dev-proxy/${serviceId}/`);
    assert.strictEqual(stoppedRes.status, 503);
    console.log('  ✓ Reports 503 when service is stopped\n');

    console.log('🎉 ALL DEVPROXY TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Clean up
    (serviceManager as any).services.delete(serviceId);
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockUpstream.close(() => resolve()));
  }
}

runDevProxyTests().catch((err) => {
  console.error('DevProxy test suite failed:', err);
  process.exit(1);
});
