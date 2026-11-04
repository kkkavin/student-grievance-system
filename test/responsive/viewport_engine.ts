/**
 * test/responsive/viewport_engine.ts
 *
 * High-Fidelity Node-based Viewport & Responsive CSS Verification Engine.
 * 
 * Provides opaque-box static and dynamic layout evaluation across:
 * - Mobile viewports (<=768px down to 375px: iPhone SE, iPhone 14, Galaxy S20, iPad portrait)
 * - Desktop baseline viewports (>768px: 1024px, 1280px, 1440px)
 * - Constrained screen heights (<=667px: iPhone SE, virtual keyboard landscape)
 * - Tailwind CSS v4 class resolution across breakpoints (base, sm: 640px, md: 768px, lg: 1024px, xl: 1280px)
 * - DOM structural preservation and non-destructive invariant tracking (R4)
 * - Real-world HTTP server lifecycle and API interaction testing
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { getDatabase } from '../../db.ts';

// ============================================================================
// 1. Viewport Definitions & Breakpoints
// ============================================================================

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  isMobile: boolean;
  isShort: boolean;
  category: 'compact-mobile' | 'standard-mobile' | 'tablet' | 'desktop';
}

export const VIEWPORTS: Record<string, ViewportConfig> = {
  IPHONE_SE: {
    name: 'iPhone SE (375x667)',
    width: 375,
    height: 667,
    isMobile: true,
    isShort: true,
    category: 'compact-mobile',
  },
  IPHONE_14: {
    name: 'iPhone 14 (390x844)',
    width: 390,
    height: 844,
    isMobile: true,
    isShort: false,
    category: 'standard-mobile',
  },
  GALAXY_S20: {
    name: 'Galaxy S20 (412x915)',
    width: 412,
    height: 915,
    isMobile: true,
    isShort: false,
    category: 'standard-mobile',
  },
  IPAD_PORTRAIT: {
    name: 'iPad Portrait (768x1024)',
    width: 768,
    height: 1024,
    isMobile: true, // <= 768px boundary
    isShort: false,
    category: 'tablet',
  },
  DESKTOP_HD: {
    name: 'Desktop HD (1280x800)',
    width: 1280,
    height: 800,
    isMobile: false,
    isShort: false,
    category: 'desktop',
  },
  DESKTOP_FHD: {
    name: 'Desktop Full HD (1440x900)',
    width: 1440,
    height: 900,
    isMobile: false,
    isShort: false,
    category: 'desktop',
  },
  SHORT_MOBILE: {
    name: 'Constrained Short Mobile (375x568)',
    width: 375,
    height: 568,
    isMobile: true,
    isShort: true,
    category: 'compact-mobile',
  },
};

export const TAILWIND_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// ============================================================================
// 2. Tailwind CSS Responsive Resolver
// ============================================================================

export interface ResolvedLayout {
  viewportWidth: number;
  viewportHeight: number;
  isMobile: boolean;
  isDesktop: boolean;
  isShortScreen: boolean;
  display?: 'flex' | 'grid' | 'block' | 'inline-flex' | 'hidden' | 'inline-block';
  flexDirection?: 'row' | 'col';
  flexWrap?: 'wrap' | 'nowrap';
  overflowX?: 'auto' | 'hidden' | 'visible' | 'scroll';
  overflowY?: 'auto' | 'hidden' | 'visible' | 'scroll';
  width?: 'full' | 'auto' | 'fit' | string;
  minWidth?: string;
  maxWidth?: string;
  paddingXRem?: number;
  paddingYRem?: number;
  touchTargetPx?: number;
  activeClasses: string[];
}

/**
 * Parses a Tailwind class string and resolves active properties at a specific viewport.
 */
export function resolveTailwindClasses(
  classString: string,
  viewport: ViewportConfig
): ResolvedLayout {
  const tokens = classString.split(/\s+/).filter(Boolean);
  const activeClasses: string[] = [];

  const propertyOverrides: Record<string, string> = {};

  for (const token of tokens) {
    const parts = token.split(':');
    let prefix: string | null = null;
    let baseClass = token;

    if (parts.length > 1) {
      prefix = parts[0];
      baseClass = parts.slice(1).join(':');
    }

    let isActive = false;
    if (!prefix) {
      // Base mobile-first class
      isActive = true;
    } else if (prefix === 'sm' && viewport.width >= TAILWIND_BREAKPOINTS.sm) {
      isActive = true;
    } else if (prefix === 'md' && viewport.width >= TAILWIND_BREAKPOINTS.md) {
      isActive = true;
    } else if (prefix === 'lg' && viewport.width >= TAILWIND_BREAKPOINTS.lg) {
      isActive = true;
    } else if (prefix === 'xl' && viewport.width >= TAILWIND_BREAKPOINTS.xl) {
      isActive = true;
    } else if (prefix === 'dark') {
      // Retain dark mode classes as active if not conflicting with layout
      isActive = true;
    }

    if (isActive) {
      activeClasses.push(token);

      // Map to core layout properties
      if (baseClass === 'flex') propertyOverrides['display'] = 'flex';
      else if (baseClass === 'grid') propertyOverrides['display'] = 'grid';
      else if (baseClass === 'block') propertyOverrides['display'] = 'block';
      else if (baseClass === 'inline-flex') propertyOverrides['display'] = 'inline-flex';
      else if (baseClass === 'hidden') propertyOverrides['display'] = 'hidden';

      if (baseClass === 'flex-row') propertyOverrides['flexDirection'] = 'row';
      else if (baseClass === 'flex-col') propertyOverrides['flexDirection'] = 'col';

      if (baseClass === 'flex-wrap') propertyOverrides['flexWrap'] = 'wrap';
      else if (baseClass === 'flex-nowrap') propertyOverrides['flexWrap'] = 'nowrap';

      if (baseClass === 'overflow-x-auto') propertyOverrides['overflowX'] = 'auto';
      else if (baseClass === 'overflow-x-hidden') propertyOverrides['overflowX'] = 'hidden';

      if (baseClass === 'overflow-y-auto') propertyOverrides['overflowY'] = 'auto';
      else if (baseClass === 'overflow-y-hidden') propertyOverrides['overflowY'] = 'hidden';

      if (baseClass === 'w-full') propertyOverrides['width'] = 'full';
      else if (baseClass === 'w-auto') propertyOverrides['width'] = 'auto';
      else if (baseClass === 'w-fit') propertyOverrides['width'] = 'fit';
      else if (baseClass.startsWith('w-[')) propertyOverrides['width'] = baseClass.slice(3, -1);

      if (baseClass.startsWith('min-w-[')) propertyOverrides['minWidth'] = baseClass.slice(7, -1);
      if (baseClass.startsWith('max-w-[')) propertyOverrides['maxWidth'] = baseClass.slice(7, -1);

      // Estimate touch targets
      if (baseClass === 'py-3' || baseClass === 'p-3') propertyOverrides['touchTarget'] = '48';
      else if (baseClass === 'py-2.5' || baseClass === 'p-2.5') propertyOverrides['touchTarget'] = '44';
      else if (baseClass === 'py-2' || baseClass === 'p-2') propertyOverrides['touchTarget'] = '40';
      else if (baseClass === 'py-1.5' || baseClass === 'p-1.5') propertyOverrides['touchTarget'] = '32';
      else if (baseClass.startsWith('min-h-[')) {
        const val = parseInt(baseClass.slice(7, -1), 10);
        if (!isNaN(val)) propertyOverrides['touchTarget'] = val.toString();
      }
    }
  }

  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    isMobile: viewport.isMobile,
    isDesktop: !viewport.isMobile,
    isShortScreen: viewport.isShort,
    display: propertyOverrides['display'] as any,
    flexDirection: propertyOverrides['flexDirection'] as any,
    flexWrap: propertyOverrides['flexWrap'] as any,
    overflowX: propertyOverrides['overflowX'] as any,
    overflowY: propertyOverrides['overflowY'] as any,
    width: propertyOverrides['width'],
    minWidth: propertyOverrides['minWidth'],
    maxWidth: propertyOverrides['maxWidth'],
    touchTargetPx: propertyOverrides['touchTarget'] ? parseInt(propertyOverrides['touchTarget'], 10) : undefined,
    activeClasses,
  };
}

// ============================================================================
// 3. File System & Component Source Helpers
// ============================================================================

const PROJECT_ROOT = path.resolve(process.cwd());

export function loadSourceFile(relativePath: string): string {
  const fullPath = path.resolve(PROJECT_ROOT, relativePath);
  assert.ok(fs.existsSync(fullPath), `Target source file must exist: ${relativePath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Extracts class attribute from a given tag/pattern in a TSX/JSX file
 */
export function extractClassNames(fileContent: string, matchRegex: RegExp): string[] {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = matchRegex.exec(fileContent)) !== null) {
    if (m[1]) matches.push(m[1]);
  }
  return matches;
}

/**
 * Verifies that a list of critical DOM elements/text strings exist in the file.
 * Requirement R4: Zero DOM elements, buttons, data fields, or text strings deleted.
 */
export function verifyDomPreservation(
  fileContent: string,
  requiredElements: string[]
): { intact: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const item of requiredElements) {
    if (!fileContent.includes(item)) {
      missing.push(item);
    }
  }
  return {
    intact: missing.length === 0,
    missing,
  };
}

// ============================================================================
// 4. Modal Safety & Viewport Top-Clipping Evaluator
// ============================================================================

export interface ModalSafetyResult {
  hasScrollableBackdrop: boolean;
  hasTopClippingProtection: boolean; // items-start or my-auto
  hasTouchFriendlyClose: boolean;
  isSafeOnShortScreen: boolean;
  details: string[];
}

export function evaluateModalSafety(modalSourceSnippet: string): ModalSafetyResult {
  const details: string[] = [];

  const hasFixedInset = /fixed\s+inset-0/.test(modalSourceSnippet);
  const hasOverflowY = /overflow-y-auto/.test(modalSourceSnippet);
  const hasItemsStart = /items-start/.test(modalSourceSnippet);
  const hasMyAuto = /my-auto/.test(modalSourceSnippet);
  const hasCloseButton = /button[^>]*aria-label="Close"|button[^>]*onClick=[^>]*Close|X\s*className/i.test(modalSourceSnippet);

  if (!hasFixedInset) details.push('Missing fixed inset-0 overlay boundary');
  if (!hasOverflowY) details.push('Missing overflow-y-auto on backdrop container');
  if (!hasItemsStart && !hasMyAuto) {
    details.push('Risk of top-clipping on short screens (requires items-start on backdrop or my-auto on card)');
  }

  const isSafeOnShortScreen = hasOverflowY && (hasItemsStart || hasMyAuto);

  return {
    hasScrollableBackdrop: hasOverflowY,
    hasTopClippingProtection: hasItemsStart || hasMyAuto,
    hasTouchFriendlyClose: hasCloseButton,
    isSafeOnShortScreen,
    details,
  };
}

// ============================================================================
// 5. Test Server Lifecycle & REST Helpers for Tier 4
// ============================================================================

export interface TestServerHandle {
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function launchResponsiveTestServer(port: number = 3250): Promise<TestServerHandle> {
  const targetUrl = `http://127.0.0.1:${port}`;

  // Check if already active
  try {
    const res = await fetch(`${targetUrl}/api/health`);
    if (res.ok) {
      return { baseUrl: targetUrl, stop: async () => {} };
    }
  } catch {
    // Port open
  }

  // Check default port 3000
  try {
    const res = await fetch('http://127.0.0.1:3000/api/health');
    if (res.ok) {
      return { baseUrl: 'http://127.0.0.1:3000', stop: async () => {} };
    }
  } catch {
    // Port 3000 not open
  }

  const proc = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: port.toString(), NODE_ENV: 'test' },
    stdio: 'ignore',
    shell: true,
  });

  const startTime = Date.now();
  let online = false;
  while (Date.now() - startTime < 12000) {
    try {
      const res = await fetch(`${targetUrl}/api/health`);
      if (res.ok) {
        online = true;
        break;
      }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const stop = async () => {
    if (proc && proc.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t']);
        } else {
          proc.kill();
        }
      } catch {
        // cleanup ignore
      }
    }
  };

  return {
    baseUrl: targetUrl,
    stop,
  };
}
