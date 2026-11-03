# Graph Report - student-grievance-system  (2026-11-03)

## Corpus Check
- 65 files · ~122,051 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 536 nodes · 1362 edges · 21 communities (20 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e8c45fae`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.ts
- rbac_fixtures.ts
- package.json
- deduplication.ts
- TypeScript Compiler Configuration
- Workflow Steps
- Report Generation & Export Utilities
- Project & Graphify Scripts
- complaintClassifier.ts
- Architecture & System Documentation
- 2. Test Design Methodology Across All 25 Features
- TEST_READY — E2E Testing Suite Verification & Readiness Signal
- Charts.tsx
- sendEmailOTP.ts
- dependencies
- vite
- allowScripts
- types.ts
- server.ts
- 📌 Conversation & Development Timeline

## God Nodes (most connected - your core abstractions)
1. `getDatabase()` - 51 edges
2. `getAuthHeaders()` - 27 edges
3. `2. Test Design Methodology Across All 25 Features` - 26 edges
4. `AdminDashboard()` - 16 edges
5. `Grievance` - 16 edges
6. `react` - 15 edges
7. `compilerOptions` - 15 edges
8. `getGrievanceById()` - 14 edges
9. `lucide-react` - 14 edges
10. `UserProfile` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Turn 2: Execution of Milestones 1 & 2` --references--> `resolveDepartmentForCategory()`  [INFERRED]
  chats/CHAT_HISTORY.md → db.ts
- `Tracked Files Modified` --references--> `JWTPayload`  [INFERRED]
  session-handoff.md → src/types.ts
- `B. Milestone 2: Department Auto-Routing & Targeted Notification Pipeline (CLEARED)` --references--> `resolveDepartmentForCategory()`  [INFERRED]
  session-handoff.md → db.ts
- `Turn 2: Execution of Milestones 1 & 2` --references--> `enforceGrievanceRLAC()`  [INFERRED]
  chats/CHAT_HISTORY.md → server.ts
- `Turn 4: Continuation & Execution of Milestone 3` --references--> `getAuthToken()`  [INFERRED]
  chats/CHAT_HISTORY.md → src/api.ts

## Import Cycles
- None detected.

## Communities (21 total, 1 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.05
Nodes (99): Turn 4: Continuation & Execution of Milestone 3, lucide-react, react, DepartmentNotificationPayload, C. Milestone 3: Role-Aware Frontend Views & Central Management (CLEARED), Tracked Files Modified, adminLoginApi(), AdminLoginResponse (+91 more)

### Community 1 - "rbac_fixtures.ts"
Cohesion: 0.14
Nodes (24): RFC-7519, authenticateJWT(), JWTPayload, base64UrlDecode(), base64UrlEncode(), signJwt, signToken(), verifyJwt (+16 more)

### Community 2 - "package.json"
Cohesion: 0.13
Nodes (21): devDependencies, autoprefixer@^10.4.21, esbuild@^0.25.0, tailwindcss@^4.1.14, tsx@^4.21.0, @types/express@^4.17.21, @types/node@^22.14.0, @types/nodemailer@^8.0.2 (+13 more)

### Community 3 - "deduplication.ts"
Cohesion: 0.13
Nodes (24): createGrievance(), getGrievanceById(), updateGrievance(), AUTO_MERGE_THRESHOLD, checkLocationAdjacency(), computeCosineSimilarity(), DEDICATED_VOCAB, extractFloorFromRoom() (+16 more)

### Community 4 - "TypeScript Compiler Configuration"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+7 more)

### Community 5 - "Workflow Steps"
Cohesion: 0.20
Nodes (9): 1. Pre-Push Verification & Health Checks, 2. Inspect Working Tree & Untracked Files, 3. Stage Changes, 4. Commit Changes, 5. Push to Remote Repository, 6. Verification & Reporting, Fast-Track Helper Script, Git Push Skill (+1 more)

### Community 6 - "Report Generation & Export Utilities"
Cohesion: 0.20
Nodes (20): calculateColWidths(), CHART_COLORS, describePieSlice(), downloadCSVReport(), downloadExcelReport(), downloadHTMLReport(), escapeHtml(), formatDate() (+12 more)

### Community 7 - "Project & Graphify Scripts"
Cohesion: 0.20
Nodes (10): scripts, build, clean, dev, graphify, graphify:update, graphify:viz, graphify:watch (+2 more)

### Community 9 - "complaintClassifier.ts"
Cohesion: 0.15
Nodes (11): CATEGORY_ICONS, ClassificationResult, defaultClassifier, ModelMetadata, SpamAnalysisResult, stemToken(), STOPWORDS, StudentComplaintClassifier (+3 more)

### Community 10 - "Architecture & System Documentation"
Cohesion: 0.40
Nodes (5): Claude Agent Graphify Guidelines, Web Application Entrypoint, AI Student Grievance System, Graphify Knowledge Graph Architecture, Local SQLite3 Database Migration

### Community 11 - "2. Test Design Methodology Across All 25 Features"
Cohesion: 0.05
Nodes (36): 1.1 Opaque-Box Testing Principles, 1.2 Zero External Test Dependency, 1.3 4-Tier Test Suite Architecture, 1. Executive Testing Philosophy & Architecture, 2. Test Design Methodology Across All 25 Features, 3. Pairwise & Combinatorial Interaction Matrix, 4. Boundary Value Analysis (BVA) Specification, 5.1 Deduplication Fixtures (`test/fixtures/dedup_fixtures.ts`) (+28 more)

### Community 25 - "TEST_READY — E2E Testing Suite Verification & Readiness Signal"
Cohesion: 0.22
Nodes (8): 1.1 Department-Level RBAC & Targeted Notification Test Suites (Tiers 1–4), 1.2 Core Deduplication, Analytics & Concurrency Test Suites, 1. Test Suite Inventory & Coverage, 2.1 RBAC & Notification Isolation Harness (`test/fixtures/rbac_fixtures.ts`), 2. Test Fixtures & Synthetic Data, 3. Verification Commands, 4. Contract Pass Criteria & Invariants, TEST_READY — E2E Testing Suite Verification & Readiness Signal

### Community 39 - "Charts.tsx"
Cohesion: 0.10
Nodes (33): fetchAnalyticsTrendsApi(), fetchRiskForecastApi(), BarChart(), BarChartProps, CATEGORY_COLOR_MAP, CHART_COLORS, ChartCard(), ChartCardProps (+25 more)

### Community 40 - "sendEmailOTP.ts"
Cohesion: 0.20
Nodes (9): @emailjs/browser@^4.4.1, @emailjs/browser, sendOTPEmail(), SendOtpParams, SendOtpResult, PUBLIC_KEY, sendOTPEmail(), SERVICE_ID (+1 more)

### Community 63 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, dotenv@^17.2.3, express@^4.21.2, @google/genai@^2.4.0, lucide-react@^0.546.0, motion@^12.23.24, nodemailer@^10.0.10, react@^19.0.1 (+9 more)

### Community 71 - "vite"
Cohesion: 0.25
Nodes (7): @tailwindcss/vite@^4.1.14, vite@^6.2.3, @vitejs/plugin-react@^5.0.4, vite@^6.2.3, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 74 - "allowScripts"
Cohesion: 0.50
Nodes (4): allowScripts, esbuild@0.28.2, @google/genai@2.31.0, protobufjs@7.6.6

### Community 75 - "types.ts"
Cohesion: 0.12
Nodes (20): computeHostelMaintenanceRollup(), computeRolling7DayVelocity(), computeTransportRollup(), computeWifiDensityMatrix(), getCampusTrendAnalytics(), inferIssueType(), inferTransportIncidentType(), computeRiskForecast() (+12 more)

### Community 80 - "server.ts"
Cohesion: 0.11
Nodes (46): createDepartment(), createRoutingRule(), DB_PATH, deleteRoutingRule(), formatDepartmentRow(), formatGrievanceRow(), formatUserRow(), getAllDepartments() (+38 more)

### Community 100 - "📌 Conversation & Development Timeline"
Cohesion: 0.11
Nodes (17): Campus Student Grievance System — Complete Development & Conversation Log, 📌 Conversation & Development Timeline, 🔑 Default Administrative Personas for Verification, Turn 1: Master Specification & Architectural Mandate, Turn 2: Execution of Milestones 1 & 2, Turn 3: Clean Work Pause & Session Handoff, Turn 5: Repository & Chat Archive to GitHub, enforceGrievanceRLAC() (+9 more)

## Knowledge Gaps
- **3 isolated node(s):** `RFC-7519`, `Claude Agent Graphify Guidelines`, `Web Application Entrypoint`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 169 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `2. Test Design Methodology Across All 25 Features` connect `2. Test Design Methodology Across All 25 Features` to `Charts.tsx`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **What connects `RFC-7519`, `Claude Agent Graphify Guidelines`, `Web Application Entrypoint` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05082458770614692 - nodes in this community are weakly interconnected._
- **Why does `Feature 16: Analytical REST API Endpoints` connect `Charts.tsx` to `2. Test Design Methodology Across All 25 Features`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Should `rbac_fixtures.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13658536585365855 - nodes in this community are weakly interconnected._
- **Why does `TrendAnalyticsResponse` connect `Charts.tsx` to `api.ts`, `types.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.12554112554112554 - nodes in this community are weakly interconnected._