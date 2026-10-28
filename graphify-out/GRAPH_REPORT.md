# Graph Report - student-support  (2026-10-28)

## Corpus Check
- 27 files · ~25,166 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 214 nodes · 425 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `788ad8fa`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- SQLite Database & Service Layer
- package.json
- Admin Analytics & Visualization
- TypeScript Compiler Configuration
- Report Generation & Export Utilities
- Project & Graphify Scripts
- Architecture & System Documentation
- sendEmailOTP.ts
- CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 15 edges
2. `getDatabase()` - 12 edges
3. `react` - 11 edges
4. `Grievance` - 11 edges
5. `scripts` - 10 edges
6. `App()` - 10 edges
7. `UserProfile` - 10 edges
8. `lucide-react` - 9 edges
9. `AdminDashboard()` - 8 edges
10. `AuthModal()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `AdminDashboard()`  [EXTRACTED]
  src/App.tsx → src/components/AdminDashboard.tsx
- `AdminDashboard()` --calls--> `ReportDownloader()`  [EXTRACTED]
  src/components/AdminDashboard.tsx → src/components/ReportDownloader.tsx
- `AuthModalProps` --references--> `UserProfile`  [EXTRACTED]
  src/components/AuthModal.tsx → src/types.ts
- `AuthModal()` --calls--> `sendOTPEmail()`  [EXTRACTED]
  src/components/AuthModal.tsx → src/services/sendEmailOTP.ts
- `ProfileModalProps` --references--> `UserProfile`  [EXTRACTED]
  src/components/ProfileModal.tsx → src/types.ts

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.12
Nodes (33): lucide-react, react, createGrievanceApi(), fetchGrievances(), loginUserApi(), saveUserApi(), updateGrievanceApi(), App() (+25 more)

### Community 1 - "SQLite Database & Service Layer"
Cohesion: 0.15
Nodes (22): createGrievance(), DB_PATH, formatGrievanceRow(), formatUserRow(), getAllGrievances(), getDatabase(), getGrievanceById(), getOutboxEmails() (+14 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (49): allowScripts, esbuild@0.28.2, @google/genai@2.31.0, protobufjs@7.6.6, dependencies, dotenv@^17.2.3, express@^4.21.2, @google/genai@^2.4.0 (+41 more)

### Community 3 - "Admin Analytics & Visualization"
Cohesion: 0.17
Nodes (21): ActiveViewSection, AdminDashboard(), VisualDimension, VisualType, BarChart(), BarChartProps, CHART_COLORS, ChartCard() (+13 more)

### Community 4 - "TypeScript Compiler Configuration"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+7 more)

### Community 6 - "Report Generation & Export Utilities"
Cohesion: 0.20
Nodes (20): calculateColWidths(), CHART_COLORS, describePieSlice(), downloadCSVReport(), downloadExcelReport(), downloadHTMLReport(), escapeHtml(), formatDate() (+12 more)

### Community 7 - "Project & Graphify Scripts"
Cohesion: 0.20
Nodes (10): scripts, build, clean, dev, graphify, graphify:update, graphify:viz, graphify:watch (+2 more)

### Community 10 - "Architecture & System Documentation"
Cohesion: 0.40
Nodes (5): Claude Agent Graphify Guidelines, Web Application Entrypoint, AI Student Grievance System, Graphify Knowledge Graph Architecture, Local SQLite3 Database Migration

### Community 14 - "sendEmailOTP.ts"
Cohesion: 0.22
Nodes (9): @emailjs/browser@^4.4.1, @emailjs/browser, sendOTPEmail(), SendOtpParams, SendOtpResult, PUBLIC_KEY, sendOTPEmail(), SERVICE_ID (+1 more)

## Knowledge Gaps
- **2 isolated node(s):** `Claude Agent Graphify Guidelines`, `Web Application Entrypoint`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 61 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `package.json`, `Admin Analytics & Visualization`, `Report Generation & Export Utilities`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **What connects `Claude Agent Graphify Guidelines`, `Web Application Entrypoint` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11717171717171718 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `App.tsx` to `package.json`, `Admin Analytics & Visualization`, `Report Generation & Export Utilities`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05568627450980392 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `Project & Graphify Scripts` to `package.json`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Should `TypeScript Compiler Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._