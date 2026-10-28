# Graph Report - student-support  (2026-10-28)

## Corpus Check
- 22 files · ~16,730 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 174 nodes · 329 edges · 15 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a81d4b7c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- StudentComplaintForm.tsx
- db.ts
- sendEmailOTP.ts
- compilerOptions
- dependencies
- devDependencies
- package.json
- vite
- scripts
- allowScripts
- App.tsx
- types.ts
- AI Student Grievance System (Local SQLite3 Edition)
- AuthModal.tsx
- ProfileModal.tsx

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 15 edges
2. `getDatabase()` - 12 edges
3. `App()` - 10 edges
4. `UserProfile` - 10 edges
5. `scripts` - 9 edges
6. `react` - 9 edges
7. `Grievance` - 9 edges
8. `lucide-react` - 8 edges
9. `AuthModal()` - 7 edges
10. `getGrievanceById()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `saveUserApi()`  [EXTRACTED]
  src/App.tsx → src/api.ts
- `App()` --calls--> `AuthModal()`  [EXTRACTED]
  src/App.tsx → src/components/AuthModal.tsx
- `App()` --calls--> `StudentComplaintForm()`  [EXTRACTED]
  src/App.tsx → src/components/StudentComplaintForm.tsx
- `AuthModalProps` --references--> `UserProfile`  [EXTRACTED]
  src/components/AuthModal.tsx → src/types.ts
- `AuthModal()` --calls--> `sendOTPEmail()`  [EXTRACTED]
  src/components/AuthModal.tsx → src/services/sendEmailOTP.ts

## Import Cycles
- None detected.

## Communities (15 total, 0 thin omitted)

### Community 0 - "StudentComplaintForm.tsx"
Cohesion: 0.27
Nodes (8): createGrievanceApi(), StudentComplaintForm(), StudentComplaintFormProps, DAYSCHOLAR_CATEGORIES, DEPARTMENT_OPTIONS, HOSTEL_BLOCKS, HOSTELLER_CATEGORIES, FAQItem

### Community 1 - "db.ts"
Cohesion: 0.16
Nodes (22): createGrievance(), DB_PATH, formatGrievanceRow(), formatUserRow(), getAllGrievances(), getDatabase(), getGrievanceById(), getOutboxEmails() (+14 more)

### Community 2 - "sendEmailOTP.ts"
Cohesion: 0.20
Nodes (10): @emailjs/browser@^4.4.1, @emailjs/browser, sendOTPEmail(), SendOtpParams, SendOtpResult, verifyOTPEmail(), PUBLIC_KEY, sendOTPEmail() (+2 more)

### Community 3 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+7 more)

### Community 4 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, express@^4.21.2, @google/genai@^2.4.0, lucide-react@^0.546.0, motion@^12.23.24, nodemailer@^10.0.10, react@^19.0.1, react-dom@^19.0.1 (+5 more)

### Community 5 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, autoprefixer@^10.4.21, esbuild@^0.25.0, tailwindcss@^4.1.14, tsx@^4.21.0, @types/node@^22.14.0, @types/nodemailer@^8.0.2, typescript@~5.8.2 (+7 more)

### Community 6 - "package.json"
Cohesion: 0.22
Nodes (8): dotenv@^17.2.3, @types/express@^4.17.21, name, private, type, version, dotenv, @types/express

### Community 7 - "vite"
Cohesion: 0.22
Nodes (7): @tailwindcss/vite@^4.1.14, vite@^6.2.3, @vitejs/plugin-react@^5.0.4, vite@^6.2.3, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 8 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, clean, dev, graphify, graphify:update, graphify:viz, lint (+1 more)

### Community 9 - "allowScripts"
Cohesion: 0.50
Nodes (4): allowScripts, esbuild@0.28.2, @google/genai@2.31.0, protobufjs@7.6.6

### Community 10 - "App.tsx"
Cohesion: 0.28
Nodes (9): lucide-react, react, fetchGrievances(), updateGrievanceApi(), App(), AdminDashboard(), FAQSection(), ProfileModal() (+1 more)

### Community 11 - "types.ts"
Cohesion: 0.27
Nodes (8): AdminDashboardProps, INITIAL_GRIEVANCES, Department, Grievance, MockEmailNotification, PriorityLevel, StudentType, UserRole

### Community 12 - "AI Student Grievance System (Local SQLite3 Edition)"
Cohesion: 0.14
Nodes (13): 1. Install Dependencies, 1. Interactive Graph Visualization, 2. AI Coding Assistant Supercharging, 2. Start the Local Server, 3. Git Automation Hooks, Administrator Login, AI Student Grievance System (Local SQLite3 Edition), 🛠️ Changes Made: Firebase to SQLite3 Migration (+5 more)

### Community 13 - "AuthModal.tsx"
Cohesion: 0.48
Nodes (4): loginUserApi(), saveUserApi(), AuthModal(), GrievanceStatus

### Community 14 - "ProfileModal.tsx"
Cohesion: 0.67
Nodes (3): AuthModalProps, ProfileModalProps, UserProfile

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `StudentComplaintForm.tsx`, `dependencies`, `package.json`, `types.ts`, `AuthModal.tsx`, `ProfileModal.tsx`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `App.tsx` to `StudentComplaintForm.tsx`, `dependencies`, `package.json`, `types.ts`, `AuthModal.tsx`, `ProfileModal.tsx`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Should `AI Student Grievance System (Local SQLite3 Edition)` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._