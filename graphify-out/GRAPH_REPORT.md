# Graph Report - student-grievance-system  (2026-11-03)

## Corpus Check
- 65 files · ~123,225 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 481 nodes · 1295 edges · 21 communities (18 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ab81a851`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Frontend UI Components & Client State
- SQLite Database Engine & Data Access Layer
- Deduplication Engine & Test Fixtures
- Admin & Department Analytics Dashboards
- Client API Services & Routing Management
- JWT Authentication & Server Middleware
- Analytics Rollup & Risk Forecasting
- Development Dependencies & Tooling
- Report Generation & Export Utilities
- Documentation & Architectural Specifications
- ML Complaint Classifier & Spam Detection
- Production Runtime Dependencies
- TypeScript Compiler Configuration
- OTP Email & Notification Services
- Project NPM Scripts & Automation
- Vite Bundler & Tailwind CSS Configuration
- Package Security & Build Scripts
- Git Push Automation Workflow
- HTML Entry Point & Bootstrap
- Application Favicon & Assets

## God Nodes (most connected - your core abstractions)
1. `getDatabase()` - 51 edges
2. `getAuthHeaders()` - 26 edges
3. `Grievance` - 16 edges
4. `react` - 15 edges
5. `compilerOptions` - 15 edges
6. `getGrievanceById()` - 14 edges
7. `lucide-react` - 14 edges
8. `AdminDashboard()` - 14 edges
9. `UserProfile` - 13 edges
10. `App()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `restoreDefaultRoutingRules()` --calls--> `getDatabase()`  [EXTRACTED]
  test/challenger_m2_autorouting.test.ts → db.ts
- `extractUserFromRequest()` --calls--> `verifyToken()`  [EXTRACTED]
  server.ts → src/utils/jwt.ts
- `authenticateJWT()` --calls--> `verifyToken()`  [EXTRACTED]
  server.ts → src/utils/jwt.ts
- `enforceGrievanceRLAC()` --calls--> `verifyToken()`  [EXTRACTED]
  server.ts → src/utils/jwt.ts
- `DepartmentNotificationPayload` --references--> `Grievance`  [EXTRACTED]
  server.ts → src/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Department RBAC and Row-Level Access Control Framework** — test_ready_rbac_test_suite, test_ready_row_level_access_control, session_handoff_rlac_middleware [EXTRACTED 1.00]
- **Four-Tier Testing and Verification Pipeline** — test_infra_four_tier_suite, test_infra_bva_specification, test_ready_readiness_signal [EXTRACTED 1.00]
- **Knowledge Graph Synchronization & Tooling** — _agents_skills_git_push_skill_pre_push_verification, claude_graphify_guidelines, readme_graphify_integration [INFERRED 0.85]

## Communities (21 total, 3 thin omitted)

### Community 0 - "Frontend UI Components & Client State"
Cohesion: 0.06
Nodes (75): lucide-react, react, DepartmentNotificationPayload, adminLoginApi(), AdminLoginResponse, assignUserDepartmentApi(), clearAuthToken(), createDepartmentApi() (+67 more)

### Community 1 - "SQLite Database Engine & Data Access Layer"
Cohesion: 0.10
Nodes (53): createDepartment(), createGrievance(), createRoutingRule(), DB_PATH, deleteRoutingRule(), formatDepartmentRow(), formatGrievanceRow(), formatUserRow() (+45 more)

### Community 2 - "Deduplication Engine & Test Fixtures"
Cohesion: 0.09
Nodes (22): AUTO_MERGE_THRESHOLD, checkLocationAdjacency(), computeCosineSimilarity(), DEDICATED_VOCAB, extractFloorFromRoom(), extractRouteNumber(), fnv1a(), generateEmbeddingVector() (+14 more)

### Community 3 - "Admin & Department Analytics Dashboards"
Cohesion: 0.08
Nodes (47): detachTicketApi(), fetchAnalyticsTrendsApi(), fetchRiskForecastApi(), fetchTriageQueueApi(), mergeTicketsApi(), reassignGrievanceApi(), ActiveViewSection, AdminDashboard() (+39 more)

### Community 4 - "Client API Services & Routing Management"
Cohesion: 0.40
Nodes (3): BENCHMARK_METRICS, getPercentile(), getStats()

### Community 5 - "JWT Authentication & Server Middleware"
Cohesion: 0.17
Nodes (21): RFC-7519, authenticateJWT(), JWTPayload, base64UrlDecode(), base64UrlEncode(), signJwt, signToken(), verifyJwt (+13 more)

### Community 6 - "Analytics Rollup & Risk Forecasting"
Cohesion: 0.17
Nodes (23): computeHostelMaintenanceRollup(), computeRolling7DayVelocity(), computeTransportRollup(), computeWifiDensityMatrix(), getCampusTrendAnalytics(), inferIssueType(), inferTransportIncidentType(), computeRiskForecast() (+15 more)

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
Nodes (17): dependencies, dotenv@^17.2.3, express@^4.21.2, @google/genai@^2.4.0, lucide-react@^0.546.0, motion@^12.23.24, nodemailer@^10.0.10, react@^19.0.1 (+9 more)

### Community 12 - "TypeScript Compiler Configuration"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+7 more)

### Community 13 - "OTP Email & Notification Services"
Cohesion: 0.20
Nodes (10): @emailjs/browser@^4.4.1, @emailjs/browser, sendOTPEmail(), SendOtpParams, SendOtpResult, verifyOTPEmail(), PUBLIC_KEY, sendOTPEmail() (+2 more)

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

## Knowledge Gaps
- **13 isolated node(s):** `RFC-7519`, `Boundary Value Analysis (BVA) Specification`, `4-Tier Test Suite Architecture`, `Monthly Risk Severity Scoring Engine`, `Push Helper Script (push.ps1)` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 123 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Frontend UI Components & Client State` to `Admin & Department Analytics Dashboards`, `Report Generation & Export Utilities`, `Production Runtime Dependencies`, `Development Dependencies & Tooling`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `RFC-7519`, `Boundary Value Analysis (BVA) Specification`, `4-Tier Test Suite Architecture` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI Components & Client State` be split into smaller, more focused modules?**
  _Cohesion score 0.06267166042446941 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `Frontend UI Components & Client State` to `Admin & Department Analytics Dashboards`, `Report Generation & Export Utilities`, `Production Runtime Dependencies`, `Development Dependencies & Tooling`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `SQLite Database Engine & Data Access Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._
- **Why does `getDatabase()` connect `SQLite Database Engine & Data Access Layer` to `Frontend UI Components & Client State`, `Deduplication Engine & Test Fixtures`, `Client API Services & Routing Management`, `JWT Authentication & Server Middleware`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `Deduplication Engine & Test Fixtures` be split into smaller, more focused modules?**
  _Cohesion score 0.0946938775510204 - nodes in this community are weakly interconnected._