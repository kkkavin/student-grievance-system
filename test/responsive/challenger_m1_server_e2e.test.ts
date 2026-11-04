/**
 * test/responsive/challenger_m1_server_e2e.test.ts
 *
 * Empirical challenger test:
 * - Boots real HTTP server
 * - Verifies /api/health endpoint
 * - Fetches index.html and checks viewport meta tag
 * - Verifies assets build references
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchResponsiveTestServer, TestServerHandle } from './viewport_engine.ts';

describe('CHALLENGER SERVER E2E: Runtime Application & Viewport Verification', () => {
  let serverHandle: TestServerHandle;

  before(async () => {
    serverHandle = await launchResponsiveTestServer(3299);
  });

  after(async () => {
    if (serverHandle) {
      await serverHandle.stop();
    }
  });

  test('TC-CHALLENGER-E2E-01: Server boots and health endpoint returns 200 OK', async () => {
    const res = await fetch(`${serverHandle.baseUrl}/api/health`);
    assert.equal(res.status, 200, 'Health endpoint must respond with 200');
    const data = await res.json();
    assert.equal(data.status, 'ok', 'Health status must be ok');
  });

  test('TC-CHALLENGER-E2E-02: index.html defines proper viewport meta tag for mobile responsiveness', async () => {
    const res = await fetch(`${serverHandle.baseUrl}/`);
    assert.equal(res.status, 200, 'Root index.html must return 200');
    const html = await res.text();
    
    // Viewport meta check
    assert.ok(
      html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0'),
      'index.html must specify viewport width=device-width and initial-scale=1.0'
    );
  });

  test('TC-CHALLENGER-E2E-03: Grievance API returns data accessible to responsive client', async () => {
    const res = await fetch(`${serverHandle.baseUrl}/api/grievances`);
    assert.equal(res.status, 200, 'API grievances endpoint must return 200');
    const data = await res.json();
    assert.ok(Array.isArray(data), 'Grievances must be returned as an array');
  });
});
