# TEST_INFRA — Comprehensive Test Infrastructure Specification

**Project**: Student Grievance System — Predictive Campus Analytics & Intelligent Deduplication  
**Architecture**: Node.js v22 Native Test Runner (`node:test`, `node:assert`) with TypeScript (`tsx`)  
**Design Paradigm**: Opaque-Box, Requirement-Driven Verification  
**Author**: E2E Test & Benchmark Engineer (`teamwork_test_writer_1`)  
**Status**: APPROVED & ACTIVE  

---

## 1. Executive Testing Philosophy & Architecture

### 1.1 Opaque-Box Testing Principles
Opaque-box (black-box) testing validates software strictly against published behavioral specifications, interface contracts, and requirements without relying on internal implementation details. The test suites in this repository exercise the application strictly via:
1. **Public HTTP REST Endpoints** (`POST /api/grievances`, `GET /api/grievances`, `GET /api/grievances/triage`, `POST /api/grievances/merge`, `POST /api/grievances/detach`, `PUT /api/grievances/:id`, `GET /api/analytics/trends`, `GET /api/analytics/risk-forecast`).
2. **Published TypeScript Service & ML Contracts** (`src/ml/deduplication.ts`, `src/services/analyticsRollup.ts`, `src/services/riskForecasting.ts`).
3. **Database State Invariants** (WAL mode SQLite schema tables: `grievances`, `users`, `outbox`).

### 1.2 Zero External Test Dependency
To eliminate supply chain vulnerabilities, flaky binary bindings, and version incompatibilities with React 19 / Node 22, the test harness relies exclusively on:
- **Test Runner**: Node.js native `node:test` (available in Node.js >= 20/22).
- **Assertions**: Node.js native `node:assert/strict`.
- **TypeScript Loader**: `tsx` (configured via `npx tsx --test`).

### 1.3 4-Tier Test Suite Architecture
The test suite is organized into 4 rigorous tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Tier 4: Real-World Scenarios                         │
│  (Hostel Pipe Burst, Bus Route 8 Breakdown, Campus Wi-Fi Switch Outage)│
├────────────────────────────────────────────────────────────────────────┤
│             Tier 3: Cross-Feature Integration Workflows                │
│  (Auto-Merge -> Outbox Queue -> Master Tree -> Triage Detach -> Fanout)│
├────────────────────────────────────────────────────────────────────────┤
│                 Tier 2: Boundary Value Analysis (BVA)                  │
│    (71h vs 73h Cutoff, 0.920 vs 0.919, 0.800 vs 0.799, Cross-Category) │
├────────────────────────────────────────────────────────────────────────┤
│                  Tier 1: Core Feature Coverage                         │
│    (Basic Submission, Ingestion Metadata, Default Status, DB Schema)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Test Design Methodology Across All 25 Features

Below is the formal Category-Partition, Boundary Value Analysis, and Test Case mapping across all 25 features defined in `PROJECT.md § Feature Inventory`.

### Feature 1: Schema Extension for Deduplication
- **Category / Partitions**:
  - `master_case_id`: NULL (Primary grievance), Valid Foreign Key UUID (Child ticket), Invalid FK (Foreign key constraint violation).
  - `status`: `PRIMARY`, `MERGED_AUTOMATIC`, `SUSPECTED_DUPLICATE`, `pending`, `in_progress`, `resolved`.
  - `incident_metadata`: Valid JSON embedding vector, location tag present vs null, ISO source timestamp.
- **Boundaries**: Foreign key cascade on master delete/detach; indexes `idx_grievances_master`, `idx_grievances_dedup`.
- **Test Invariant**: SQLite `PRAGMA foreign_keys = ON;` must reject orphaned `master_case_id`.

### Feature 2: In-Process Vector Embedding Pipeline
- **Category / Partitions**:
  - Input Text: Single word, short sentence, 1,000-char max complaint, unicode/Tamil transliterations, pure punctuation/whitespace.
  - Domain Keywords: Specific hostel room numbers (`A-304`), bus route numbers (`Route 14`), network identifiers (`AP-CS-3`).
- **Boundaries**: L2 normalization factor must ensure vector Euclidean norm $\|v\|_2 = 1.0 \pm 10^{-6}$.
- **Test Invariant**: Embedding vector length is constant ($D = 256$ or $384$), all values in $[-1.0, 1.0]$.

### Feature 3: Two-Stage Deduplication Match Pipeline
- **Stage 1 (Hard Filtering)**:
  - Temporal Window: Submission within 24–72 hours vs older than 72 hours.
  - Category Match: Same category (e.g. 'Hostel Maintenance') vs different ('Food & Mess').
  - Location Adjacency: Identical room, same floor, adjacent rooms, different blocks.
- **Stage 2 (Cosine Similarity)**:
  - Metric: $\cos(\theta) = \sum_{i=1}^D a_i b_i$.
- **Test Invariant**: Tickets failing Stage 1 hard filter are NEVER compared in Stage 2, preserving sub-millisecond execution.

### Feature 4: Auto-Merge & Child Linking ($\ge 0.92$)
- **Category / Partitions**:
  - Similarity score: $0.920 \le s \le 1.000$.
- **Boundaries**:
  - $s = 0.9199$: Must NOT auto-merge (falls into Suspected Duplicate).
  - $s = 0.9200$: Must auto-merge into master ticket.
- **Test Invariant**: `master_case_id` set to candidate master ID, `status = 'MERGED_AUTOMATIC'`, linking notification queued.

### Feature 5: Suspected Duplicate Flagging ($0.80 - 0.91$)
- **Category / Partitions**:
  - Similarity score: $0.800 \le s \le 0.919$.
- **Boundaries**:
  - $s = 0.7999$: Must NOT be flagged as duplicate (remains `PRIMARY`).
  - $s = 0.8000$: Must be flagged as `SUSPECTED_DUPLICATE`.
  - $s = 0.9199$: Stays `SUSPECTED_DUPLICATE`.
- **Test Invariant**: `status = 'SUSPECTED_DUPLICATE'`, candidate master ID recorded, appears in triage queue.

### Feature 6: Atomic Transactions & Concurrency Control
- **Category / Partitions**:
  - Concurrent incoming requests: 2 to 10 simultaneous identical complaints submitted via `Promise.all`.
- **Boundaries**: Zero race conditions, no dual-master promotion, no `SQLITE_BUSY` uncaught exceptions.
- **Test Invariant**: Exactly 1 ticket is elected `PRIMARY`; all remaining 9 become `MERGED_AUTOMATIC` children.

### Feature 7: Triage & Merge REST APIs
- **Endpoints**:
  - `GET /api/grievances/triage`: Lists suspected duplicates with side-by-side comparison data.
  - `POST /api/grievances/merge`: Body `{ masterId, childId }` -> sets status `MERGED_AUTOMATIC`, links FK.
  - `POST /api/grievances/detach`: Body `{ childId }` -> promotes to `PRIMARY`, clears `master_case_id`.
- **Boundaries**: Detaching non-child ticket returns 400; merging non-existent ID returns 404.

### Feature 8: Master Resolution Notification Fan-Out
- **Category / Partitions**:
  - Master ticket with 0 children vs master ticket with $N$ children ($N = 1, 5, 10$).
- **Trigger**: Updating master ticket status to `resolved`.
- **Test Invariant**: SQLite `outbox` receives exactly $N + 1$ notification rows (1 for master reporter + $N$ for child reporters).

### Feature 9: Student Privacy Isolation
- **Category / Partitions**:
  - Requester: Student A (owner of child ticket), Student B (owner of master), Student C (third party student).
- **Test Invariant**: Student A's response contains their own complaint + `publicMasterNotes`, with ZERO appearance of Student B's name, email, phone, or raw description.

### Feature 10: Hostel Maintenance Rollup Aggregation
- **Dimensions**: Hostel Block (A, B, C, D, E), Floor (1, 2, 3, 4), Issue Type (`plumbing`, `power`, `cleaning`, `repairs`).
- **Metrics**: Total grievances, pending count, resolved count, consolidation ratio ($(\text{total} - \text{primary}) / \text{total}$).

### Feature 11: Campus Transport Rollup Aggregation
- **Dimensions**: Route identifier (Routes 1–12), Delay Frequency Pct, Maintenance Incidents, Capacity Surge Index.
- **Status Classification**: `NORMAL`, `SURGE`, `DELAYED`.

### Feature 12: Network/Wi-Fi Incident Density Aggregation
- **Dimensions**: Departmental Block, Floor Switch ID (`SW-Zone-Fx`), AP Controller ID (`AP-Zone-Fx-yy`).
- **Density Levels**: `LOW`, `MEDIUM`, `HIGH`.

### Feature 13: Academic Calendar Weighting Engine
- **Event Multipliers**:
  - Monsoon Season (Oct–Nov): $W = 1.65$.
  - Odd Semester Finals / Even Finals (Nov / Apr-May): $W = 1.50$ / $1.45$.
  - Semester Reopening (Jul / Jan): $W = 1.40$ / $1.30$.
  - Break Periods (Dec / Jun): $W = 0.35$ / $0.30$.

### Feature 14: 1–100 Monthly Risk Severity Score
- **Formula**:
  $$\text{Score} = \text{clamp}\left(1, 100, \text{round}(C_{\text{velocity}} + C_{\text{backlog}} + C_{\text{calendar}} + C_{\text{urgency}})\right)$$
- **Indicators**:
  - $1 - 39$: `LOW`
  - $40 - 74$: `ELEVATED`
  - $75 - 100$: `HIGH_RISK`
- **Boundaries**: Strictly $1 \le \text{Score} \le 100$.

### Feature 15: Primary Predictive Explanation Drivers
- **Explanation Generators**: Deterministic string mappings explaining the dominant contributor:
  - "Monsoon season onset: High drainage overflow risk in Block A"
  - "Exam period Wi-Fi saturation: AP-CSE-F2 capacity threshold exceeded"
  - "Backlog aging: 70% of electrical repairs open > 72 hours"

### Feature 16: Analytical REST API Endpoints
- **Endpoints**: `GET /api/analytics/trends` and `GET /api/analytics/risk-forecast`.
- **Validation**: Schema shape conforms to `TrendAnalyticsResponse` and `RiskForecastResponse`.

### Feature 17: Frontend Analytics Dashboard Views (Contract Verification)
- **Visual Payloads**: Data contracts for multi-line trend charts, route heatmaps, and Wi-Fi density matrix.

### Feature 18: Frontend Risk Forecast Panel (Contract Verification)
- **Visual Payloads**: Risk gauge bounds, calendar factor badges, actionable maintenance cards with priority buttons.

### Feature 19: Admin Merge & Triage Moderation Interface (Contract Verification)
- **Triage Payloads**: Suspected duplicate pairs with similarity badge, candidate master summary.

### Feature 20: Frontend Student Privacy & Public Note Display (Contract Verification)
- **Contract**: Sanitized student view payload with public master status note.

### Feature 21: Deduplication Accuracy & Threshold Benchmarks
- **Test Suite**: 40 curated pairs (15 exact $\ge 0.92$, 12 suspected $0.80 - 0.91$, 13 divergent $< 0.80$).
- **Success Criteria**: 100% precision on threshold classification.

### Feature 22: Sub-50ms Vector Similarity Query Load Test
- **Load**: 100 consecutive vector similarity queries against candidate pool.
- **Assertion**: 95th percentile latency $P_{95} < 50\text{ ms}$.

### Feature 23: Notification Fan-Out & Privacy Verification Tests
- **Integration**: Full cycle submission -> auto-merge -> master resolution -> outbox audit.

### Feature 24: Rolling Trend & Risk Forecast Math Verification
- **Mathematical Invariants**: Verification of clamping, weights, and rolling velocity window calculations.

### Feature 25: Final Integration & Adversarial Hardening (Tier 5)
- **Adversarial**: SQL injection escape strings, unicode emoji payloads, zero-length fields, rapid cyclic merge/detach.

---

## 3. Pairwise & Combinatorial Interaction Matrix

| Test Case | Grievance Category | Location Context | Time Offset | Semantic Similarity | Expected Decision |
|---|---|---|---|---|---|
| TC-PAIR-01 | Hostel Maintenance | Same Room (`A-304`) | 2 hours | $0.96$ | `AUTO_MERGE` |
| TC-PAIR-02 | Hostel Maintenance | Same Floor (`A-308`) | 12 hours | $0.85$ | `SUSPECTED_DUPLICATE` |
| TC-PAIR-03 | Hostel Maintenance | Different Block (`D-102`) | 4 hours | $0.94$ | `PRIMARY` (Pruned Stage 1) |
| TC-PAIR-04 | Campus Transport | Same Route (`Route 14`) | 1 hour | $0.93$ | `AUTO_MERGE` |
| TC-PAIR-05 | Campus Transport | Same Route (`Route 14`) | 30 hours | $0.82$ | `SUSPECTED_DUPLICATE` |
| TC-PAIR-06 | Campus Transport | Different Route (`Route 3`) | 2 hours | $0.95$ | `PRIMARY` (Pruned Stage 1) |
| TC-PAIR-07 | Network / Wi-Fi | Same AP (`AP-CS-3`) | 30 mins | $0.97$ | `AUTO_MERGE` |
| TC-PAIR-08 | Network / Wi-Fi | Same Dept (`CSE Block`) | 6 hours | $0.84$ | `SUSPECTED_DUPLICATE` |
| TC-PAIR-09 | Food & Mess | Same Mess (`Mess 2`) | 71 hours | $0.92$ | `AUTO_MERGE` |
| TC-PAIR-10 | Food & Mess | Same Mess (`Mess 2`) | 73 hours | $0.95$ | `PRIMARY` (Pruned Stage 1, >72h) |

---

## 4. Boundary Value Analysis (BVA) Specification

| Metric / Parameter | Lower Boundary (Fail/Alternative) | Exact Threshold | Upper Boundary (Pass/Action) | Target Behavior |
|---|---|---|---|---|
| Auto-Merge Cosine Similarity | $0.9199$ | $0.9200$ | $0.9201$ | $<0.92$: Suspected; $\ge 0.92$: Auto-Merge |
| Suspected Duplicate Similarity | $0.7999$ | $0.8000$ | $0.8001$ | $<0.80$: Primary; $\ge 0.80$: Suspected |
| Hard Filter Rolling Window | $73\text{ hours}$ (Outside) | $72.0\text{ hours}$ | $71\text{ hours}$ (Inside) | $>72\text{h}$: Filtered out; $\le 72\text{h}$: Included |
| Risk Severity Score | $0$ (Invalid, clamped to 1) | $1\text{ to }100$ | $101$ (Invalid, clamped to 100) | Strictly bounded in $[1, 100]$ |
| Vector Query P95 Latency | $49.99\text{ ms}$ (Pass) | $50.00\text{ ms}$ (Boundary) | $50.01\text{ ms}$ (Failure) | Strict assertion: $P_{95} < 50\text{ ms}$ |

---

## 5. Test Fixture Architecture

### 5.1 Deduplication Fixtures (`test/fixtures/dedup_fixtures.ts`)
- **Total Pairs**: 40 curated pairs.
- **Breakdown**:
  - **15 Exact / High-Similarity Pairs ($\ge 0.92$)**: Validates automatic consolidation of identical physical issues across Hostel, Transport, Wi-Fi, Food, and Electrical domains.
  - **12 Suspected Duplicate Pairs ($0.80 - 0.91$)**: Validates flagging for administrative review (adjacent rooms, shared infrastructure, related route delays).
  - **13 Divergent / Negative Pairs ($< 0.80$)**: Validates false-positive prevention across cross-block, cross-category, temporal separation (>72h), and unrelated issues within the same room.

### 5.2 Time-Series Fixtures (`test/fixtures/timeseries_fixtures.ts`)
- **Total Grievances**: 200 historical events.
- **Span**: 12 calendar months representing a complete academic year.
- **Distribution Profiles**:
  - **Monsoon Surge (Oct–Nov)**: Peak in plumbing, roof leakages, and damp electrical issues across Blocks A and B ($W_{\text{monsoon}} = 1.65$).
  - **Semester Exam Surge (Nov, Apr–May)**: Peak in library and hostel Wi-Fi bandwidth bottlenecks and quiet hour disturbances ($W_{\text{exam}} = 1.50$).
  - **Semester Reopening Surge (Jul–Aug)**: Peak in campus transport bus crowding, route delays, and mess registration ($W_{\text{start}} = 1.40$).
  - **Vacation Baseline (Dec, Jun)**: Minimal baseline volume ($W_{\text{break}} \le 0.35$).

---

## 6. Test Runner Commands & CI Verification

```powershell
# Run Tier 1-4 Deduplication E2E Test Suite
npx tsx --test test/e2e/e2e_deduplication.test.ts

# Run Rollup Aggregation & Risk Forecasting Analytics Test Suite
npx tsx --test test/e2e/e2e_analytics.test.ts

# Run Privacy Isolation & Concurrent Transaction Test Suite
npx tsx --test test/e2e/e2e_privacy_concurrency.test.ts

# Run Vector Similarity Performance & P95 Latency Benchmark
npx tsx --test test/benchmarks/similarity_benchmark.test.ts

# Run Entire Test Suite in a Single Command
npx tsx --test test/e2e/*.test.ts test/benchmarks/*.test.ts
```

---
*Signed by E2E Test & Benchmark Engineer (`teamwork_test_writer_1`)*
