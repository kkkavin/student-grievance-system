# Project: Semantic Grievance Merging & Bulk-Resolution Pipeline

## Architecture
- **ML Deduplication Layer (`src/ml/deduplication.ts`)**:
  - In-process 256-d sublinear TF-IDF + domain entity vector embedding with L2 normalization.
  - Two-stage deduplication: Stage 1 hard filters (category, 72h window, location adjacency) + Stage 2 cosine similarity.
  - Semantic grievance grouping: clusters complaints with identical semantic meaning ($s \ge 0.92$), sorting chronologically by `createdAt ASC` to designate the earliest submitted grievance as the root parent issue.
- **Backend Persistence & API (`server.ts`, `db.ts`)**:
  - SQLite3 in WAL mode via `node:sqlite`.
  - Schema with indexed `master_case_id`, `status`, `assigned_department_id`.
  - Single-click cascading resolution: `POST /api/grievances/:id/resolve` (and `PUT /api/grievances/:id`) wrapped in `withTransaction`, cascading `status = 'resolved'` and `resolvedAt = new Date().toISOString()` to parent and all child complaints simultaneously, fanning out email notifications.
  - RBAC & RLAC guardrails: protected by `enforceGrievanceRLAC` (Super Admin global access, Department Staff/Head scoped strictly to assigned department, Student mutations rejected with 403).
- **Frontend Dashboard Presentation & Client (`AdminDashboard.tsx`, `DepartmentDashboard.tsx`, `App.tsx`, `src/api.ts`)**:
  - Unified line item display: Groups complaints using `groupSemanticGrievances` / master-child relationships, collapsing grouped duplicates into a single parent row/card with a `Merged Group (N complaints)` badge and expandable child inspection drawer.
  - Single-click UI resolution action: Row-level and modal-level resolution buttons with optimistic updates across both parent and child tickets (`g.id === id || g.masterCaseId === id`).
- **Constraints & Guardrails**:
  - Routing: Auto-routing rules and department resolution remain intact; child complaints inherit parent's department.
  - Analytics: `analyticsRollup.ts` (`consolidationRatio`) and `riskForecasting.ts` remain accurate and mathematically intact.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Semantic Grievance Grouping | Implement `groupSemanticGrievances` in `src/ml/deduplication.ts` to cluster complaints with identical semantic meaning | M1 | R1 |
| 2 | Earliest Parent Designation | Sort candidates chronologically (`createdAt ASC`) to designate earliest grievance as root parent (`master_case_id: null`) | M1 | R1 |
| 3 | Single-Click Cascading Resolution Endpoint | Add `POST /api/grievances/:id/resolve` in `server.ts` with atomic transaction resolution | M2 | R3 |
| 4 | Parent & Child Resolution Fan-Out | Simultaneously resolve parent and all child tickets in DB and dispatch email notifications to all reporters | M2 | R3 |
| 5 | RLAC & RBAC Enforcement on Resolution | Protect cascading resolution via `enforceGrievanceRLAC` preventing cross-department mutations | M2 | R3, R4 |
| 6 | Frontend API Client Cascading Helper | Implement `resolveGrievanceCascadeApi` in `src/api.ts` with error handling and fallback | M2 | R3 |
| 7 | Admin Dashboard Unified Presentation | Render grouped complaints as a single unified line item in `AdminDashboard.tsx` with count badge and expander | M3 | R2 |
| 8 | Department Dashboard Unified Presentation | Render grouped complaints as a single unified line item in `DepartmentDashboard.tsx` with count badge and expander | M3 | R2 |
| 9 | Single-Click Resolution UI Action | Provide one-click resolution buttons in both dashboards with optimistic parent+child state update | M3 | R3 |
| 10 | Dedicated Unit Test Suite | Comprehensive unit tests in `test/unit_semantic_grouping.test.ts` for grouping and earliest parent designation | M1 | R5 |
| 11 | Dedicated E2E Cascading Resolution Tests | E2E tests in `test/e2e/e2e_cascading_resolution.test.ts` verifying atomic cascading resolution and RLAC | M2 | R5 |
| 12 | Dedicated E2E Dashboard Presentation Tests | E2E tests in `test/e2e/e2e_unified_dashboard_presentation.test.ts` verifying unified line items and bulk resolve | M3 | R5 |
| 13 | Full Regression & Non-Interference Verification | Verify all 302+ baseline tests pass, routing and analytics remain intact | M4 | R4, R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Semantic Grievance Grouping | `src/ml/deduplication.ts`, `test/unit_semantic_grouping.test.ts` | none | DONE |
| 2 | M2: Backend Cascading Resolution API | `server.ts`, `db.ts`, `src/api.ts`, `test/e2e/e2e_cascading_resolution.test.ts` | M1 | DONE |
| 3 | M3: Unified Dashboard Presentation & UI | `AdminDashboard.tsx`, `DepartmentDashboard.tsx`, `App.tsx`, `test/e2e/e2e_unified_dashboard_presentation.test.ts` | M1, M2 | DONE |
| 4 | M4: Final Milestone (Full E2E, Regression & Audit) | Complete verification, baseline pass, adversarial coverage, forensic integrity audit | M1, M2, M3 | DONE |

## Interface Contracts
### `src/ml/deduplication.ts` ↔ Dashboards & Backend
```typescript
export interface GroupedSemanticGrievance {
  parent: Grievance;
  children: Grievance[];
  totalCount: number; // 1 (standalone) or 1 + children.length
  matchScore?: number;
}

export function groupSemanticGrievances(
  grievances: Grievance[],
  options?: { similarityThreshold?: number; windowHours?: number; checkCategory?: boolean }
): GroupedSemanticGrievance[];
```

### Backend Resolution API ↔ Frontend Client
```typescript
// POST /api/grievances/:id/resolve
// Headers: Authorization: Bearer <jwt>
// Body (optional): { resolutionNote?: string }
// Response:
{
  success: true,
  parent: Grievance,
  resolvedChildrenCount: number,
  childIds: string[]
}
```

## Code Layout
- `src/ml/deduplication.ts` — ML vector embedding, two-stage similarity, and `groupSemanticGrievances` batch grouping.
- `server.ts` — Express REST API, `POST /api/grievances/:id/resolve`, `PUT /api/grievances/:id`, RLAC middleware.
- `db.ts` — SQLite3 persistence, `getChildGrievances`, `withTransaction`, `updateGrievance`.
- `src/api.ts` — Frontend HTTP client, `resolveGrievanceCascadeApi`.
- `src/components/AdminDashboard.tsx` — Super Admin grievance queue, unified line items, quick resolve action.
- `src/components/DepartmentDashboard.tsx` — Department staff grievance queue, unified line items, quick resolve action.
- `src/App.tsx` — Top-level state and optimistic update handlers (`g.id === id || g.masterCaseId === id`).
- `test/unit_semantic_grouping.test.ts` — Dedicated unit tests for semantic grouping.
- `test/e2e/e2e_cascading_resolution.test.ts` — Dedicated E2E tests for cascading resolution API and RLAC.
- `test/e2e/e2e_unified_dashboard_presentation.test.ts` — Dedicated E2E tests for unified dashboard presentation.
