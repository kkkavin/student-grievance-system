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
  // 1. Create Users Table
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
      createdAt TEXT NOT NULL
    );
  `);

  // 2. Create Grievances Table
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
      public_master_notes TEXT NULL
    );
  `);

  // Dynamic migration checks for existing databases
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
  `);

  // 3. Create Outbox / Notifications Table
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

  // 4. Seed initial default users if not present
  const userCountStmt = db.prepare("SELECT COUNT(*) as count FROM users");
  const userCount = (userCountStmt.get() as { count: number }).count;

  if (userCount === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (
        id, regNo, name, department, gender, studentType, phone, email, hostelBlock, roomNo, role, isEmailVerified, passwordHash, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Default sample student
    insertUser.run(
      "STU123",
      "STU123",
      "Rahul Sharma",
      "CSE (Computer Science & Engineering)",
      "Male",
      "hosteller",
      "9876543210",
      "rahul.cs23@college.edu",
      "Block A (Boys Hostel)",
      "A-304",
      "student",
      1,
      "student123",
      new Date().toISOString(),
    );

    // Default admin account (configurable via ADMIN_EMAIL and ADMIN_PASSWORD environment variables)
    const adminEmail = process.env.ADMIN_EMAIL || "admin.grievance@college.edu";
    const adminPassword = process.env.ADMIN_PASSWORD || "adminpass123";
    insertUser.run(
      "admin-001",
      "ADMIN-CELL",
      "Chief Proctor & Warden Admin",
      "Administration",
      "Other",
      "hosteller",
      "080-28904100",
      adminEmail,
      null,
      null,
      "admin",
      1,
      adminPassword,
      new Date().toISOString(),
    );
  }

  // 5. Seed initial grievances if not present
  const grievanceCountStmt = db.prepare(
    "SELECT COUNT(*) as count FROM grievances",
  );
  const grievanceCount = (grievanceCountStmt.get() as { count: number }).count;

  if (grievanceCount === 0) {
    const insertGrievance = db.prepare(`
      INSERT INTO grievances (
        id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
        hostelBlock, roomNo, category, description, status, priority, isSpam, spamReason,
        aiClassification, createdAt, resolvedAt, adminNotes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const g of INITIAL_GRIEVANCES) {
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
      );
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
  };
}

// Format SQLite row to UserProfile interface
function formatUserRow(row: any): UserProfile & { passwordHash?: string } {
  return {
    id: row.id,
    regNo: row.regNo,
    name: row.name,
    department: row.department || undefined,
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

  const stmt = db.prepare(`
    INSERT INTO grievances (
      id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
      hostelBlock, roomNo, category, description, status, priority, isSpam, spamReason,
      aiClassification, createdAt, resolvedAt, adminNotes,
      master_case_id, location_tag, source_timestamp, embedding_vector, similarity_score, merged_at, public_master_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  user: Partial<UserProfile> & { password?: string; passwordHash?: string },
): UserProfile {
  const db = getDatabase();
  const regNo = (user.regNo || user.id || "").trim().toUpperCase();
  const existing = getUserByRegNo(regNo);

  const name = user.name || (existing ? existing.name : "Student");
  const department =
    user.department !== undefined ? user.department : existing?.department;
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
        hostelBlock = ?, roomNo = ?, role = ?, isEmailVerified = ?, passwordHash = ?
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
      regNo,
    );
  } else {
    db.prepare(
      `
      INSERT INTO users (
        id, regNo, name, department, gender, studentType, phone, email, hostelBlock, roomNo, role, isEmailVerified, passwordHash, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  to: string;
  subject: string;
  body: string;
  type: string;
  timestamp: string;
}) {
  const db = getDatabase();
  db.prepare(
    `
    INSERT OR REPLACE INTO outbox (id, recipient, subject, body, type, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    emailItem.id,
    emailItem.to,
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
