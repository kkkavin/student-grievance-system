# Graph Report - student-grievance-system  (2026-11-04)

## Corpus Check
- 77 files · ~145,147 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 529 nodes · 1476 edges · 27 communities (23 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5d5ff4db`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- Project: Semantic Grievance Merging & Bulk-Resolution Pipeline
- Deduplication Engine & Test Fixtures
- AdminDashboard.tsx
- Charts.tsx
- JWT Authentication & Server Middleware
- Analytics Rollup & Risk Forecasting
- Development Dependencies & Tooling
- Report Generation & Export Utilities
- Documentation & Architectural Specifications
- ML Complaint Classifier & Spam Detection
- Production Runtime Dependencies
- TypeScript Compiler Configuration
- api.ts
- Project NPM Scripts & Automation
- Vite Bundler & Tailwind CSS Configuration
- Package Security & Build Scripts
- Git Push Automation Workflow
- HTML Entry Point & Bootstrap
- Application Favicon & Assets
- stress_analytics_concurrency.test.ts
- Grievance
- AuthModal.tsx
- types.ts
- getAuthHeaders
- motion@^12.23.24

## God Nodes (most connected - your core abstractions)
1. `getDatabase()` - 56 edges
2. `getAuthHeaders()` - 27 edges
3. `Grievance` - 21 edges
4. `getGrievanceById()` - 15 edges
5. `react` - 15 edges
6. `AdminDashboard()` - 15 edges
7. `compilerOptions` - 15 edges
8. `lucide-react` - 14 edges
9. `App()` - 13 edges
10. `generateEmbeddingVector()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Code Layout` --references--> `resolveGrievanceCascadeApi()`  [INFERRED]
  PROJECT.md → src/api.ts
- `Architecture` --references--> `groupSemanticGrievances()`  [INFERRED]
  PROJECT.md → src/ml/deduplication.ts
- `Code Layout` --references--> `groupSemanticGrievances()`  [INFERRED]
  PROJECT.md → src/ml/deduplication.ts
- `Feature Inventory` --references--> `resolveGrievanceCascadeApi()`  [INFERRED]
  PROJECT.md → src/api.ts
- `Feature Inventory` --references--> `groupSemanticGrievances()`  [INFERRED]
  PROJECT.md → src/ml/deduplication.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Department RBAC and Row-Level Access Control Framework** — test_ready_rbac_test_suite, test_ready_row_level_access_control, session_handoff_rlac_middleware [EXTRACTED 1.00]
- **Four-Tier Testing and Verification Pipeline** — test_infra_four_tier_suite, test_infra_bva_specification, test_ready_readiness_signal [EXTRACTED 1.00]
- **Knowledge Graph Synchronization & Tooling** — _agents_skills_git_push_skill_pre_push_verification, claude_graphify_guidelines, readme_graphify_integration [INFERRED 0.85]

## Communities (27 total, 4 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.19
Nodes (13): lucide-react, react, clearAuthToken(), saveUserApi(), App(), FAQSection(), ProfileModal(), DAYSCHOLAR_CATEGORIES (+5 more)

### Community 1 - "Project: Semantic Grievance Merging & Bulk-Resolution Pipeline"
Cohesion: 0.33
Nodes (5): Backend Resolution API ↔ Frontend Client, Interface Contracts, Milestones, Project: Semantic Grievance Merging & Bulk-Resolution Pipeline, `src/ml/deduplication.ts` ↔ Dashboards & Backend

### Community 2 - "Deduplication Engine & Test Fixtures"
Cohesion: 0.07
Nodes (73): createDepartment(), createGrievance(), createRoutingRule(), DB_PATH, deleteRoutingRule(), formatDepartmentRow(), formatGrievanceRow(), formatUserRow() (+65 more)

### Community 3 - "AdminDashboard.tsx"
Cohesion: 0.16
Nodes (20): Feature Inventory, escalateGrievanceApi(), fetchDepartmentsApi(), fetchGrievances(), reassignGrievanceApi(), requestReassignGrievanceApi(), resolveGrievanceCascadeApi(), updateGrievanceApi() (+12 more)

### Community 4 - "Charts.tsx"
Cohesion: 0.10
Nodes (35): fetchAnalyticsTrendsApi(), fetchRiskForecastApi(), BarChart(), BarChartProps, CATEGORY_COLOR_MAP, ChartCard(), ChartCardProps, describeArc() (+27 more)

### Community 5 - "JWT Authentication & Server Middleware"
Cohesion: 0.09
Nodes (34): RFC-7519, authenticateJWT(), JWTPayload, base64UrlDecode(), base64UrlEncode(), signJwt, signToken(), verifyJwt (+26 more)

### Community 6 - "Analytics Rollup & Risk Forecasting"
Cohesion: 0.10
Nodes (23): GroupedSemanticGrievance, VECTOR_DIMENSION, computeHostelMaintenanceRollup(), computeRolling7DayVelocity(), computeTransportRollup(), computeWifiDensityMatrix(), getCampusTrendAnalytics(), inferIssueType() (+15 more)

### Community 7 - "Development Dependencies & Tooling"
Cohesion: 0.13
Nodes (21): devDependencies, autoprefixer@^10.4.21, esbuild@^0.25.0, tailwindcss@^4.1.14, tsx@^4.21.0, @types/express@^4.17.21, @types/node@^22.14.0, @types/nodemailer@^8.0.2 (+13 more)

### Community 8 - "Report Generation & Export Utilities"
Cohesion: 0.20
Nodes (20): calculateColWidths(), CHART_COLORS, describePieSlice(), downloadCSVReport(), downloadExcelReport(), downloadHTMLReport(), escapeHtml(), formatDate() (+12 more)

### Community 9 - "Documentation & Architectural Specifications"
Cohesion: 0.10
Nodes (20): Default Administrative Personas Catalog, Campus Student Grievance System Development Log, Teamwork Multi-Agent Coordination Protocol, Graphify Query Protocol, Graphify Project Guidelines, Graphify Knowledge Graph Integration, Local Heuristic Spam Classifier, SQLite3 Local Database Architecture (+12 more)

### Community 10 - "ML Complaint Classifier & Spam Detection"
Cohesion: 0.15
Nodes (11): CATEGORY_ICONS, ClassificationResult, defaultClassifier, ModelMetadata, SpamAnalysisResult, stemToken(), STOPWORDS, StudentComplaintClassifier (+3 more)

### Community 11 - "Production Runtime Dependencies"
Cohesion: 0.12
Nodes (17): dependencies, dotenv@^17.2.3, @emailjs/browser@^4.4.1, express@^4.21.2, @google/genai@^2.4.0, lucide-react@^0.546.0, nodemailer@^10.0.10, react@^19.0.1 (+9 more)

### Community 12 - "TypeScript Compiler Configuration"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+7 more)

### Community 13 - "api.ts"
Cohesion: 0.19
Nodes (18): detachTicket, detachTicketApi(), fetchAnalyticsTrends, FetchGrievancesParams, fetchRiskForecast, fetchTriageQueue, fetchTriageQueueApi(), getUserApi() (+10 more)

### Community 14 - "Project NPM Scripts & Automation"
Cohesion: 0.20
Nodes (10): scripts, build, clean, dev, graphify, graphify:update, graphify:viz, graphify:watch (+2 more)

### Community 15 - "Vite Bundler & Tailwind CSS Configuration"
Cohesion: 0.25
Nodes (7): @tailwindcss/vite@^4.1.14, vite@^6.2.3, @vitejs/plugin-react@^5.0.4, vite@^6.2.3, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 16 - "Package Security & Build Scripts"
Cohesion: 0.50
Nodes (4): allowScripts, esbuild@0.28.2, @google/genai@2.31.0, protobufjs@7.6.6

### Community 17 - "Git Push Automation Workflow"
Cohesion: 0.67
Nodes (3): Git Push Workflow, Pre-Push Verification & Health Checks, Push Helper Script (push.ps1)

### Community 21 - "stress_analytics_concurrency.test.ts"
Cohesion: 0.40
Nodes (3): BENCHMARK_METRICS, getPercentile(), getStats()

### Community 22 - "Grievance"
Cohesion: 0.17
Nodes (16): CascadingResolutionResult, DepartmentNotificationPayload, AdminLoginResponse, createGrievanceApi(), SanitizedStudentGrievance, AuthModalProps, DepartmentDashboardProps, ProfileModalProps (+8 more)

### Community 23 - "AuthModal.tsx"
Cohesion: 0.19
Nodes (14): adminLoginApi(), loginUserApi(), registerUserApi(), setAuthToken(), AuthModal(), TEST_STAFF_CREDENTIALS, sendOTPEmail(), SendOtpParams (+6 more)

### Community 24 - "types.ts"
Cohesion: 0.12
Nodes (15): AcademicBranch, AuditLogEntry, CalendarMultipliers, CategoryRoutingRule, FAQItem, HostelBlockRollup, HostelFloorRollup, HostelIssueTypeRollup (+7 more)

### Community 25 - "getAuthHeaders"
Cohesion: 0.37
Nodes (12): assignUserDepartmentApi(), createDepartmentApi(), createRoutingRuleApi(), deleteRoutingRuleApi(), fetchAdminDepartmentsApi(), fetchAuditLogsApi(), fetchRoutingRulesApi(), getAuthHeaders() (+4 more)

## Knowledge Gaps
- **13 isolated node(s):** `RFC-7519`, `Boundary Value Analysis (BVA) Specification`, `4-Tier Test Suite Architecture`, `Monthly Risk Severity Scoring Engine`, `Push Helper Script (push.ps1)` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 139 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `AdminDashboard.tsx`, `Charts.tsx`, `Development Dependencies & Tooling`, `Report Generation & Export Utilities`, `Production Runtime Dependencies`, `api.ts`, `Grievance`, `AuthModal.tsx`, `getAuthHeaders`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `RFC-7519`, `Boundary Value Analysis (BVA) Specification`, `4-Tier Test Suite Architecture` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Deduplication Engine & Test Fixtures` be split into smaller, more focused modules?**
  _Cohesion score 0.07215980024968789 - nodes in this community are weakly interconnected._
- **Why does `getDatabase()` connect `Deduplication Engine & Test Fixtures` to `api.ts`, `stress_analytics_concurrency.test.ts`, `JWT Authentication & Server Middleware`, `Analytics Rollup & Risk Forecasting`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `Charts.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09759759759759759 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `App.tsx` to `AdminDashboard.tsx`, `Charts.tsx`, `Development Dependencies & Tooling`, `Report Generation & Export Utilities`, `Production Runtime Dependencies`, `api.ts`, `Grievance`, `AuthModal.tsx`, `getAuthHeaders`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `JWT Authentication & Server Middleware` be split into smaller, more focused modules?**
  _Cohesion score 0.0886615515771526 - nodes in this community are weakly interconnected._