# AI Student Grievance System (Local SQLite3 Edition)

A full-stack College Student Grievance Redressal and Anti-Ragging Portal converted from Firebase Firestore to a completely local **SQLite3** database with zero external API key requirements.

---

## 🚀 Quick Start (Running Locally)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Local Server
```bash
npm run dev
```

The application will start immediately at:
**[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Default Accounts (Pre-Seeded in SQLite3)

### Student Login
- **Register Number:** `2023CS042`
- **Password:** `student123`
- *(Or sign up with any new registration number using the automated local OTP verification)*

### Administrator Login
- Securely configured for authorized personnel (configurable via `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables). Login credentials are kept private and not exposed on public UI views.

---

## 🛠️ Changes Made: Firebase to SQLite3 Migration

1. **Local SQLite3 Database (`db.ts` & `database.sqlite`):**
   - Built on Node.js native SQLite database engine (`node:sqlite`).
   - Automatically initializes `users`, `grievances`, and `outbox` tables on first launch.
   - Pre-seeds initial demo tickets and accounts if the database is empty.
   - Automatically creates and persists data in `database.sqlite`.

2. **Backend REST API Endpoints (`server.ts`):**
   - `GET /api/grievances`: Fetch all grievances.
   - `POST /api/grievances`: Submit new grievance.
   - `PUT /api/grievances/:id`: Update ticket priority, status, or resolution notes.
   - `POST /api/auth/login`: Authenticate student or admin against SQLite.
   - `POST /api/auth/send-otp`: Generate 6-digit OTP code (logged in console and stored in outbox).
   - `POST /api/auth/verify-otp`: Validate 6-digit verification code.
   - `POST /api/users`: Register or update student profiles.
   - `POST /api/ai/classify-complaint`: Local heuristic spam, gibberish, and category classifier.
   - `POST /api/notifications/send` & `GET /api/notifications/outbox`: In-app notification viewer.

3. **Frontend Integration (`src/api.ts`):**
   - Replaced all Firebase Firestore SDK calls (`collection`, `doc`, `onSnapshot`, `setDoc`, `addDoc`) with typed REST API calls.
   - Removed `firebase` dependency and `src/firebase.ts`.

4. **Zero API Key Dependency:**
   - **No Gemini API Key Needed:** Local rule-based heuristic classifier analyzes complaint spam, keyboard smashes, and automatically categorizes tickets locally.
   - **No Email API Key Needed:** OTP verification works completely offline and locally, logging OTP codes to the terminal and providing a quick one-click Auto-fill in the UI.

---

## 📦 Scripts

- `npm run dev`: Starts the local Express + Vite server with SQLite3.
- `npm run build`: Bundles the client and server for production.
- `npm run start`: Runs the built server (`dist/server.cjs`).
- `npm run lint`: Performs TypeScript type check.
- `npm run graphify`: Generates the complete codebase knowledge graph (`graphify-out/`).
- `npm run graphify:watch`: Runs real-time background watcher that auto-updates the graph whenever files are edited/saved.
- `npm run graphify:update`: Incrementally updates the knowledge graph based on AST code changes.
- `npm run graphify:viz`: Exports interactive HTML visualization (`graphify-out/graph.html`).

---

## 🕸️ Graphify Knowledge Graph Integration

This repository incorporates **[Graphify](https://github.com/Graphify-Labs/graphify)** (`graphifyy`), converting the codebase into a queryable knowledge graph.

### 1. Interactive Graph Visualization
- **In-App Visualizer:** When running the server, navigate to **`http://localhost:3000/graph`** or click the **"Knowledge Graph"** / **"Architecture Graph"** buttons in the header and Admin Console.
- **Standalone File:** Open `graphify-out/graph.html` directly in any web browser.

### 2. Automatic Updates
The graph updates automatically in three ways:
1. **Real-time Live Watch Mode (`npm run graphify:watch`):** Monitors your project files and auto-rebuilds `graph.json`, `graph.html`, and `GRAPH_REPORT.md` in real-time as you edit and save files (with a 3s debounce).
2. **On Git Commits (Git Hooks):** Pre-configured git hooks (`.git/hooks/post-commit`, `post-merge`, `post-checkout`) automatically update the graph whenever code changes are committed.
3. **During AI Agent Sessions:** The agent rule [`.agents/rules/graphify.md`](.agents/rules/graphify.md) automatically triggers `graphify update .` whenever the AI assistant modifies code in the project.
4. **Manual On-Demand:** Run `npm run graphify:update` whenever you want an immediate one-off rebuild.

### 2. AI Coding Assistant Supercharging
- Native **Google Antigravity** rules and skills are configured in `.agents/rules/graphify.md`, `.agents/workflows/graphify.md`, and `.agents/skills/graphify/`.
- Coding agents can query the knowledge graph instead of burning context tokens reading whole files:
  ```bash
  # Query architecture or component relationships
  graphify query "AdminDashboard"

  # Explain a specific symbol or function
  graphify explain "AuthModal()"

  # Find the shortest path between components
  graphify path "src/App.tsx::App()" "getDatabase()" --undirected
  ```

### 3. Git Automation Hooks
- Pre-configured git commit hooks (`.git/hooks/post-commit`, `post-merge`, `post-checkout`) automatically update the knowledge graph whenever code changes are committed.
