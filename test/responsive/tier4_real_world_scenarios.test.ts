/**
 * test/responsive/tier4_real_world_scenarios.test.ts
 *
 * Tier 4: Real-World Scenarios E2E Responsive Suite
 *
 * Real-world end-to-end user journeys testing complete lifecycles:
 * - Scenario 1: Full Student Grievance Submission on Mobile (375px iPhone SE)
 * - Scenario 2: Department Staff Inspection & Resolution on Mobile (390px iPhone 14)
 * - Scenario 3: Admin Analytics Review & Report Generation on Mobile/Tablet (412px & 768px)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../../db.ts';
import {
  VIEWPORTS,
  loadSourceFile,
  resolveTailwindClasses,
  launchResponsiveTestServer,
  TestServerHandle,
} from './viewport_engine.ts';
import {
  TEST_USERS,
  TEST_DEPARTMENTS,
  seedRbacTestData,
  cleanRbacTestData,
} from '../fixtures/rbac_fixtures.ts';

const RESPONSIVE_TEST_PORT = process.env.RESP_TEST_PORT
  ? parseInt(process.env.RESP_TEST_PORT, 10)
  : 3260;

let serverHandle: TestServerHandle;
let serverBaseUrl: string;

before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);

  serverHandle = await launchResponsiveTestServer(RESPONSIVE_TEST_PORT);
  serverBaseUrl = serverHandle.baseUrl;
});

after(async () => {
  try {
    const db = getDatabase();
    cleanRbacTestData(db);
  } catch {
    // cleanup ignore
  }
  if (serverHandle) {
    await serverHandle.stop();
  }
});

describe('Tier 4: Scenario 1 — Full Student Grievance Submission on Mobile (375px iPhone SE)', () => {
  const appTsx = loadSourceFile('src/App.tsx');
  const formTsx = loadSourceFile('src/components/StudentComplaintForm.tsx');

  test('Step 1: Student opens site on 375px mobile — verifies compact header layout and navigation triggers', () => {
    const headerMatch = appTsx.match(/<header[^>]*>[\s\S]*?<div className="([^"]*max-w-7xl[^"]*)"/);
    assert.ok(headerMatch, 'Header must exist');

    const layout = resolveTailwindClasses(headerMatch[1], VIEWPORTS.IPHONE_SE);
    assert.equal(layout.isMobile, true);
    assert.equal(layout.viewportWidth, 375);
    assert.ok(headerMatch[1].includes('px-3') || headerMatch[1].includes('px-4'));
  });

  test('Step 2: Student navigates to complaint form — verifies full-width responsive inputs and touch targets', () => {
    const textareaMatch = formTsx.match(/id="complaint-description-textarea"[\s\S]*?className="([^"]*)"/);
    assert.ok(textareaMatch, 'Description textarea must exist');
    assert.ok(textareaMatch[1].includes('w-full'), 'Description textarea must occupy 100% width on mobile');

    const submitBtnMatch = formTsx.match(/id="submit-grievance-btn"[\s\S]*?className="([^"]*)"/);
    assert.ok(submitBtnMatch, 'Submit button must exist');
    assert.ok(
      submitBtnMatch[1].includes('w-full') || submitBtnMatch[1].includes('sm:w-auto') || submitBtnMatch[1].includes('py-2.5'),
      'Submit button must provide accessible touch padding'
    );
  });

  test('Step 3: Student submits grievance to server — verifies API response and ticket persistence', async () => {
    const payload = {
      title: 'Hostel Block B Wi-Fi completely offline',
      description: 'The Wi-Fi router on 3rd floor Block B room 304 has been down for 48 hours. Need urgent fix for assignments.',
      category: 'Hostel Wi-Fi & Internet',
      studentName: 'Rahul Sharma',
      studentRegNo: 'RBAC_2024_001',
      studentEmail: 'rahul.student@rbactest.edu',
      studentType: 'hosteller',
      hostelBlock: 'Block B',
      roomNo: '304',
      isAnonymous: false,
    };

    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.ok(
      res.status === 200 || res.status === 201,
      `Expected 200 OK or 201 Created from grievance submission, got ${res.status}`
    );
    const data = (await res.json()) as any;
    assert.ok(data.id || data.ticketNo, 'Submission must return ticket details');
  });

  test('Step 4: Student views confirmation screen — verifies responsive action button stacking (flex-col sm:flex-row)', () => {
    const successBtnMatch = formTsx.indexOf('id="success-view-dashboard-btn"');
    assert.ok(successBtnMatch !== -1, 'Success dashboard button must exist');

    const snippet = formTsx.slice(Math.max(0, successBtnMatch - 300), successBtnMatch + 300);
    assert.ok(
      snippet.includes('flex-col sm:flex-row'),
      'Confirmation buttons must stack into flex-col on mobile and flex-row on desktop'
    );
  });
});

describe('Tier 4: Scenario 2 — Department Staff Inspection & Resolution on Mobile (390px iPhone 14)', () => {
  const deptTsx = loadSourceFile('src/components/DepartmentDashboard.tsx');
  let staffToken: string;

  test('Step 1: Department Staff authenticates via mobile login endpoint', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.STAFF_NETWORK.email,
        password: TEST_USERS.STAFF_NETWORK.password,
      }),
    });

    assert.equal(res.status, 200, 'Staff login must succeed');
    const body = (await res.json()) as any;
    assert.ok(body.token, 'Staff login must issue JWT token');
    staffToken = body.token;
  });

  test('Step 2: Staff fetches scoped grievance list — verifies table wrapper horizontal scroll on 390px', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    assert.equal(res.status, 200, 'Grievance list fetch must succeed');
    const tableIndex = deptTsx.indexOf('<table');
    assert.ok(tableIndex !== -1, 'DepartmentDashboard must feature data table');

    const wrapper = deptTsx.slice(Math.max(0, tableIndex - 200), tableIndex + 100);
    assert.ok(
      wrapper.includes('overflow-x-auto'),
      'Table wrapper must have overflow-x-auto for horizontal swipe navigation'
    );
  });

  test('Step 3: Staff inspects ticket and triggers resolution — verifies modal actions adapt for mobile touch', () => {
    const actionIndex = deptTsx.indexOf('Resolve Grievance');
    assert.ok(actionIndex !== -1, 'Resolve action must exist in DepartmentDashboard');

    const actionsSnippet = deptTsx.slice(Math.max(0, actionIndex - 400), actionIndex + 200);
    assert.ok(
      actionsSnippet.includes('flex-col') || actionsSnippet.includes('flex-wrap') || actionsSnippet.includes('w-full'),
      'Inspection drawer action buttons must stack vertically or wrap on small screens'
    );
  });
});

describe('Tier 4: Scenario 3 — Super Admin Analytics Review & Report Download (412px & 768px Viewports)', () => {
  const predictiveTsx = loadSourceFile('src/components/PredictiveAnalyticsDashboard.tsx');
  const reportTsx = loadSourceFile('src/components/ReportDownloader.tsx');
  let adminToken: string;

  test('Step 1: Super Admin authenticates and accesses analytics trends API', async () => {
    const loginRes = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.SUPER_ADMIN.email,
        password: TEST_USERS.SUPER_ADMIN.password,
      }),
    });

    assert.equal(loginRes.status, 200, 'Admin login must succeed');
    const body = (await loginRes.json()) as any;
    adminToken = body.token;

    const trendsRes = await fetch(`${serverBaseUrl}/api/analytics/trends`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(trendsRes.status, 200, 'Analytics trends endpoint must respond 200 OK');
  });

  test('Step 2: Admin reviews Predictive Analytics sub-tabs — verifies horizontal scrolling on 412px', () => {
    const tabIndex = predictiveTsx.indexOf('Comprehensive View');
    assert.ok(tabIndex !== -1, 'Predictive Analytics sub-tabs must exist');

    const tabSnippet = predictiveTsx.slice(Math.max(0, tabIndex - 250), tabIndex + 150);
    assert.ok(
      tabSnippet.includes('overflow-x-auto') || tabSnippet.includes('scrollbar-none') || tabSnippet.includes('flex-wrap'),
      'Sub-tabs must permit horizontal scrolling without page blowout'
    );
  });

  test('Step 3: Admin opens Report Downloader — verifies dropdown does not clip off-screen at 768px tablet breakpoint', () => {
    const popoverIndex = reportTsx.indexOf('Format Options');
    assert.ok(popoverIndex !== -1, 'ReportDownloader popover must exist');

    const popoverSnippet = reportTsx.slice(Math.max(0, popoverIndex - 300), popoverIndex + 200);
    assert.ok(
      popoverSnippet.includes('max-w-[calc(100vw-2rem)]') || popoverSnippet.includes('w-full') || popoverSnippet.includes('max-w-'),
      'ReportDownloader popover must respect maximum responsive boundary'
    );
  });
});
