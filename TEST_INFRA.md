# TEST_INFRA — Responsive Mobile & Desktop E2E Testing Infrastructure

**Project**: Student Grievance System — Mobile Responsiveness Architecture (Tiers 1–4)  
**Test Harness**: Node.js v22 Native Test Runner (`node:test`, `node:assert/strict`) via `tsx`  
**Design Paradigm**: Opaque-Box, Requirement-Driven Viewport & DOM Invariant Verification  
**Author**: E2E Test Writer (`e2e_test_writer`)  
**Status**: ACTIVE & APPROVED  

---

## 1. Executive Testing Philosophy & Architecture

### 1.1 Opaque-Box Testing Principles
Opaque-box testing validates software strictly against published behavioral specifications, responsive design contracts, and interface invariants without coupling to volatile implementation details. The test suites validate the mobile responsiveness across:
1. **Viewport Geometry & Boundary Constraints**:
   - Small screens (`<= 768px` down to `375px`): iPhone SE (375px), iPhone 14 (390px), Galaxy S20 (412px), iPad portrait breakpoint (768px).
   - Desktop baseline (`> 768px`): iPad landscape (1024px), Desktop HD (1280px), Desktop FHD (1440px).
   - Constrained vertical heights (`<= 667px` and `568px`): iPhone SE landscape, on-screen virtual keyboard active.
2. **Tailwind CSS v4 Responsive Rule Resolution**:
   - Validates that base utility classes establish safe mobile defaults (e.g. `w-full`, `flex-col`, `overflow-x-auto`).
   - Validates that responsive prefixes (`sm:`, `md:`, `lg:`) activate strictly at defined pixel breakpoints (640px, 768px, 1024px).
   - Validates that dark mode variants (`dark:`) preserve layout geometry and contrast.
3. **DOM Invariants & Non-Destructive Preservation (R4)**:
   - Validates that **zero DOM elements, buttons, data fields, text strings, or structural HTML are deleted**.
   - Validates that responsive styling is purely additive (`sm:`, `md:`, `lg:`, `overflow-x-auto`, `flex-wrap`).
4. **End-to-End Live REST Server Verification**:
   - Exercises real HTTP REST APIs (`/api/grievances`, `/api/auth/admin/login`, `/api/analytics/trends`) in combination with responsive viewport assertions.

### 1.2 Zero External Test Dependencies
To eliminate supply chain vulnerabilities, flaky browser binary downloads, and React 19 / Node 22 compatibility issues, the responsive test harness relies exclusively on:
- **Test Runner**: Node.js native `node:test`.
- **Assertions**: Node.js native `node:assert/strict`.
- **TypeScript Engine**: `tsx` (via `npx tsx --test`).
- **File System & Parser Engine**: Built-in `node:fs`, `node:path`, `node:child_process`.

---

## 2. Responsive Viewport Engine Architecture (`test/responsive/viewport_engine.ts`)

The dedicated engine provides four core capabilities:

### 2.1 Viewport Configuration Matrix
```typescript
export const VIEWPORTS = {
  IPHONE_SE:    { width: 375,  height: 667,  isMobile: true,  isShort: true,  category: 'compact-mobile' },
  IPHONE_14:    { width: 390,  height: 844,  isMobile: true,  isShort: false, category: 'standard-mobile' },
  GALAXY_S20:   { width: 412,  height: 915,  isMobile: true,  isShort: false, category: 'standard-mobile' },
  IPAD_PORTRAIT:{ width: 768,  height: 1024, isMobile: true,  isShort: false, category: 'tablet' },
  DESKTOP_HD:   { width: 1280, height: 800,  isMobile: false, isShort: false, category: 'desktop' },
  DESKTOP_FHD:  { width: 1440, height: 900,  isMobile: false, isShort: false, category: 'desktop' },
  SHORT_MOBILE: { width: 375,  height: 568,  isMobile: true,  isShort: true,  category: 'compact-mobile' },
};
```

### 2.2 Tailwind CSS Responsive Resolver
Given any component class string and target viewport $W \times H$:
- Evaluates token prefixes (`sm:`, `md:`, `lg:`, `xl:`, `dark:`).
- Resolves computed properties:
  - `display`: `flex` | `grid` | `block` | `inline-flex` | `hidden`
  - `flexDirection`: `row` vs `col`
  - `flexWrap`: `wrap` vs `nowrap`
  - `overflowX`: `auto` | `hidden` | `visible`
  - `overflowY`: `auto` | `hidden`
  - `width`: `full` (100%) vs `auto` vs fixed
  - `touchTarget`: calculates minimum interactive tap height (WCAG 2.1 AA 44px standard)

### 2.3 Modal Safety & Top-Clipping Evaluator
Evaluates modal containers against short-screen top-clipping:
- Asserts presence of `fixed inset-0` boundary.
- Asserts `overflow-y-auto` on backdrop container.
- Asserts `items-start` on backdrop or `my-auto` on inner dialog card to eliminate top header clipping when viewport height $H \le 667\text{px}$.

### 2.4 DOM Preservation Scanner
Scans source components for required elements and text strings to guarantee compliance with Requirement R4 (zero element deletion).

---

## 3. 4-Tier Test Suite Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Tier 4: Real-World Scenarios                         │
│  (Mobile Student Submission, Staff Inspection & Resolution, Admin Analytics) │
├────────────────────────────────────────────────────────────────────────┤
│             Tier 3: Cross-Feature Combinations (Pairwise)              │
│  (Modal + Short Screen, Sub-Tabs + Filters, Mic Voice + Form, Theme Toggle) │
├────────────────────────────────────────────────────────────────────────┤
│                 Tier 2: Boundary Value Analysis (BVA)                  │
│  (375px, 390px, 412px, 768px, 1280px, H<=667px, Long Badges, Deep Tables)│
├────────────────────────────────────────────────────────────────────────┤
│                  Tier 1: Feature Coverage (R1 - R4)                    │
│  (Global Layout & Nav, Dashboards & Tables, Forms & Modals, Invariants)│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Feature Coverage Mapping Across Tiers

| Requirement | Scope | Test File | Test Count | Key Invariants Verified |
|---|---|---|---|---|
| **R1** | Global Layout & Navigation | `test/responsive/tier1_feature_coverage.test.ts` | 7 | `html, body { max-width: 100vw; overflow-x: hidden; }`, header padding `px-3 sm:px-6`, title `text-sm md:text-lg`, subtitle truncation, login button min 44px, dark toggle, logout modal |
| **R2** | Dashboards, Tables & Charts | `test/responsive/tier1_feature_coverage.test.ts` | 8 | Multi-tab horizontal scroll `overflow-x-auto`, table wrapper `overflow-x-auto` with `min-w-[600px]`, chart legends `flex-wrap`, pagination wrapping `flex-col sm:flex-row`, modal actions stacking, ReportDownloader boundary |
| **R3** | Forms, Modals & Moderation | `test/responsive/tier1_feature_coverage.test.ts` | 8 | Form inputs & textarea `w-full`, submit button full-width with 44px touch height, student context badge `flex-wrap`, toolbar touch targets >= 40px, AuthModal `items-start`/`my-auto`, ProfileModal safety, Triage moderation stats & comparison stacking |
| **R4** | Non-Destructive Layout | `test/responsive/tier1_feature_coverage.test.ts` | 5 | Desktop baseline preservation (>768px), zero DOM deletions in `App.tsx`, `StudentComplaintForm.tsx`, `AuthModal.tsx`, purely additive responsive classes |
| **BVA** | Breakpoints & Corner Cases | `test/responsive/tier2_boundary_corner_cases.test.ts` | 14 | 375px iPhone SE, 390px iPhone 14, 412px Galaxy S20, 768px iPad breakpoint, 1280px desktop, short screens (667px/568px), long badge strings, multi-page pagination, deep tables |
| **Pairwise** | Cross-Feature Combinations | `test/responsive/tier3_cross_feature_combinations.test.ts` | 8 | Modal + short screen, sub-tabs + active filters, voice input + rich-text toolbar, theme switching (dark/light), inspection drawer + action buttons, triage diff modal |
| **Scenarios** | Real-World End-to-End | `test/responsive/tier4_real_world_scenarios.test.ts` | 10 | Scenario 1: Student grievance submission on 375px mobile; Scenario 2: Staff inspection & single-click resolution on 390px mobile; Scenario 3: Super Admin analytics audit & report download on tablet |
| **TOTAL** | **Comprehensive E2E Responsive Suite** | **4 Test Suites** | **60 Tests** | **Full Mobile Responsiveness (375px–768px) & Desktop Baseline (>768px)** |

---

## 5. Verification Commands

All test suites can be executed independently or as an entire suite using Node.js native test runner via `tsx`:

```powershell
# 1. Run Complete E2E Responsive Test Suite (Tiers 1-4, 60 tests)
npx tsx --test test/responsive/tier1_feature_coverage.test.ts test/responsive/tier2_boundary_corner_cases.test.ts test/responsive/tier3_cross_feature_combinations.test.ts test/responsive/tier4_real_world_scenarios.test.ts

# 2. Run Tier 1: Feature Coverage (R1, R2, R3, R4)
npx tsx --test test/responsive/tier1_feature_coverage.test.ts

# 3. Run Tier 2: Boundary Value Analysis & Corner Cases
npx tsx --test test/responsive/tier2_boundary_corner_cases.test.ts

# 4. Run Tier 3: Cross-Feature Pairwise Combinations
npx tsx --test test/responsive/tier3_cross_feature_combinations.test.ts

# 5. Run Tier 4: Real-World Scenarios with Live Server
npx tsx --test test/responsive/tier4_real_world_scenarios.test.ts

# 6. Run TypeScript Lint / Typecheck
npm run lint

# 7. Run Production Bundle Build
npm run build
```

---

## 6. Contract Invariants & Acceptance Gates

1. **Root Viewport Gate**: `html, body` must enforce `max-width: 100vw; overflow-x: hidden;` eliminating any horizontal document wobble.
2. **Touch Target Gate**: All primary interactive buttons, links, and triggers on `<= 768px` must provide a minimum 40px–44px touch target.
3. **Modal Top-Clipping Gate**: Modal backdrops must provide `overflow-y-auto` and either `items-start` on backdrop or `my-auto` on dialog card.
4. **Desktop Baseline Gate**: Screens `> 768px` must remain pixel-perfect with original multi-column grids, horizontal toolbars, and desktop spacing.
5. **Zero Deletion Gate**: Zero DOM elements, buttons, data fields, or text strings may be deleted during responsive adaptations.
6. **Code Integrity Gate**: `npm run lint` (`tsc --noEmit`) must exit with code 0 (zero TypeScript errors), and `npm run build` must complete cleanly.
