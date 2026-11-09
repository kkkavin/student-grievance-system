"""
Deterministic database seeder matching src/data/constants.ts, src/data/initialData.ts,
and test/fixtures/timeseries_fixtures.ts.

Seeds:
1. 5 Operational Departments
2. 14 Category Routing Rules
3. 16 Canonical Users with bcrypt password hashes
4. 5 Initial Complaints (tkt-101 to tkt-105) with 384-d normalized embeddings
5. 200 Synthetic Historical Complaints spanning 12 months with 384-d normalized embeddings
"""

import asyncio
from datetime import datetime, timezone
import math
import re
from typing import List, Dict, Any, Optional
import bcrypt

# Compatibility patch for passlib with bcrypt>=4.1.0
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = type("About", (), {"__version__": getattr(bcrypt, "__version__", "4.0.1")})()

from passlib.context import CryptContext
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.base import AsyncSessionLocal, engine, Base
from backend.db.models import (
    Department,
    User,
    Complaint,
    CategoryRoutingRule,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

try:
    from backend.app.db.seed import (
        seed_database as seed_modern_database,
        seed_database as seed_app_database,
    )
except ImportError:
    seed_modern_database = None
    seed_app_database = None

# Pre-computed bcrypt hashes
HASH_ADMIN_123 = pwd_context.hash("Admin@123")
HASH_STUDENT_123 = pwd_context.hash("Student@123")


def fnv1a_hash(text: str) -> int:
    """32-bit FNV-1a hash matching deduplication.ts."""
    h = 2166136261
    for char in text:
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def generate_seed_embedding(
    text: str, category: str = "", tags: Optional[List[str]] = None, dim: int = 384
) -> List[float]:
    """
    Generates a deterministic 384-dimensional L2-normalized float embedding.
    Matches sublinear TF-IDF + FNV-1a feature hash from src/ml/deduplication.ts.
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


def get_seed_departments() -> List[Dict[str, Any]]:
    return [
        {
            "id": "dept-network-ops",
            "name": "Network Operations",
            "code": "NET_OPS",
            "contact_email": "network.admin@college.edu",
        },
        {
            "id": "dept-hostel-admin",
            "name": "Hostel Administration",
            "code": "HOSTEL_ADMIN",
            "contact_email": "warden.office@college.edu",
        },
        {
            "id": "dept-campus-transport",
            "name": "Campus Transport",
            "code": "CAMPUS_TRANSPORT",
            "contact_email": "transport.incharge@college.edu",
        },
        {
            "id": "dept-facilities",
            "name": "Campus Facilities & Estate",
            "code": "FACILITIES",
            "contact_email": "facilities@college.edu",
        },
        {
            "id": "dept-academic-affairs",
            "name": "Academic Affairs & Anti-Ragging",
            "code": "ACADEMIC_AFFAIRS",
            "contact_email": "antiragging.cell@college.edu",
        },
    ]


def get_seed_routing_rules() -> List[Dict[str, Any]]:
    return [
        {"id": "rule-net-01", "category": "Hostel Wi-Fi & Internet", "department_id": "dept-network-ops"},
        {"id": "rule-net-02", "category": "Library & Wi-Fi", "department_id": "dept-network-ops"},
        {"id": "rule-hostel-01", "category": "Plumbing & Water", "department_id": "dept-hostel-admin"},
        {"id": "rule-hostel-02", "category": "Food & Mess", "department_id": "dept-hostel-admin"},
        {"id": "rule-hostel-03", "category": "Cleanliness & Sanitation", "department_id": "dept-hostel-admin"},
        {"id": "rule-fac-01", "category": "Damages & Repairs", "department_id": "dept-facilities"},
        {"id": "rule-fac-02", "category": "Electrical & AC", "department_id": "dept-facilities"},
        {"id": "rule-trans-01", "category": "Bus & Transport", "department_id": "dept-campus-transport"},
        {"id": "rule-fac-03", "category": "Canteen & Cafeteria", "department_id": "dept-facilities"},
        {"id": "rule-fac-04", "category": "Campus Cleanliness", "department_id": "dept-facilities"},
        {"id": "rule-acad-01", "category": "Classroom & Lab Facilities", "department_id": "dept-academic-affairs"},
        {"id": "rule-acad-02", "category": "Administrative & Fees", "department_id": "dept-academic-affairs"},
        {"id": "rule-acad-03", "category": "Ragging & Harassment", "department_id": "dept-academic-affairs"},
        {"id": "rule-oth-01", "category": "Others", "department_id": "dept-hostel-admin"},
    ]


def get_seed_users() -> List[Dict[str, Any]]:
    return [
        {
            "id": "admin-super-01",
            "reg_no": "SUPERADMIN",
            "name": "Super Admin",
            "email": "superadmin@college.edu",
            "role": "SUPER_ADMIN",
            "department_id": None,
            "department": "Administration",
            "gender": "Other",
            "student_type": "hosteller",
            "phone": "080-28904100",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "admin-001",
            "reg_no": "ADMIN-CELL",
            "name": "Chief Proctor & Warden Admin",
            "email": "admin.grievance@college.edu",
            "role": "SUPER_ADMIN",
            "department_id": None,
            "department": "Administration",
            "gender": "Other",
            "student_type": "hosteller",
            "phone": "080-28904100",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-net-01",
            "reg_no": "STAFF-NET-01",
            "name": "Network Operations Staff",
            "email": "staff.network@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-network-ops",
            "department": "Network Operations",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "9876543201",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "head-net-01",
            "reg_no": "HEAD-NET-01",
            "name": "Network Operations Head",
            "email": "head.network@college.edu",
            "role": "DEPARTMENT_HEAD",
            "department_id": "dept-network-ops",
            "department": "Network Operations",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "9876543202",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-hostel-01",
            "reg_no": "STAFF-HOSTEL-01",
            "name": "Hostel Admin Staff",
            "email": "staff.hostel@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-hostel-admin",
            "department": "Hostel Administration",
            "gender": "Female",
            "student_type": "hosteller",
            "phone": "9876543203",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "head-hostel-01",
            "reg_no": "HEAD-HOSTEL-01",
            "name": "Hostel Admin Head",
            "email": "head.hostel@college.edu",
            "role": "DEPARTMENT_HEAD",
            "department_id": "dept-hostel-admin",
            "department": "Hostel Administration",
            "gender": "Male",
            "student_type": "hosteller",
            "phone": "9876543204",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-trans-01",
            "reg_no": "STAFF-TRANS-01",
            "name": "Campus Transport Staff",
            "email": "staff.transport@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-campus-transport",
            "department": "Campus Transport",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "9876543205",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "head-trans-01",
            "reg_no": "HEAD-TRANS-01",
            "name": "Campus Transport Head",
            "email": "head.transport@college.edu",
            "role": "DEPARTMENT_HEAD",
            "department_id": "dept-campus-transport",
            "department": "Campus Transport",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "9876543206",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-hostel-welfare",
            "reg_no": "STAFF-HST-WELFARE",
            "name": "Hostel Welfare Officer",
            "email": "hostel.welfare@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-hostel-admin",
            "department": "Hostel Administration",
            "gender": "Female",
            "student_type": "hosteller",
            "phone": "9876543207",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-food-mess",
            "reg_no": "STAFF-MESS-01",
            "name": "Food & Mess Supervisor",
            "email": "food.mess@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-hostel-admin",
            "department": "Hostel Administration",
            "gender": "Male",
            "student_type": "hosteller",
            "phone": "9876543208",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-plumbing-water",
            "reg_no": "STAFF-PLUMB-01",
            "name": "Plumbing & Water In-Charge",
            "email": "plumbing.water@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-hostel-admin",
            "department": "Hostel Administration",
            "gender": "Male",
            "student_type": "hosteller",
            "phone": "9876543209",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-transport-seed",
            "reg_no": "STAFF-TRANS-SEED",
            "name": "Campus Transport Officer",
            "email": "transport@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-campus-transport",
            "department": "Campus Transport",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "9876543212",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-electrical-ac",
            "reg_no": "STAFF-ELEC-01",
            "name": "Electrical & AC Maintenance Staff",
            "email": "electrical.ac@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-facilities",
            "department": "Campus Facilities & Estate",
            "gender": "Male",
            "student_type": "dayscholar",
            "phone": "9876543213",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-antiragging",
            "reg_no": "STAFF-RAGGING-01",
            "name": "Anti-Ragging Committee Officer",
            "email": "antiragging@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-academic-affairs",
            "department": "Academic Affairs & Anti-Ragging",
            "gender": "Female",
            "student_type": "dayscholar",
            "phone": "9876543214",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "staff-antiragging-committee",
            "reg_no": "STAFF-RAGGING-COMM",
            "name": "Anti-Ragging Committee Staff",
            "email": "antiragging.committee@college.edu",
            "role": "DEPARTMENT_STAFF",
            "department_id": "dept-academic-affairs",
            "department": "Academic Affairs & Anti-Ragging",
            "gender": "Female",
            "student_type": "dayscholar",
            "phone": "9876543215",
            "password_hash": HASH_ADMIN_123,
        },
        {
            "id": "STU123",
            "reg_no": "STU123",
            "name": "Rahul Sharma",
            "email": "rahul.cs23@college.edu",
            "role": "STUDENT",
            "department_id": None,
            "department": "CSE (Computer Science & Engineering)",
            "gender": "Male",
            "student_type": "hosteller",
            "phone": "9876543210",
            "password_hash": HASH_STUDENT_123,
        },
    ]


def get_seed_initial_complaints() -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "tkt-101",
            "ticket_no": "GRV-2026-8912",
            "student_reg_no": "STU123",
            "student_name": "Rahul Sharma",
            "student_email": "rahul.cs23@college.edu",
            "student_phone": "9876543210",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "A-304",
            "category": "Plumbing & Water",
            "description": "Continuous water leakage from washroom ceiling tap and damaged pipe fittings.",
            "status": "pending",
            "priority": "urgent",
            "is_spam": False,
            "assigned_department_id": "dept-hostel-admin",
            "created_at": now,
        },
        {
            "id": "tkt-102",
            "ticket_no": "GRV-2026-8910",
            "student_reg_no": "2024EC109",
            "student_name": "Priya Nair",
            "student_email": "priya.ec24@college.edu",
            "student_phone": "9845112233",
            "student_type": "hosteller",
            "hostel_block": "Block C",
            "room_no": "C-210",
            "category": "Food & Mess",
            "description": "Dinner served in hostel mess was cold and undercooked. Hygiene issues reported.",
            "status": "pending",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-hostel-admin",
            "created_at": now,
        },
        {
            "id": "tkt-103",
            "ticket_no": "GRV-2026-8899",
            "student_reg_no": "2022ME055",
            "student_name": "Aditya Varma",
            "student_email": "aditya.me22@college.edu",
            "student_phone": "9123456780",
            "student_type": "dayscholar",
            "hostel_block": None,
            "room_no": None,
            "category": "Bus & Transport",
            "description": "Route 14 college bus arrived 45 minutes late at Tollgate Highway stop causing exam rush.",
            "status": "pending",
            "priority": "medium",
            "is_spam": False,
            "assigned_department_id": "dept-campus-transport",
            "created_at": now,
        },
        {
            "id": "tkt-104",
            "ticket_no": "GRV-2026-8870",
            "student_reg_no": "2023IS019",
            "student_name": "Kavya S",
            "student_email": "kavya.is23@college.edu",
            "student_phone": "9877112233",
            "student_type": "hosteller",
            "hostel_block": "Block D",
            "room_no": "D-102",
            "category": "Electrical & AC",
            "description": "Ceiling fan sparking and switchboard burnt out in ground floor room.",
            "status": "resolved",
            "priority": "urgent",
            "is_spam": False,
            "admin_notes": "Electrician replaced the capacitor and switchboard socket with a new 5A regulator.",
            "assigned_department_id": "dept-facilities",
            "created_at": now,
            "resolved_at": now,
        },
        {
            "id": "tkt-105",
            "ticket_no": "GRV-2026-8865",
            "student_reg_no": "2025CS999",
            "student_name": "Unknown Prankster",
            "student_email": "prank.test@college.edu",
            "student_phone": "9999999999",
            "student_type": "hosteller",
            "hostel_block": "Block A",
            "room_no": "A-000",
            "category": "Others",
            "description": "asdfgh qwerty random spam complaint text with no grievance intent.",
            "status": "pending",
            "priority": "less_important",
            "is_spam": True,
            "spam_reason": "GIBBERISH",
            "assigned_department_id": "dept-hostel-admin",
            "created_at": now,
        },
    ]


def build_historical_grievances() -> List[Dict[str, Any]]:
    """
    Constructs the exact 200 synthetic historical grievances matching
    test/fixtures/timeseries_fixtures.ts over 12 academic months.
    """
    grievances: List[Dict[str, Any]] = []
    hostel_blocks = ["A", "B", "C", "D", "E"]
    routes = [f"Route {i + 1}" for i in range(12)]
    departments = ["CSE", "ECE", "MECH", "CIVIL", "IT", "LIBRARY"]

    first_names = [
        "Aarav", "Priya", "Rohan", "Sneha", "Vikram", "Divya", "Karthik", "Ananya", "Sanjay", "Meera",
        "Arun", "Pooja", "Harish", "Kavitha", "Ganesh", "Deepa", "Naveen", "Swathi", "Manoj", "Nisha"
    ]
    last_names = [
        "Patel", "Sharma", "Sundaram", "Nair", "Singh", "Kumar", "Reddy", "Menon", "Iyer", "Babu",
        "Verma", "Krishnan", "Roy", "Joshi", "Das", "Sen", "Rao", "Pillai", "Murugan", "Gupta"
    ]

    monthly_distributions = [
        {"year": 2025, "month": 11, "count": 28, "surge": "MONSOON_EXAM"},
        {"year": 2025, "month": 12, "count": 6,  "surge": "WINTER_BREAK"},
        {"year": 2026, "month": 1,  "count": 16, "surge": "SPRING_START"},
        {"year": 2026, "month": 2,  "count": 14, "surge": "NORMAL"},
        {"year": 2026, "month": 3,  "count": 14, "surge": "NORMAL"},
        {"year": 2026, "month": 4,  "count": 24, "surge": "EXAM_SUMMER"},
        {"year": 2026, "month": 5,  "count": 22, "surge": "EXAM_SUMMER"},
        {"year": 2026, "month": 6,  "count": 5,  "surge": "SUMMER_BREAK"},
        {"year": 2026, "month": 7,  "count": 25, "surge": "FALL_REOPENING"},
        {"year": 2026, "month": 8,  "count": 16, "surge": "NORMAL"},
        {"year": 2026, "month": 9,  "count": 12, "surge": "NORMAL"},
        {"year": 2026, "month": 10, "count": 18, "surge": "MONSOON_ONSET"},
    ]

    ticket_counter = 1000

    for dist in monthly_distributions:
        year = dist["year"]
        month = dist["month"]
        surge = dist["surge"]

        for i in range(dist["count"]):
            ticket_counter += 1
            rec_id = f"hist_{year}_{month:02d}_{i + 1:03d}"
            ticket_no = f"GRV-{year}-{ticket_counter}"

            day = min(28, (i * 2) % 27 + 1)
            hour = (i * 3) % 24
            minute = (i * 7) % 60
            created_dt = datetime(year, month, day, hour, minute, 0, tzinfo=timezone.utc)

            fn = first_names[(ticket_counter + i) % len(first_names)]
            ln = last_names[(ticket_counter + i * 2) % len(last_names)]
            student_name = f"{fn} {ln}"
            student_reg_no = f"202{(ticket_counter % 4) + 2}CS{ticket_counter % 900 + 100}"
            student_email = f"{fn.lower()}.{ln[0].lower()}{ticket_counter % 100}@campus.edu"

            category = "Hostel Maintenance"
            student_type = "hosteller"
            hostel_block = hostel_blocks[i % len(hostel_blocks)]
            floor_num = (i % 4) + 1
            room_no = f"{hostel_block}-{floor_num}0{(i % 8) + 1}"
            priority = "medium"
            description = ""
            location_tag = ""
            assigned_dept_id = "dept-facilities"

            if surge in ("MONSOON_EXAM", "MONSOON_ONSET"):
                type_mod = i % 4
                if type_mod in (0, 1):
                    category = "Hostel Maintenance"
                    priority = "urgent"
                    description = f"Heavy monsoon rainwater seepage through ceiling and plumbing drain overflow in {room_no}."
                    location_tag = f"Hostel Block {hostel_block}, Floor {floor_num}, Room {room_no}"
                    assigned_dept_id = "dept-facilities"
                elif type_mod == 2:
                    category = "Electrical & AC"
                    priority = "urgent"
                    description = f"Damp electrical switchboard sparking near corridor of Block {hostel_block} floor {floor_num}."
                    location_tag = f"Hostel Block {hostel_block}, Floor {floor_num}"
                    assigned_dept_id = "dept-facilities"
                else:
                    category = "Hostel Wi-Fi & Internet"
                    student_type = "dayscholar"
                    hostel_block = None
                    room_no = None
                    description = "Library exam study hall Wi-Fi bandwidth completely throttled during evening revision hours."
                    location_tag = "Central Library, Floor 2, AP-LIB-F2-01"
                    priority = "urgent"
                    assigned_dept_id = "dept-network-ops"
            elif surge == "EXAM_SUMMER":
                type_mod = i % 3
                if type_mod == 0:
                    category = "Hostel Wi-Fi & Internet"
                    student_type = "dayscholar"
                    hostel_block = None
                    room_no = None
                    dept_block = departments[i % len(departments)]
                    description = f"High latency and frequent disconnects on {dept_block} floor {floor_num} Wi-Fi during exam preparation."
                    location_tag = f"{dept_block} Block, Floor {floor_num}, AP-{dept_block}-F{floor_num}-01"
                    priority = "urgent"
                    assigned_dept_id = "dept-network-ops"
                elif type_mod == 1:
                    category = "Electrical & AC"
                    priority = "urgent"
                    description = f"Severe summer heat: ceiling fan regulator burnt in room {room_no}, unable to study."
                    location_tag = f"Hostel Block {hostel_block}, Floor {floor_num}, Room {room_no}"
                    assigned_dept_id = "dept-facilities"
                else:
                    category = "Plumbing & Water"
                    priority = "medium"
                    description = f"Daily water dispenser filter clogged and not cooling in Block {hostel_block} floor {floor_num}."
                    location_tag = f"Hostel Block {hostel_block}, Floor {floor_num}"
                    assigned_dept_id = "dept-hostel-admin"
            elif surge == "FALL_REOPENING":
                type_mod = i % 3
                if type_mod in (0, 1):
                    category = "Bus & Transport"
                    student_type = "dayscholar"
                    hostel_block = None
                    room_no = None
                    t_route = routes[i % len(routes)]
                    description = f"Semester start rush: {t_route} severely overcrowded, students unable to board morning bus."
                    location_tag = f"Campus Transport {t_route}"
                    priority = "urgent"
                    assigned_dept_id = "dept-campus-transport"
                else:
                    category = "Food & Mess"
                    location_tag = "Central Dining Mess 1"
                    description = "Mess registration queue unmanaged, 40-minute wait time for first-year lunch service."
                    priority = "medium"
                    assigned_dept_id = "dept-hostel-admin"
            else:
                cat_mod = i % 5
                if cat_mod == 0:
                    category = "Plumbing & Water"
                    description = f"Window latch broken and rattling in room {room_no}."
                    location_tag = f"Hostel Block {hostel_block}, Floor {floor_num}, Room {room_no}"
                    assigned_dept_id = "dept-hostel-admin"
                elif cat_mod == 1:
                    category = "Bus & Transport"
                    student_type = "dayscholar"
                    hostel_block = None
                    room_no = None
                    t_route = routes[i % len(routes)]
                    description = f"{t_route} bus tyre pressure low, delayed arrival at campus."
                    location_tag = f"Campus Transport {t_route}"
                    assigned_dept_id = "dept-campus-transport"
                elif cat_mod == 2:
                    category = "Hostel Wi-Fi & Internet"
                    student_type = "dayscholar"
                    hostel_block = None
                    room_no = None
                    dept_block = departments[i % len(departments)]
                    description = f"Signal drop in {dept_block} room {floor_num}02 near AP-{dept_block}-F{floor_num}-02."
                    location_tag = f"{dept_block} Block, Floor {floor_num}"
                    assigned_dept_id = "dept-network-ops"
                elif cat_mod == 3:
                    category = "Food & Mess"
                    location_tag = "South Mess Dining Hall"
                    description = "Drinking water dispenser empty during dinner hours in South Mess."
                    assigned_dept_id = "dept-hostel-admin"
                else:
                    category = "Electrical & AC"
                    description = f"Tube light starter replacement required in room {room_no}."
                    location_tag = f"Hostel Block {hostel_block}, Floor {floor_num}, Room {room_no}"
                    assigned_dept_id = "dept-facilities"

            # Resolution status
            status = "resolved"
            resolved_dt: Optional[datetime] = None

            if year == 2026 and month >= 10:
                status = "pending" if i % 3 == 0 else ("in_progress" if i % 3 == 1 else "PRIMARY")
            elif year == 2026 and month >= 8:
                status = "pending" if i % 5 == 0 else "resolved"

            if status == "resolved":
                res_day = min(28, day + (i % 4) + 1)
                resolved_dt = datetime(year, month, res_day, 18, 0, 0, tzinfo=timezone.utc)

            embedding_vec = generate_seed_embedding(description, category, [location_tag])

            grievances.append({
                "id": rec_id,
                "ticket_no": ticket_no,
                "student_reg_no": student_reg_no,
                "student_name": student_name,
                "student_email": student_email,
                "student_phone": f"9876543{i:03d}",
                "student_type": student_type,
                "hostel_block": hostel_block,
                "room_no": room_no,
                "category": category,
                "description": description,
                "status": status,
                "priority": priority,
                "is_spam": False,
                "location_tag": location_tag,
                "source_timestamp": created_dt,
                "created_at": created_dt,
                "resolved_at": resolved_dt,
                "embedding": embedding_vec,
                "assigned_department_id": assigned_dept_id,
            })

    return grievances


async def seed_database(
    session: Optional[AsyncSession] = None,
    reset: bool = False,
    include_historical: bool = True,
) -> None:
    """Idempotently seeds all default departments, routing rules, users, and grievances."""
    if session is not None:
        await _perform_seeding(session, reset=reset, include_historical=include_historical)
    else:
        # Ensure tables exist
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with AsyncSessionLocal() as session:
            await _perform_seeding(session, reset=reset, include_historical=include_historical)
            await session.commit()


async def _perform_seeding(session: AsyncSession, reset: bool = False, include_historical: bool = True) -> None:
    if reset:
        await session.execute(delete(Complaint))
        await session.execute(delete(User))
        await session.execute(delete(CategoryRoutingRule))
        await session.execute(delete(Department))
        await session.flush()

    # 1. Departments
    departments_data = get_seed_departments()
    for d in departments_data:
        existing = await session.get(Department, d["id"])
        if not existing:
            dept = Department(
                id=d["id"],
                name=d["name"],
                code=d["code"],
                contact_email=d["contact_email"],
                is_active=True,
            )
            session.add(dept)
    await session.flush()

    # 2. Routing Rules
    routing_data = get_seed_routing_rules()
    for r in routing_data:
        existing = await session.scalar(
            select(CategoryRoutingRule).where(CategoryRoutingRule.category == r["category"])
        )
        if not existing:
            rule = CategoryRoutingRule(
                id=r["id"],
                category=r["category"],
                department_id=r["department_id"],
                is_active=True,
            )
            session.add(rule)
    await session.flush()

    # 3. Users
    users_data = get_seed_users()
    for u in users_data:
        existing = await session.get(User, u["id"])
        if not existing:
            user = User(
                id=u["id"],
                reg_no=u["reg_no"],
                name=u["name"],
                email=u["email"],
                role=u["role"],
                department_id=u["department_id"],
                department=u["department"],
                gender=u["gender"],
                student_type=u["student_type"],
                phone=u["phone"],
                password_hash=u["password_hash"],
                is_email_verified=True,
            )
            session.add(user)
    await session.flush()

    # 4. Initial Complaints
    initial_complaints = get_seed_initial_complaints()
    for c in initial_complaints:
        existing = await session.get(Complaint, c["id"])
        if not existing:
            emb = generate_seed_embedding(c["description"], c["category"])
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
                spam_reason=c.get("spam_reason"),
                created_at=c["created_at"],
                resolved_at=c.get("resolved_at"),
                admin_notes=c.get("admin_notes"),
                embedding=emb,
                assigned_department_id=c["assigned_department_id"],
            )
            session.add(complaint)
    await session.flush()

    # 5. Synthetic Historical Complaints
    if include_historical:
        historical_complaints = build_historical_grievances()
        for h in historical_complaints:
            existing = await session.get(Complaint, h["id"])
            if not existing:
                complaint = Complaint(
                    id=h["id"],
                    ticket_no=h["ticket_no"],
                    student_reg_no=h["student_reg_no"],
                    student_name=h["student_name"],
                    student_email=h["student_email"],
                    student_phone=h["student_phone"],
                    student_type=h["student_type"],
                    hostel_block=h["hostel_block"],
                    room_no=h["room_no"],
                    category=h["category"],
                    description=h["description"],
                    status=h["status"],
                    priority=h["priority"],
                    is_spam=h["is_spam"],
                    location_tag=h["location_tag"],
                    source_timestamp=h["source_timestamp"],
                    created_at=h["created_at"],
                    resolved_at=h["resolved_at"],
                    embedding=h["embedding"],
                    assigned_department_id=h["assigned_department_id"],
                )
                session.add(complaint)
        await session.flush()


if __name__ == "__main__":
    import sys
    should_reset = "--reset" in sys.argv
    asyncio.run(seed_database(reset=should_reset))
    print("Deterministic database seeding complete.")
