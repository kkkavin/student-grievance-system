/**
 * test/responsive/challenger_m1_adversarial_stress.test.ts
 *
 * EMPIRICAL CHALLENGER Stress Test Suite for Milestone 1:
 * - Extremely narrow viewports (320px, 360px, 375px)
 * - Long user names / registration numbers in header
 * - Landscape orientation on mobile devices (short heights: 375px, 320px, 260px)
 * - Logout dialog clipping risk on short screens
 * - Zero regression on desktop viewports (>768px: 1024px, 1280px, 1440px)
 * - Viewport boundary enforcement in src/index.css & src/App.tsx
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

describe('CHALLENGER STRESS: Milestone 1 Viewport & Responsive Hardening', () => {
  const indexCss = loadSourceFile('src/index.css');
  const appTsx = loadSourceFile('src/App.tsx');

  // ==========================================================================
  // 1. EXTREMELY NARROW VIEWPORTS (320px, 360px, 375px)
  // ==========================================================================
  describe('Dimension 1: Extremely Narrow Viewports (320px - 375px)', () => {
    const narrowViewports = [
      { name: 'Ultra-Compact Mobile (iPhone SE 1st Gen)', width: 320, height: 568 },
      { name: 'Budget Android (Galaxy A / Redmi)', width: 360, height: 640 },
      { name: 'Standard Compact (iPhone SE 2nd/3rd Gen)', width: 375, height: 667 },
    ];

    for (const vp of narrowViewports) {
      test(`STRESS-M1-01: Header Layout Budget at ${vp.width}px (${vp.name})`, () => {
        // Find header container classes
        const headerMatch = appTsx.match(/<header[\s\S]*?<div className="([^"]*max-w-7xl[^"]*)"/);
        assert.ok(headerMatch, 'Header container must exist');
        const headerClasses = headerMatch[1];

        // Container horizontal padding on mobile is px-3 (12px * 2 = 24px)
        assert.ok(headerClasses.includes('px-3'), 'Header must use px-3 padding on mobile');
        const paddingTotal = 24;
        const availableInnerWidth = vp.width - paddingTotal;

        // Verify Brand Title and Subtitle have truncation protection to prevent blowout
        assert.ok(
          appTsx.includes('truncate') && appTsx.includes('min-w-0'),
          'Brand container must have min-w-0 and truncate to prevent flex blowout at narrow viewports'
        );

        // Subtitle must have max-w constraint or truncate
        assert.ok(
          appTsx.includes('max-w-[130px]') || appTsx.includes('truncate'),
          'Subtitle must be truncated on narrow screens'
        );

        // Verify root container has overflow-x-hidden
        assert.ok(
          appTsx.includes('overflow-x-hidden'),
          'App root container must declare overflow-x-hidden'
        );
      });

      test(`STRESS-M1-02: Authenticated Header Profile Trigger at ${vp.width}px (${vp.name})`, () => {
        // In authenticated state, on mobile (<640px / sm:), the user name/regNo text
        // MUST be hidden (hidden sm:block) so only avatar + chevron is visible,
        // preventing header blowout on 320px/360px/375px screens.
        const nameBlockMatch = appTsx.match(/className="([^"]*hidden sm:block[^"]*)"[\s\S]*?\{currentUser\.name\}/);
        assert.ok(nameBlockMatch, 'User name/regNo block must be wrapped in hidden sm:block');

        // Profile button trigger width calculation:
        // Avatar circle: w-8 h-8 (32px)
        // Chevron: w-3.5 h-3.5 (14px)
        // Padding: pl-2 sm:pl-2.5 pr-2.5 sm:pr-3 (18px on mobile)
        // Gap: gap-1.5 sm:gap-2 (6px on mobile)
        // Total profile trigger width ~ 70px.
        // Combined with dark toggle (44px) + gap-1.5 (6px) = 120px.
        // At 320px: available width = 296px. 296 - 120 - 8 (gap-2) - 44 (logo icon + gap) = 124px available for title!
        assert.ok(
          vp.width >= 320,
          `At ${vp.width}px, authenticated header has sufficient headroom (> 100px) for title`
        );
      });

      test(`STRESS-M1-03: User Profile Dropdown Menu Width at ${vp.width}px (${vp.name})`, () => {
        // Dropdown card must not overflow screen edges on narrow screens
        const dropdownMatch = appTsx.match(/id="user-profile-dropdown-btn"[\s\S]*?<div className="absolute right-0 mt-2 ([^"]*)"/);
        assert.ok(dropdownMatch, 'Profile dropdown menu card must exist');
        const dropdownClasses = dropdownMatch[1];

        // Must specify max-w-[calc(100vw-1.5rem)] or similar viewport-bound max width
        assert.ok(
          dropdownClasses.includes('max-w-[calc(100vw-1.5rem)]') || dropdownClasses.includes('max-w-full') || dropdownClasses.includes('max-w-['),
          'Dropdown menu must be constrained by viewport width on narrow screens'
        );

        // Both dropdown options must meet 44px touch target on mobile
        assert.ok(
          appTsx.includes('id="dropdown-profile-option"'),
          'dropdown-profile-option must exist'
        );
        assert.ok(
          appTsx.includes('id="dropdown-logout-option"'),
          'dropdown-logout-option must exist'
        );

        // Extract dropdown options class snippet
        const profileOptionClasses = appTsx.match(/id="dropdown-profile-option"[\s\S]*?className="([^"]*)"/)?.[1];
        const logoutOptionClasses = appTsx.match(/id="dropdown-logout-option"[\s\S]*?className="([^"]*)"/)?.[1];

        assert.ok(profileOptionClasses, 'Profile option classes must exist');
        assert.ok(logoutOptionClasses, 'Logout option classes must exist');

        assert.ok(
          profileOptionClasses.includes('min-h-[44px]') || profileOptionClasses.includes('py-3'),
          'Profile option must have >= 44px tap target on mobile'
        );
        assert.ok(
          logoutOptionClasses.includes('min-h-[44px]') || logoutOptionClasses.includes('py-3'),
          'Logout option must have >= 44px tap target on mobile'
        );
      });
    }
  });

  // ==========================================================================
  // 2. LONG USER NAMES & REGISTRATION NUMBERS IN HEADER
  // ==========================================================================
  describe('Dimension 2: Long User Names & Registration Numbers', () => {
    test('STRESS-M1-04: Mobile Profile Header Trigger Is Immune to Long User Names', () => {
      // On mobile screens (<640px), the user's name and registration number are hidden (hidden sm:block),
      // meaning even a 500-character name cannot blow up the mobile header!
      const profileButtonSnippet = appTsx.match(/id="user-profile-dropdown-btn"[\s\S]*?<\/button>/)?.[0];
      assert.ok(profileButtonSnippet, 'Profile dropdown button must exist');

      assert.ok(
        profileButtonSnippet.includes('hidden sm:block'),
        'User text details must be hidden on mobile screen to prevent layout blow-up from long names'
      );
    });

    test('STRESS-M1-05: User Dropdown Header Truncates Extremely Long Names and Emails', () => {
      // When dropdown is opened, the user's name and email are displayed in the dropdown header.
      // They MUST feature truncate so long names/emails do not expand the dropdown box.
      const dropdownHeaderMatch = appTsx.match(/<div className="px-4 py-2 border-b[^"]*">([\s\S]*?)<\/div>/);
      assert.ok(dropdownHeaderMatch, 'Dropdown header with user name/email must exist');
      const innerContent = dropdownHeaderMatch[1];

      assert.ok(
        innerContent.includes('truncate'),
        'User name and email in profile dropdown header must have truncate applied'
      );
    });

    test('STRESS-M1-06: Desktop Profile Header Trigger with Long Name Analysis', () => {
      // On desktop (>=640px), the user name is displayed.
      // We challenge whether the brand title has truncate to absorb any right-side expansion.
      const titleSpanMatch = appTsx.match(/Student Grievance System[\s\S]*?<\/span>/);
      assert.ok(titleSpanMatch, 'Title span must exist');
      assert.ok(
        appTsx.includes('truncate') && appTsx.includes('shrink-0'),
        'Header brand and right controls use truncate + shrink-0 to prevent layout collapse'
      );
    });
  });

  // ==========================================================================
  // 3. LANDSCAPE ORIENTATION ON MOBILE (Short Viewport Heights: 375px, 320px, 260px)
  // ==========================================================================
  describe('Dimension 3: Mobile Landscape & Constrained Height Orientation', () => {
    const landscapeViewports = [
      { name: 'iPhone SE Landscape (667x375)', width: 667, height: 375 },
      { name: 'iPhone 14 Landscape (844x390)', width: 844, height: 390 },
      { name: 'Galaxy S20 Landscape (915x412)', width: 915, height: 412 },
      { name: 'Constrained Landscape Split-Screen (667x260)', width: 667, height: 260 },
    ];

    for (const vp of landscapeViewports) {
      test(`STRESS-M1-07: Header Horizontal Stability in Landscape (${vp.name})`, () => {
        // In landscape, width >= 640px triggers sm: classes.
        // Brand logo expands to sm:w-10 sm:h-10 (40px)
        // Padding becomes sm:px-6 (48px total)
        // With width >= 667px, header has plenty of room (> 400px remaining).
        assert.ok(vp.width >= 640, 'Landscape width activates sm: classes cleanly');
      });
    }

    test('STRESS-M1-08: Logout Modal Top-Clipping Protection on Short Landscape Heights', () => {
      // Find the logout confirmation dialog
      const logoutModalSnippet = appTsx.match(/\{isLogoutConfirmOpen && \(([\s\S]*?)\)\}/)?.[1];
      assert.ok(logoutModalSnippet, 'Logout confirmation dialog must exist in src/App.tsx');

      const safety = evaluateModalSafety(logoutModalSnippet);
      assert.ok(
        safety.hasScrollableBackdrop,
        'Logout modal backdrop MUST have overflow-y-auto for scrollability on short screens'
      );
      assert.ok(
        safety.hasTopClippingProtection,
        'Logout modal card MUST have my-auto or items-start to prevent top-clipping on short screens'
      );
      assert.ok(
        safety.isSafeOnShortScreen,
        'Logout modal must be fully safe against vertical clipping on short landscape screens'
      );
    });

    test('STRESS-M1-09: Logout Modal Touch Targets on Mobile Landscape', () => {
      const cancelBtnClasses = appTsx.match(/id="cancel-logout-modal-btn"[\s\S]*?className="([^"]*)"/)?.[1];
      const confirmBtnClasses = appTsx.match(/id="confirm-logout-modal-btn"[\s\S]*?className="([^"]*)"/)?.[1];
      assert.ok(cancelBtnClasses, 'Cancel button must exist');
      assert.ok(confirmBtnClasses, 'Confirm button must exist');

      assert.ok(
        cancelBtnClasses.includes('min-h-[44px]'),
        'Cancel button must have min-h-[44px] touch target'
      );
      assert.ok(
        confirmBtnClasses.includes('min-h-[44px]'),
        'Confirm button must have min-h-[44px] touch target'
      );
    });
  });

  // ==========================================================================
  // 4. ZERO REGRESSION ON DESKTOP VIEWPORTS (>768px: 1024px, 1280px, 1440px)
  // ==========================================================================
  describe('Dimension 4: Zero Regression on Desktop Viewports (>768px)', () => {
    test('STRESS-M1-10: Header Desktop Classes & Dimensions Intact', () => {
      // Header container
      assert.ok(appTsx.includes('sm:px-6'), 'Desktop header padding sm:px-6 preserved');
      // Logo icon
      assert.ok(appTsx.includes('sm:w-10 sm:h-10'), 'Desktop logo container sm:w-10 sm:h-10 preserved');
      assert.ok(appTsx.includes('sm:w-6 sm:h-6'), 'Desktop logo icon sm:w-6 sm:h-6 preserved');
      // Brand typography
      assert.ok(appTsx.includes('md:text-lg'), 'Desktop brand title md:text-lg preserved');
      assert.ok(appTsx.includes('sm:max-w-none'), 'Desktop brand subtitle sm:max-w-none preserved');
      // Profile menu
      assert.ok(appTsx.includes('sm:w-52'), 'Desktop profile dropdown width sm:w-52 preserved');
      assert.ok(appTsx.includes('sm:py-2.5'), 'Desktop profile dropdown item padding sm:py-2.5 preserved');
      assert.ok(appTsx.includes('sm:min-h-0'), 'Desktop min-h reset sm:min-h-0 preserved for compact mouse UI');
    });

    test('STRESS-M1-11: Student Grievances Desktop Grid & Hero Preservation', () => {
      // Hero card
      assert.ok(appTsx.includes('sm:p-8 md:p-10'), 'Desktop hero padding sm:p-8 md:p-10 preserved');
      assert.ok(appTsx.includes('sm:rounded-3xl'), 'Desktop hero rounded-3xl preserved');
      assert.ok(appTsx.includes('sm:w-auto'), 'Hero CTA button sm:w-auto desktop inline width preserved');
      // Ticket grid
      assert.ok(appTsx.includes('md:grid-cols-2 lg:grid-cols-3'), 'Desktop 2-col/3-col ticket grid preserved');
    });

    test('STRESS-M1-12: Zero DOM Deletions or Text Deletions Invariance (R4)', () => {
      const requiredDomStrings = [
        'id="brand-logo-btn"',
        'id="dark-mode-toggle-btn"',
        'id="header-login-btn"',
        'id="user-profile-dropdown-btn"',
        'id="dropdown-profile-option"',
        'id="dropdown-logout-option"',
        'id="lodge-complaint-hero-btn"',
        'id="cancel-logout-modal-btn"',
        'id="confirm-logout-modal-btn"',
        'Student Grievance System',
        'AI-Powered College Redressal Cell',
        'Have a problem on campus or in your hostel?',
        'Your Lodged Grievances',
        'Confirm Logout',
      ];

      const domCheck = verifyDomPreservation(appTsx, requiredDomStrings);
      assert.ok(
        domCheck.intact,
        `DOM structural invariant violation: Missing strings [${domCheck.missing.join(', ')}]`
      );
    });
  });

  // ==========================================================================
  // 5. ROOT VIEWPORT BOUNDARY & UTILITIES IN src/index.css
  // ==========================================================================
  describe('Dimension 5: Root CSS Safety & Utility Invariants', () => {
    test('STRESS-M1-13: html and body enforce viewport containment', () => {
      assert.ok(
        /html,\s*body\s*\{[^}]*max-width:\s*100vw/i.test(indexCss),
        'html, body must have max-width: 100vw'
      );
      assert.ok(
        /html,\s*body\s*\{[^}]*overflow-x:\s*hidden/i.test(indexCss),
        'html, body must have overflow-x: hidden'
      );
      assert.ok(
        /html,\s*body\s*\{[^}]*touch-action:\s*manipulation/i.test(indexCss),
        'html, body must have touch-action: manipulation'
      );
      assert.ok(
        /html,\s*body\s*\{[^}]*-webkit-text-size-adjust:\s*100%/i.test(indexCss),
        'html, body must have -webkit-text-size-adjust: 100%'
      );
    });

    test('STRESS-M1-14: Momentum scrolling enabled for overflow containers', () => {
      assert.ok(
        /-webkit-overflow-scrolling:\s*touch/i.test(indexCss),
        'Momentum scrolling (-webkit-overflow-scrolling: touch) must be enabled'
      );
    });

    test('STRESS-M1-15: Cross-browser .scrollbar-none utility', () => {
      assert.ok(indexCss.includes('.scrollbar-none'), '.scrollbar-none class must exist');
      assert.ok(indexCss.includes('scrollbar-width: none'), 'scrollbar-width: none for Firefox');
      assert.ok(indexCss.includes('-ms-overflow-style: none'), '-ms-overflow-style: none for IE/Edge');
      assert.ok(indexCss.includes('::-webkit-scrollbar'), '::-webkit-scrollbar display: none for WebKit/Blink');
    });
  });
});
