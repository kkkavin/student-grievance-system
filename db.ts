import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import {
  UserProfile,
  Grievance,
  PriorityLevel,
  GrievanceStatus,
  StudentType,
  TriageGrievance,
  TriageCandidateMaster,
  Department,
  CategoryRoutingRule,
  AuditLogEntry,
  UserRole,
} from "./src/types";
import { INITIAL_GRIEVANCES } from "./src/data/initialData";

const DB_PATH = path.join(process.cwd(), "database.sqlite");

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    dbInstance.exec("PRAGMA busy_timeout = 5000;");
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: DatabaseSync) {
  // 1. Create Departments Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      contact_email TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
    CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);
  `);

  // 2. Create Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      regNo TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT,
      gender TEXT,
      studentType TEXT NOT NULL,
      phone TEXT,
      email TEXT UNIQUE NOT NULL,
      hostelBlock TEXT,
      roomNo TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      isEmailVerified INTEGER NOT NULL DEFAULT 1,
      passwordHash TEXT,
      createdAt TEXT NOT NULL,
      department_id TEXT NULL REFERENCES departments(id)
    );
  `);

  // 3. Create Grievances Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS grievances (
      id TEXT PRIMARY KEY,
      ticketNo TEXT UNIQUE NOT NULL,
      studentRegNo TEXT NOT NULL,
      studentName TEXT NOT NULL,
      studentEmail TEXT NOT NULL,
      studentPhone TEXT,
      studentType TEXT NOT NULL,
      hostelBlock TEXT,
      roomNo TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      isSpam INTEGER NOT NULL DEFAULT 0,
      spamReason TEXT,
      aiClassification TEXT,
      createdAt TEXT NOT NULL,
      resolvedAt TEXT,
      adminNotes TEXT,
      master_case_id TEXT NULL REFERENCES grievances(id),
      location_tag TEXT NULL,
      source_timestamp TEXT NULL,
      embedding_vector TEXT NULL,
      similarity_score REAL NULL,
      merged_at TEXT NULL,
      public_master_notes TEXT NULL,
      assigned_department_id TEXT NULL REFERENCES departments(id)
    );
  `);

  // 4. Create Category Routing Rules Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS category_routing_rules (
      id TEXT PRIMARY KEY,
      category TEXT UNIQUE NOT NULL,
      department_id TEXT NOT NULL REFERENCES departments(id),
      priority_override TEXT NULL,
      location_tag_pattern TEXT NULL,
      priority_order INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_category ON category_routing_rules(category);
    CREATE INDEX IF NOT EXISTS idx_routing_dept ON category_routing_rules(department_id);
  `);

  // Dynamic migration checks for category_routing_rules
  const routingTableCols = (
    db.prepare("PRAGMA table_info(category_routing_rules)").all() as Array<{ name: string }>
  ).map((c) => c.name);

  if (!routingTableCols.includes("location_tag_pattern")) {
    try {
      db.exec("ALTER TABLE category_routing_rules ADD COLUMN location_tag_pattern TEXT NULL;");
    } catch (err) {
      console.warn("Migration location_tag_pattern failed or applied:", err);
    }
  }
  if (!routingTableCols.includes("priority_order")) {
    try {
      db.exec("ALTER TABLE category_routing_rules ADD COLUMN priority_order INTEGER DEFAULT 0;");
    } catch (err) {
      console.warn("Migration priority_order failed or applied:", err);
    }
  }

  // 5. Create Audit Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      previous_state TEXT,
      new_state TEXT,
      reason TEXT,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Dynamic migration checks for audit_logs
  const auditTableCols = (
    db.prepare("PRAGMA table_info(audit_logs)").all() as Array<{ name: string }>
  ).map((c) => c.name);

  if (!auditTableCols.includes("timestamp")) {
    try {
      db.exec("ALTER TABLE audit_logs ADD COLUMN timestamp TEXT NULL;");
      db.exec("UPDATE audit_logs SET timestamp = created_at WHERE timestamp IS NULL;");
    } catch (err) {
      console.warn("Migration audit_logs.timestamp failed or applied:", err);
    }
  }

  // Dynamic migration checks for existing users table
  const userColumns = (
    db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>
  ).map((c) => c.name);

  if (!userColumns.includes("department_id")) {
    try {
      db.exec("ALTER TABLE users ADD COLUMN department_id TEXT NULL REFERENCES departments(id);");
    } catch (err) {
      console.warn("Migration users.department_id failed or already applied:", err);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);

  // Dynamic migration checks for existing grievances table
  const grievanceColumns = (
    db.prepare("PRAGMA table_info(grievances)").all() as Array<{ name: string }>
  ).map((c) => c.name);

  const migrations: Array<{ name: string; ddl: string }> = [
    {
      name: "master_case_id",
      ddl: "ALTER TABLE grievances ADD COLUMN master_case_id TEXT NULL REFERENCES grievances(id)",
    },
    {
      name: "location_tag",
      ddl: "ALTER TABLE grievances ADD COLUMN location_tag TEXT NULL",
    },
    {
      name: "source_timestamp",
      ddl: "ALTER TABLE grievances ADD COLUMN source_timestamp TEXT NULL",
    },
    {
      name: "embedding_vector",
      ddl: "ALTER TABLE grievances ADD COLUMN embedding_vector TEXT NULL",
    },
    {
      name: "similarity_score",
      ddl: "ALTER TABLE grievances ADD COLUMN similarity_score REAL NULL",
    },
    {
      name: "merged_at",
      ddl: "ALTER TABLE grievances ADD COLUMN merged_at TEXT NULL",
    },
    {
      name: "public_master_notes",
      ddl: "ALTER TABLE grievances ADD COLUMN public_master_notes TEXT NULL",
    },
    {
      name: "assigned_department_id",
      ddl: "ALTER TABLE grievances ADD COLUMN assigned_department_id TEXT NULL REFERENCES departments(id)",
    },
  ];

  for (const m of migrations) {
    if (!grievanceColumns.includes(m.name)) {
      try {
        db.exec(m.ddl);
      } catch (err) {
        console.warn(`Migration ${m.name} failed or already applied:`, err);
      }
    }
  }

  // Deduplication & performance indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_grievances_master ON grievances(master_case_id);
    CREATE INDEX IF NOT EXISTS idx_grievances_dedup ON grievances(category, createdAt);
    CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status);
    CREATE INDEX IF NOT EXISTS idx_grievances_assigned_dept ON grievances(assigned_department_id);
  `);

  // 6. Create Outbox / Notifications Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);

  // 7. Seed default operational departments if not present
  const deptCountStmt = db.prepare("SELECT COUNT(*) as count FROM departments");
  const deptCount = (deptCountStmt.get() as { count: number }).count;

  if (deptCount === 0) {
    const insertDept = db.prepare(`
      INSERT INTO departments (id, name, code, contact_email, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);
    const now = new Date().toISOString();
    insertDept.run("dept-network-ops", "Network Operations", "NET_OPS", "network.admin@college.edu", now, now);
    insertDept.run("dept-hostel-admin", "Hostel Administration", "HOSTEL_ADMIN", "warden.office@college.edu", now, now);
    insertDept.run("dept-campus-transport", "Campus Transport", "CAMPUS_TRANSPORT", "transport.incharge@college.edu", now, now);
    insertDept.run("dept-facilities", "Campus Facilities & Estate", "FACILITIES", "facilities@college.edu", now, now);
    insertDept.run("dept-academic-affairs", "Academic Affairs & Anti-Ragging", "ACADEMIC_AFFAIRS", "antiragging.cell@college.edu", now, now);
  }

  // 8. Seed default category routing rules if not present
  const routingCountStmt = db.prepare("SELECT COUNT(*) as count FROM category_routing_rules");
  const routingCount = (routingCountStmt.get() as { count: number }).count;

  const insertRule = db.prepare(`
    INSERT INTO category_routing_rules (id, category, department_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(category) DO UPDATE SET
      department_id = excluded.department_id,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);
  const now = new Date().toISOString();
  const rules = [
    { id: "rule-net-01", cat: "Hostel Wi-Fi & Internet", dept: "dept-network-ops" },
    { id: "rule-net-02", cat: "Library & Wi-Fi", dept: "dept-network-ops" },
    { id: "rule-hostel-01", cat: "Plumbing & Water", dept: "dept-hostel-admin" },
    { id: "rule-hostel-02", cat: "Food & Mess", dept: "dept-hostel-admin" },
    { id: "rule-hostel-03", cat: "Cleanliness & Sanitation", dept: "dept-hostel-admin" },
    { id: "rule-fac-01", cat: "Damages & Repairs", dept: "dept-facilities" },
    { id: "rule-fac-02", cat: "Electrical & AC", dept: "dept-facilities" },
    { id: "rule-trans-01", cat: "Bus & Transport", dept: "dept-campus-transport" },
    { id: "rule-fac-03", cat: "Canteen & Cafeteria", dept: "dept-facilities" },
    { id: "rule-fac-04", cat: "Campus Cleanliness", dept: "dept-facilities" },
    { id: "rule-acad-01", cat: "Classroom & Lab Facilities", dept: "dept-academic-affairs" },
    { id: "rule-acad-02", cat: "Administrative & Fees", dept: "dept-academic-affairs" },
    { id: "rule-acad-03", cat: "Ragging & Harassment", dept: "dept-academic-affairs" },
    { id: "rule-oth-01", cat: "Others", dept: "dept-hostel-admin" },
  ];
  for (const r of rules) {
    try {
      insertRule.run(r.id, r.cat, r.dept, now, now);
    } catch (err) {
      console.warn(`Routing rule seed ${r.cat} warning:`, err);
    }
  }

  // 9. Seed default staff, admin, and student users
  const adminEmail = process.env.ADMIN_EMAIL || "admin.grievance@college.edu";
  const adminPassword = process.env.ADMIN_PASSWORD || "adminpass123";

  const defaultUsers = [
    {
      id: "admin-super-01",
      regNo: "SUPERADMIN",
      name: "Super Admin",
      department: "Administration",
      gender: "Other",
      studentType: "hosteller",
      phone: "080-28904100",
      email: "superadmin@college.edu",
      role: "SUPER_ADMIN",
      department_id: null,
      passwordHash: adminPassword,
    },
    {
      id: "admin-001",
      regNo: "ADMIN-CELL",
      name: "Chief Proctor & Warden Admin",
      department: "Administration",
      gender: "Other",
      studentType: "hosteller",
      phone: "080-28904100",
      email: adminEmail,
      role: "SUPER_ADMIN",
      department_id: null,
      passwordHash: adminPassword,
    },
    {
      id: "staff-net-01",
      regNo: "STAFF-NET-01",
      name: "Network Operations Staff",
      department: "Network Operations",
      gender: "Male",
      studentType: "dayscholar",
      phone: "9876543201",
      email: "staff.network@college.edu",
      role: "DEPARTMENT_STAFF",
      department_id: "dept-network-ops",
      passwordHash: "adminpass123",
    },
    {
      id: "head-net-01",
      regNo: "HEAD-NET-01",
      name: "Network Operations Head",
      department: "Network Operations",
      gender: "Male",
      studentType: "dayscholar",
      phone: "9876543202",
      email: "head.network@college.edu",
      role: "DEPARTMENT_HEAD",
      department_id: "dept-network-ops",
      passwordHash: "adminpass123",
    },
    {
      id: "staff-hostel-01",
      regNo: "STAFF-HOSTEL-01",
      name: "Hostel Admin Staff",
      department: "Hostel Administration",
      gender: "Female",
      studentType: "hosteller",
      phone: "9876543203",
      email: "staff.hostel@college.edu",
      role: "DEPARTMENT_STAFF",
      department_id: "dept-hostel-admin",
      passwordHash: "adminpass123",
    },
    {
      id: "head-hostel-01",
      regNo: "HEAD-HOSTEL-01",
      name: "Hostel Admin Head",
      department: "Hostel Administration",
      gender: "Male",
      studentType: "hosteller",
      phone: "9876543204",
      email: "head.hostel@college.edu",
      role: "DEPARTMENT_HEAD",
      department_id: "dept-hostel-admin",
      passwordHash: "adminpass123",
    },
    {
      id: "staff-trans-01",
      regNo: "STAFF-TRANS-01",
      name: "Campus Transport Staff",
      department: "Campus Transport",
      gender: "Male",
      studentType: "dayscholar",
      phone: "9876543205",
      email: "staff.transport@college.edu",
      role: "DEPARTMENT_STAFF",
      department_id: "dept-campus-transport",
      passwordHash: "adminpass123",
    },
    {
      id: "head-trans-01",
      regNo: "HEAD-TRANS-01",
      name: "Campus Transport Head",
      department: "Campus Transport",
      gender: "Male",
      studentType: "dayscholar",
      phone: "9876543206",
      email: "head.transport@college.edu",
      role: "DEPARTMENT_HEAD",
      department_id: "dept-campus-transport",
      passwordHash: "adminpass123",
    },
    {
      id: "STU123",
      regNo: "STU123",
      name: "Rahul Sharma",
      department: "CSE (Computer Science & Engineering)",
      gender: "Male",
      studentType: "hosteller",
      phone: "9876543210",
      email: "rahul.cs23@college.edu",
      role: "STUDENT",
      department_id: null,
      passwordHash: "student123",
    },
  ];

  const nowUser = new Date().toISOString();
  for (const u of defaultUsers) {
    const existing = db.prepare("SELECT id, role, department_id FROM users WHERE LOWER(email) = LOWER(?) OR UPPER(regNo) = UPPER(?)").get(u.email, u.regNo) as any;
    if (existing) {
      db.prepare(`
        UPDATE users SET
          role = ?, department_id = ?, passwordHash = coalesce(nullif(passwordHash, ''), ?)
        WHERE id = ?
      `).run(u.role, u.department_id, u.passwordHash, existing.id);
    } else {
      db.prepare(`
        INSERT INTO users (
          id, regNo, name, department, gender, studentType, phone, email, hostelBlock, roomNo, role, isEmailVerified, passwordHash, createdAt, department_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, null, null, ?, 1, ?, ?, ?)
      `).run(
        u.id,
        u.regNo,
        u.name,
        u.department,
        u.gender,
        u.studentType,
        u.phone,
        u.email,
        u.role,
        u.passwordHash,
        nowUser,
        u.department_id,
      );
    }
  }

  // 10. Seed initial grievances if not present
  const grievanceCountStmt = db.prepare(
    "SELECT COUNT(*) as count FROM grievances",
  );
  const grievanceCount = (grievanceCountStmt.get() as { count: number }).count;

  if (grievanceCount === 0) {
    const insertGrievance = db.prepare(`
      INSERT INTO grievances (
        id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
        hostelBlock, roomNo, category, description, status, priority, isSpam, spamReason,
        aiClassification, createdAt, resolvedAt, adminNotes, assigned_department_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const g of INITIAL_GRIEVANCES) {
      let deptId = "dept-hostel-admin";
      if (g.category === "Hostel Wi-Fi & Internet" || g.category === "Library & Wi-Fi") {
        deptId = "dept-network-ops";
      } else if (g.category === "Bus & Transport") {
        deptId = "dept-campus-transport";
      } else if (g.category === "Canteen & Cafeteria" || g.category === "Campus Cleanliness") {
        deptId = "dept-facilities";
      } else if (g.category === "Classroom & Lab Facilities" || g.category === "Administrative & Fees" || g.category === "Ragging & Harassment") {
        deptId = "dept-academic-affairs";
      }

      insertGrievance.run(
        g.id,
        g.ticketNo,
        g.studentRegNo,
        g.studentName,
        g.studentEmail,
        g.studentPhone || null,
        g.studentType,
        g.hostelBlock || null,
        g.roomNo || null,
        g.category,
        g.description,
        g.status,
        g.priority || "medium",
        g.isSpam ? 1 : 0,
        g.spamReason || null,
        g.aiClassification ? JSON.stringify(g.aiClassification) : null,
        g.createdAt,
        g.resolvedAt || null,
        g.adminNotes || null,
        deptId,
      );
    }
  } else {
    // Backfill any unassigned grievances
    try {
      db.exec(`
        UPDATE grievances
        SET assigned_department_id = (
          SELECT department_id FROM category_routing_rules
          WHERE category_routing_rules.category = grievances.category
          LIMIT 1
        )
        WHERE assigned_department_id IS NULL;

        UPDATE grievances
        SET assigned_department_id = 'dept-hostel-admin'
        WHERE assigned_department_id IS NULL;
      `);
    } catch (err) {
      console.warn("Backfill assigned_department_id warning:", err);
    }
  }
}

// Format SQLite row to Grievance interface
function formatGrievanceRow(row: any): Grievance {
  let embeddingVector: number[] | undefined;
  if (row.embedding_vector) {
    try {
      embeddingVector = JSON.parse(row.embedding_vector);
    } catch {
      embeddingVector = undefined;
    }
  }

  return {
    id: row.id,
    ticketNo: row.ticketNo,
    studentRegNo: row.studentRegNo,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    studentPhone: row.studentPhone || "",
    studentType: row.studentType as StudentType,
    hostelBlock: row.hostelBlock || undefined,
    roomNo: row.roomNo || undefined,
    category: row.category,
    description: row.description,
    status: row.status as GrievanceStatus,
    priority: (row.priority as PriorityLevel) || "medium",
    isSpam: Boolean(row.isSpam),
    spamReason: row.spamReason || undefined,
    aiClassification: row.aiClassification
      ? JSON.parse(row.aiClassification)
      : undefined,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt || undefined,
    adminNotes: row.adminNotes || undefined,
    masterCaseId:
      row.master_case_id !== undefined ? row.master_case_id : undefined,
    locationTag: row.location_tag || undefined,
    sourceTimestamp: row.source_timestamp || undefined,
    embeddingVector,
    similarityScore:
      row.similarity_score !== null && row.similarity_score !== undefined
        ? Number(row.similarity_score)
        : undefined,
    mergedAt: row.merged_at || undefined,
    publicMasterNotes: row.public_master_notes || undefined,
    assignedDepartmentId: row.assigned_department_id || undefined,
    assigned_department_id: row.assigned_department_id || undefined,
  };
}

// Format SQLite row to UserProfile interface
function formatUserRow(row: any): UserProfile & { passwordHash?: string; department_id?: string | null } {
  return {
    id: row.id,
    regNo: row.regNo,
    name: row.name,
    department: row.department || undefined,
    departmentId: row.department_id || null,
    department_id: row.department_id || null,
    gender: row.gender || "Male",
    studentType: row.studentType as StudentType,
    phone: row.phone || "",
    email: row.email,
    hostelBlock: row.hostelBlock || undefined,
    roomNo: row.roomNo || undefined,
    role: row.role,
    isEmailVerified: Boolean(row.isEmailVerified),
    createdAt: row.createdAt,
    passwordHash: row.passwordHash || undefined,
  };
}

// ======================== GRIEVANCE METHODS ========================

export function getAllGrievances(): Grievance[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM grievances ORDER BY createdAt DESC");
  const rows = stmt.all();
  return rows.map(formatGrievanceRow);
}

export function getGrievanceById(id: string): Grievance | null {
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT * FROM grievances WHERE id = ? OR ticketNo = ?",
  );
  const row = stmt.get(id, id);
  return row ? formatGrievanceRow(row) : null;
}

export function createGrievance(data: Partial<Grievance>): Grievance {
  const db = getDatabase();

  const id = data.id || "tkt_" + Math.random().toString(36).substring(2, 9);
  const year = new Date().getFullYear();
  const ticketNo =
    data.ticketNo ||
    `GRV-${year}-${Date.now().toString(36).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const createdAt = data.createdAt || new Date().toISOString();
  const status = data.status || "pending";
  const priority = data.priority || "medium";
  const isSpam = data.isSpam ? 1 : 0;
  const aiClassification = data.aiClassification
    ? JSON.stringify(data.aiClassification)
    : null;
  const masterCaseId =
    data.masterCaseId !== undefined ? data.masterCaseId : null;
  const locationTag = data.locationTag || null;
  const sourceTimestamp = data.sourceTimestamp || null;
  const embeddingVector = data.embeddingVector
    ? JSON.stringify(data.embeddingVector)
    : null;
  const similarityScore =
    data.similarityScore !== undefined ? data.similarityScore : null;
  const mergedAt = data.mergedAt || null;
  const publicMasterNotes = data.publicMasterNotes || null;
  const assignedDepartmentId =
    data.assignedDepartmentId !== undefined
      ? data.assignedDepartmentId
      : data.assigned_department_id !== undefined
        ? data.assigned_department_id
        : null;

  const stmt = db.prepare(`
    INSERT INTO grievances (
      id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
      hostelBlock, roomNo, category, description, status, priority, isSpam, spamReason,
      aiClassification, createdAt, resolvedAt, adminNotes,
      master_case_id, location_tag, source_timestamp, embedding_vector, similarity_score, merged_at, public_master_notes, assigned_department_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    ticketNo,
    data.studentRegNo || "STUDENT",
    data.studentName || "Student",
    data.studentEmail || "student@college.edu",
    data.studentPhone || null,
    data.studentType || "dayscholar",
    data.hostelBlock || null,
    data.roomNo || null,
    data.category || "Others",
    data.description || "",
    status,
    priority,
    isSpam,
    data.spamReason || null,
    aiClassification,
    createdAt,
    data.resolvedAt || null,
    data.adminNotes || null,
    masterCaseId,
    locationTag,
    sourceTimestamp,
    embeddingVector,
    similarityScore,
    mergedAt,
    publicMasterNotes,
    assignedDepartmentId,
  );

  return getGrievanceById(id)!;
}

export function updateGrievance(
  id: string,
  updates: Partial<Grievance>,
): Grievance | null {
  const db = getDatabase();
  const existing = getGrievanceById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const params: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    params.push(updates.status);
  }
  if (updates.priority !== undefined) {
    fields.push("priority = ?");
    params.push(updates.priority);
  }
  if (updates.resolvedAt !== undefined) {
    fields.push("resolvedAt = ?");
    params.push(updates.resolvedAt);
  }
  if (updates.adminNotes !== undefined) {
    fields.push("adminNotes = ?");
    params.push(updates.adminNotes);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    params.push(updates.category);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    params.push(updates.description);
  }
  if (updates.isSpam !== undefined) {
    fields.push("isSpam = ?");
    params.push(updates.isSpam ? 1 : 0);
  }
  if (updates.spamReason !== undefined) {
    fields.push("spamReason = ?");
    params.push(updates.spamReason);
  }
  if (updates.masterCaseId !== undefined) {
    fields.push("master_case_id = ?");
    params.push(updates.masterCaseId);
  }
  if (updates.locationTag !== undefined) {
    fields.push("location_tag = ?");
    params.push(updates.locationTag);
  }
  if (updates.sourceTimestamp !== undefined) {
    fields.push("source_timestamp = ?");
    params.push(updates.sourceTimestamp);
  }
  if (updates.embeddingVector !== undefined) {
    fields.push("embedding_vector = ?");
    params.push(
      updates.embeddingVector ? JSON.stringify(updates.embeddingVector) : null,
    );
  }
  if (updates.similarityScore !== undefined) {
    fields.push("similarity_score = ?");
    params.push(updates.similarityScore);
  }
  if (updates.mergedAt !== undefined) {
    fields.push("merged_at = ?");
    params.push(updates.mergedAt);
  }
  if (updates.publicMasterNotes !== undefined) {
    fields.push("public_master_notes = ?");
    params.push(updates.publicMasterNotes);
  }
  if (updates.assignedDepartmentId !== undefined) {
    fields.push("assigned_department_id = ?");
    params.push(updates.assignedDepartmentId);
  } else if ((updates as any).assigned_department_id !== undefined) {
    fields.push("assigned_department_id = ?");
    params.push((updates as any).assigned_department_id);
  }

  if (fields.length === 0) return existing;

  params.push(id);
  const sql = `UPDATE grievances SET ${fields.join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...params);

  return getGrievanceById(id);
}

export function withTransaction<T>(fn: () => T): T {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // rollback could fail if already rolled back
    }
    throw err;
  }
}

export function getChildGrievances(masterCaseId: string): Grievance[] {
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT * FROM grievances WHERE master_case_id = ? ORDER BY createdAt ASC",
  );
  const rows = stmt.all(masterCaseId);
  return rows.map(formatGrievanceRow);
}

export function getCandidatesForDeduplication(
  category: string,
  hoursAgo: number = 72,
): Grievance[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM grievances
    WHERE category = ?
      AND status NOT IN ('MERGED_AUTOMATIC', 'resolved')
      AND datetime(createdAt) >= datetime('now', '-' || ? || ' hours')
    ORDER BY createdAt DESC
  `);
  const rows = stmt.all(category, hoursAgo);
  return rows.map(formatGrievanceRow);
}

export function getTriageGrievances(): TriageGrievance[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM grievances
    WHERE status = 'SUSPECTED_DUPLICATE'
    ORDER BY createdAt DESC
  `);
  const rows = stmt.all();
  const list: TriageGrievance[] = [];

  for (const row of rows) {
    const child = formatGrievanceRow(row);
    let candidateMaster: TriageCandidateMaster;

    if (child.masterCaseId) {
      const master = getGrievanceById(child.masterCaseId);
      if (master) {
        candidateMaster = {
          id: master.id,
          ticketNo: master.ticketNo,
          description: master.description,
          studentName: master.studentName,
          status: master.status,
          createdAt: master.createdAt,
          publicMasterNotes: master.publicMasterNotes || '',
        };
      } else {
        candidateMaster = {
          id: child.masterCaseId,
          ticketNo: "UNKNOWN",
          description: "Candidate master ticket",
          studentName: "Unknown",
          status: "pending",
          createdAt: child.createdAt,
          publicMasterNotes: '',
        };
      }
    } else {
      candidateMaster = {
        id: "",
        ticketNo: "N/A",
        description: "No master assigned",
        studentName: "N/A",
        status: "pending",
        createdAt: child.createdAt,
        publicMasterNotes: '',
      };
    }

    list.push({
      id: child.id,
      ticketNo: child.ticketNo,
      category: child.category,
      description: child.description,
      studentName: child.studentName,
      studentRegNo: child.studentRegNo,
      createdAt: child.createdAt,
      similarityScore: child.similarityScore ?? 0,
      candidateMaster,
    });
  }

  return list;
}

// ======================== USER METHODS ========================

export function getUserByRegNo(
  regNo: string,
): (UserProfile & { passwordHash?: string }) | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users WHERE UPPER(regNo) = UPPER(?)");
  const row = stmt.get(regNo.trim());
  return row ? formatUserRow(row) : null;
}

export function getUserByEmail(
  email: string,
): (UserProfile & { passwordHash?: string }) | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)");
  const row = stmt.get(email.trim());
  return row ? formatUserRow(row) : null;
}

export function upsertUser(
  user: Partial<UserProfile> & { password?: string; passwordHash?: string; department_id?: string | null; departmentId?: string | null },
): UserProfile {
  const db = getDatabase();
  const regNo = (user.regNo || user.id || "").trim().toUpperCase();
  const existing = getUserByRegNo(regNo);

  const name = user.name || (existing ? existing.name : "Student");
  const department =
    user.department !== undefined ? user.department : existing?.department;
  const departmentId =
    user.departmentId !== undefined
      ? user.departmentId
      : user.department_id !== undefined
        ? user.department_id
        : (existing as any)?.department_id || null;
  const gender = user.gender || existing?.gender || "Male";
  const studentType = user.studentType || existing?.studentType || "hosteller";
  const phone = user.phone !== undefined ? user.phone : existing?.phone || "";
  const email = (user.email || existing?.email || "").trim().toLowerCase();
  const hostelBlock =
    user.hostelBlock !== undefined ? user.hostelBlock : existing?.hostelBlock;
  const roomNo = user.roomNo !== undefined ? user.roomNo : existing?.roomNo;
  const role = user.role || existing?.role || "student";
  const isEmailVerified =
    user.isEmailVerified !== undefined ? (user.isEmailVerified ? 1 : 0) : 1;
  const passwordHash =
    user.password || user.passwordHash || existing?.passwordHash || "";
  const createdAt =
    user.createdAt || existing?.createdAt || new Date().toISOString();

  if (existing) {
    db.prepare(
      `
      UPDATE users SET
        name = ?, department = ?, gender = ?, studentType = ?, phone = ?, email = ?,
        hostelBlock = ?, roomNo = ?, role = ?, isEmailVerified = ?, passwordHash = ?, department_id = ?
      WHERE UPPER(regNo) = UPPER(?)
    `,
    ).run(
      name,
      department || null,
      gender,
      studentType,
      phone,
      email,
      hostelBlock || null,
      roomNo || null,
      role,
      isEmailVerified,
      passwordHash,
      departmentId,
      regNo,
    );
  } else {
    db.prepare(
      `
      INSERT INTO users (
        id, regNo, name, department, gender, studentType, phone, email, hostelBlock, roomNo, role, isEmailVerified, passwordHash, createdAt, department_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      regNo,
      regNo,
      name,
      department || null,
      gender,
      studentType,
      phone,
      email,
      hostelBlock || null,
      roomNo || null,
      role,
      isEmailVerified,
      passwordHash,
      createdAt,
      departmentId,
    );
  }

  const updated = getUserByRegNo(regNo);
  const { passwordHash: _, ...publicProfile } = updated!;
  return publicProfile as UserProfile;
}

export function verifyUserCredentials(
  identifier: string,
  passwordAttempt: string,
): { success: boolean; user?: UserProfile; error?: string } {
  const clean = identifier.trim();
  let user = getUserByRegNo(clean);
  if (!user) {
    user = getUserByEmail(clean);
  }

  if (!user) {
    return {
      success: false,
      error: "User not found. Please verify your Register Number or Email.",
    };
  }

  if (user.passwordHash && user.passwordHash !== passwordAttempt.trim()) {
    return {
      success: false,
      error: "Invalid password. Please check your credentials.",
    };
  }

  const { passwordHash: _, ...publicProfile } = user;
  return { success: true, user: publicProfile as UserProfile };
}

// ======================== OUTBOX METHODS ========================

export function saveOutboxEmail(emailItem: {
  id: string;
  to?: string;
  recipient?: string;
  subject: string;
  body: string;
  type: string;
  timestamp: string;
}) {
  const db = getDatabase();
  const recipient = emailItem.recipient || emailItem.to || "";
  db.prepare(
    `
    INSERT OR REPLACE INTO outbox (id, recipient, subject, body, type, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    emailItem.id,
    recipient,
    emailItem.subject,
    emailItem.body,
    emailItem.type,
    emailItem.timestamp,
  );
}

export function getOutboxEmails(filterEmail?: string): Array<{
  id: string;
  to: string;
  recipient: string;
  subject: string;
  body: string;
  type: "otp" | "confirmation" | "resolution";
  timestamp: string;
}> {
  const db = getDatabase();
  let rows: any[];
  if (filterEmail) {
    const stmt = db.prepare(
      "SELECT * FROM outbox WHERE LOWER(recipient) = LOWER(?) ORDER BY timestamp DESC",
    );
    rows = stmt.all(filterEmail.trim());
  } else {
    const stmt = db.prepare(
      "SELECT * FROM outbox ORDER BY timestamp DESC LIMIT 50",
    );
    rows = stmt.all();
  }
  return rows.map((r) => ({
    id: r.id,
    to: r.recipient,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    type: r.type as "otp" | "confirmation" | "resolution",
    timestamp: r.timestamp,
  }));
}

// ======================== DEPARTMENT METHODS ========================

function formatDepartmentRow(row: any): Department {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    contactEmail: row.contact_email,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAllDepartments(onlyActive: boolean = true): Department[] {
  const db = getDatabase();
  const query = onlyActive
    ? "SELECT * FROM departments WHERE is_active = 1 ORDER BY name ASC"
    : "SELECT * FROM departments ORDER BY name ASC";
  const rows = db.prepare(query).all() as any[];
  return rows.map(formatDepartmentRow);
}

export function getDepartmentById(id: string): Department | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM departments WHERE id = ? OR LOWER(code) = LOWER(?)");
  const row = stmt.get(id, id) as any;
  return row ? formatDepartmentRow(row) : null;
}

export function getDepartmentByCode(code: string): Department | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM departments WHERE UPPER(code) = UPPER(?)");
  const row = stmt.get(code.trim().toUpperCase()) as any;
  return row ? formatDepartmentRow(row) : null;
}

export function createDepartment(data: {
  id?: string;
  name: string;
  code: string;
  contactEmail: string;
  isActive?: boolean;
}): Department {
  const db = getDatabase();
  const id = data.id || `dept_${data.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const now = new Date().toISOString();
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1;

  const stmt = db.prepare(`
    INSERT INTO departments (id, name, code, contact_email, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.name.trim(), data.code.trim().toUpperCase(), data.contactEmail.trim(), isActive, now, now);
  return getDepartmentById(id)!;
}

export function updateDepartment(
  id: string,
  updates: Partial<{ name: string; code: string; contactEmail: string; isActive: boolean }>
): Department | null {
  const db = getDatabase();
  const existing = getDepartmentById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const params: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    params.push(updates.name.trim());
  }
  if (updates.code !== undefined) {
    fields.push("code = ?");
    params.push(updates.code.trim().toUpperCase());
  }
  if (updates.contactEmail !== undefined) {
    fields.push("contact_email = ?");
    params.push(updates.contactEmail.trim());
  }
  if (updates.isActive !== undefined) {
    fields.push("is_active = ?");
    params.push(updates.isActive ? 1 : 0);
  }

  fields.push("updated_at = ?");
  params.push(new Date().toISOString());

  params.push(existing.id);
  db.prepare(`UPDATE departments SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return getDepartmentById(existing.id);
}

export function getGrievancesByDepartment(departmentId: string): Grievance[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM grievances WHERE assigned_department_id = ? ORDER BY createdAt DESC");
  const rows = stmt.all(departmentId);
  return rows.map(formatGrievanceRow);
}

// ======================== CATEGORY ROUTING METHODS ========================

export function resolveDepartmentForCategory(category: string, locationTag?: string | null): string {
  const db = getDatabase();

  // 1. If locationTag matches a routing rule's location_tag_pattern
  if (locationTag && locationTag.trim() !== '') {
    const locStmt = db.prepare(`
      SELECT department_id FROM category_routing_rules
      WHERE is_active = 1
        AND location_tag_pattern IS NOT NULL
        AND LOWER(?) LIKE '%' || LOWER(location_tag_pattern) || '%'
      ORDER BY priority_order ASC
      LIMIT 1
    `);
    const locRow = locStmt.get(locationTag.trim()) as { department_id: string } | undefined;
    if (locRow && locRow.department_id) {
      return locRow.department_id;
    }
  }

  // 2. Match exact category
  const stmt = db.prepare(`
    SELECT department_id FROM category_routing_rules
    WHERE LOWER(category) = LOWER(?) AND is_active = 1
    ORDER BY priority_order ASC
    LIMIT 1
  `);
  const row = stmt.get(category.trim()) as { department_id: string } | undefined;
  if (row && row.department_id) {
    return row.department_id;
  }

  // 3. Fallback pattern matching
  const catLower = category.toLowerCase();
  if (catLower.includes('wi-fi') || catLower.includes('internet') || catLower.includes('network')) {
    return 'dept-network-ops';
  }
  if (catLower.includes('bus') || catLower.includes('transport')) {
    return 'dept-campus-transport';
  }
  if (catLower.includes('plumb') || catLower.includes('water') || catLower.includes('mess') || catLower.includes('food') || catLower.includes('hostel')) {
    return 'dept-hostel-admin';
  }
  if (catLower.includes('clean') || catLower.includes('facility') || catLower.includes('ac') || catLower.includes('repair') || catLower.includes('canteen')) {
    return 'dept-facilities';
  }
  if (catLower.includes('ragging') || catLower.includes('academic') || catLower.includes('class') || catLower.includes('lab') || catLower.includes('fee')) {
    return 'dept-academic-affairs';
  }

  return 'dept-hostel-admin';
}

export function getAllRoutingRules(): CategoryRoutingRule[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM category_routing_rules ORDER BY priority_order ASC, category ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    departmentId: r.department_id,
    locationTagPattern: r.location_tag_pattern || undefined,
    priorityOrder: r.priority_order !== null && r.priority_order !== undefined ? Number(r.priority_order) : 0,
    priorityOverride: r.priority_override || undefined,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getRoutingRuleById(id: string): CategoryRoutingRule | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM category_routing_rules WHERE id = ?").get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    departmentId: row.department_id,
    locationTagPattern: row.location_tag_pattern || undefined,
    priorityOrder: row.priority_order !== null && row.priority_order !== undefined ? Number(row.priority_order) : 0,
    priorityOverride: row.priority_override || undefined,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createRoutingRule(data: {
  category: string;
  departmentId: string;
  locationTagPattern?: string | null;
  priorityOrder?: number;
  priorityOverride?: PriorityLevel | null;
  isActive?: boolean;
}): CategoryRoutingRule {
  const db = getDatabase();
  const id = "rule_" + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1;
  const priorityOrder = data.priorityOrder !== undefined ? data.priorityOrder : 0;

  db.prepare(`
    INSERT INTO category_routing_rules (id, category, department_id, priority_override, location_tag_pattern, priority_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(category) DO UPDATE SET
      department_id = excluded.department_id,
      priority_override = excluded.priority_override,
      location_tag_pattern = excluded.location_tag_pattern,
      priority_order = excluded.priority_order,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).run(
    id,
    data.category.trim(),
    data.departmentId.trim(),
    data.priorityOverride || null,
    data.locationTagPattern || null,
    priorityOrder,
    isActive,
    now,
    now
  );

  return getRoutingRuleById(id) || {
    id,
    category: data.category.trim(),
    departmentId: data.departmentId.trim(),
    locationTagPattern: data.locationTagPattern || undefined,
    priorityOrder,
    priorityOverride: (data.priorityOverride as PriorityLevel) || undefined,
    isActive: Boolean(isActive),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateRoutingRule(
  id: string,
  updates: Partial<{
    category: string;
    departmentId: string;
    locationTagPattern: string | null;
    priorityOrder: number;
    priorityOverride: PriorityLevel | null;
    isActive: boolean;
  }>
): CategoryRoutingRule | null {
  const db = getDatabase();
  const existing = getRoutingRuleById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const params: any[] = [];

  if (updates.category !== undefined) {
    fields.push("category = ?");
    params.push(updates.category.trim());
  }
  if (updates.departmentId !== undefined) {
    fields.push("department_id = ?");
    params.push(updates.departmentId.trim());
  }
  if (updates.locationTagPattern !== undefined) {
    fields.push("location_tag_pattern = ?");
    params.push(updates.locationTagPattern);
  }
  if (updates.priorityOrder !== undefined) {
    fields.push("priority_order = ?");
    params.push(updates.priorityOrder);
  }
  if (updates.priorityOverride !== undefined) {
    fields.push("priority_override = ?");
    params.push(updates.priorityOverride);
  }
  if (updates.isActive !== undefined) {
    fields.push("is_active = ?");
    params.push(updates.isActive ? 1 : 0);
  }

  fields.push("updated_at = ?");
  params.push(new Date().toISOString());

  params.push(id);
  db.prepare(`UPDATE category_routing_rules SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return getRoutingRuleById(id);
}

export function deleteRoutingRule(id: string): boolean {
  const db = getDatabase();
  const res = db.prepare("DELETE FROM category_routing_rules WHERE id = ?").run(id);
  return res.changes > 0;
}

// ======================== AUDIT LOG METHODS ========================

export function recordAuditLog(entry: {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorEmail?: string;
  actorRole: string;
  previousState?: string | null;
  newState?: string | null;
  reason?: string | null;
}): AuditLogEntry {
  const db = getDatabase();
  const id = "aud_" + Math.random().toString(36).substring(2, 10);
  const now = new Date().toISOString();
  const email = entry.actorEmail || "";

  db.prepare(`
    INSERT INTO audit_logs (id, entity_type, entity_id, action, actor_id, actor_email, actor_role, previous_state, new_state, reason, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.entityType,
    entry.entityId,
    entry.action,
    entry.actorId,
    email,
    entry.actorRole,
    entry.previousState || null,
    entry.newState || null,
    entry.reason || null,
    now,
    now
  );

  return {
    id,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actorId: entry.actorId,
    actorEmail: email,
    actorRole: entry.actorRole,
    action: entry.action,
    previousState: entry.previousState || null,
    newState: entry.newState || null,
    reason: entry.reason || null,
    timestamp: now,
    createdAt: now,
  };
}

export function getAuditLogs(filter?: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
}): AuditLogEntry[] {
  const db = getDatabase();
  let query = "SELECT * FROM audit_logs";
  const conditions: string[] = [];
  const params: any[] = [];

  if (filter?.entityType) {
    conditions.push("entity_type = ?");
    params.push(filter.entityType);
  }
  if (filter?.entityId) {
    conditions.push("entity_id = ?");
    params.push(filter.entityId);
  }
  if (filter?.actorId) {
    conditions.push("actor_id = ?");
    params.push(filter.actorId);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY rowid DESC LIMIT 100";
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    actorRole: r.actor_role,
    action: r.action,
    previousState: r.previous_state || null,
    newState: r.new_state || null,
    reason: r.reason || null,
    timestamp: r.timestamp || r.created_at,
    createdAt: r.created_at || r.timestamp,
  }));
}

// ======================== USER DEPARTMENT PROVISIONING ========================

export function updateUserDepartment(
  identifier: string,
  departmentId: string | null,
  role?: UserRole
): UserProfile | null {
  const db = getDatabase();
  const clean = identifier.trim();
  let user = getUserByRegNo(clean) || getUserByEmail(clean);
  if (!user) {
    const byId = db.prepare("SELECT * FROM users WHERE id = ?").get(clean) as any;
    if (byId) {
      user = {
        id: byId.id,
        regNo: byId.regNo,
        name: byId.name,
        email: byId.email,
        studentType: byId.studentType,
        gender: byId.gender || 'Male',
        phone: byId.phone || '',
        role: byId.role,
        isEmailVerified: Boolean(byId.isEmailVerified),
        createdAt: byId.createdAt,
        department_id: byId.department_id,
        departmentId: byId.department_id,
      };
    }
  }
  if (!user) return null;

  const newRole = role || user.role;
  db.prepare(`
    UPDATE users SET
      department_id = ?,
      role = ?
    WHERE id = ?
  `).run(departmentId, newRole, user.id);

  const updated = getUserByRegNo(user.regNo);
  if (!updated) return null;
  const { passwordHash: _, ...publicProfile } = updated;
  return publicProfile as UserProfile;
}
