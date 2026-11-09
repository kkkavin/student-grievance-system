# Project: Campus Grievance Management System (2026 AI Production Tech Stack)

## Architecture Overview
The platform has been migrated to a modern 2026 AI production architecture featuring dual-target execution, robust vector search, and strict backward-compatible REST contracts:

1. **Persistence & Vector Layer (`backend/db/`)**:
   - **PostgreSQL 16** with **`pgvector`** extension (`Vector(384)`).
   - **SQLAlchemy 2.0 Async** (`asyncpg`) with normalized schema: `departments`, `users`, `complaints`, `category_routing_rules`, `audit_logs`, `notifications`, `otp_codes`.
   - **Alembic** migrations (`backend/alembic/versions/0001_initial_schema.py`) with HNSW cosine index on `complaints.embedding`.
   - Deterministic seeder (`backend/db/seed.py`) populating 5 departments, 14 routing rules, 16 users, 5 initial tickets, and 200 synthetic complaints with 384-dimensional embeddings.
   - Dual-bridge persistence: Transparent fallback to in-memory/SQLite in `db.ts` and `server.ts` during lightweight local and CI runs.

2. **AI & REST Business Logic Engine (`backend/`)**:
   - **Python 3.12 + FastAPI + Pydantic v2** (`backend/main.py`).
   - Modular routers preserving exact HTTP contracts, status codes, and JSON response envelopes:
     - Auth & RBAC (`backend/routers/auth.py`): Unified login, OTP dispatch & verification, JWT claim issuance (`STUDENT`, `DEPARTMENT_STAFF`, `DEPARTMENT_HEAD`, `SUPER_ADMIN`).
     - Grievance Lifecycle & Cascading Resolution (`backend/routers/grievances.py`): Submissions, AI triage, hybrid deduplication, manual merge/detach, atomic cascading resolution (`POST /api/grievances/:id/resolve`), RLAC isolation.
     - Auto-Routing & Departments (`backend/routers/departments.py`): Dynamic rule resolution and administrative management.
     - Predictive Analytics & Risk Forecasting (`backend/routers/analytics.py`): Port of multi-dimensional rollups and academic calendar risk scoring.
     - AI Classification & OOD Gatekeeper (`backend/routers/ai.py`, `backend/ml/classifier.py`): 3-stage validation pipeline with sub-50ms inference.
     - Targeted Notifications & Outbox (`backend/routers/notifications.py`).
     - Graph Intelligence (`backend/routers/graph.py`): REST summary of knowledge graph topology.

3. **Frontend Application Layer (Next.js App Router & React 19)**:
   - **Next.js 15+ (App Router)** with React 19 and Tailwind CSS.
   - Next.js API proxying via `next.config.mjs` rewriting `/api/:path*` to the FastAPI backend.
   - Client hydration and dashboard rendering in `src/app/` seamlessly hosting existing components: `AdminDashboard.tsx`, `DepartmentDashboard.tsx`, `DepartmentManagement.tsx`, `PredictiveAnalyticsDashboard.tsx`, `StudentComplaintForm.tsx`, `TriageModerationView.tsx`, `AuthModal.tsx`, `ReportDownloader.tsx`.

4. **Quality Gates & Zero-Regression Verification**:
   - 100% of Node.js / TypeScript test suites under `test/**` continue to pass without regression.
   - 100% of Python backend pytest tests (59/59) pass.
   - Knowledge graph synchronized via `graphify update .`.

## Milestones Summary
| Milestone | Description | Tech Stack | Status |
|-----------|-------------|------------|--------|
| **Track A** | PostgreSQL 16 + pgvector + SQLAlchemy 2.0 Async + Alembic | Python 3.12, PostgreSQL, pgvector, Alembic | **COMPLETED** |
| **Track B** | FastAPI REST & AI Business Logic Engine | FastAPI, Pydantic v2, scikit-learn / NumPy | **COMPLETED** |
| **Track C** | Next.js App Router (React 19, TypeScript, Tailwind CSS) | Next.js 15, React 19, Tailwind CSS | **COMPLETED** |
| **Track D** | Zero-Regression Verification & Knowledge Graph Sync | Node.js Test Harness, Pytest, Graphify | **COMPLETED** |
