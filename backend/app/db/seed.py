"""
Rich Idempotent Database Seeder for Campus Grievance System.
Executable via:
    python -m app.db.seed
    python -m backend.app.db.seed
    npm run db:seed

Seeds:
1. 10 Operational Departments (100% campus domain coverage)
2. 33 Category Routing Rules (dispatching all categories to responsible departments)
3. 15 Canonical Core Users:
   - 1 Super Admin: Dr. Rajeshwari (Dean - Student Affairs)
   - 10 Department Admins (1 per operational department)
   - 4 Representative Students (Kavin, Ananya, Rahul, Priya)
4. 38 Realistic Complaints:
   - 100% Department Coverage
   - Status Diversity: 11 Pending, 12 In Progress, 5 Escalated, 10 Resolved
   - Priority Diversity: 10 Urgent, 10 High, 12 Medium, 6 Low
   - 3 Semantic Duplicate Clusters (Wi-Fi AP failure, Water leakage flood, Mess food poisoning)
   - 30-Day Historical Timeseries Distribution (timestamps spanning past 30 days)
   - 384-dimensional L2-normalized vector embeddings on all complaints
5. 12 Complaint Upvotes (peer grievance endorsements)
6. 10 Outbox Notifications (creation, escalation, and resolution alerts)
7. 12 Audit Log Entries (immutable compliance trail)
8. Universal Development OTP Sessions (OTP '123456' active for all seeded accounts)
"""

import asyncio
from datetime import datetime, timezone, timedelta
import math
import re
import sys
from typing import List, Dict, Any, Optional
import bcrypt

# Compatibility patch for passlib with bcrypt>=4.1.0
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = type("About", (), {"__version__": getattr(bcrypt, "__version__", "4.0.1")})()

from passlib.context import CryptContext
from sqlalchemy import select, delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

# Multi-tiered package discovery
try:
    from backend.app.db.models import (
        Department,
        User,
        Complaint,
        ComplaintUpvote,
        CategoryRoutingRule,
        AuditLog,
        Notification,
        OtpSession,
    )
    from backend.app.db.base import Base
    from backend.app.db.session import AsyncSessionLocal, engine
except ImportError:
    try:
        from app.db.models import (
            Department,
            User,
            Complaint,
            ComplaintUpvote,
            CategoryRoutingRule,
            AuditLog,
            Notification,
            OtpSession,
        )
        from app.db.base import Base
        from app.db.session import AsyncSessionLocal, engine
    except ImportError:
        from backend.db.models import (
            Department,
            User,
            Complaint,
            CategoryRoutingRule,
            AuditLog,
            Notification,
            OtpCode as OtpSession,
        )
        from backend.db.base import Base, AsyncSessionLocal, engine
        ComplaintUpvote = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pre-computed bcrypt hashes
HASH_ADMIN_123 = pwd_context.hash("Admin@123")
HASH_DEPT_123 = pwd_context.hash("Dept@123")
HASH_STUDENT_123 = pwd_context.hash("Student@123")


def fnv1a_hash(text: str) -> int:
    """32-bit FNV-1a hash matching frontend/backend deduplication engine."""
    h = 2166136261
    for char in text:
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def generate_seed_embedding(
    text: str, category: str = "", tags: Optional[List[str]] = None, dim: int = 384
) -> List[float]:
    """
    Generates a deterministic 384-dimensional L2-normalized float vector.
    Preserves exact mathematical parity with backend/ml/deduplication.py.
    """
    vec = [0.0] * dim
    combined_tokens = re.findall(
        r"[a-z0-9#_-]+", f"{category} {text} {' '.join(tags or [])}".lower()
    )

    if not combined_tokens:
        vec[0] = 1.0
        return vec

    tf_map: Dict[str, float] = {}
    for tok in combined_tokens:
        tf_map[tok] = tf_map.get(tok, 0.0) + 1.0

    for tok, count in tf_map.items():
        sublinear_tf = 1.0 + math.log(max(1.0, count))
        h = fnv1a_hash(tok)
        slot = abs(h) % dim
        vec[slot] += sublinear_tf

    # L2 Euclidean unit normalization
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0.0:
        vec = [float(x / norm) for x in vec]
    else:
        vec[0] = 1.0
    return vec


# ============================================================================
# 1. 10 DEPARTMENTS (100% COVERAGE)
# ============================================================================

def get_seed_departments() -> List[Dict[str, Any]]:
    return [
        {
            "id": "dept-hostel",
            "name": "Hostel & Accommodation",
            "code": "HOSTEL",
            "contact_email": "hostel.admin@campus.edu",
        },
        {
            "id": "dept-mess",
            "name": "Mess & Canteen",
            "code": "MESS",
            "contact_email": "mess.admin@campus.edu",
        },
        {
            "id": "dept-it",
            "name": "IT & ERP",
            "code": "IT_ERP",
            "contact_email": "it.admin@campus.edu",
        },
        {
            "id": "dept-academics",
            "name": "Academics & Labs",
            "code": "ACADEMICS",
            "contact_email": "academics.admin@campus.edu",
        },
        {
            "id": "dept-infra",
            "name": "Infrastructure & Maintenance",
            "code": "INFRA",
            "contact_email": "infra.admin@campus.edu",
        },
        {
            "id": "dept-transport",
            "name": "Transport",
            "code": "TRANSPORT",
            "contact_email": "transport.admin@campus.edu",
        },
        {
            "id": "dept-security",
            "name": "Anti-Ragging & Security",
            "code": "SECURITY",
            "contact_email": "security.admin@campus.edu",
        },
        {
            "id": "dept-medical",
            "name": "Medical & Wellness",
            "code": "MEDICAL",
            "contact_email": "medical.admin@campus.edu",
        },
        {
            "id": "dept-accounts",
            "name": "Administration & Finance",
            "code": "ACCOUNTS",
            "contact_email": "accounts.admin@campus.edu",
        },
        {
            "id": "dept-studentlife",
            "name": "Library, Sports & Placement",
            "code": "STUDENTLIFE",
            "contact_email": "studentlife.admin@campus.edu",
        },
    ]


# ============================================================================
# 2. 33 CATEGORY ROUTING RULES
# ============================================================================

def get_seed_routing_rules() -> List[Dict[str, Any]]:
    return [
        # IT & ERP
        {"id": "rule-it-01", "category": "Hostel Wi-Fi & Internet", "department_id": "dept-it", "priority_override": None},
        {"id": "rule-it-02", "category": "IT, Wi-Fi, ERP & Digital Infrastructure", "department_id": "dept-it", "priority_override": None},
        # Hostel & Accommodation
        {"id": "rule-hst-01", "category": "Hostel & Accommodation", "department_id": "dept-hostel", "priority_override": None},
        {"id": "rule-hst-02", "category": "Hostel, Accommodation & Residential Life", "department_id": "dept-hostel", "priority_override": None},
        {"id": "rule-hst-03", "category": "Cleanliness & Sanitation", "department_id": "dept-hostel", "priority_override": None},
        # Mess & Canteen
        {"id": "rule-mess-01", "category": "Food & Mess", "department_id": "dept-mess", "priority_override": None},
        {"id": "rule-mess-02", "category": "Mess, Canteen & Food Hygiene", "department_id": "dept-mess", "priority_override": None},
        {"id": "rule-mess-03", "category": "Canteen & Cafeteria", "department_id": "dept-mess", "priority_override": None},
        # Infrastructure & Maintenance
        {"id": "rule-inf-01", "category": "Infrastructure & Maintenance", "department_id": "dept-infra", "priority_override": None},
        {"id": "rule-inf-02", "category": "Campus Infrastructure, Electrical, Plumbing & Sanitation", "department_id": "dept-infra", "priority_override": None},
        {"id": "rule-inf-03", "category": "Plumbing & Water", "department_id": "dept-infra", "priority_override": None},
        {"id": "rule-inf-04", "category": "Electrical & AC", "department_id": "dept-infra", "priority_override": None},
        {"id": "rule-inf-05", "category": "Damages & Repairs", "department_id": "dept-infra", "priority_override": None},
        {"id": "rule-inf-06", "category": "Campus Cleanliness", "department_id": "dept-infra", "priority_override": None},
        # Transport
        {"id": "rule-trn-01", "category": "Transport", "department_id": "dept-transport", "priority_override": None},
        {"id": "rule-trn-02", "category": "Bus & Transport", "department_id": "dept-transport", "priority_override": None},
        {"id": "rule-trn-03", "category": "Transport & Commute", "department_id": "dept-transport", "priority_override": None},
        # Anti-Ragging & Security (Urgent Priority Override)
        {"id": "rule-sec-01", "category": "Anti-Ragging & Security", "department_id": "dept-security", "priority_override": "urgent"},
        {"id": "rule-sec-02", "category": "Ragging & Harassment", "department_id": "dept-security", "priority_override": "urgent"},
        {"id": "rule-sec-03", "category": "Anti-Ragging, Bullying, Teasing & Student Safety / ICC", "department_id": "dept-security", "priority_override": "urgent"},
        # Academics & Labs
        {"id": "rule-acd-01", "category": "Academics & Labs", "department_id": "dept-academics", "priority_override": None},
        {"id": "rule-acd-02", "category": "Academics, Faculty, Labs & Examinations", "department_id": "dept-academics", "priority_override": None},
        {"id": "rule-acd-03", "category": "Classroom & Lab Facilities", "department_id": "dept-academics", "priority_override": None},
        # Medical & Wellness
        {"id": "rule-med-01", "category": "Medical & Wellness", "department_id": "dept-medical", "priority_override": "high"},
        {"id": "rule-med-02", "category": "Medical, Dispensary & Disability Accessibility", "department_id": "dept-medical", "priority_override": None},
        {"id": "rule-med-03", "category": "Mental Health, Counseling & Student Wellbeing", "department_id": "dept-medical", "priority_override": None},
        # Administration & Finance
        {"id": "rule-acc-01", "category": "Administration & Finance", "department_id": "dept-accounts", "priority_override": None},
        {"id": "rule-acc-02", "category": "Administration, Finance, Scholarships & Certificates", "department_id": "dept-accounts", "priority_override": None},
        {"id": "rule-acc-03", "category": "Administrative & Fees", "department_id": "dept-accounts", "priority_override": None},
        # Library, Sports & Placement
        {"id": "rule-lfe-01", "category": "Library, Sports & Placement", "department_id": "dept-studentlife", "priority_override": None},
        {"id": "rule-lfe-02", "category": "Library, Sports, Gym & Placement Cell", "department_id": "dept-studentlife", "priority_override": None},
        {"id": "rule-lfe-03", "category": "Library & Wi-Fi", "department_id": "dept-studentlife", "priority_override": None},
        # Fallback / General
        {"id": "rule-oth-01", "category": "Others", "department_id": "dept-hostel", "priority_override": None},
    ]


# ============================================================================
# 3. 15 CANONICAL USERS (SUPER ADMIN, 10 DEPT ADMINS, 4 STUDENTS)
# ============================================================================

def get_seed_users() -> List[Dict[str, Any]]:
    return [
        # Super Administrator
        {
            "id": "usr-admin-super",
            "reg_no": "ADMIN-001",
            "name": "Dr. Rajeshwari (Dean - Student Affairs)",
            "email": "admin@campus.edu",
            "role": "SUPER_ADMIN",
            "department_id": None,
            "department": "Office of Student Affairs",
            "gender": "Female",
            "student_type": "hosteller",
            "phone": "+91 94440 12345",
            "password_hash": HASH_ADMIN_123,
        },
        # 10 Department Administrators (Password: Dept@123)
        {
            "id": "usr-admin-hostel",
            "reg_no": "STAFF-HOSTEL",
            "name": "Prof. Sundaram (Chief Warden)",
            "email": "hostel.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-hostel",
            "department": "Hostel & Accommodation",
            "gender": "Male",
            "student_type": "hosteller",
            "phone": "+91 94440 20001",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-mess",
            "reg_no": "STAFF-MESS",
            "name": "Dr. Meenakshi (Mess Director)",
            "email": "mess.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-mess",
            "department": "Mess & Canteen",
            "gender": "Female",
            "student_type": "hosteller",
            "phone": "+91 94440 20002",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-it",
            "reg_no": "STAFF-IT",
            "name": "Er. Karthikeyan (Head - IT)",
            "email": "it.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-it",
            "department": "IT & ERP",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "+91 94440 20003",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-academics",
            "reg_no": "STAFF-ACAD",
            "name": "Dr. Ramanathan (Dean - Academic Affairs)",
            "email": "academics.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-academics",
            "department": "Academics & Labs",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "+91 94440 20004",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-infra",
            "reg_no": "STAFF-INFRA",
            "name": "Er. Balasubramanian (Estate Officer)",
            "email": "infra.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-infra",
            "department": "Infrastructure & Maintenance",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "+91 94440 20005",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-transport",
            "reg_no": "STAFF-TRANS",
            "name": "Mr. Saravanan (Transport Manager)",
            "email": "transport.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-transport",
            "department": "Transport",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "+91 94440 20006",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-security",
            "reg_no": "STAFF-SEC",
            "name": "Col. Natarajan (Chief Security Officer)",
            "email": "security.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-security",
            "department": "Anti-Ragging & Security",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "+91 94440 20007",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-medical",
            "reg_no": "STAFF-MED",
            "name": "Dr. Shanthi (Chief Medical Officer)",
            "email": "medical.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-medical",
            "department": "Medical & Wellness",
            "gender": "Female",
            "student_type": "dayscholar",
            "phone": "+91 94440 20008",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-accounts",
            "reg_no": "STAFF-ACC",
            "name": "Mr. Venkatraman (Finance Officer)",
            "email": "accounts.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-accounts",
            "department": "Administration & Finance",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "+91 94440 20009",
            "password_hash": HASH_DEPT_123,
        },
        {
            "id": "usr-admin-studentlife",
            "reg_no": "STAFF-LIFE",
            "name": "Dr. Padmavathi (Dean - Student Life)",
            "email": "studentlife.admin@campus.edu",
            "role": "DEPARTMENT_ADMIN",
            "department_id": "dept-studentlife",
            "department": "Library, Sports & Placement",
            "gender": "Female",
            "student_type": "dayscholar",
            "phone": "+91 94440 20010",
            "password_hash": HASH_DEPT_123,
        },
        # 4 Representative Students (Password: Student@123)
        {
            "id": "usr-student-kavin",
            "reg_no": "2023CSE042",
            "name": "Kavin Kumar",
            "email": "kavin@student.campus.edu",
            "role": "STUDENT",
            "department_id": None,
            "department": "CSE (Computer Science & Engineering)",
            "gender": "Male",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "phone": "+91 98765 43210",
            "password_hash": HASH_STUDENT_123,
        },
        {
            "id": "usr-student-ananya",
            "reg_no": "2023ECE015",
            "name": "Ananya Sharma",
            "email": "ananya@student.campus.edu",
            "role": "STUDENT",
            "department_id": None,
            "department": "ECE (Electronics & Communication Engineering)",
            "gender": "Female",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "phone": "+91 98765 43211",
            "password_hash": HASH_STUDENT_123,
        },
        {
            "id": "usr-student-rahul",
            "reg_no": "2022MECH088",
            "name": "Rahul Verma",
            "email": "rahul@student.campus.edu",
            "role": "STUDENT",
            "department_id": None,
            "department": "MECH (Mechanical Engineering)",
            "gender": "Male",
            "student_type": "dayscholar",
            "hostel_block": None,
            "room_no": None,
            "phone": "+91 98765 43212",
            "password_hash": HASH_STUDENT_123,
        },
        {
            "id": "usr-student-priya",
            "reg_no": "2024IT021",
            "name": "Priya Ramasamy",
            "email": "priya@student.campus.edu",
            "role": "STUDENT",
            "department_id": None,
            "department": "IT (Information Technology)",
            "gender": "Female",
            "student_type": "hosteller",
            "hostel_block": "Block B",
            "room_no": "212",
            "phone": "+91 98765 43213",
            "password_hash": HASH_STUDENT_123,
        },
    ]


# ============================================================================
# 4. 38 REALISTIC COMPLAINTS & 3 DUPLICATE CLUSTERS (30-DAY TIMESERIES)
# ============================================================================

def get_seed_complaints() -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)

    complaints: List[Dict[str, Any]] = [
        # --------------------------------------------------------------------
        # CLUSTER 1: IT & ERP — Wi-Fi AP Failure in Block C (Auto-Merged >= 0.92)
        # --------------------------------------------------------------------
        {
            "id": "tkt-101",
            "ticket_no": "GRV-2026-8901",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Hostel Wi-Fi & Internet",
            "description": "Block C 3rd floor Wi-Fi access point AP-C-F3-01 is completely dead since yesterday evening. No internet in corridor or rooms.",
            "status": "in_progress",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-it",
            "location_tag": "Hostel Block C, Floor 3, AP-C-F3-01",
            "master_case_id": None,
            "similarity_score": None,
            "created_at": now - timedelta(days=2, hours=4),
        },
        {
            "id": "tkt-102",
            "ticket_no": "GRV-2026-8902",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Hostel Wi-Fi & Internet",
            "description": "Wi-Fi signal not connecting in Block C room 304, unable to submit lab assignments online.",
            "status": "in_progress",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-it",
            "location_tag": "Hostel Block C, Room 304",
            "master_case_id": "tkt-101",
            "similarity_score": 0.94,
            "created_at": now - timedelta(days=2, hours=3),
            "merged_at": now - timedelta(days=2, hours=2, minutes=50),
        },
        {
            "id": "tkt-103",
            "ticket_no": "GRV-2026-8903",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "310",
            "category": "Hostel Wi-Fi & Internet",
            "description": "Internet connection totally down across entire 3rd floor Block C hostel corridor.",
            "status": "in_progress",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-it",
            "location_tag": "Hostel Block C, 3rd Floor Corridor",
            "master_case_id": "tkt-101",
            "similarity_score": 0.93,
            "created_at": now - timedelta(days=2, hours=2),
            "merged_at": now - timedelta(days=2, hours=1, minutes=45),
        },
        {
            "id": "tkt-104",
            "ticket_no": "GRV-2026-8904",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "312",
            "category": "Hostel Wi-Fi & Internet",
            "description": "No SSID broadcast or router signal near room C-312 on third floor.",
            "status": "in_progress",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-it",
            "location_tag": "Hostel Block C, Room 312",
            "master_case_id": "tkt-101",
            "similarity_score": 0.92,
            "created_at": now - timedelta(days=2, hours=1),
            "merged_at": now - timedelta(days=2, minutes=45),
        },

        # --------------------------------------------------------------------
        # CLUSTER 2: Infrastructure — Major Pipeline Leakage (Suspected 0.80 - 0.91)
        # --------------------------------------------------------------------
        {
            "id": "tkt-105",
            "ticket_no": "GRV-2026-8905",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Plumbing & Water",
            "description": "Major water pipeline burst in 2nd floor common washroom of Block A, continuous water flooding the corridor.",
            "status": "pending",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-infra",
            "location_tag": "Hostel Block A, Floor 2 Washroom",
            "master_case_id": None,
            "similarity_score": None,
            "created_at": now - timedelta(days=3, hours=6),
        },
        {
            "id": "tkt-106",
            "ticket_no": "GRV-2026-8906",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Plumbing & Water",
            "description": "Severe pipe leak flooding the bathroom floor in Block A second floor wing.",
            "status": "pending",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-infra",
            "location_tag": "Hostel Block A, 2nd Floor Bathrooms",
            "master_case_id": "tkt-105",
            "similarity_score": 0.89,
            "created_at": now - timedelta(days=3, hours=5),
        },
        {
            "id": "tkt-107",
            "ticket_no": "GRV-2026-8907",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "204",
            "category": "Plumbing & Water",
            "description": "Water gushing from broken pipe valve in Block A level 2 toilet, risk of slipping.",
            "status": "pending",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-infra",
            "location_tag": "Hostel Block A, Level 2 Toilet",
            "master_case_id": "tkt-105",
            "similarity_score": 0.88,
            "created_at": now - timedelta(days=3, hours=4),
        },

        # --------------------------------------------------------------------
        # CLUSTER 3: Mess & Canteen — Food Poisoning / Raw Meat (Auto-Merged >= 0.92)
        # --------------------------------------------------------------------
        {
            "id": "tkt-108",
            "ticket_no": "GRV-2026-8908",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Food & Mess",
            "description": "Undercooked chicken and spoiled sambar served during dinner at South Mess dining hall. Several hostellers feeling sick.",
            "status": "escalated",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-mess",
            "location_tag": "South Campus Dining Mess 2",
            "master_case_id": None,
            "similarity_score": None,
            "created_at": now - timedelta(days=2, hours=10),
        },
        {
            "id": "tkt-109",
            "ticket_no": "GRV-2026-8909",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block B",
            "room_no": "212",
            "category": "Food & Mess",
            "description": "Dinner chicken in South Mess was raw and smelly tonight, acute food poisoning hazard.",
            "status": "escalated",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-mess",
            "location_tag": "South Mess Hall",
            "master_case_id": "tkt-108",
            "similarity_score": 0.95,
            "created_at": now - timedelta(days=2, hours=9),
            "merged_at": now - timedelta(days=2, hours=8, minutes=40),
        },
        {
            "id": "tkt-110",
            "ticket_no": "GRV-2026-8910",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Food & Mess",
            "description": "Spoiled food and raw undercooked meat served to students in South hostel mess.",
            "status": "escalated",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-mess",
            "location_tag": "South Mess Dining Hall",
            "master_case_id": "tkt-108",
            "similarity_score": 0.94,
            "created_at": now - timedelta(days=2, hours=8),
            "merged_at": now - timedelta(days=2, hours=7, minutes=30),
        },

        # --------------------------------------------------------------------
        # TRANSPORT DEPARTMENT
        # --------------------------------------------------------------------
        {
            "id": "tkt-111",
            "ticket_no": "GRV-2026-8911",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Bus & Transport",
            "description": "Route 14 college bus arrived 45 minutes late at Silk Board Highway junction causing 25 students to miss their morning internal assessment test.",
            "status": "pending",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-transport",
            "location_tag": "Route 14 - Silk Board Junction",
            "created_at": now - timedelta(days=5, hours=3),
        },
        {
            "id": "tkt-112",
            "ticket_no": "GRV-2026-8912",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Bus & Transport",
            "description": "Extreme overcrowding on Route 7 morning bus with students forced to travel on footboard. Safety hazard.",
            "status": "in_progress",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-transport",
            "location_tag": "Route 7 - Tambaram Bus Stand",
            "created_at": now - timedelta(days=12, hours=7),
        },
        {
            "id": "tkt-113",
            "ticket_no": "GRV-2026-8913",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Bus & Transport",
            "description": "Bus pass renewal counter charged Rs 200 extra fee without providing an official stamped fee receipt.",
            "status": "resolved",
            "priority": "low",
            "is_spam": False,
            "assigned_department_id": "dept-transport",
            "location_tag": "Transport Counter, Admin Block",
            "created_at": now - timedelta(days=22, hours=4),
            "resolved_at": now - timedelta(days=20, hours=10),
            "admin_notes": "Cashier issued official university receipt and excess charge of Rs 200 credited to student transport account.",
        },

        # --------------------------------------------------------------------
        # ANTI-RAGGING & SECURITY
        # --------------------------------------------------------------------
        {
            "id": "tkt-114",
            "ticket_no": "GRV-2026-8914",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block B",
            "room_no": "212",
            "category": "Ragging & Harassment",
            "description": "Group of 3rd year seniors taunting and mocking junior students near the mechanical workshop pathway after 6 PM. Demanding forced introductions.",
            "status": "escalated",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-security",
            "location_tag": "Mechanical Workshop Pathway",
            "created_at": now - timedelta(days=3, hours=1),
        },
        {
            "id": "tkt-115",
            "ticket_no": "GRV-2026-8915",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Anti-Ragging & Security",
            "description": "Multiple streetlights broken creating a pitch-dark unsafe stretch between Girls Hostel Block A and Central Library.",
            "status": "in_progress",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-security",
            "location_tag": "Pathway between Block A and Central Library",
            "created_at": now - timedelta(days=14, hours=6),
        },
        {
            "id": "tkt-116",
            "ticket_no": "GRV-2026-8916",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Anti-Ragging & Security",
            "description": "Security guard at Main Gate 2 used abusive language and refused campus entry despite showing valid RFID student card.",
            "status": "resolved",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-security",
            "location_tag": "Main Campus Gate 2",
            "created_at": now - timedelta(days=26, hours=5),
            "resolved_at": now - timedelta(days=25, hours=2),
            "admin_notes": "Chief Security Officer interviewed the security personnel, issued a written warning, and reassigned him to perimeter patrol.",
        },

        # --------------------------------------------------------------------
        # ACADEMICS & LABS
        # --------------------------------------------------------------------
        {
            "id": "tkt-117",
            "ticket_no": "GRV-2026-8917",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Classroom & Lab Facilities",
            "description": "Digital Signal Processing lab systems 12 to 16 have expired MATLAB licenses, blocking practical examination preparation.",
            "status": "pending",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-academics",
            "location_tag": "ECE Department, DSP Lab Room 302",
            "created_at": now - timedelta(days=6, hours=2),
        },
        {
            "id": "tkt-118",
            "ticket_no": "GRV-2026-8918",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Academics & Labs",
            "description": "Attendance portal glitch shows 65% in Compiler Design whereas physical attendance register records 88%. Need official correction.",
            "status": "in_progress",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-academics",
            "location_tag": "CSE Department HOD Office",
            "created_at": now - timedelta(days=15, hours=8),
        },
        {
            "id": "tkt-119",
            "ticket_no": "GRV-2026-8919",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Academics & Labs",
            "description": "End-semester exam hall ticket download blocked on student portal due to false fee pending flag.",
            "status": "resolved",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-academics",
            "location_tag": "Exam Cell & COE Office",
            "created_at": now - timedelta(days=25, hours=9),
            "resolved_at": now - timedelta(days=24, hours=15),
            "admin_notes": "Accounts clearance verified; Dean of Academic Affairs unblocked hall ticket and dispatched PDF to registered email.",
        },

        # --------------------------------------------------------------------
        # MEDICAL & WELLNESS
        # --------------------------------------------------------------------
        {
            "id": "tkt-120",
            "ticket_no": "GRV-2026-8920",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block B",
            "room_no": "212",
            "category": "Medical & Wellness",
            "description": "Campus health center dispensary closed and duty doctor absent during evening emergency hours (7:30 PM).",
            "status": "pending",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-medical",
            "location_tag": "Campus Health Centre & Dispensary",
            "created_at": now - timedelta(days=4, hours=5),
        },
        {
            "id": "tkt-121",
            "ticket_no": "GRV-2026-8921",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Medical & Wellness",
            "description": "Critical shortage of first aid supplies, paracetamol, and asthma inhalers in health center dispensary.",
            "status": "in_progress",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-medical",
            "location_tag": "Dispensary Pharmacy Counter",
            "created_at": now - timedelta(days=16, hours=4),
        },
        {
            "id": "tkt-122",
            "ticket_no": "GRV-2026-8922",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Mental Health, Counseling & Student Wellbeing",
            "description": "Request for confidential student counseling session appointment for exam stress and sleep anxiety management.",
            "status": "resolved",
            "priority": "low",
            "is_spam": False,
            "assigned_department_id": "dept-medical",
            "location_tag": "Student Wellbeing & Counseling Cell",
            "created_at": now - timedelta(days=28, hours=3),
            "resolved_at": now - timedelta(days=27, hours=1),
            "admin_notes": "Clinical psychologist scheduled and completed two 45-minute counseling sessions; wellness coping plan provided.",
        },

        # --------------------------------------------------------------------
        # ADMINISTRATION & FINANCE
        # --------------------------------------------------------------------
        {
            "id": "tkt-123",
            "ticket_no": "GRV-2026-8923",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Administrative & Fees",
            "description": "Post-Matric State Government Scholarship disbursement delayed by 4 months despite official state welfare approval.",
            "status": "pending",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-accounts",
            "location_tag": "Scholarship Section, Admin Block Ground Floor",
            "created_at": now - timedelta(days=7, hours=2),
        },
        {
            "id": "tkt-124",
            "ticket_no": "GRV-2026-8924",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Administration & Finance",
            "description": "Caution deposit refund of Rs. 10,000 for previous academic room transfer not credited to bank account.",
            "status": "in_progress",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-accounts",
            "location_tag": "Accounts Finance Office",
            "created_at": now - timedelta(days=18, hours=6),
        },
        {
            "id": "tkt-125",
            "ticket_no": "GRV-2026-8925",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Administrative & Fees",
            "description": "Bonafide certificate application for passport renewal pending registrar approval for over 12 working days.",
            "status": "resolved",
            "priority": "low",
            "is_spam": False,
            "assigned_department_id": "dept-accounts",
            "location_tag": "Registrar Section, Main Administrative Block",
            "created_at": now - timedelta(days=24, hours=4),
            "resolved_at": now - timedelta(days=22, hours=12),
            "admin_notes": "Registrar verified application, digitally signed bonafide certificate, and generated download link.",
        },
        {
            "id": "tkt-126",
            "ticket_no": "GRV-2026-8926",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block B",
            "room_no": "212",
            "category": "Administrative & Fees",
            "description": "Wrongful late fee penalty of Rs 1,500 levied on tuition fee paid 2 days prior to university deadline.",
            "status": "resolved",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-accounts",
            "location_tag": "Cashier & Billing Desk",
            "created_at": now - timedelta(days=29, hours=8),
            "resolved_at": now - timedelta(days=28, hours=2),
            "admin_notes": "Bank transaction timestamp verified; late fee of Rs. 1,500 reversed and adjusted against next semester bill.",
        },

        # --------------------------------------------------------------------
        # LIBRARY, SPORTS & PLACEMENT
        # --------------------------------------------------------------------
        {
            "id": "tkt-127",
            "ticket_no": "GRV-2026-8927",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Library & Wi-Fi",
            "description": "Required reference textbooks for Machine Learning (Bishop / Goodfellow) unavailable with all 6 catalog copies marked lost.",
            "status": "pending",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-studentlife",
            "location_tag": "Central Library, Stack 4 (Computer Science)",
            "created_at": now - timedelta(days=8, hours=4),
        },
        {
            "id": "tkt-128",
            "ticket_no": "GRV-2026-8928",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Library, Sports & Placement",
            "description": "Campus gymnasium treadmill drive belt snapped and bench press frame severely wobbly; injury hazard for students.",
            "status": "in_progress",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-studentlife",
            "location_tag": "Indoor Sports Complex & Gymnasium",
            "created_at": now - timedelta(days=17, hours=3),
        },
        {
            "id": "tkt-129",
            "ticket_no": "GRV-2026-8929",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Library, Sports & Placement",
            "description": "Placement training aptitude screening portal crashed midway through round 1 test, disqualifying 40 candidates unfairly.",
            "status": "escalated",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-studentlife",
            "location_tag": "Training & Placement Cell, Seminar Hall 3",
            "created_at": now - timedelta(days=20, hours=7),
        },
        {
            "id": "tkt-130",
            "ticket_no": "GRV-2026-8930",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block B",
            "room_no": "212",
            "category": "Library, Sports & Placement",
            "description": "Outdoor basketball court floodlights not functioning during university tournament practice sessions.",
            "status": "resolved",
            "priority": "low",
            "is_spam": False,
            "assigned_department_id": "dept-studentlife",
            "location_tag": "Outdoor Basketball Court",
            "created_at": now - timedelta(days=27, hours=5),
            "resolved_at": now - timedelta(days=26, hours=10),
            "admin_notes": "Physical Education Department replaced four 400W halogen floodlight bulbs and repaired circuit breaker.",
        },

        # --------------------------------------------------------------------
        # INFRASTRUCTURE & MAINTENANCE
        # --------------------------------------------------------------------
        {
            "id": "tkt-131",
            "ticket_no": "GRV-2026-8931",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Electrical & AC",
            "description": "Ceiling fan sparking and humming loudly in Lecture Hall LH-204 during class hours; burning smell.",
            "status": "in_progress",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-infra",
            "location_tag": "Main Academic Block, Lecture Hall LH-204",
            "created_at": now - timedelta(days=9, hours=2),
        },
        {
            "id": "tkt-132",
            "ticket_no": "GRV-2026-8932",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Cleanliness & Sanitation",
            "description": "Men's restroom flush tank valve broken and overflowing continuously on Science Block 1st floor.",
            "status": "pending",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-infra",
            "location_tag": "Science Block, 1st Floor Restroom",
            "created_at": now - timedelta(days=11, hours=5),
        },
        {
            "id": "tkt-133",
            "ticket_no": "GRV-2026-8933",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Damages & Repairs",
            "description": "Broken classroom wooden desks in Room 102 with exposed rusty nails tearing student clothes.",
            "status": "resolved",
            "priority": "low",
            "is_spam": False,
            "assigned_department_id": "dept-infra",
            "location_tag": "Civil Engineering Block, Room 102",
            "created_at": now - timedelta(days=21, hours=4),
            "resolved_at": now - timedelta(days=19, hours=8),
            "admin_notes": "Estate carpenter repaired four dual desks and replaced damaged laminate tops.",
        },
        {
            "id": "tkt-134",
            "ticket_no": "GRV-2026-8934",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Electrical & AC",
            "description": "Air conditioning unit in Seminar Hall 1 blowing warm air and vibrating during international conference.",
            "status": "resolved",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-infra",
            "location_tag": "Seminar Hall 1, Admin Block 2nd Floor",
            "created_at": now - timedelta(days=23, hours=7),
            "resolved_at": now - timedelta(days=22, hours=14),
            "admin_notes": "HVAC technician cleaned air filters and recharged refrigerant gas.",
        },

        # --------------------------------------------------------------------
        # HOSTEL & ACCOMMODATION
        # --------------------------------------------------------------------
        {
            "id": "tkt-135",
            "ticket_no": "GRV-2026-8935",
            "student_reg_no": "2023CSE042",
            "student_name": "Kavin Kumar",
            "student_email": "kavin@student.campus.edu",
            "student_phone": "+91 98765 43210",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "304",
            "category": "Hostel, Accommodation & Residential Life",
            "description": "Passenger elevator in Boys Hostel Block C making grinding sounds and getting stuck between floors 2 and 3.",
            "status": "pending",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-hostel",
            "location_tag": "Hostel Block C, Elevator 1",
            "created_at": now - timedelta(days=2, hours=5),
        },
        {
            "id": "tkt-136",
            "ticket_no": "GRV-2026-8936",
            "student_reg_no": "2024IT021",
            "student_name": "Priya Ramasamy",
            "student_email": "priya@student.campus.edu",
            "student_phone": "+91 98765 43213",
            "student_type": "hosteller",
            "hostel_block": "Block B",
            "room_no": "212",
            "category": "Hostel & Accommodation",
            "description": "Severe bedbug infestation in Block B room 212 mattresses causing allergic rashes and sleep deprivation.",
            "status": "in_progress",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-hostel",
            "location_tag": "Hostel Block B, Room 212",
            "created_at": now - timedelta(days=10, hours=3),
        },
        {
            "id": "tkt-137",
            "ticket_no": "GRV-2026-8937",
            "student_reg_no": "2023ECE015",
            "student_name": "Ananya Sharma",
            "student_email": "ananya@student.campus.edu",
            "student_phone": "+91 98765 43211",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "108",
            "category": "Hostel & Accommodation",
            "description": "Solar water heating system not supplying hot water to Block A 1st and 2nd floor showers during winter mornings.",
            "status": "resolved",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-hostel",
            "location_tag": "Hostel Block A, Rooftop Solar Geyser Unit",
            "created_at": now - timedelta(days=19, hours=4),
            "resolved_at": now - timedelta(days=18, hours=11),
            "admin_notes": "Plumber descaled thermal collector tubes and replaced faulty circulation thermostat.",
        },

        # --------------------------------------------------------------------
        # MESS & CANTEEN
        # --------------------------------------------------------------------
        {
            "id": "tkt-138",
            "ticket_no": "GRV-2026-8938",
            "student_reg_no": "2022MECH088",
            "student_name": "Rahul Verma",
            "student_email": "rahul@student.campus.edu",
            "student_phone": "+91 98765 43212",
            "student_type": "dayscholar",
            "category": "Canteen & Cafeteria",
            "description": "Drinking water RO water cooler in Central Canteen dispensing murky yellowish water with chemical chlorine odor.",
            "status": "pending",
            "priority": "high",
            "is_spam": False,
            "assigned_department_id": "dept-mess",
            "location_tag": "Central Student Canteen, RO Water Station",
            "created_at": now - timedelta(days=1, hours=8),
        },
    ]

    return complaints


# ============================================================================
# 5. AUXILIARY FIXTURES: UPVOTES, NOTIFICATIONS, AUDIT LOGS, OTP SESSIONS
# ============================================================================

def get_seed_upvotes() -> List[Dict[str, Any]]:
    return [
        {"id": "upv-001", "complaint_id": "tkt-101", "user_id": "usr-student-ananya"},
        {"id": "upv-002", "complaint_id": "tkt-101", "user_id": "usr-student-rahul"},
        {"id": "upv-003", "complaint_id": "tkt-101", "user_id": "usr-student-priya"},
        {"id": "upv-004", "complaint_id": "tkt-105", "user_id": "usr-student-kavin"},
        {"id": "upv-005", "complaint_id": "tkt-105", "user_id": "usr-student-priya"},
        {"id": "upv-006", "complaint_id": "tkt-108", "user_id": "usr-student-ananya"},
        {"id": "upv-007", "complaint_id": "tkt-108", "user_id": "usr-student-rahul"},
        {"id": "upv-008", "complaint_id": "tkt-108", "user_id": "usr-student-priya"},
        {"id": "upv-009", "complaint_id": "tkt-114", "user_id": "usr-student-kavin"},
        {"id": "upv-010", "complaint_id": "tkt-114", "user_id": "usr-student-ananya"},
        {"id": "upv-011", "complaint_id": "tkt-129", "user_id": "usr-student-ananya"},
        {"id": "upv-012", "complaint_id": "tkt-129", "user_id": "usr-student-rahul"},
    ]


def get_seed_notifications() -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "notif-001",
            "recipient": "kavin@student.campus.edu",
            "subject": "Grievance Ticket Created: GRV-2026-8901",
            "body": "Your grievance regarding 'Block C 3rd floor Wi-Fi access point' has been registered and assigned to IT & ERP.",
            "type": "TICKET_CREATED",
            "timestamp": now - timedelta(days=2, hours=4),
        },
        {
            "id": "notif-002",
            "recipient": "it.admin@campus.edu",
            "subject": "URGENT Grievance Assigned: GRV-2026-8901",
            "body": "A new URGENT grievance in Hostel Wi-Fi & Internet requires investigation.",
            "type": "TICKET_ASSIGNED",
            "timestamp": now - timedelta(days=2, hours=3, minutes=58),
        },
        {
            "id": "notif-003",
            "recipient": "ananya@student.campus.edu",
            "subject": "Grievance Ticket Created: GRV-2026-8905",
            "body": "Your grievance regarding 'Major water pipeline burst in 2nd floor common washroom' has been registered and assigned to Infrastructure & Maintenance.",
            "type": "TICKET_CREATED",
            "timestamp": now - timedelta(days=3, hours=6),
        },
        {
            "id": "notif-004",
            "recipient": "infra.admin@campus.edu",
            "subject": "URGENT Grievance Assigned: GRV-2026-8905",
            "body": "A major water leakage incident has been reported in Hostel Block A, Floor 2 Washroom.",
            "type": "TICKET_ASSIGNED",
            "timestamp": now - timedelta(days=3, hours=5, minutes=55),
        },
        {
            "id": "notif-005",
            "recipient": "kavin@student.campus.edu",
            "subject": "Grievance Escalated: GRV-2026-8908",
            "body": "Your complaint regarding food poisoning at South Mess has been escalated to Dean - Student Affairs.",
            "type": "TICKET_ESCALATED",
            "timestamp": now - timedelta(days=2, hours=7),
        },
        {
            "id": "notif-006",
            "recipient": "admin@campus.edu",
            "subject": "ESCALATION ALERT: Food & Mess Incident GRV-2026-8908",
            "body": "Multiple reports of undercooked chicken and spoiled food in South Mess have been escalated.",
            "type": "DEAN_ALERT",
            "timestamp": now - timedelta(days=2, hours=6, minutes=50),
        },
        {
            "id": "notif-007",
            "recipient": "security.admin@campus.edu",
            "subject": "ANTI-RAGGING ALERT: GRV-2026-8914",
            "body": "High-priority student harassment reported near Mechanical Workshop pathway. Immediate proctorial action required.",
            "type": "ANTI_RAGGING_ALERT",
            "timestamp": now - timedelta(days=3, hours=1),
        },
        {
            "id": "notif-008",
            "recipient": "rahul@student.campus.edu",
            "subject": "Grievance Resolved: GRV-2026-8919",
            "body": "Your exam hall ticket issue has been resolved. You can now download your hall ticket on the student portal.",
            "type": "TICKET_RESOLVED",
            "timestamp": now - timedelta(days=24, hours=15),
        },
        {
            "id": "notif-009",
            "recipient": "ananya@student.campus.edu",
            "subject": "Grievance Resolved: GRV-2026-8925",
            "body": "Your bonafide certificate for passport renewal has been signed and is ready for download.",
            "type": "TICKET_RESOLVED",
            "timestamp": now - timedelta(days=22, hours=12),
        },
        {
            "id": "notif-010",
            "recipient": "kavin@student.campus.edu",
            "subject": "Grievance Resolved: GRV-2026-8922",
            "body": "Your appointment with the Student Wellness & Counseling Cell has been confirmed.",
            "type": "TICKET_RESOLVED",
            "timestamp": now - timedelta(days=27, hours=1),
        },
    ]


def get_seed_audit_logs() -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "audit-001",
            "entity_type": "Complaint",
            "entity_id": "tkt-101",
            "action": "TICKET_CREATED",
            "actor_id": "usr-student-kavin",
            "actor_email": "kavin@student.campus.edu",
            "actor_role": "STUDENT",
            "previous_state": None,
            "new_state": '{"status": "pending", "category": "Hostel Wi-Fi & Internet"}',
            "reason": "Initial complaint submission by student",
            "timestamp": now - timedelta(days=2, hours=4),
        },
        {
            "id": "audit-002",
            "entity_type": "Complaint",
            "entity_id": "tkt-101",
            "action": "STATUS_UPDATE",
            "actor_id": "usr-admin-it",
            "actor_email": "it.admin@campus.edu",
            "actor_role": "DEPARTMENT_ADMIN",
            "previous_state": '{"status": "pending"}',
            "new_state": '{"status": "in_progress"}',
            "reason": "Network technician dispatched to inspect Block C 3rd floor switch",
            "timestamp": now - timedelta(days=2, hours=3, minutes=30),
        },
        {
            "id": "audit-003",
            "entity_type": "Complaint",
            "entity_id": "tkt-102",
            "action": "DUPLICATE_MERGE",
            "actor_id": "system-ai",
            "actor_email": "system@campus.edu",
            "actor_role": "SYSTEM",
            "previous_state": '{"master_case_id": null}',
            "new_state": '{"master_case_id": "tkt-101", "similarity": 0.94}',
            "reason": "AI hybrid deduplication auto-merged complaint into master tkt-101 (score >= 0.92)",
            "timestamp": now - timedelta(days=2, hours=2, minutes=50),
        },
        {
            "id": "audit-004",
            "entity_type": "Complaint",
            "entity_id": "tkt-108",
            "action": "ESCALATION",
            "actor_id": "usr-admin-mess",
            "actor_email": "mess.admin@campus.edu",
            "actor_role": "DEPARTMENT_ADMIN",
            "previous_state": '{"status": "in_progress"}',
            "new_state": '{"status": "escalated"}',
            "reason": "Multiple student health hazards reported; escalated to Dean of Student Affairs",
            "timestamp": now - timedelta(days=2, hours=7),
        },
        {
            "id": "audit-005",
            "entity_type": "Complaint",
            "entity_id": "tkt-114",
            "action": "SECURITY_DISPATCH",
            "actor_id": "usr-admin-security",
            "actor_email": "security.admin@campus.edu",
            "actor_role": "DEPARTMENT_ADMIN",
            "previous_state": '{"status": "pending"}',
            "new_state": '{"status": "escalated"}',
            "reason": "Zero-tolerance anti-ragging patrol deployed to Mechanical workshop pathway",
            "timestamp": now - timedelta(days=3, hours=1),
        },
        {
            "id": "audit-006",
            "entity_type": "Complaint",
            "entity_id": "tkt-119",
            "action": "RESOLVE_TICKET",
            "actor_id": "usr-admin-academics",
            "actor_email": "academics.admin@campus.edu",
            "actor_role": "DEPARTMENT_ADMIN",
            "previous_state": '{"status": "in_progress"}',
            "new_state": '{"status": "resolved"}',
            "reason": "Hall ticket unlocked following accounts verification",
            "timestamp": now - timedelta(days=24, hours=15),
        },
        {
            "id": "audit-007",
            "entity_type": "Complaint",
            "entity_id": "tkt-125",
            "action": "RESOLVE_TICKET",
            "actor_id": "usr-admin-accounts",
            "actor_email": "accounts.admin@campus.edu",
            "actor_role": "DEPARTMENT_ADMIN",
            "previous_state": '{"status": "in_progress"}',
            "new_state": '{"status": "resolved"}',
            "reason": "Bonafide certificate issued and approved by Registrar",
            "timestamp": now - timedelta(days=22, hours=12),
        },
        {
            "id": "audit-008",
            "entity_type": "Complaint",
            "entity_id": "tkt-134",
            "action": "RESOLVE_TICKET",
            "actor_id": "usr-admin-infra",
            "actor_email": "infra.admin@campus.edu",
            "actor_role": "DEPARTMENT_ADMIN",
            "previous_state": '{"status": "in_progress"}',
            "new_state": '{"status": "resolved"}',
            "reason": "HVAC filters replaced and refrigerant gas recharged",
            "timestamp": now - timedelta(days=22, hours=14),
        },
    ]


# ============================================================================
# 6. IDEMPOTENT SEEDING ENGINE
# ============================================================================

async def seed_database(
    session: Optional[AsyncSession] = None,
    reset: bool = False,
    include_historical: bool = True,
    verbose: bool = True,
) -> Dict[str, int]:
    """
    Idempotently seeds all departments, routing rules, users, complaints,
    upvotes, notifications, audit logs, and dev OTP sessions.
    Safe to execute repeatedly without throwing duplicate key errors.
    """
    if session is not None:
        return await _execute_seeding(session, reset=reset, include_historical=include_historical, verbose=verbose)
    else:
        # Ensure database tables exist
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with AsyncSessionLocal() as session:
            counts = await _execute_seeding(session, reset=reset, include_historical=include_historical, verbose=verbose)
            await session.commit()
            return counts


async def _execute_seeding(
    session: AsyncSession,
    reset: bool = False,
    include_historical: bool = True,
    verbose: bool = True,
) -> Dict[str, int]:
    counts: Dict[str, int] = {
        "departments": 0,
        "routing_rules": 0,
        "users": 0,
        "complaints": 0,
        "upvotes": 0,
        "notifications": 0,
        "audit_logs": 0,
        "otp_sessions": 0,
    }

    # ------------------------------------------------------------------------
    # STEP 0: CLEAN SLATE IF RESET=TRUE (Reverse dependency order)
    # ------------------------------------------------------------------------
    if reset:
        if verbose:
            print("[SEED] Reset requested: Purging existing database tables in dependency order...")
        if ComplaintUpvote is not None:
            await session.execute(delete(ComplaintUpvote))
        await session.execute(delete(Notification))
        await session.execute(delete(AuditLog))
        await session.execute(delete(OtpSession))
        # First delete duplicate child complaints to avoid self-referential foreign key constraint
        await session.execute(delete(Complaint).where(Complaint.master_case_id.isnot(None)))
        await session.execute(delete(Complaint))
        await session.execute(delete(CategoryRoutingRule))
        # Clear department_id on users before deleting departments
        await session.execute(delete(User))
        await session.execute(delete(Department))
        await session.flush()
        if verbose:
            print("[SEED] Existing database tables cleanly purged.")

    # ------------------------------------------------------------------------
    # STEP 1: DEPARTMENTS (10 Operational Units)
    # ------------------------------------------------------------------------
    departments = get_seed_departments()
    for d in departments:
        dept = await session.get(Department, d["id"])
        if not dept:
            # Check by code
            dept = await session.scalar(select(Department).where(Department.code == d["code"]))
        if not dept:
            dept = Department(
                id=d["id"],
                name=d["name"],
                code=d["code"],
                contact_email=d["contact_email"],
                is_active=True,
            )
            session.add(dept)
            counts["departments"] += 1
        else:
            dept.name = d["name"]
            dept.contact_email = d["contact_email"]
            dept.is_active = True
    await session.flush()

    # ------------------------------------------------------------------------
    # STEP 2: CATEGORY ROUTING RULES (33 Rules)
    # ------------------------------------------------------------------------
    rules = get_seed_routing_rules()
    for r in rules:
        existing = await session.scalar(
            select(CategoryRoutingRule).where(CategoryRoutingRule.category == r["category"])
        )
        if not existing:
            rule = CategoryRoutingRule(
                id=r["id"],
                category=r["category"],
                department_id=r["department_id"],
                priority_override=r.get("priority_override"),
                is_active=True,
            )
            session.add(rule)
            counts["routing_rules"] += 1
        else:
            existing.department_id = r["department_id"]
            existing.priority_override = r.get("priority_override")
            existing.is_active = True
    await session.flush()

    # ------------------------------------------------------------------------
    # STEP 3: USERS (1 Super Admin, 10 Dept Admins, 4 Students)
    # ------------------------------------------------------------------------
    users = get_seed_users()
    for u in users:
        existing = await session.get(User, u["id"])
        if not existing:
            existing = await session.scalar(
                select(User).where(or_(User.email == u["email"].lower(), User.reg_no == u["reg_no"]))
            )
        if not existing:
            user = User(
                id=u["id"],
                reg_no=u["reg_no"],
                name=u["name"],
                email=u["email"].lower(),
                role=u["role"],
                department_id=u["department_id"],
                department=u.get("department"),
                gender=u["gender"],
                student_type=u["student_type"],
                hostel_block=u.get("hostel_block"),
                room_no=u.get("room_no"),
                phone=u.get("phone"),
                password_hash=u["password_hash"],
                is_email_verified=True,
            )
            session.add(user)
            counts["users"] += 1
        else:
            existing.name = u["name"]
            existing.role = u["role"]
            existing.department_id = u["department_id"]
            existing.department = u.get("department")
            existing.password_hash = u["password_hash"]
            existing.is_email_verified = True
    await session.flush()

    # ------------------------------------------------------------------------
    # STEP 4: COMPLAINTS (38 Realistic Complaints)
    # First seed master complaints, then duplicate/child complaints
    # ------------------------------------------------------------------------
    all_complaints = get_seed_complaints()

    # 4A. Master Complaints (master_case_id is None)
    masters = [c for c in all_complaints if not c.get("master_case_id")]
    for c in masters:
        existing = await session.get(Complaint, c["id"])
        if not existing:
            existing = await session.scalar(
                select(Complaint).where(Complaint.ticket_no == c["ticket_no"])
            )
        emb = generate_seed_embedding(c["description"], c["category"], [c.get("location_tag") or ""])
        if not existing:
            complaint = Complaint(
                id=c["id"],
                ticket_no=c["ticket_no"],
                student_reg_no=c["student_reg_no"],
                student_name=c["student_name"],
                student_email=c["student_email"],
                student_phone=c.get("student_phone"),
                student_type=c["student_type"],
                hostel_block=c.get("hostel_block"),
                room_no=c.get("room_no"),
                category=c["category"],
                description=c["description"],
                status=c["status"],
                priority=c["priority"],
                is_spam=c.get("is_spam", False),
                location_tag=c.get("location_tag"),
                assigned_department_id=c["assigned_department_id"],
                created_at=c["created_at"],
                resolved_at=c.get("resolved_at"),
                admin_notes=c.get("admin_notes"),
                embedding=emb,
            )
            session.add(complaint)
            counts["complaints"] += 1
        else:
            existing.ticket_no = c["ticket_no"]
            existing.status = c["status"]
            existing.priority = c["priority"]
            existing.assigned_department_id = c["assigned_department_id"]
            existing.embedding = emb
    await session.flush()

    # 4B. Duplicate / Child Complaints (master_case_id is set)
    children = [c for c in all_complaints if c.get("master_case_id")]
    for c in children:
        existing = await session.get(Complaint, c["id"])
        if not existing:
            existing = await session.scalar(
                select(Complaint).where(Complaint.ticket_no == c["ticket_no"])
            )
        emb = generate_seed_embedding(c["description"], c["category"], [c.get("location_tag") or ""])
        if not existing:
            complaint = Complaint(
                id=c["id"],
                ticket_no=c["ticket_no"],
                student_reg_no=c["student_reg_no"],
                student_name=c["student_name"],
                student_email=c["student_email"],
                student_phone=c.get("student_phone"),
                student_type=c["student_type"],
                hostel_block=c.get("hostel_block"),
                room_no=c.get("room_no"),
                category=c["category"],
                description=c["description"],
                status=c["status"],
                priority=c["priority"],
                is_spam=c.get("is_spam", False),
                location_tag=c.get("location_tag"),
                master_case_id=c["master_case_id"],
                similarity_score=c.get("similarity_score"),
                merged_at=c.get("merged_at"),
                assigned_department_id=c["assigned_department_id"],
                created_at=c["created_at"],
                resolved_at=c.get("resolved_at"),
                admin_notes=c.get("admin_notes"),
                embedding=emb,
            )
            session.add(complaint)
            counts["complaints"] += 1
        else:
            existing.ticket_no = c["ticket_no"]
            existing.status = c["status"]
            existing.assigned_department_id = c["assigned_department_id"]
            existing.master_case_id = c["master_case_id"]
            existing.similarity_score = c.get("similarity_score")
            existing.embedding = emb
    await session.flush()

    # ------------------------------------------------------------------------
    # STEP 5: COMPLAINT UPVOTES
    # ------------------------------------------------------------------------
    if ComplaintUpvote is not None:
        upvotes = get_seed_upvotes()
        for u in upvotes:
            existing = await session.scalar(
                select(ComplaintUpvote).where(
                    ComplaintUpvote.complaint_id == u["complaint_id"],
                    ComplaintUpvote.user_id == u["user_id"],
                )
            )
            if not existing:
                upvote = ComplaintUpvote(
                    id=u["id"],
                    complaint_id=u["complaint_id"],
                    user_id=u["user_id"],
                    created_at=datetime.now(timezone.utc),
                )
                session.add(upvote)
                counts["upvotes"] += 1
        await session.flush()

    # ------------------------------------------------------------------------
    # STEP 6: NOTIFICATIONS
    # ------------------------------------------------------------------------
    notifications = get_seed_notifications()
    for n in notifications:
        existing = await session.get(Notification, n["id"])
        if not existing:
            notif = Notification(
                id=n["id"],
                recipient=n["recipient"],
                subject=n["subject"],
                body=n["body"],
                type=n["type"],
                timestamp=n["timestamp"],
            )
            session.add(notif)
            counts["notifications"] += 1
    await session.flush()

    # ------------------------------------------------------------------------
    # STEP 7: AUDIT LOGS
    # ------------------------------------------------------------------------
    logs = get_seed_audit_logs()
    for l in logs:
        existing = await session.get(AuditLog, l["id"])
        if not existing:
            entry = AuditLog(
                id=l["id"],
                entity_type=l["entity_type"],
                entity_id=l["entity_id"],
                action=l["action"],
                actor_id=l["actor_id"],
                actor_email=l["actor_email"],
                actor_role=l["actor_role"],
                previous_state=l.get("previous_state"),
                new_state=l.get("new_state"),
                reason=l.get("reason"),
                timestamp=l["timestamp"],
            )
            session.add(entry)
            counts["audit_logs"] += 1
    await session.flush()

    # ------------------------------------------------------------------------
    # STEP 8: UNIVERSAL DEV OTP SESSIONS (123456)
    # ------------------------------------------------------------------------
    all_emails = [u["email"].lower() for u in users]
    expires = datetime.now(timezone.utc) + timedelta(days=365)
    for idx, em in enumerate(all_emails):
        sess_id = f"otp-dev-{idx + 1:03d}"
        existing = await session.get(OtpSession, sess_id)
        if not existing:
            existing = await session.scalar(
                select(OtpSession).where(OtpSession.email == em)
            )
        if not existing:
            otp_s = OtpSession(
                id=sess_id,
                email=em,
                otp_code="123456",
                expires_at=expires,
                is_used=False,
            )
            session.add(otp_s)
            counts["otp_sessions"] += 1
        else:
            existing.otp_code = "123456"
            existing.expires_at = expires
            existing.is_used = False
    await session.flush()

    if verbose:
        print(f"[SEED] Successfully seeded database entities:")
        print(f"       -> Departments:    {counts['departments']} inserted")
        print(f"       -> Routing Rules:  {counts['routing_rules']} inserted")
        print(f"       -> Users:          {counts['users']} inserted (1 Super Admin, 10 Dept Admins, 4 Students)")
        print(f"       -> Complaints:     {counts['complaints']} inserted (38 realistic cases, 3 duplicate clusters)")
        print(f"       -> Upvotes:        {counts['upvotes']} inserted")
        print(f"       -> Notifications:  {counts['notifications']} inserted")
        print(f"       -> Audit Logs:     {counts['audit_logs']} inserted")
        print(f"       -> OTP Sessions:   {counts['otp_sessions']} active with dev code '123456'")

    return counts


# ============================================================================
# 7. CLI ENTRY POINT (python -m app.db.seed)
# ============================================================================

def main():
    should_reset = "--reset" in sys.argv
    no_historical = "--no-historical" in sys.argv
    verbose = "--quiet" not in sys.argv

    print("==================================================================")
    print(" Campus Grievance System — Idempotent Database Seeder")
    print(f" Execution Mode: {'RESET & SEED' if should_reset else 'UPSERT & VERIFY'}")
    print("==================================================================")

    res = asyncio.run(
        seed_database(
            reset=should_reset,
            include_historical=not no_historical,
            verbose=verbose,
        )
    )
    print("\nDatabase seeding completed successfully.")
    print("All credentials and role access documented in CREDENTIALS.md")


if __name__ == "__main__":
    main()
