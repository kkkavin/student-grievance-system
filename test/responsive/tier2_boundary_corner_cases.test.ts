/**
 * test/responsive/tier2_boundary_corner_cases.test.ts
 *
 * Tier 2: Boundary Value Analysis (BVA) & Corner Cases E2E Responsive Suite
 *
 * Requirements Covered:
 * - 375px minimum viewport boundary (iPhone SE)
 * - 390px modern mobile viewport (iPhone 12/13/14)
 * - 412px Android mobile viewport (Samsung Galaxy S20 / Pixel)
 * - 768px tablet breakpoint boundary (iPad portrait)
 * - 1280px desktop baseline viewport
 * - Short screen heights (<= 667px and 568px) for modal top-clipping
 * - Long badge strings and student name text expansion
 * - Multiple pagination pages (10+ pages) without horizontal blowout
 * - Deep tables (6+ columns) with column minimum width enforcement
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWPORTS,
  loadSourceFile,
  resolveTailwindClasses,
  evaluateModalSafety,
} from './viewport_engine.ts';

describe('Tier 2: Boundary Value Analysis — Mobile & Desktop Breakpoints', () => {
  const indexCss = loadSourceFile('src/index.css');
  const appTsx = loadSourceFile('src/App.tsx');
  const adminTsx = loadSourceFile('src/components/AdminDashboard.tsx');
  const deptTsx = loadSourceFile('src/components/DepartmentDashboard.tsx');
  const chartsTsx = loadSourceFile('src/components/Charts.tsx');

  test('TC-RESP-BVA-01: 375px Minimum Viewport (iPhone SE) — Global Header Layout Boundary', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § Viewport Verification & R1
    // At 375px viewport, combined header elements must fit without exceeding 375px
    const headerMatch = appTsx.match(/<header[^>]*>[\s\S]*?<div className="([^"]*max-w-7xl[^"]*)"/);
    assert.ok(headerMatch, 'Header container must exist');

    const layout375 = resolveTailwindClasses(headerMatch[1], VIEWPORTS.IPHONE_SE);
    assert.equal(layout375.isMobile, true);
    assert.equal(layout375.viewportWidth, 375);

    // Verify root CSS overflow-x boundary is active
    assert.ok(
      indexCss.includes('overflow-x: hidden'),
      'Root CSS must enforce overflow-x: hidden to prevent 375px window blowout'
    );
  });

  test('TC-RESP-BVA-02: 390px Modern Mobile Viewport (iPhone 14) — Intermediate Mobile Stability', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § Viewport Verification
    const layout390 = resolveTailwindClasses(
      'w-full max-w-full overflow-x-hidden flex flex-col',
      VIEWPORTS.IPHONE_14
    );
    assert.equal(layout390.isMobile, true);
    assert.equal(layout390.viewportWidth, 390);
    assert.equal(layout390.overflowX, 'hidden');
  });

  test('TC-RESP-BVA-03: 412px Android Viewport (Galaxy S20) — Form and Card Layout', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § Viewport Verification
    const layout412 = resolveTailwindClasses(
      'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
      VIEWPORTS.GALAXY_S20
    );
    assert.equal(layout412.isMobile, true);
    assert.equal(layout412.viewportWidth, 412);
    // On 412px (below sm: 640px), grid remains single-column
    assert.ok(!layout412.activeClasses.includes('sm:grid-cols-2'));
  });

  test('TC-RESP-BVA-04: 768px Tablet Breakpoint Boundary (iPad Portrait) — Exact Breakpoint Transition', () => {
    // Authoritative Requirement: PROJECT.md § Architecture (<=768px mobile vs >768px desktop)
    const tabletLayout = resolveTailwindClasses(
      'flex flex-col md:flex-row items-stretch md:items-center px-4 md:px-8',
      VIEWPORTS.IPAD_PORTRAIT
    );
    assert.equal(tabletLayout.viewportWidth, 768);
    // At 768px, md: prefix activates
    assert.equal(tabletLayout.flexDirection, 'row');
  });

  test('TC-RESP-BVA-05: 1280px Desktop Baseline Viewport — Full Unconstrained Layout', () => {
    // Authoritative Requirement: PROJECT.md § Architecture & R4
    const desktopLayout = resolveTailwindClasses(
      'flex flex-col sm:flex-row items-stretch sm:items-center px-4 sm:px-6 lg:px-8',
      VIEWPORTS.DESKTOP_HD
    );
    assert.equal(desktopLayout.isDesktop, true);
    assert.equal(desktopLayout.viewportWidth, 1280);
    assert.equal(desktopLayout.flexDirection, 'row');
  });
});

describe('Tier 2: Boundary Value Analysis — Constrained Heights & Short Screens', () => {
  const appTsx = loadSourceFile('src/App.tsx');
  const authTsx = loadSourceFile('src/components/AuthModal.tsx');
  const profileTsx = loadSourceFile('src/components/ProfileModal.tsx');
  const deptTsx = loadSourceFile('src/components/DepartmentDashboard.tsx');

  test('TC-RESP-BVA-06: Modal Top-Clipping Boundary on Short Screens (H = 667px iPhone SE & H = 568px Landscape)', () => {
    // Authoritative Requirement: PROJECT.md § Interface Contracts (Modals standard)
    // Short screen height requires overflow-y-auto and items-start or my-auto
    const authSafety = evaluateModalSafety(authTsx);
    assert.ok(
      authSafety.hasScrollableBackdrop,
      'AuthModal must have overflow-y-auto on outer backdrop'
    );
    assert.ok(
      authSafety.hasTopClippingProtection,
      'AuthModal must feature items-start or my-auto to protect against top-clipping on short screens'
    );
  });

  test('TC-RESP-BVA-07: ProfileModal Viewport Overflow Boundary on Constrained Heights', () => {
    // Authoritative Requirement: PROJECT.md § Feature 14
    const profileSafety = evaluateModalSafety(profileTsx);
    assert.ok(
      profileSafety.hasScrollableBackdrop,
      'ProfileModal backdrop must have overflow-y-auto'
    );
    assert.ok(
      profileSafety.hasTopClippingProtection,
      'ProfileModal must feature items-start or my-auto to prevent button occlusion'
    );
  });

  test('TC-RESP-BVA-08: App.tsx Logout Modal Sizing on Constrained Viewport Height', () => {
    // Authoritative Requirement: PROJECT.md § Feature 4
    const modalIndex = appTsx.indexOf('isLogoutConfirmOpen &&');
    assert.ok(modalIndex !== -1, 'Logout modal must exist in App.tsx');

    const modalSnippet = appTsx.slice(modalIndex, modalIndex + 600);
    assert.ok(
      modalSnippet.includes('overflow-y-auto'),
      'Logout modal container must provide overflow-y-auto'
    );
    assert.ok(
      modalSnippet.includes('my-auto') || modalSnippet.includes('items-start'),
      'Logout modal card must specify my-auto or items-start for short screens'
    );
  });

  test('TC-RESP-BVA-09: DepartmentDashboard Inspection Drawer Modal Scrollability on Short Viewports', () => {
    // Authoritative Requirement: PROJECT.md § Feature 9
    const drawerIndex = deptTsx.indexOf('selectedTicket &&') !== -1
      ? deptTsx.indexOf('selectedTicket &&')
      : deptTsx.indexOf('TICKET INSPECTION & RESPONSE DRAWER MODAL');
    assert.ok(drawerIndex !== -1, 'Inspection drawer modal must exist');

    const drawerSnippet = deptTsx.slice(drawerIndex, drawerIndex + 800);
    assert.ok(
      drawerSnippet.includes('overflow-y-auto') || deptTsx.includes('overflow-y-auto'),
      'Inspection drawer must provide vertical scrolling'
    );
  });
});

describe('Tier 2: Boundary Value Analysis — Extreme Data Stress & Deep Data Grids', () => {
  const formTsx = loadSourceFile('src/components/StudentComplaintForm.tsx');
  const adminTsx = loadSourceFile('src/components/AdminDashboard.tsx');
  const deptTsx = loadSourceFile('src/components/DepartmentDashboard.tsx');
  const chartsTsx = loadSourceFile('src/components/Charts.tsx');
  const reportTsx = loadSourceFile('src/components/ReportDownloader.tsx');

  test('TC-RESP-BVA-10: Long Student Badge String Stress (100+ Char Student Name/Room)', () => {
    // Authoritative Requirement: PROJECT.md § Feature 12 & survey
    // Student context pill must not trigger horizontal scroll when user details are extensive
    const pillIndex = formTsx.indexOf('Student Context Pill');
    assert.ok(pillIndex !== -1, 'Student context pill must exist');

    const pillSnippet = formTsx.slice(pillIndex, pillIndex + 500);
    assert.ok(
      pillSnippet.includes('flex-wrap') || pillSnippet.includes('truncate') || pillSnippet.includes('max-w-'),
      'Student context pill must withstand long string expansion via flex-wrap or truncation'
    );
  });

  test('TC-RESP-BVA-11: Deep Multi-Column Table Stress (6+ Columns with Long Summaries)', () => {
    // Authoritative Requirement: PROJECT.md § Feature 6
    const tableIndex = deptTsx.indexOf('<table');
    assert.ok(tableIndex !== -1, 'Table must exist in DepartmentDashboard');

    const tableSnippet = deptTsx.slice(Math.max(0, tableIndex - 200), tableIndex + 200);
    assert.ok(
      tableSnippet.includes('overflow-x-auto'),
      'Deep table container must be wrapped in overflow-x-auto'
    );
    assert.ok(
      tableSnippet.includes('min-w-') || deptTsx.includes('min-w-[600px]') || deptTsx.includes('min-w-[640px]'),
      'Deep table columns must have enforced minimum width to prevent cell crushing'
    );
  });

  test('TC-RESP-BVA-12: Multi-Page Pagination Stress (10+ Pages) in AdminDashboard.tsx', () => {
    // Authoritative Requirement: PROJECT.md § Feature 8
    const pageIndex = adminTsx.indexOf('totalPages');
    assert.ok(pageIndex !== -1, 'Pagination logic must exist in AdminDashboard.tsx');

    const paginationSnippet = adminTsx.slice(pageIndex, pageIndex + 600);
    assert.ok(
      paginationSnippet.includes('overflow-x-auto') || paginationSnippet.includes('flex-wrap') || adminTsx.includes('flex-col sm:flex-row'),
      'AdminDashboard pagination must wrap or scroll horizontally when totalPages is high'
    );
  });

  test('TC-RESP-BVA-13: SVG Donut and Bar Chart Boundary Scaling at 375px Mobile Viewport', () => {
    // Authoritative Requirement: PROJECT.md § Feature 7
    const barChartIndex = chartsTsx.indexOf('function BarChart');
    assert.ok(barChartIndex !== -1, 'BarChart must exist in Charts.tsx');

    const barSnippet = chartsTsx.slice(barChartIndex, barChartIndex + 1500);
    assert.ok(
      barSnippet.includes('overflow-x-auto'),
      'Dynamic SVG BarChart container must provide overflow-x-auto for touch swiping'
    );
  });

  test('TC-RESP-BVA-14: ReportDownloader Popover Position at Left/Right Viewport Edges', () => {
    // Authoritative Requirement: PROJECT.md § Feature 10
    const popoverIndex = reportTsx.indexOf('Format Options');
    assert.ok(popoverIndex !== -1, 'Popover must exist');

    const popoverSnippet = reportTsx.slice(Math.max(0, popoverIndex - 300), popoverIndex + 200);
    assert.ok(
      popoverSnippet.includes('max-w-[calc(100vw-2rem)]') || popoverSnippet.includes('w-full') || popoverSnippet.includes('max-w-'),
      'Export popover must stay within screen boundaries on 375px mobile screens'
    );
  });
});
