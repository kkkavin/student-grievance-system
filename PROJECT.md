# Project: Campus Student Grievance Management System (Production-Hardened AI & GTM Expansion)

## Architecture
The platform is a production-hardened full-stack Campus Grievance Management System built with a unified modern architecture:
1. **Frontend**: Next.js 15+ App Router / React 19 + Tailwind CSS, with interactive dashboards (`StudentComplaintForm.tsx`, `AdminDashboard.tsx`, etc.) targeting canonical `/api/v1/*` routes.
2. **Backend**: Canonical FastAPI application located strictly at `backend/app/` with non-breaking route aliasing for legacy `/api/*` endpoints.
3. **AI Triage Agent**: Groq Cloud LLM (`llama-3.3-70b-versatile`, `response_format={"type": "json_object"}`) with structured Pydantic v2 `TriageResult` schema and a high-speed deterministic 3-stage local heuristic fallback (<0.5ms SLA) that vetoes off-campus venues (cinemas, malls, food apps, flights) while accepting campus concerns (infrastructure, hostels, academics, ragging/interpersonal safety).
4. **Vector Deduplication Engine**: `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dimensions) with lazy singleton loading and deterministic TF-IDF/n-gram vector fallback, backed by PostgreSQL `pgvector.sqlalchemy.Vector(384)` with cosine similarity linking (>0.82 threshold).
5. **Event-Driven Workflow Automation**: Asynchronous execution via FastAPI `BackgroundTasks` triggering transactional status update notifications and outbound webhook alerts (Slack, Discord, Custom) when tickets are `CRITICAL` or duplicate clusters reach $\ge 3$ tickets.
6. **VisAI Labs GTM Suite**: Dynamic Outbound Webhook management (`WebhookConfig`, `WebhookDeliveryLog`) and real-time Resolution SLA & Automation Analytics (`/api/v1/analytics/automation-sla`) integrated into the `AdminDashboard.tsx` UI.

```
┌────────────────────────────────────────────────────────┐
│             Next.js 15+ Frontend (React 19)            │
│    StudentComplaintForm.tsx    AdminDashboard.tsx      │
└───────────────────────────┬────────────────────────────┘
                            │ /api/v1/* (/api/* aliases)
                            ▼
┌────────────────────────────────────────────────────────┐
│            Canonical FastAPI (backend/app/)            │
│   auth.py   grievances.py   ai.py   webhooks.py ...   │
├───────────────────────────┬────────────────────────────┤
│ Groq LLM Triage Agent     │ sentence-transformers      │
│ (llama-3.3-70b-versatile) │ (all-MiniLM-L6-v2 384-d)   │
│ + Local Deterministic     │ + pgvector Cosine Sim      │
│   Heuristic Fallback      │ + Offline TF-IDF Fallback  │
└─────────────┬─────────────┴─────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│ PostgreSQL 16 + pgvector  │ │ FastAPI BackgroundTasks  │
│ (grievances, webhooks,    │ │ - SMTP / In-App Notify   │
│  otp_sessions, audit)     │ │ - Outbound Webhook Alert │
└───────────────────────────┘ └──────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Canonical Backend Consolidation | Eliminate redundant root `backend/routers`, `services`, `db`, `ml`, `schemas`; consolidate into `backend/app/` with 3-line entrypoint shim in `backend/main.py` | M1 | R1 |
| 2 | Grievance Domain Standardization | Standardize on `grievance` terminology across models, schemas, routers (`backend/app/routers/grievances.py`, `Grievance` SQLAlchemy model, `/api/v1/grievances`); merge redundant `complaints.py` | M1 | R1 |
| 3 | Non-Breaking Route Aliasing | Mount primary routes under `/api/v1/*` with hidden backward-compatible aliases for legacy `/api/*`; update `frontend/lib/api.ts` | M1 | R1 |
| 4 | Server-Side Cryptographic OTP | Remove client-side OTP; implement secure 6-digit OTP generation, salted hash storage in `otp_sessions` (5-min TTL, max 5 attempts), BackgroundTasks dispatch, and JWT issuance | M1 | R1 |
| 5 | Git Artifact Clean & Security | Untrack `CREDENTIALS.md`, `.agents/`, `session-handoff.md`, `CLAUDE.md`, `graphify-out/`; update `.gitignore` and `.env.example` with clean placeholders | M1 | R1 |
| 6 | Groq LLM Triage Agent | Structured triage endpoint `POST /api/v1/ai/triage` using `groq` SDK (`llama-3.3-70b-versatile`, `response_format={"type": "json_object"}`) returning strict Pydantic v2 `TriageResult` | M2 | R2 |
| 7 | Deterministic Local Heuristic Fallback | 3-stage local heuristic fallback returning exact `TriageResult` schema in <0.5ms SLA if Groq key missing/invalid or timeout >3.5s; fast frontend gatekeeper | M2 | R2 |
| 8 | OOD Off-Campus Rejection & Campus Ingestion | Reject off-campus venues (cinemas, malls, food delivery, flights) with `rejection_reason`; accept campus concerns including bullying/ragging/harassment | M2 | R2 |
| 9 | Sentence-Transformers Vector Embedding | Lazy singleton service for `all-MiniLM-L6-v2` (384-d) with deterministic TF-IDF/n-gram offline fallback | M3 | R2 |
| 10 | pgvector Semantic Deduplication | Store vector on `Grievance` (`Vector(384)`); link open departmental tickets with cosine similarity > 0.82 (`duplicate_of_id`, increment `duplicate_count`, `intercepted_by_dedup`) | M3 | R2 |
| 11 | Event-Driven Workflow Automation | FastAPI `BackgroundTasks` enqueuing `send_status_update_email` on create/status patch, and `dispatch_webhook_alert` on `CRITICAL` or duplicate cluster $\ge 3$ | M3 | R2 |
| 12 | Outbound Webhook Alerting | `WebhookConfig` & `WebhookDeliveryLog` models; `GET/POST /api/v1/webhooks`, `POST /api/v1/webhooks/{id}/test` via `httpx.AsyncClient` with formatted payloads | M4 | R3 |
| 13 | Resolution SLA & Automation Analytics | Endpoint `GET /api/v1/analytics/automation-sla` returning department SLA metrics, auto-triage rate, duplicates intercepted, and webhook deliveries | M4 | R3 |
| 14 | Admin Dashboard GTM Expansion | "AI Automation & SLA Performance" panel in `AdminDashboard.tsx` with KPI cards, SLA breakdown chart, and interactive webhook test drawer | M4 | R3 |
| 15 | Interview-Ready Technical README | Architecture diagram (Mermaid + ASCII), setup commands (`npm run setup`, `npm run dev`, `npm test`), and copy-paste `curl` verification workflows | M5 | R4 |
| 16 | End-to-End Test Suite Verification | Pytest and frontend test harness fixes ensuring 100% pass rate in hybrid environment (DB/Mock) | M5 | R4 |
| 17 | Opaque-Box E2E Testing Suite | Multi-tier test suite (Tiers 1-4) validating all API contracts and publishing `TEST_READY.md` | Track E | Testing Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Canonical Backend & Security | Features 1, 2, 3, 4, 5 (Consolidate `backend/app/`, route aliasing, cryptographic OTP, git untrack) | none | DONE |
| M2 | Groq LLM Triage & Fallback | Features 6, 7, 8 (Groq `llama-3.3-70b-versatile`, `TriageResult` schema, heuristic fallback, OOD veto) | M1 | DONE |
| M3 | Vector Deduplication & Events | Features 9, 10, 11 (`sentence-transformers`, pgvector similarity >0.82, BackgroundTasks email/webhooks) | M1, M2 | DONE |
| M4 | Outbound Webhooks & SLA Analytics | Features 12, 13, 14 (`WebhookConfig`, `/api/v1/webhooks`, `/api/v1/analytics/automation-sla`, Admin UI panel) | M1, M3 | DONE |
| M5 | Technical Docs & Final Verification | Features 15, 16 (`README.md`, pytest and frontend test suite 100% pass, verification curl workflows) | M1, M2, M3, M4 | DONE |
| Track E | E2E Testing Suite | Feature 17 (Opaque-box E2E test suite across Tiers 1-4, `TEST_READY.md`) | M1 | DONE |

## Code Layout
- `backend/app/`: Canonical FastAPI application root
  - `main.py`: Primary FastAPI application factory, middleware, router mounts under `/api/v1/*` and `/api/*` aliases
  - `core/config.py`: Application settings (Groq, JWT, Database, SMTP, CORS)
  - `db/`: SQLAlchemy models (`models.py`), database session (`session.py`), migrations (`alembic/`)
  - `routers/`: REST endpoints (`auth.py`, `grievances.py`, `ai.py`, `webhooks.py`, `analytics.py`, `departments.py`, `notifications.py`)
  - `schemas/`: Pydantic v2 validation models (`auth.py`, `grievance.py`, `ai.py`, `webhooks.py`, `analytics.py`)
  - `services/`: Business services (`auth_service.py`, `email_service.py`, `webhook_service.py`, `audit_service.py`)
  - `ml/`: AI models & pipelines (`classifier.py`, `deduplication.py`)
- `backend/main.py`: Minimal 3-line compatibility shim forwarding to `backend.app.main:app`
- `backend/tests/`: Pytest suite (`conftest.py`, `test_auth.py`, `test_grievances.py`, `test_ai_triage.py`, `test_deduplication.py`, `test_webhooks.py`, `test_analytics_sla.py`, `test_ml_classifier.py`)
- `frontend/`: Next.js 15+ application
  - `components/`: React components (`StudentComplaintForm.tsx`, `AdminDashboard.tsx`, etc.)
  - `lib/api.ts`: API client targeting `/api/v1/*`
  - `services/`: Client-side utilities

## Interface Contracts
### 1. Auth Contract (`/api/v1/auth`)
- `POST /api/v1/auth/request-otp`:
  - Request: `{"email": "student@campus.edu"}`
  - Response: `{"message": "OTP sent successfully", "session_id": "...", "expires_in": 300}`
- `POST /api/v1/auth/verify-otp`:
  - Request: `{"email": "student@campus.edu", "otp": "123456"}`
  - Response: `{"access_token": "...", "token_type": "bearer", "user": {"id": "...", "email": "...", "role": "STUDENT"}}`

### 2. AI Triage Contract (`/api/v1/ai/triage`)
- Request: `{"text": "...", "student_type": "HOSTELER", "category": null}`
- Response: `TriageResult`:
  - `is_valid_grievance: bool`
  - `rejection_reason: Optional[str]`
  - `category: str`
  - `department_id: str`
  - `urgency: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]`
  - `confidence: float`
  - `intent_summary: str`
  - `actionable_steps: List[str]`

### 3. Grievances Contract (`/api/v1/grievances`)
- `POST /api/v1/grievances`:
  - Request: Grievance submission schema
  - Response: Created grievance object (including `duplicate_of_id`, `duplicate_count`, `intercepted_by_dedup`)
- `PATCH /api/v1/grievances/{id}/status`:
  - Request: `{"status": "IN_PROGRESS", "admin_notes": "...", "priority": "CRITICAL"}`
  - Response: Updated grievance object

### 4. Webhooks Contract (`/api/v1/webhooks`)
- `GET /api/v1/webhooks`: List registered webhook configs
- `POST /api/v1/webhooks`: Register a new webhook config (`target_url`, `platform`, `trigger_on_critical`, etc.)
- `POST /api/v1/webhooks/{id}/test`: Trigger test alert delivery; returns `WebhookDeliveryLog`

### 5. SLA Analytics Contract (`/api/v1/analytics/automation-sla`)
- `GET /api/v1/analytics/automation-sla`:
  - Response: `{ "department_sla_metrics": [...], "auto_triage_rate": {...}, "duplicates_intercepted": {...}, "webhook_deliveries_24h": {...} }`
