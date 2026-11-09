# Campus Grievance System — Seeded Test Credentials

> **Notice**: These credentials are automatically initialized by the database seeder (`python -m app.db.seed` / `npm run db:seed`).  
> In all development and testing environments, the **universal development OTP code is `123456`**.

---

## 1. Quick Demo Login Overview

The modern frontend modal (`AuthModal.tsx`) includes a **Quick Demo Login** selector. Clicking any seeded role auto-fills the appropriate identifier, password, and OTP code to authenticate with a single click.

Alternatively, you can authenticate via:
1. **Password Authentication**: Provide Registered Email / Reg No and the corresponding password.
2. **OTP Authentication**: Provide Registered Email and development OTP code `123456`.

---

## 2. Super Administrator

The Super Administrator oversees the entire campus ecosystem, inspects global analytics, moderates duplicates across departments, and possesses unconditional global access rights.

| Field | Value | Notes |
|---|---|---|
| **Full Name** | Dr. Rajeshwari | Dean - Student Affairs |
| **Email** | `admin@campus.edu` | Primary Super Admin Email |
| **Registration / Staff No** | `ADMIN-001` | Alternate login identifier |
| **Role** | `SUPER_ADMIN` | Global administrative permissions |
| **Department** | Office of Student Affairs | Global (cross-departmental) |
| **Password** | `Admin@123` | Case-sensitive |
| **Dev OTP** | `123456` | Valid across all OTP verification endpoints |
| **Landing Portal** | `/admin/dashboard` | Super Admin Console & Triage |
| **Permissions** | `read:all`, `write:all`, `delete:all`, `admin:all` | Full system access |

---

## 3. Department Administrators (100% Coverage — 10 Operational Units)

Each department admin manages grievances routed to their specific functional domain.  
All 10 Department Admins share the uniform password **`Dept@123`** and development OTP **`123456`**.

| # | Department Name | Department Code | Admin Name / Title | Login Email | Staff ID | Password | Dev OTP | Portal Route |
|---|---|---|---|---|---|---|---|---|
| 1 | **Hostel & Accommodation** | `HOSTEL` | Prof. Sundaram (Chief Warden) | `hostel.admin@campus.edu` | `STAFF-HOSTEL` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 2 | **Mess & Canteen** | `MESS` | Dr. Meenakshi (Mess Director) | `mess.admin@campus.edu` | `STAFF-MESS` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 3 | **IT & ERP** | `IT_ERP` | Er. Karthikeyan (Head - IT) | `it.admin@campus.edu` | `STAFF-IT` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 4 | **Academics & Labs** | `ACADEMICS` | Dr. Ramanathan (Dean - Academic Affairs) | `academics.admin@campus.edu` | `STAFF-ACAD` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 5 | **Infrastructure & Maintenance** | `INFRA` | Er. Balasubramanian (Estate Officer) | `infra.admin@campus.edu` | `STAFF-INFRA` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 6 | **Transport** | `TRANSPORT` | Mr. Saravanan (Transport Manager) | `transport.admin@campus.edu` | `STAFF-TRANS` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 7 | **Anti-Ragging & Security** | `SECURITY` | Col. Natarajan (Chief Security Officer) | `security.admin@campus.edu` | `STAFF-SEC` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 8 | **Medical & Wellness** | `MEDICAL` | Dr. Shanthi (Chief Medical Officer) | `medical.admin@campus.edu` | `STAFF-MED` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 9 | **Administration & Finance** | `ACCOUNTS` | Mr. Venkatraman (Finance Officer) | `accounts.admin@campus.edu` | `STAFF-ACC` | `Dept@123` | `123456` | `/admin/department/dashboard` |
| 10 | **Library, Sports & Placement** | `STUDENTLIFE` | Dr. Padmavathi (Dean - Student Life) | `studentlife.admin@campus.edu` | `STAFF-LIFE` | `Dept@123` | `123456` | `/admin/department/dashboard` |

> **Row-Level Access Control (RLAC)**: Department Admins have scoped visibility (`read:department`, `write:department`, `resolve:department`). Attempting to read or resolve grievances assigned to other departments returns **HTTP 403 Forbidden**.

---

## 4. Student Accounts (Representative Personas)

Representative student profiles representing various academic departments, residential blocks, and enrollment types (Hosteller vs. Day Scholar).  
All student accounts share the uniform password **`Student@123`** and development OTP **`123456`**.

| Student Name | Register No | Email Address | Academic Branch | Residence Type | Hostel Block / Room | Password | Dev OTP | Landing Portal |
|---|---|---|---|---|---|---|---|---|
| **Kavin Kumar** | `2023CSE042` | `kavin@student.campus.edu` | Computer Science (CSE) | Hosteller | Block C, Room 304 | `Student@123` | `123456` | `/student/dashboard` |
| **Ananya Sharma** | `2023ECE015` | `ananya@student.campus.edu` | Electronics & Comm (ECE) | Hosteller | Block A, Room 108 | `Student@123` | `123456` | `/student/dashboard` |
| **Rahul Verma** | `2022MECH088` | `rahul@student.campus.edu` | Mechanical Engg (MECH) | Day Scholar | N/A (Route 14 Bus) | `Student@123` | `123456` | `/student/dashboard` |
| **Priya Ramasamy** | `2024IT021` | `priya@student.campus.edu` | Information Tech (IT) | Hosteller | Block B, Room 212 | `Student@123` | `123456` | `/student/dashboard` |

> **Security Guardrail**: Student accounts attempting to authenticate at the administrative endpoint (`/api/auth/admin/login` or `portal="admin"`) are rejected with **HTTP 403 Forbidden** (`Access denied: STUDENT accounts are not permitted to access administrative portal`).

---

## 5. Summary Matrix by Role & Permission

| Role Key | Normalized Claim | Default Identifier | Password | Dev OTP | Scope / Permissions | Target View |
|---|---|---|---|---|---|---|
| Super Admin | `SUPER_ADMIN` | `admin@campus.edu` | `Admin@123` | `123456` | `read:all`, `write:all`, `delete:all`, `admin:all` | Global Console (`/admin/dashboard`) |
| Dept Admin | `DEPARTMENT_ADMIN` | `<dept>.admin@campus.edu` | `Dept@123` | `123456` | `read:department`, `write:department`, `resolve:department` | Dept Portal (`/admin/department/dashboard`) |
| Student | `STUDENT` | `<name>@student.campus.edu` | `Student@123` | `123456` | `read:own`, `write:own` | Student Portal (`/student/dashboard`) |

---

## 6. Database Seeder & Execution Commands

To populate or reset these credentials and the 38 pre-configured grievance scenarios:

```bash
# Seed or update credentials idempotently (safe to run anytime)
npm run db:seed
# or directly via Python
python -m app.db.seed

# Wipe existing data and perform a pristine re-seed
npm run db:reset
# or directly via Python
python -m app.db.seed --reset
```
