# Campus Grievance Redressal & Anti-Ragging System
### Production-Hardened AI Architecture & VisAI Labs GTM Suite

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15.2+-black.svg?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Groq](https://img.shields.io/badge/Groq-Llama--3.3--70B-F55036.svg)](https://groq.com)
[![pgvector](https://img.shields.io/badge/pgvector-384--d%20Cosine-336791.svg?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Pytest](https://img.shields.io/badge/Pytest-479%20Passed-0A9EDC.svg?logo=pytest&logoColor=white)](https://pytest.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-166%20Tests%20Passed-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A full-stack, enterprise-grade AI campus grievance redressal and anti-ragging platform engineered for higher-education campuses. Features **Next.js 15 App Router (React 19, TypeScript, Tailwind CSS)** on the frontend, a canonical **FastAPI backend** (`backend/app/` with `/api/v1/*` routing and non-breaking legacy aliases), an **LLM Triage Agent on Groq (Llama-3.3-70B-Versatile)** with a sub-millisecond deterministic local fallback, **Sentence-Transformers + pgvector** 384-dimensional semantic deduplication, **Event-Driven Workflow Automation** via FastAPI `BackgroundTasks`, and the **VisAI Labs GTM Suite** (Outbound Webhook Alerting & Real-Time Resolution SLA Analytics).

---

## 🏛️ System Architecture

### Mermaid Interactive Architecture Diagram

```mermaid
flowchart TD
    subgraph Client["Frontend: Next.js 15 App Router (React 19 + TypeScript)"]
        UI_Student["Student Complaint Form\n(Live Keystroke Gating & Voice mic)"]
        UI_Admin["Admin & Department Dashboards\n(SLA Analytics Panel & Webhook Drawer)"]
        Client_API["API Client (frontend/lib/api.ts)\nTargets Canonical /api/v1/*"]
        UI_Student --> Client_API
        UI_Admin --> Client_API
    end

    subgraph Backend["FastAPI Canonical Backend Service (backend/app/)"]
        Router_Auth["/api/v1/auth\n- Cryptographic 6-digit OTP\n- SHA-256 Salted Hash (5m TTL)\n- RFC 7519 HS256 JWT Issuance"]
        Router_Grievances["/api/v1/grievances\n- Canonical REST Lifecycle\n- Hidden /api/ legacy aliases\n- Department RLAC Isolation"]
        Router_AI["/api/v1/ai/triage\n- Structured Groq LLM Triage\n- Pydantic v2 TriageResult Schema\n- <0.5ms Deterministic Fallback"]
        Router_Webhooks["/api/v1/webhooks\n- WebhookConfig CRUD\n- POST /{id}/test Live Dispatch\n- HMAC Secret Headers"]
        Router_Analytics["/api/v1/analytics/automation-sla\n- Department SLA Compliance %\n- Auto-Triage & Accuracy Rate\n- Intercepted Duplicates & Hours Saved"]

        Client_API --> Router_Auth
        Client_API --> Router_Grievances
        Client_API --> Router_AI
        Client_API --> Router_Webhooks
        Client_API --> Router_Analytics
    end

    subgraph Intelligence["AI & Vector Intelligence Layer"]
        Groq_LLM["Groq Cloud LLM\nllama-3.3-70b-versatile\n(temperature=0.1, json_object)"]
        Local_Fallback["Deterministic 3-Stage Heuristic Fallback\n(<0.5ms SLA, Zero-Cost Offline Guard)"]
        OOD_Gate["Domain Invariant Gate\nVetoes Off-Campus Venues | Accepts Ragging/Safety"]
        ST_Embed["Sentence-Transformers\nall-MiniLM-L6-v2 (384-d)\n+ Offline TF-IDF Fallback"]
        
        Router_AI --> Groq_LLM
        Groq_LLM -.->|Timeout >3.5s / Missing Key| Local_Fallback
        Router_AI --> OOD_Gate
        Router_Grievances --> ST_Embed
    end

    subgraph Storage["Persistence & Vector Indexing"]
        PG_DB[("PostgreSQL 16\n- campus_grievance_db\n- users, departments, audit_logs\n- otp_sessions, category_routing_rules")]
        PG_Vector[("pgvector Extension\nVector(384) Cosine Index\n- Automatic Linking (>0.82 Similarity)\n- Master-Duplicate Parent Clustering")]
        
        Router_Auth --> PG_DB
        Router_Webhooks --> PG_DB
        Router_Analytics --> PG_DB
        ST_Embed --> PG_Vector
        Router_Grievances --> PG_DB
        PG_Vector --> Router_Grievances
    end

    subgraph Automation["Event-Driven Workflow Automation (FastAPI BackgroundTasks)"]
        Event_Engine["BackgroundTasks Async Queue"]
        SMTP_Notify["Transactional Email Dispatcher\n(SMTP TLS with Console Fallback)"]
        Webhook_Dispatch["Outbound Webhook Dispatcher\n(Slack, Discord, Custom Webhooks)"]
        Delivery_Log[("webhook_delivery_logs Table")]

        Router_Grievances -->|Ticket Created / Status PATCH| Event_Engine
        Event_Engine --> SMTP_Notify
        Event_Engine -->|Urgency == CRITICAL or Cluster >= 3| Webhook_Dispatch
        Webhook_Dispatch --> Delivery_Log
    end
```

---

### ASCII System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS 15+ FRONTEND TIER (React 19)                            │
│  - StudentComplaintForm.tsx : Live Keystroke Gatekeeper (<1ms), Persistent Voice Mic    │
│  - AdminDashboard.tsx       : AI Automation & SLA Performance Panel, Webhook Drawer    │
│  - lib/api.ts               : Canonical Client targeting /api/v1/* (Non-breaking)      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP REST (/api/v1/* & /api/* legacy aliases)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CANONICAL FASTAPI BACKEND (backend/app/)                        │
│  ┌───────────────────────┬──────────────────────┬──────────────────────┐               │
│  │  /api/v1/auth         │  /api/v1/ai/triage   │  /api/v1/grievances  │               │
│  │  - Cryptographic OTP  │  - Groq Llama-3.3-70B│  - Lifecycle & RLAC  │               │
│  │  - Salted SHA-256 Hash│  - Strict Schema     │  - Vector Dedup Hook │               │
│  │  - 5m TTL / 5 Limit   │  - <0.5ms Fallback   │  - Cascading Resolve │               │
│  ├───────────────────────┼──────────────────────┼──────────────────────┤               │
│  │  /api/v1/webhooks     │  /api/v1/analytics   │  /api/v1/departments │               │
│  │  - Config & CRUD      │  - Resolution SLA %  │  - 10 Campus Portals │               │
│  │  - Live POST /test    │  - Auto-Triage Rate  │  - Category Routing  │               │
│  │  - HMAC Secret Header │  - Duplicate Savings │  - Staff Assignment  │               │
│  └───────────────────────┴──────────────────────┴──────────────────────┘               │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│         AI & VECTOR ENGINE                │       EVENT-DRIVEN AUTOMATION              │
│  - Groq LLM: llama-3.3-70b-versatile      │  - FastAPI BackgroundTasks Worker Queue    │
│  - Local Deterministic Fallback (<0.5ms)  │  - Transactional Status Email (SMTP TLS)   │
│  - OOD Veto (Malls, Cinemas, Flights)     │  - Emergency Webhook Alert (Slack/Discord) │
│  - Sentence-Transformers (384-d vector)   │  - Triggers: CRITICAL or Dup Cluster >= 3  │
│  - pgvector Cosine Linking (>0.82)        │  - Webhook Delivery Audit Logging          │
└─────────────────────┬─────────────────────┴─────────────────────┬──────────────────────┘
                      │                                           │
                      ▼                                           ▼
┌───────────────────────────────────────────┐ ┌──────────────────────────────────────────┐
│         POSTGRESQL 16 + PGVECTOR          │ │       OUTBOUND EXTERNAL SYSTEMS          │
│  - users, departments, audit_logs         │ │  - Campus Incident Slack Channels        │
│  - grievances (Vector(384) Cosine index)  │ │  - Security & Anti-Ragging Discord Webhook│
│  - webhook_configs & webhook_delivery_logs│ │  - Student Email Notification Outbox     │
│  - otp_sessions (salted hash, attempt ctr)│ │  - Centralized Syslog / Telemetry Engine │
└───────────────────────────────────────────┘ └──────────────────────────────────────────┘
```

---

## ⚡ Key Architectural Capabilities

### 1. Structured Groq Cloud LLM Triage Agent & Deterministic Fallback
* **Groq Cloud Integration**: Driven by `llama-3.3-70b-versatile` with `response_format={"type": "json_object"}` and strict temperature clamping (`0.1`) for reproducible classifications.
* **Strict Pydantic v2 Contract (`TriageResult`)**:
  ```json
  {
    "is_valid_grievance": true,
    "rejection_reason": null,
    "category": "Hostel & Infrastructure",
    "department_id": "dept-hostel",
    "urgency": "HIGH",
    "confidence": 0.94,
    "intent_summary": "Water leakage and low pressure reported in Block B",
    "actionable_steps": [
      "Dispatch maintenance plumber to Block B 3rd floor",
      "Inspect overhead distribution valve"
    ]
  }
  ```
* **Sub-Millisecond Deterministic Local Fallback**: When `GROQ_API_KEY` is omitted, invalid, or upstream network latency exceeds 3.5 seconds, the system activates a local 3-stage heuristic pipeline (`local_heuristic_fallback`). It returns the exact same Pydantic schema in **<0.5ms**, maintaining 100% offline uptime and driving the live submit-button gatekeeper in `StudentComplaintForm.tsx`.
* **Out-of-Domain (OOD) Rejection & Safety Net**: Automatically flags and rejects non-campus inputs (commercial flights, city cinemas, food delivery apps, crypto) with contextual rejection reasons, while accepting campus harassment, ragging, and interpersonal safety concerns even when location tags are omitted.

### 2. Sentence-Transformers & pgvector Semantic Deduplication
* **384-Dimensional Embeddings**: Computes dense semantic vectors via `sentence-transformers` (`all-MiniLM-L6-v2`) with lazy singleton memory loading and offline TF-IDF/n-gram fallback.
* **PostgreSQL pgvector Cosine Linking**: Each grievance stores its embedding in a `Vector(384)` column. On submission, the backend queries existing open departmental tickets via cosine distance:
  $$\text{Cosine Similarity} = 1 - \text{Cosine Distance} > 0.82$$
* **Cluster Management**: When similarity exceeds `0.82`, the new ticket is automatically flagged as `intercepted_by_dedup = True`, linked to the parent case (`duplicate_of_id`), and increments the parent's `duplicate_count`. Resolving the master ticket cascades resolution to all child complaints.

### 3. Event-Driven Workflow Automation
* **Non-Blocking BackgroundTasks**: Grievance submissions and status updates (`PATCH /api/v1/grievances/{id}/status`) immediately return HTTP responses while dispatching notifications asynchronously.
* **Automated Alert Escalation**:
  - Enqueues `send_status_update_email` on ticket creation and lifecycle transitions.
  - Automatically dispatches `dispatch_webhook_alert` when `urgency == "CRITICAL"`, when priority is escalated to `CRITICAL`, or when duplicate clusters reach $\ge 3$ tickets.

### 4. VisAI Labs GTM Suite (Webhooks & SLA Analytics)
* **Outbound Webhooks**: Complete RESTful management (`GET /api/v1/webhooks`, `POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/{id}`) with platform support for Slack, Discord, and custom HMAC-authenticated HTTP targets.
* **Live Test Alert Dispatcher**: `POST /api/v1/webhooks/{id}/test` dispatches sample critical payloads using `httpx.AsyncClient` with detailed delivery logging (`WebhookDeliveryLog`).
* **Resolution SLA & Automation Analytics**:
  - Endpoint `GET /api/v1/analytics/automation-sla` aggregates real-time KPIs: average resolution hours vs target SLA per department, SLA compliance rate (%), autonomous Groq triage rate (%), intercepted duplicate volume, and staff hours saved.
  - Interactive "AI Automation & SLA Performance" dashboard panel in `AdminDashboard.tsx` with KPI cards, department SLA breakdown table, and a slide-over webhook testing drawer.

---

## 📁 Monorepo Layout

```
student-grievance-system/
├── backend/                       # Canonical FastAPI Backend Application
│   ├── alembic/                   # Database schema migrations
│   ├── app/                       # Canonical backend application root
│   │   ├── core/                  # Security (JWT HS256, salted SHA-256 OTP), Config
│   │   ├── db/                    # SQLAlchemy 2.0 models, sessionmaker, seed script
│   │   ├── ml/                    # Groq LLM Triage, heuristics, sentence-transformers dedup
│   │   ├── routers/               # Canonical REST endpoints (/api/v1/* + /api/* aliases)
│   │   │   ├── auth.py            # Cryptographic OTP, JWT login, registration
│   │   │   ├── grievances.py      # Standardized grievance lifecycle & vector dedup
│   │   │   ├── ai.py              # Groq LLM Triage (/api/v1/ai/triage)
│   │   │   ├── webhooks.py        # Webhook configs & live test alert dispatch
│   │   │   ├── analytics.py       # Resolution SLA & Automation analytics
│   │   │   └── departments.py     # 10 campus departments & staff routing
│   │   ├── schemas/               # Strict Pydantic v2 validation contracts
│   │   ├── services/              # Email delivery, webhook dispatch, SLA aggregation
│   │   └── main.py                # Primary FastAPI app factory & route mounting
│   ├── main.py                    # 3-line compatibility entrypoint shim
│   ├── tests/                     # 479-test Pytest suite (Tiers 1-4, ML, Webhooks, SLA)
│   └── requirements.txt           # Python backend dependencies
│
├── frontend/                      # Next.js 15 App Router Frontend Application
│   ├── app/                       # Next.js App Router (layout, page, globals.css)
│   ├── components/                # React 19 UI components
│   │   ├── AdminDashboard.tsx     # Admin console with SLA Performance panel
│   │   ├── AIAutomationSlaPanel.tsx # SLA KPI cards, department table, webhook drawer
│   │   ├── StudentComplaintForm.tsx # Keystroke gating, voice recognition mic
│   │   └── AuthModal.tsx          # Quick demo selector & server OTP flow
│   ├── lib/api.ts                 # Canonical API client targeting /api/v1/*
│   ├── tests/                     # 166-test frontend suite (Node.js test runner via tsx)
│   └── package.json               # Frontend dependencies & scripts
│
├── scripts/                       # Monorepo setup, seeding, and execution runners
├── package.json                   # Root task orchestrator (npm run setup, dev, test)
├── TEST_READY.md                  # Comprehensive 4-Tier E2E Verification Report
├── docker-compose.yml             # Docker stack (PostgreSQL + FastAPI + Next.js)
├── .env.example                   # Clean placeholder environment variables
└── README.md                      # Primary technical repository documentation
```

---

## 🚀 Local Setup & Installation

### Prerequisites
* **Node.js**: 20.x or 22.x LTS (`node --version`)
* **Python**: 3.11+ or 3.12+ (`python --version`)
* **PostgreSQL**: 15+ or 16+ running locally on port 5432 with `pgvector` (or via Docker)

### 1. Clone & Configure Environment
```bash
# Clone the repository
git clone <repo-url>
cd student-grievance-system

# Copy environment variable template
cp .env.example .env
```

Review `.env` to verify default settings:
```ini
# Application Secrets
JWT_SECRET=dev-campus-jwt-secret-key-32-chars-minimum!
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/campus_grievance_db
SYNC_DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/campus_grievance_db

# AI & LLM Triage (Leave blank to use deterministic local fallback)
GROQ_API_KEY=

# Universal Development OTP
UNIVERSAL_DEV_OTP=123456
```

### 2. Automated One-Shot Setup
Run the setup script from the root directory. This creates `.venv`, installs pip packages, installs frontend dependencies, initializes PostgreSQL tables, and seeds initial demo data:
```bash
npm run setup
```

### 3. Launch Development Servers
Concurrently start the FastAPI backend (`http://localhost:8000`) and Next.js frontend (`http://localhost:3000`):
```bash
npm run dev
```

* **Frontend**: Open `http://localhost:3000` in your browser.
* **Interactive API Documentation (Swagger)**: Open `http://localhost:8000/docs`.

---

## 🧪 Comprehensive Verification Suite

Execute the multi-tier automated test harness (645 total tests, 100% pass rate):

```bash
# Run both Backend (479 tests) and Frontend (166 tests) test suites
npm test

# Run Backend Pytest suite specifically
npm run test:backend
# or directly with pytest:
.venv\Scripts\pytest.exe backend/tests/ -v

# Run Frontend test suite specifically
npm run test:frontend

# Run Frontend TypeScript compilation check (0 errors)
npm run lint

# Run Optimized Next.js Production Build
npm run build
```

---

## 📋 Copy-Paste `curl` Verification Workflows

The following copy-paste `curl` commands allow rapid verification of all core endpoints from any terminal.

### Workflow 1: Cryptographic Server-Side OTP & Authentication

#### Step 1.1: Request Cryptographic 6-Digit OTP
Generates a random 6-digit OTP, stores a salted SHA-256 hash in PostgreSQL `otp_sessions` with a 5-minute TTL, and dispatches via background tasks:
```bash
curl -X POST "http://localhost:8000/api/v1/auth/request-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "kavin@student.campus.edu"
  }'
```
*Expected Response (200 OK — Zero OTP leakage in response):*
```json
{
  "success": true,
  "message": "Verification code sent to kavin@student.campus.edu",
  "session_id": "otp-1731682490000",
  "expires_in": 300
}
```

#### Step 1.2: Verify OTP & Issue RFC 7519 JWT
Verify the OTP (using the universal development OTP `123456` or the console-logged OTP) to receive a signed JWT access token and user profile:
```bash
curl -X POST "http://localhost:8000/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "kavin@student.campus.edu",
    "otp": "123456"
  }'
```
*Expected Response (200 OK):*
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr-student-kavin",
    "email": "kavin@student.campus.edu",
    "name": "Kavin M",
    "regNo": "2024CSE042",
    "role": "STUDENT"
  }
}
```

---

### Workflow 2: AI Triage Agent Analysis (`POST /api/v1/ai/triage`)

#### Step 2.1: Test Valid Campus Grievance (Groq LLM / Local Fallback)
Tests structured triage returning category, department, urgency, intent summary, and actionable resolution steps:
```bash
curl -X POST "http://localhost:8000/api/v1/ai/triage" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Severe water leakage and ceiling dampness in Hostel Block C Room 304 causing electrical short circuit concerns",
    "student_type": "HOSTELER",
    "category": null
  }'
```
*Expected Response (200 OK):*
```json
{
  "is_valid_grievance": true,
  "rejection_reason": null,
  "category": "Hostel & Accommodation",
  "department_id": "dept-hostel",
  "urgency": "HIGH",
  "confidence": 0.95,
  "intent_summary": "Water leakage and ceiling dampness reported in Hostel Block C with electrical safety hazard.",
  "actionable_steps": [
    "Dispatch estate maintenance plumber to inspect Block C 3rd floor supply lines",
    "Isolate room electrical circuits to prevent fire hazard",
    "Provide temporary dry accommodation if leakage persists"
  ]
}
```

#### Step 2.2: Test Off-Campus Out-of-Domain (OOD) Veto
Tests automatic rejection of off-campus commercial complaints:
```bash
curl -X POST "http://localhost:8000/api/v1/ai/triage" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "PVR Cinemas air conditioning was completely broken during my movie show yesterday evening",
    "student_type": "DAY_SCHOLAR",
    "category": null
  }'
```
*Expected Response (200 OK):*
```json
{
  "is_valid_grievance": false,
  "rejection_reason": "OFF_CAMPUS_DOMAIN",
  "category": "Others",
  "department_id": "dept-studentlife",
  "urgency": "LOW",
  "confidence": 0.05,
  "intent_summary": "Off-campus commercial establishment grievance rejected.",
  "actionable_steps": [
    "Advise student to file complaints through municipal or commercial consumer redressal forums"
  ]
}
```

---

### Workflow 3: Vector Semantic Deduplication & Grievance Lifecycle

#### Step 3.1: Submit Master Grievance
Submits an initial grievance to Hostel & Accommodation:
```bash
curl -X POST "http://localhost:8000/api/v1/grievances" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Low water pressure in Block C bathrooms",
    "description": "There is extremely low water pressure in all Block C 3rd floor bathrooms since this morning.",
    "category": "Hostel & Accommodation",
    "departmentId": "dept-hostel",
    "studentRegNo": "2024CSE042",
    "studentName": "Kavin M",
    "studentEmail": "kavin@student.campus.edu",
    "studentType": "HOSTELER",
    "urgency": "MEDIUM"
  }'
```
*Expected Response (201 Created):*
```json
{
  "id": "grv-...",
  "ticketNo": "GRV-...",
  "title": "Low water pressure in Block C bathrooms",
  "status": "OPEN",
  "duplicateCount": 0,
  "interceptedByDedup": false,
  "masterCaseId": null
}
```

#### Step 3.2: Submit Duplicate Grievance (Semantic Cosine Matching > 0.82)
Submit a paraphrased complaint from a different student. The sentence-transformers vector embedding detects >0.82 cosine similarity against the open ticket:
```bash
curl -X POST "http://localhost:8000/api/v1/grievances" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Block C 3rd floor taps have almost zero water coming out",
    "description": "Block C third floor restrooms have almost no water running from the taps today.",
    "category": "Hostel & Accommodation",
    "departmentId": "dept-hostel",
    "studentRegNo": "2024ECE018",
    "studentName": "Ananya S",
    "studentEmail": "ananya@student.campus.edu",
    "studentType": "HOSTELER",
    "urgency": "MEDIUM"
  }'
```
*Expected Response (201 Created — Automatically linked duplicate):*
```json
{
  "id": "grv-...",
  "title": "Block C 3rd floor taps have almost zero water coming out",
  "status": "SUSPECTED_DUPLICATE",
  "duplicateOfId": "grv-...",
  "masterCaseId": "grv-...",
  "duplicateCount": 0,
  "interceptedByDedup": true
}
```

---

### Workflow 4: Outbound Webhook Management & Live Test Dispatch

#### Step 4.1: Register a New Webhook Configuration
Register an outbound webhook alerting endpoint (Slack, Discord, or Custom):
```bash
curl -X POST "http://localhost:8000/api/v1/webhooks" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Campus Security Slack Channel",
    "target_url": "https://httpbin.org/post",
    "platform": "slack",
    "secret_header": "whsec_campus_secret_key_8921",
    "trigger_on_critical": true,
    "trigger_on_duplicate_cluster": true,
    "is_active": true
  }'
```
*Expected Response (201 Created):*
```json
{
  "id": "whk-...",
  "name": "Campus Security Slack Channel",
  "target_url": "https://httpbin.org/post",
  "platform": "slack",
  "trigger_on_critical": true,
  "trigger_on_duplicate_cluster": true,
  "is_active": true,
  "created_at": "2026-11-15T15:00:00Z"
}
```

#### Step 4.2: Dispatch Live Test Alert & Inspect Delivery Log
Trigger a sample critical alert dispatch via `httpx.AsyncClient` and view delivery telemetry:
```bash
# Replace {webhook_id} with the ID from Step 4.1
curl -X POST "http://localhost:8000/api/v1/webhooks/{webhook_id}/test"
```
*Expected Response (200 OK):*
```json
{
  "id": "whl-...",
  "webhook_id": "whk-...",
  "event_type": "test.alert",
  "status_code": 200,
  "delivered_at": "2026-11-15T15:00:05Z",
  "response_body": "{\"url\": \"https://httpbin.org/post\"...}"
}
```

---

### Workflow 5: Resolution SLA & Automation Analytics

Query real-time SLA metrics, auto-triage rates, and deduplication savings:
```bash
curl -X GET "http://localhost:8000/api/v1/analytics/automation-sla"
```
*Expected Response (200 OK):*
```json
{
  "department_sla_metrics": [
    {
      "department_id": "dept-hostel",
      "department_name": "Hostel & Accommodation",
      "target_sla_hours": 24,
      "avg_resolution_hours": 14.2,
      "total_resolved": 38,
      "within_sla_count": 35,
      "sla_compliance_rate": 92.1
    },
    {
      "department_id": "dept-security",
      "department_name": "Anti-Ragging & Security",
      "target_sla_hours": 4,
      "avg_resolution_hours": 1.8,
      "total_resolved": 12,
      "within_sla_count": 12,
      "sla_compliance_rate": 100.0
    }
  ],
  "auto_triage_rate": {
    "total_grievances": 85,
    "auto_triaged_count": 81,
    "auto_triage_percentage": 95.3,
    "manual_reassignments": 4,
    "routing_accuracy": 95.1
  },
  "duplicates_intercepted": {
    "total_duplicates_intercepted": 27,
    "estimated_staff_hours_saved": 40.5
  },
  "webhook_deliveries_24h": {
    "critical_alerts_dispatched": 8,
    "cluster_alerts_dispatched": 5,
    "status_update_emails_sent": 85,
    "total_events_triggered": 98
  }
}
```

---

## 🔑 Demo Accounts & Seeded Credentials

The application includes pre-seeded roles across all 10 campus departments for instant evaluation. The authentication modal (`AuthModal.tsx`) features a **Quick Demo Login** button that pre-populates credentials with one click.

* **Universal Development OTP**: `123456`

### Super Administrator
* **Email**: `admin@campus.edu` | **Password**: `Admin@123` | **OTP**: `123456`
* **Role**: `SUPER_ADMIN` (Dr. Rajeshwari, Dean of Student Affairs)
* **Access**: Cross-departmental oversight, audit logs, AI automation & SLA performance analytics, and webhook management.

### Department Administrators (10 Campus Portals)
All 10 Department Admins share password **`Dept@123`** and OTP **`123456`**:

| # | Department | Email Address | Head / Administrator |
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
* `kavin@student.campus.edu` (CSE, Hosteller — Block C, Room 304)
* `ananya@student.campus.edu` (ECE, Hosteller — Block A, Room 108)
* `rahul@student.campus.edu` (MECH, Day Scholar — Route 14 Bus)
* `priya@student.campus.edu` (IT, Hosteller — Block B, Room 212)

---

## 🕸️ Code Knowledge Graph (`graphify`)

This monorepo is indexed by **[Graphify](https://github.com/Graphify-Labs/graphify)**. Explore architectural relationships, symbol dependencies, and call trees without manual grep:

```bash
# Query component relationships
graphify query "StudentComplaintForm"

# Explain function behavior and callers
graphify explain "classify_with_groq"

# Trace architectural lineage path
graphify path "frontend/components/StudentComplaintForm.tsx" "backend/app/ml/classifier.py"

# Synchronize knowledge graph post-edits (AST-only, zero API cost)
npm run graphify:update
# or directly:
graphify update . --force
```

---

## 📄 License
Academic & Educational Use Only — Department of Student Affairs, Campus Grievance Redressal Committee.
