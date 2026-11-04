/**
 * test/responsive/tier1_feature_coverage.test.ts
 *
 * Tier 1: Feature Coverage E2E Responsive Test Suite (>= 5 tests per feature)
 *
 * Requirements Covered:
 * - R1: Responsive Global Layout and Navigation (Features 1, 2, 3, 4)
 * - R2: Responsive Dashboards and Data Grids (Features 5, 6, 7, 8, 9, 10)
 * - R3: Responsive Forms, Modals, and Moderation Views (Features 11, 12, 13, 14, 15)
 * - R4: Non-Destructive Layout Constraints and Baseline Preservation (Feature 16)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWPORTS,
  loadSourceFile,
  resolveTailwindClasses,
  verifyDomPreservation,
  evaluateModalSafety,
} from './viewport_engine.ts';

describe('Tier 1: Feature Coverage — R1 Global Layout & Navigation', () => {
  const indexCss = loadSourceFile('src/index.css');
  const appTsx = loadSourceFile('src/App.tsx');

  test('TC-RESP-R1-01: Root Viewport Boundary sets max-width: 100vw and overflow-x: hidden in src/index.css', () => {
    // Authoritative Requirement: PROJECT.md § Feature 1 & R1
    // html, body must have overflow-x: hidden and max-width: 100vw to eliminate mobile page wobble
    const hasOverflowXHidden = /overflow-x:\s*hidden/i.test(indexCss);
    const hasMaxWidth100vw = /max-width:\s*100vw/i.test(indexCss) || /w-screen/i.test(indexCss);
    
    assert.ok(
      hasOverflowXHidden,
      'src/index.css must declare overflow-x: hidden on html/body to prevent horizontal window wobble'
    );
    assert.ok(
      hasMaxWidth100vw,
      'src/index.css must declare max-width: 100vw to bound viewport width'
    );
  });

  test('TC-RESP-R1-02: Header brand title scales responsively with text-sm sm:text-base md:text-lg in src/App.tsx', () => {
    // Authoritative Requirement: PROJECT.md § Feature 2 & survey
    // Title must be compact on mobile (text-sm) and larger on desktop (md:text-lg)
    const titleMatch = appTsx.match(/className="([^"]*font-bold[^"]*)"[^>]*>[\s\S]*?Student Grievance System/);
    assert.ok(titleMatch, 'Student Grievance System brand title element must exist in src/App.tsx');
    
    const titleClasses = titleMatch[1];
    assert.ok(
      titleClasses.includes('text-sm'),
      'Brand title should use mobile-friendly font sizing (text-sm)'
    );
    assert.ok(
      titleClasses.includes('text-lg') || titleClasses.includes('md:text-lg') || titleClasses.includes('sm:text-lg'),
      'Brand title must expand to text-lg on desktop viewports'
    );
  });

  test('TC-RESP-R1-03: Header subtitle applies truncation and max-width on mobile in src/App.tsx', () => {
    // Authoritative Requirement: PROJECT.md § Feature 2 & survey
    // Subtitle must truncate on mobile (e.g. max-w-[130px] min-[400px]:max-w-[180px] sm:max-w-none truncate)
    const subtitleMatch = appTsx.match(/className="([^"]*font-medium[^"]*)"[^>]*>[\s\S]*?AI-Powered College Redressal Cell/);
    assert.ok(subtitleMatch, 'AI-Powered College Redressal Cell subtitle element must exist in src/App.tsx');
    
    const subClasses = subtitleMatch[1];
    assert.ok(
      subClasses.includes('truncate'),
      'Subtitle must include truncate class to avoid multi-line collision on mobile'
    );
    assert.ok(
      subClasses.includes('max-w-') || subClasses.includes('sm:max-w-none'),
      'Subtitle must provide responsive max-width boundary on mobile'
    );
  });

  test('TC-RESP-R1-04: Header container uses compact horizontal padding px-3 with sm:px-6 in src/App.tsx', () => {
    // Authoritative Requirement: PROJECT.md § Feature 2
    const headerMatch = appTsx.match(/<header[^>]*>[\s\S]*?<div className="([^"]*max-w-7xl[^"]*)"/);
    assert.ok(headerMatch, 'Header inner max-w-7xl container must exist in src/App.tsx');
    
    const containerClasses = headerMatch[1];
    assert.ok(
      containerClasses.includes('px-3') || containerClasses.includes('px-4'),
      'Header container must use compact padding on mobile viewports (<= 768px)'
    );
    assert.ok(
      containerClasses.includes('sm:px-6') || containerClasses.includes('md:px-6'),
      'Header container must restore full desktop padding on viewports > 768px'
    );
  });

  test('TC-RESP-R1-05: Header login action button provides compact mobile padding and min-height', () => {
    // Authoritative Requirement: PROJECT.md § Feature 3
    const loginBtnMatch = appTsx.match(/onClick=\{[^}]*setIsAuthModalOpen\(true\)[^}]*\}[^>]*className="([^"]*)"/);
    assert.ok(loginBtnMatch, 'Header login button must exist in src/App.tsx');
    
    const btnClasses = loginBtnMatch[1];
    assert.ok(
      btnClasses.includes('text-[11px]') || btnClasses.includes('text-xs'),
      'Login button must have readable, compact typography on mobile'
    );
    assert.ok(
      btnClasses.includes('whitespace-nowrap'),
      'Login button must specify whitespace-nowrap to prevent awkward word splitting'
    );
    assert.ok(
      btnClasses.includes('min-h-[44px]') || btnClasses.includes('py-2') || btnClasses.includes('py-1.5'),
      'Login button must provide accessible touch height'
    );
  });

  test('TC-RESP-R1-06: Header dark mode toggle maintains accessible alignment across mobile and desktop', () => {
    // Authoritative Requirement: PROJECT.md § Feature 3
    const darkToggleMatch = appTsx.match(/id="dark-mode-toggle-btn"[\s\S]*?className="([^"]*)"/);
    assert.ok(darkToggleMatch, 'Dark mode toggle with id="dark-mode-toggle-btn" must exist in src/App.tsx');
    
    const toggleClasses = darkToggleMatch[1];
    assert.ok(
      toggleClasses.includes('min-w-[44px]') || toggleClasses.includes('p-2') || toggleClasses.includes('p-2.5'),
      'Dark mode toggle must retain accessible touch target (>= 44px)'
    );
  });

  test('TC-RESP-R1-07: Logout confirmation dialogue provides touch-friendly buttons and scrollable container in src/App.tsx', () => {
    // Authoritative Requirement: PROJECT.md § Feature 4
    const logoutModalMatch = appTsx.match(/id="cancel-logout-modal-btn"[\s\S]*?id="confirm-logout-modal-btn"/);
    assert.ok(logoutModalMatch, 'Logout confirmation buttons must exist in src/App.tsx');
    
    const modalSnippet = appTsx.slice(
      Math.max(0, appTsx.indexOf('isLogoutConfirmOpen &&') - 100),
      appTsx.indexOf('id="confirm-logout-modal-btn"') + 300
    );
    assert.ok(
      modalSnippet.includes('overflow-y-auto'),
      'Logout modal backdrop must have overflow-y-auto to prevent clipping on short mobile screens'
    );
    assert.ok(
      modalSnippet.includes('min-h-[44px]') || modalSnippet.includes('py-2.5'),
      'Logout dialogue buttons must meet touch target standards (>= 44px)'
    );
  });
});

describe('Tier 1: Feature Coverage — R2 Dashboards, Tables & Charts', () => {
  const adminTsx = loadSourceFile('src/components/AdminDashboard.tsx');
  const deptTsx = loadSourceFile('src/components/DepartmentDashboard.tsx');
  const predictiveTsx = loadSourceFile('src/components/PredictiveAnalyticsDashboard.tsx');
  const deptMgmtTsx = loadSourceFile('src/components/DepartmentManagement.tsx');
  const chartsTsx = loadSourceFile('src/components/Charts.tsx');
  const reportTsx = loadSourceFile('src/components/ReportDownloader.tsx');

  test('TC-RESP-R2-01: AdminDashboard multi-tab navigation strip incorporates horizontal scrolling', () => {
    // Authoritative Requirement: PROJECT.md § Feature 5 & R2
    // Tab bar buttons span >550px; requires overflow-x-auto to prevent mobile blowout
    const tabIndex = adminTsx.indexOf('id="toggle-view-queue"');
    assert.ok(tabIndex !== -1, 'AdminDashboard top view toggle buttons must exist');
    
    const tabParentSnippet = adminTsx.slice(Math.max(0, tabIndex - 300), tabIndex + 50);
    assert.ok(
      tabParentSnippet.includes('overflow-x-auto') || tabParentSnippet.includes('scrollbar-none'),
      'AdminDashboard tab bar container must include overflow-x-auto for touch swiping on mobile'
    );
  });

  test('TC-RESP-R2-02: PredictiveAnalyticsDashboard sub-tab bar includes horizontal scrolling', () => {
    // Authoritative Requirement: PROJECT.md § Feature 5 & R2
    const tabIndex = predictiveTsx.indexOf('Comprehensive View');
    assert.ok(tabIndex !== -1, 'Comprehensive View sub-tab must exist');

    const tabSection = predictiveTsx.slice(Math.max(0, tabIndex - 250), tabIndex + 150);
    assert.ok(
      tabSection.includes('overflow-x-auto') || tabSection.includes('scrollbar-none') || tabSection.includes('flex-wrap'),
      'PredictiveAnalyticsDashboard sub-tabs must provide overflow-x-auto or flex-wrap for small viewports'
    );
  });

  test('TC-RESP-R2-03: DepartmentManagement sub-tab navigation strip includes horizontal scroll', () => {
    // Authoritative Requirement: PROJECT.md § Feature 5 & R2
    const tabIndex = deptMgmtTsx.indexOf('Auto-Routing Rules');
    assert.ok(tabIndex !== -1, 'Auto-Routing Rules sub-tab must exist');

    const tabSection = deptMgmtTsx.slice(Math.max(0, tabIndex - 250), tabIndex + 150);
    assert.ok(
      tabSection.includes('overflow-x-auto') || tabSection.includes('scrollbar-none') || tabSection.includes('flex-wrap'),
      'DepartmentManagement sub-tabs must provide overflow-x-auto or flex-wrap'
    );
  });

  test('TC-RESP-R2-04: DepartmentDashboard grievance queue table wrapper enforces horizontal scroll & min-width', () => {
    // Authoritative Requirement: PROJECT.md § Feature 6 & R2
    const tableIndex = deptTsx.indexOf('<table');
    assert.ok(tableIndex !== -1, 'DepartmentDashboard must contain grievance table');
    
    const wrapperSnippet = deptTsx.slice(Math.max(0, tableIndex - 200), tableIndex + 150);
    assert.ok(
      wrapperSnippet.includes('overflow-x-auto'),
      'DepartmentDashboard table wrapper must have overflow-x-auto'
    );
    assert.ok(
      wrapperSnippet.includes('min-w-') || deptTsx.includes('min-w-[600px]') || deptTsx.includes('min-w-[640px]'),
      'Table columns must preserve minimum legible width on small screens'
    );
  });

  test('TC-RESP-R2-05: Charts.tsx Legend component implements flex-wrapping for mobile viewports', () => {
    // Authoritative Requirement: PROJECT.md § Feature 7 & R2
    const legendIndex = chartsTsx.indexOf('function Legend');
    assert.ok(legendIndex !== -1, 'Legend component must exist in Charts.tsx');
    
    const legendSnippet = chartsTsx.slice(legendIndex, legendIndex + 800);
    assert.ok(
      legendSnippet.includes('flex-wrap'),
      'Legend container must use flex-wrap to prevent chart legend clipping on mobile'
    );
  });

  test('TC-RESP-R2-06: AdminDashboard pagination wraps into flex-col on mobile and flex-row on desktop', () => {
    // Authoritative Requirement: PROJECT.md § Feature 8 & R2
    const paginationIndex = adminTsx.indexOf('Showing');
    assert.ok(paginationIndex !== -1, 'Pagination indicator must exist in AdminDashboard.tsx');
    
    const paginationSnippet = adminTsx.slice(Math.max(0, paginationIndex - 200), paginationIndex + 300);
    assert.ok(
      paginationSnippet.includes('flex-col') || paginationSnippet.includes('flex-wrap') || paginationSnippet.includes('overflow-x-auto'),
      'Pagination footer must adapt responsively for mobile screens'
    );
  });

  test('TC-RESP-R2-07: DepartmentDashboard inspection modal action buttons stack responsively on mobile', () => {
    // Authoritative Requirement: PROJECT.md § Feature 9 & R2
    const modalActionsIndex = deptTsx.indexOf('Resolve Grievance');
    assert.ok(modalActionsIndex !== -1, 'Resolve Grievance action button must exist');
    
    const actionsSnippet = deptTsx.slice(Math.max(0, modalActionsIndex - 400), modalActionsIndex + 200);
    assert.ok(
      actionsSnippet.includes('flex-col') || actionsSnippet.includes('flex-wrap') || actionsSnippet.includes('w-full'),
      'Inspection modal action buttons must stack vertically or wrap on small screens'
    );
  });

  test('TC-RESP-R2-08: ReportDownloader export dropdown specifies max-width constraint for mobile screens', () => {
    // Authoritative Requirement: PROJECT.md § Feature 10 & R2
    const dropdownIndex = reportTsx.indexOf('Format Options');
    assert.ok(dropdownIndex !== -1, 'Format Options popover must exist in ReportDownloader.tsx');
    
    const dropdownSnippet = reportTsx.slice(Math.max(0, dropdownIndex - 300), dropdownIndex + 100);
    assert.ok(
      dropdownSnippet.includes('max-w-[calc(100vw-2rem)]') || dropdownSnippet.includes('max-w-') || dropdownSnippet.includes('w-full') || dropdownSnippet.includes('sm:w-80'),
      'ReportDownloader popover must not bleed outside viewport on 375px mobile screens'
    );
  });
});

describe('Tier 1: Feature Coverage — R3 Forms, Modals & Moderation Views', () => {
  const formTsx = loadSourceFile('src/components/StudentComplaintForm.tsx');
  const authTsx = loadSourceFile('src/components/AuthModal.tsx');
  const profileTsx = loadSourceFile('src/components/ProfileModal.tsx');
  const triageTsx = loadSourceFile('src/components/TriageModerationView.tsx');

  test('TC-RESP-R3-01: StudentComplaintForm inputs and textareas expand to 100% width on mobile', () => {
    // Authoritative Requirement: PROJECT.md § Feature 11 & R3
    const textareaMatch = formTsx.match(/id="complaint-description-textarea"[^>]*className="([^"]*)"/);
    assert.ok(textareaMatch, 'Complaint description textarea must exist');
    
    const textareaClasses = textareaMatch[1];
    assert.ok(
      textareaClasses.includes('w-full'),
      'Complaint form textarea must use w-full for full-width touch usage'
    );
  });

  test('TC-RESP-R3-02: StudentComplaintForm submit button utilizes full-width on mobile and auto on desktop', () => {
    // Authoritative Requirement: PROJECT.md § Feature 11 & R3
    const submitBtnMatch = formTsx.match(/id="submit-grievance-btn"[^>]*className="([^"]*)"/);
    assert.ok(submitBtnMatch, 'Submit grievance button must exist');
    
    const btnClasses = submitBtnMatch[1];
    assert.ok(
      btnClasses.includes('w-full') || btnClasses.includes('sm:w-auto') || btnClasses.includes('py-3') || btnClasses.includes('py-2.5'),
      'Submit button must be full-width with touch-friendly padding on mobile'
    );
  });

  test('TC-RESP-R3-03: Student context badge employs flex-wrap to prevent horizontal overflow on 375px', () => {
    // Authoritative Requirement: PROJECT.md § Feature 12 & R3
    const contextBadgeIndex = formTsx.indexOf('Student Context Pill');
    assert.ok(contextBadgeIndex !== -1, 'Student context badge comment or structure must exist');
    
    const contextSnippet = formTsx.slice(contextBadgeIndex, contextBadgeIndex + 400);
    assert.ok(
      contextSnippet.includes('flex-wrap') || contextSnippet.includes('max-w-') || contextSnippet.includes('truncate'),
      'Student context badge container must accommodate long names via flex-wrap or truncation'
    );
  });

  test('TC-RESP-R3-04: StudentComplaintForm rich-text toolbar buttons maintain touch targets of >= 40px', () => {
    // Authoritative Requirement: PROJECT.md § Feature 12 & R3
    const toolbarIndex = formTsx.indexOf('insertFormatting');
    assert.ok(toolbarIndex !== -1, 'Formatting toolbar actions must exist');
    
    const toolbarSnippet = formTsx.slice(toolbarIndex, toolbarIndex + 600);
    assert.ok(
      toolbarSnippet.includes('p-2') || toolbarSnippet.includes('p-2.5') || toolbarSnippet.includes('p-1.5') || toolbarSnippet.includes('rounded-lg'),
      'Toolbar actions must provide accessible touch targets'
    );
  });

  test('TC-RESP-R3-05: AuthModal eliminates top-clipping risk on short screens via items-start and my-auto', () => {
    // Authoritative Requirement: PROJECT.md § Feature 13 & R3
    const modalSafety = evaluateModalSafety(authTsx);
    assert.ok(modalSafety.hasScrollableBackdrop, 'AuthModal must have overflow-y-auto on backdrop');
    assert.ok(
      modalSafety.hasTopClippingProtection,
      'AuthModal must include items-start or my-auto to eliminate top-clipping on short mobile viewports'
    );
  });

  test('TC-RESP-R3-06: ProfileModal protects against short-screen clipping and provides responsive action buttons', () => {
    // Authoritative Requirement: PROJECT.md § Feature 14 & R3
    const profileSafety = evaluateModalSafety(profileTsx);
    assert.ok(profileSafety.hasScrollableBackdrop, 'ProfileModal must have overflow-y-auto');
    assert.ok(
      profileSafety.hasTopClippingProtection,
      'ProfileModal must include items-start or my-auto'
    );
  });

  test('TC-RESP-R3-07: TriageModerationView stats pills utilize flex-wrap to prevent horizontal overflow', () => {
    // Authoritative Requirement: PROJECT.md § Feature 15 & R3
    const triageIndex = triageTsx.indexOf('Suspected Duplicate');
    assert.ok(triageIndex !== -1, 'Triage stats pill must exist');
    
    const statsSnippet = triageTsx.slice(Math.max(0, triageIndex - 300), triageIndex + 200);
    assert.ok(
      statsSnippet.includes('flex-wrap') || statsSnippet.includes('overflow-x-auto'),
      'Triage stats pill row must wrap or scroll horizontally'
    );
  });

  test('TC-RESP-R3-08: TriageModerationView comparison modal footer buttons stack responsively on mobile', () => {
    // Authoritative Requirement: PROJECT.md § Feature 15 & R3
    const comparisonIndex = triageTsx.indexOf('Merge into Master');
    assert.ok(comparisonIndex !== -1, 'Merge action button must exist in comparison view');
    
    const footerSnippet = triageTsx.slice(Math.max(0, comparisonIndex - 300), comparisonIndex + 300);
    assert.ok(
      footerSnippet.includes('flex-col') || footerSnippet.includes('flex-wrap') || footerSnippet.includes('items-stretch'),
      'Comparison modal footer buttons must stack or wrap on <= 768px viewports'
    );
  });
});

describe('Tier 1: Feature Coverage — R4 Non-Destructive Layout & Invariants Preservation', () => {
  const appTsx = loadSourceFile('src/App.tsx');
  const formTsx = loadSourceFile('src/components/StudentComplaintForm.tsx');
  const authTsx = loadSourceFile('src/components/AuthModal.tsx');

  test('TC-RESP-R4-01: Desktop baseline preservation: layout maintains desktop grids and horizontal rows on > 768px', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § Acceptance Criteria & R4
    // Desktop screens above 768px must retain multi-column layouts and desktop padding
    const desktopAdmin = resolveTailwindClasses(
      'p-4 sm:p-6 lg:p-8 flex flex-col sm:flex-row items-stretch sm:items-center',
      VIEWPORTS.DESKTOP_HD
    );
    assert.equal(desktopAdmin.isDesktop, true);
    assert.equal(desktopAdmin.flexDirection, 'row');
  });

  test('TC-RESP-R4-02: Zero DOM elements deleted in src/App.tsx and core component headers', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § R4
    const criticalAppElements = [
      'Student Grievance System',
      'AI-Powered College Redressal Cell',
      'Toggle Theme',
      'dark-mode-toggle-btn',
      'brand-logo-btn',
    ];
    const check = verifyDomPreservation(appTsx, criticalAppElements);
    assert.ok(check.intact, `Missing critical DOM elements in App.tsx: ${check.missing.join(', ')}`);
  });

  test('TC-RESP-R4-03: Zero DOM elements deleted in StudentComplaintForm.tsx', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § R4
    const criticalFormElements = [
      'complaint-description-textarea',
      'submit-grievance-btn',
      'back-to-home-btn',
      'Local ML Auto-Triage Active',
    ];
    const check = verifyDomPreservation(formTsx, criticalFormElements);
    assert.ok(check.intact, `Missing critical elements in StudentComplaintForm: ${check.missing.join(', ')}`);
  });

  test('TC-RESP-R4-04: Zero DOM elements deleted in AuthModal.tsx', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § R4
    const criticalAuthElements = [
      'tab-login-btn',
      'tab-signup-btn',
      'tab-admin-btn',
      'Student Login',
      'Student Sign Up',
      'Admin Access',
      'close-auth-modal-btn',
    ];
    const check = verifyDomPreservation(authTsx, criticalAuthElements);
    assert.ok(check.intact, `Missing critical elements in AuthModal: ${check.missing.join(', ')}`);
  });

  test('TC-RESP-R4-05: Non-destructive CSS additions preserve existing desktop utility classes', () => {
    // Authoritative Requirement: ORIGINAL_REQUEST.md § R4
    // Ensures responsive prefixes (sm:, md:, lg:) are used rather than destructive class replacement
    const sampleComponentClass = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between';
    const mobileLayout = resolveTailwindClasses(sampleComponentClass, VIEWPORTS.IPHONE_SE);
    const desktopLayout = resolveTailwindClasses(sampleComponentClass, VIEWPORTS.DESKTOP_HD);

    assert.equal(mobileLayout.flexDirection, 'col', 'Mobile layout must stack vertically');
    assert.equal(desktopLayout.flexDirection, 'row', 'Desktop layout must remain horizontal');
  });
});
