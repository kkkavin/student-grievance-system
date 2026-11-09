# Campus Grievance Redressal & Anti-Ragging System

A modern, production-grade, full-stack AI grievance redressal and anti-ragging platform designed for university campuses. Built with a decoupled monorepo architecture featuring **Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS)** on the frontend, **Python FastAPI (SQLAlchemy 2.0 Async, Pydantic v2)** on the backend, and a relational **PostgreSQL** database with vector similarity indexing.

---

## 🏛️ System Architecture

The platform is designed around strict separation of concerns, high throughput, sub-50ms AI classification, and zero-latency student feedback:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT / BROWSER                              │
│  - Next.js 15 App Router (React 19, Tailwind CSS, Lucide Icons)         │
│  - Instant Keystroke Validation (<1ms Client Pre-filter)                │
│  - Persistent SpeechRecognition Voice Engine (useRef Lifecycle)         │
│  - Role Dashboards (Student, 10 Department Portals, Super Admin Console)│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP /api (Reverse Proxy Rewrite)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       FASTAPI BACKEND SERVICE                           │
│  - Asynchronous High-Throughput REST API (Python 3.12+, Uvicorn)        │
│  - RFC 7519 HS256 JWT Authentication & Department Row-Level Isolation   │
│  - 3-Stage Grievance Classifier (Heuristics -> OOD Gate -> TF-IDF/MNB)   │
│  - Hybrid Semantic Deduplication (Vector Cosine + Token Overlap)        │
│  - Multi-Ticket Cascading Resolution & Audit Logging                    │
│  - Multidimensional Analytics Rollups & Monthly Risk Forecasting        │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Async SQLAlchemy 2.0 / asyncpg
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL DATABASE                             │
│  - Port 5432: campus_grievance_db                                       │
│  - Tables: users, departments, complaints, complaint_upvotes,           │
│    category_routing_rules, notifications, audit_logs, otp_sessions      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Capabilities
- **Intelligent Keystroke Gating**: Submit buttons disable live while typing until inputs constitute genuine campus grievances. No post-click error banners or frustration.
- **Harassment & Anti-Ragging Safety Net**: Immediate detection and escalation of ragging, bullying, stalking, eve teasing, extortion, and harassment without requiring explicit building names.
- **Strict Out-of-Domain (OOD) Rejection**: Rejects commercial, city-level, cinema, train, crypto, and off-campus complaints with clear contextual feedback.
- **Hybrid Semantic Deduplication**: Automatically detects duplicate complaints across blocks using vector similarity and token overlap, clustering them under master tickets with cascading resolution.
- **Row-Level Access Control (RLAC)**: Strict cryptographic and database isolation preventing department admins from accessing or modifying cross-department records.
- **Predictive Analytics & Forecasting**: Real-time risk scoring (1–100) combining category volumes, resolution velocities, and academic calendar multipliers (exam weeks, cultural fests).

---

## 📁 Monorepo Structure

```
student-support/
├── backend/                       # Python FastAPI Backend Application
│   ├── alembic/                   # Database schema migrations
│   ├── app/
│   │   ├── core/                  # Security (JWT HS256, bcrypt), Config settings
│   │   ├── db/                    # SQLAlchemy 2.0 models, sessionmaker, seed script
│   │   ├── ml/                    # 3-Stage grievance classifier & hybrid deduplication
│   │   ├── routers/               # Modular REST endpoints (auth, complaints, analytics, depts)
│   │   ├── schemas/               # Pydantic v2 validation schemas
│   │   ├── services/              # Analytics aggregation & monthly risk forecasting
│   │   └── main.py                # FastAPI application entrypoint & middleware
│   ├── tests/                     # Comprehensive pytest test suite (238 test cases)
│   ├── pytest.ini                 # Pytest configuration
│   └── requirements.txt           # Python backend dependencies
│
├── frontend/                      # Next.js 15 App Router Application
│   ├── app/                       # App router layout, page, globals.css
│   ├── components/                # React 19 UI components (AuthModal, Dashboards, ComplaintForm)
│   ├── lib/                       # API proxy client, client-side pre-filtering classifier
│   ├── types/                     # TypeScript interface definitions
│   ├── tests/                     # Frontend test suite (162 test cases)
│   ├── next.config.mjs            # Next.js config with API proxy rewrites
│   ├── tailwind.config.ts         # Tailwind CSS design system configuration
│   └── package.json               # Frontend dependencies & scripts
│
├── graphify-out/                  # Codebase Knowledge Graph & Visualizer
│   ├── graph.html                 # Interactive browser architecture visualizer
│   ├── graph.json                 # Machine-readable node/edge dependency graph
│   └── GRAPH_REPORT.md            # Structural architectural summary
│
├── package.json                   # Root unified multi-tier CLI task runner
├── CREDENTIALS.md                 # Complete catalog of seeded demo credentials
├── docker-compose.yml             # Production Docker container orchestration
├── .env.example                   # Environment variable template
└── README.md                      # Primary repository documentation
```

> **Zero Legacy Leftovers**: All legacy Vite + Express + SQLite files (`server.ts`, `db.ts`, `vite.config.ts`, `index.html`, `bun.lock`, `database.sqlite*`, and legacy `src/`) have been completely purged from the repository.

---

## ⚡ Multi-Tier CLI Commands Reference

Manage both tiers seamlessly from the repository root:

| Command | Tier | Description |
|---|---|---|
| `npm run setup` | Full Stack | One-shot environment orchestrator: initializes `.venv`, installs pip packages, installs frontend `node_modules`, starts PostgreSQL, migrates tables, and seeds initial demo data. |
| `npm run dev` | Full Stack | Concurrently launches FastAPI (`http://localhost:8000`) and Next.js (`http://localhost:3000`) with color-coded log streams. |
| `npm run backend` | Backend | Runs FastAPI with hot-reload via Uvicorn on port 8000. |
| `npm run frontend` | Frontend | Runs Next.js App Router development server on port 3000. |
| `npm run db:seed` | Database | Idempotently populates Super Admin, 10 Department Admins, Students, 38+ realistic complaints, and 30 days of analytics data. |
| `npm run db:reset` | Database | Drops existing tables, reapplies schema migrations, and freshly reseeds the database. |
| `npm test` | Testing | Runs both the backend `pytest` suite (238 tests) and frontend test suite (162 tests). |
| `npm run build` | Frontend | Builds the optimized production bundle for Next.js 15. |
| `npm run graphify:update` | Architecture | Regenerates the AST code knowledge graph in `graphify-out/` without external LLM API costs. |

---

## 🔑 Quick Demo Login & Seeded Accounts

The authentication dialog (`AuthModal.tsx`) features a one-click **Quick Demo Login** selector that auto-fills credentials for instant role exploration.

In development, the universal OTP code is **`123456`**.

### Super Administrator
* **Email**: `admin@campus.edu` | **Password**: `Admin@123` | **OTP**: `123456`
* **Role**: `SUPER_ADMIN` (Dr. Rajeshwari, Dean of Student Affairs)
* **Access**: Global cross-departmental oversight, system audit logs, and triage queue moderation.

### Department Administrators (100% Campus Coverage)
All 10 Department Admins share password **`Dept@123`** and OTP **`123456`**:

| # | Department | Email Address | HOD / Admin |
|---|---|---|---|
| 1 | **Hostel & Accommodation** | `hostel.admin@campus.edu` | Prof. Sundaram (Chief Warden) |
| 2 | **Mess & Canteen** | `mess.admin@campus.edu` | Dr. Meenakshi (Mess Director) |
| 3 | **IT & ERP Services** | `it.admin@campus.edu` | Er. Karthikeyan (Head - IT) |
| 4 | **Academics & Labs** | `academics.admin@campus.edu` | Dr. Ramanathan (Dean - Academics) |
| 5 | **Infrastructure & Maintenance** | `infra.admin@campus.edu` | Er. Balasubramanian (Estate Officer) |
| 6 | **Transport Services** | `transport.admin@campus.edu` | Mr. Saravanan (Transport Manager) |
| 7 | **Anti-Ragging & Security** | `security.admin@campus.edu` | Col. Natarajan (Chief Security Officer) |
| 8 | **Medical & Wellness** | `medical.admin@campus.edu` | Dr. Shanthi (Chief Medical Officer) |
| 9 | **Administration & Finance** | `accounts.admin@campus.edu` | Mr. Venkatraman (Finance Officer) |
| 10 | **Library, Sports & Placement** | `studentlife.admin@campus.edu` | Dr. Padmavathi (Dean - Student Life) |

### Representative Student Accounts
All student accounts share password **`Student@123`** and OTP **`123456`**:
- `kavin@student.campus.edu` (CSE, Hosteller - Block C, Room 304)
- `ananya@student.campus.edu` (ECE, Hosteller - Block A, Room 108)
- `rahul@student.campus.edu` (MECH, Day Scholar - Route 14 Bus)
- `priya@student.campus.edu` (IT, Hosteller - Block B, Room 212)

> Full account details, registration numbers, and role permissions are documented in **[`CREDENTIALS.md`](CREDENTIALS.md)**.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 20.x or 22.x LTS
- **Python** 3.11+ or 3.12+
- **PostgreSQL** 15+ or 16+ running locally on port 5432 (or Docker)

### Installation & Launch
```bash
# 1. Clone repository and install dependencies
git clone <repo-url>
cd student-support

# 2. Run automated setup (provisions venv, dependencies, database, and seeds)
npm run setup

# 3. Start development servers
npm run dev
```

Visit **`http://localhost:3000`** in your browser to access the application.

---

## 🧪 Comprehensive Verification Suite

Execute the full verification pipeline to validate all functional, security, and ML guarantees:

```bash
# 1. Backend Pytest Suite (238/238 passing)
cd backend
pytest tests/ -v

# 2. Frontend Test Suite (162/162 passing)
cd frontend
npm test

# 3. Production Build Validation
cd frontend
npm run build
```

---

## 🚢 Production Deployment

### Option A: Docker Compose (Recommended)
Launch the entire containerized stack with a single command:
```bash
docker compose up -d --build
```
This initializes:
- `grievance-postgres`: PostgreSQL 16 with pgvector on port 5432.
- `grievance-fastapi`: FastAPI backend running Uvicorn workers on port 8000.
- `grievance-frontend`: Next.js 15 production server on port 3000.

### Option B: Cloud PaaS (Vercel + Railway / Render)
1. **Frontend (Vercel)**:
   - Root directory: `frontend/`
   - Framework preset: `Next.js`
   - Environment variables: `FASTAPI_URL=https://api.yourdomain.com`
2. **Backend (Railway / Render / AWS ECS)**:
   - Root directory: `backend/`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4`
   - Environment variables:
     * `DATABASE_URL=postgresql+asyncpg://<user>:<pwd>@<host>:5432/<db>`
     * `SYNC_DATABASE_URL=postgresql+psycopg2://<user>:<pwd>@<host>:5432/<db>`
     * `JWT_SECRET=<strong-random-hex-secret>`
     * `CORS_ORIGINS=https://yourdomain.com`
3. **Database (Neon / Supabase / AWS RDS)**:
   - Provision PostgreSQL 16 database and apply migrations: `python -m app.db.init_db`.

---

## 🕸️ Knowledge Graph Integration (`graphify`)

This codebase is indexed by **[Graphify](https://github.com/Graphify-Labs/graphify)**. Explore architectural dependencies and symbol relationships directly:

```bash
# Query component relationships
graphify query "StudentComplaintForm"

# Explain function behavior and callers
graphify explain "classify_grievance"

# Trace shortest architectural lineage path
graphify path "frontend/components/StudentComplaintForm.tsx" "backend/app/ml/classifier.py"

# Regenerate knowledge graph post-code modifications
graphify update . --force
```
Open **`graphify-out/graph.html`** in any browser for an interactive 3D visual graph of the codebase.

---

## 📄 License
Academic & Educational Use Only — Department of Student Affairs, Campus Grievance Redressal Committee.
