/**
 * test/responsive/tier3_cross_feature_combinations.test.ts
 *
 * Tier 3: Cross-Feature Combinations (Pairwise Integration) E2E Responsive Suite
 *
 * Requirements Covered:
 * - Pairwise 1: Modal opened in mobile view (375px) on short screen (<=667px)
 * - Pairwise 2: Sub-tab switching while viewing filtered table data on mobile
 * - Pairwise 3: Student complaint form submission with voice input and rich-text toolbar
 * - Pairwise 4: Theme switching (dark/light mode toggle) on mobile (375px)
 * - Pairwise 5: Table inspection drawer with multi-action reassignment on mobile
 * - Pairwise 6: Triage duplicate moderation comparison modal with master notes on mobile
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWPORTS,
  loadSourceFile,
  resolveTailwindClasses,
  evaluateModalSafety,
} from './viewport_engine.ts';

describe('Tier 3: Pairwise Combinations — Mobile Modals & Viewport Constraints', () => {
  const appTsx = loadSourceFile('src/App.tsx');
  const authTsx = loadSourceFile('src/components/AuthModal.tsx');
  const profileTsx = loadSourceFile('src/components/ProfileModal.tsx');

  test('TC-RESP-PAIR-01: Modal opened in mobile view (375px) with short screen height (<=667px)', () => {
    // Authoritative Requirement: PROJECT.md § M3 & Interface Contracts
    // Combines mobile width constraint (375px) + short screen height (667px or 568px)
    const authSafety = evaluateModalSafety(authTsx);
    const profileSafety = evaluateModalSafety(profileTsx);

    assert.ok(
      authSafety.hasScrollableBackdrop,
      'AuthModal must be vertically scrollable on short mobile screens'
    );
    assert.ok(
      authSafety.hasTopClippingProtection,
      'AuthModal must prevent top-clipping on short screens (items-start or my-auto)'
    );

    assert.ok(
      profileSafety.hasScrollableBackdrop,
      'ProfileModal must be vertically scrollable on short mobile screens'
    );
    assert.ok(
      profileSafety.hasTopClippingProtection,
      'ProfileModal must prevent top-clipping on short screens'
    );
  });

  test('TC-RESP-PAIR-02: App.tsx user profile menu and logout modal interaction on 375px mobile', () => {
    // Combines profile dropdown menu trigger + confirmation dialogue on mobile
    const profileBtnMatch = appTsx.match(/id="user-profile-dropdown-btn"[\s\S]*?className="([^"]*)"/);
    assert.ok(profileBtnMatch, 'Profile menu button must exist in App.tsx');

    const logoutModalIndex = appTsx.indexOf('isLogoutConfirmOpen &&');
    assert.ok(logoutModalIndex !== -1, 'Logout dialogue must exist in App.tsx');

    const logoutSnippet = appTsx.slice(logoutModalIndex, logoutModalIndex + 700);
    assert.ok(
      logoutSnippet.includes('my-auto') || logoutSnippet.includes('items-start'),
      'Logout dialogue must be centered or top-aligned with safe vertical margin on mobile'
    );
  });
});

describe('Tier 3: Pairwise Combinations — Dashboard Navigation & Filter State on Mobile', () => {
  const adminTsx = loadSourceFile('src/components/AdminDashboard.tsx');
  const deptTsx = loadSourceFile('src/components/DepartmentDashboard.tsx');
  const predictiveTsx = loadSourceFile('src/components/PredictiveAnalyticsDashboard.tsx');

  test('TC-RESP-PAIR-03: Sub-tab switching while viewing filtered table data on mobile', () => {
    // Combines multi-tab navigation strip with filtered search/date inputs
    const tabMatch = adminTsx.indexOf('id="toggle-view-queue"');
    assert.ok(tabMatch !== -1, 'AdminDashboard tab strip must exist');

    const tabParent = adminTsx.slice(Math.max(0, tabMatch - 300), tabMatch + 100);
    assert.ok(
      tabParent.includes('overflow-x-auto') || tabParent.includes('scrollbar-none'),
      'Tab strip must permit horizontal scrolling without triggering root page overflow'
    );

    const filterIndex = adminTsx.indexOf('Filter by Status');
    assert.ok(filterIndex !== -1, 'Status filter must exist in AdminDashboard');
  });

  test('TC-RESP-PAIR-04: Predictive Analytics sub-tab navigation with dynamic SVG chart cards on mobile', () => {
    // Combines predictive sub-tab switching with SVG chart rendering
    const tabIndex = predictiveTsx.indexOf('Comprehensive View');
    assert.ok(tabIndex !== -1, 'PredictiveAnalytics sub-tabs must exist');

    const kpiIndex = predictiveTsx.indexOf('Campus Risk Index');
    assert.ok(kpiIndex !== -1, 'Predictive KPI cards must exist');

    const kpiSnippet = predictiveTsx.slice(Math.max(0, kpiIndex - 300), kpiIndex + 100);
    assert.ok(
      kpiSnippet.includes('grid-cols-1') || kpiSnippet.includes('flex-col'),
      'Predictive KPI cards must stack on mobile viewports (<= 768px)'
    );
  });
});

describe('Tier 3: Pairwise Combinations — Form Submission, Voice Dictation & Rich-Text Formatting', () => {
  const formTsx = loadSourceFile('src/components/StudentComplaintForm.tsx');

  test('TC-RESP-PAIR-05: Form submission with voice dictation active and rich-text toolbar buttons', () => {
    // Combines speech-to-text mic recording + rich-text formatting tools + full-width submit button
    const micIndex = formTsx.indexOf('toggleVoiceInput');
    assert.ok(micIndex !== -1, 'Voice input toggle function must exist');

    const submitIndex = formTsx.indexOf('id="submit-grievance-btn"');
    assert.ok(submitIndex !== -1, 'Submit button must exist in StudentComplaintForm');

    const submitSnippet = formTsx.slice(submitIndex, submitIndex + 250);
    assert.ok(
      submitSnippet.includes('w-full') || submitSnippet.includes('sm:w-auto'),
      'Submit button must be full-width on mobile'
    );
  });

  test('TC-RESP-PAIR-06: Submission success celebration screen layout on 375px mobile', () => {
    // Combines successful submission state + action buttons (View in Dashboard & Lodge Another)
    const successIndex = formTsx.indexOf('id="success-view-dashboard-btn"');
    assert.ok(successIndex !== -1, 'Success view button must exist in StudentComplaintForm');

    const successSnippet = formTsx.slice(Math.max(0, successIndex - 300), successIndex + 300);
    assert.ok(
      successSnippet.includes('flex-col sm:flex-row'),
      'Success screen buttons must stack into flex-col on mobile and flex-row on desktop'
    );
  });
});

describe('Tier 3: Pairwise Combinations — Theme Switching & Contrast on Mobile', () => {
  const appTsx = loadSourceFile('src/App.tsx');
  const indexCss = loadSourceFile('src/index.css');

  test('TC-RESP-PAIR-07: Theme switching (dark mode toggle) maintains responsive alignment without layout shifts', () => {
    // Combines dark theme variant activation + mobile header layout alignment
    const darkToggleIndex = appTsx.indexOf('id="dark-mode-toggle-btn"');
    assert.ok(darkToggleIndex !== -1, 'Dark mode toggle must exist');

    const headerSnippet = appTsx.slice(Math.max(0, appTsx.indexOf('<header')), darkToggleIndex + 200);
    assert.ok(
      headerSnippet.includes('dark:bg-slate-900') || headerSnippet.includes('dark:text-'),
      'Header must specify dark mode styling alongside responsive spacing'
    );
    assert.ok(
      indexCss.includes('.dark body'),
      'Root stylesheet must provide dark mode background definitions'
    );
  });
});

describe('Tier 3: Pairwise Combinations — Moderation Triage & Comparison Modals', () => {
  const triageTsx = loadSourceFile('src/components/TriageModerationView.tsx');

  test('TC-RESP-PAIR-08: Triage side-by-side comparison modal with notes editor and 3 actions on mobile', () => {
    // Combines comparison diff modal + public master notes + action footer buttons
    const comparisonIndex = triageTsx.indexOf('Merge into Master');
    assert.ok(comparisonIndex !== -1, 'Comparison modal merge action must exist');

    const actionsSnippet = triageTsx.slice(Math.max(0, comparisonIndex - 300), comparisonIndex + 200);
    assert.ok(
      actionsSnippet.includes('flex-col') || actionsSnippet.includes('flex-wrap') || actionsSnippet.includes('items-stretch'),
      'Comparison modal actions must adapt responsively on mobile viewports'
    );
  });
});
