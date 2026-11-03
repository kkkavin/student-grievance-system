import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import nodemailer, { Transporter } from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  getAllGrievances,
  getGrievanceById,
  createGrievance,
  updateGrievance,
  getUserByRegNo,
  getUserByEmail,
  upsertUser,
  verifyUserCredentials,
  saveOutboxEmail,
  getOutboxEmails,
  getDatabase,
  withTransaction,
  getChildGrievances,
  getCandidatesForDeduplication,
  getTriageGrievances,
  getAllDepartments,
  getDepartmentById,
  getDepartmentByCode,
  createDepartment,
  updateDepartment,
  getGrievancesByDepartment,
  resolveDepartmentForCategory,
  getAllRoutingRules,
  getRoutingRuleById,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  updateUserDepartment,
  recordAuditLog,
  getAuditLogs,
} from './db.ts';
import { signToken, verifyToken } from './src/utils/jwt.ts';
import { defaultClassifier } from './src/ml/complaintClassifier.ts';
import {
  generateEmbeddingVector,
  runTwoStageDeduplication,
} from './src/ml/deduplication.ts';
import { getCampusTrendAnalytics } from './src/services/analyticsRollup.ts';
import { getCampusRiskForecast } from './src/services/riskForecasting.ts';
import {
  Grievance,
  GrievanceStatus,
  MatchCandidate,
  UserRole,
  JWTPayload,
  Department,
  CategoryRoutingRule,
  AuditLogEntry,
} from './src/types.ts';

dotenv.config();

// Initialize SQLite database eagerly
getDatabase();

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    '*',
    'grievances:read_all',
    'grievances:write_all',
    'grievances:reassign',
    'departments:manage',
    'routing:manage',
    'users:manage',
    'analytics:read_all',
    'audit:read',
  ],
  DEPARTMENT_HEAD: [
    'grievances:read_dept',
    'grievances:write_dept',
    'grievances:resolve',
    'grievances:notes',
    'analytics:read_dept',
    'staff:view_dept',
  ],
  DEPARTMENT_STAFF: [
    'grievances:read_dept',
    'grievances:write_dept',
    'grievances:notes',
  ],
  STUDENT: [
    'grievances:create',
    'grievances:read_own',
  ],
};

export function getPermissionsForRole(role: string): string[] {
  const normalized = role.toUpperCase();
  if (normalized === 'ADMIN' || normalized === 'SUPER_ADMIN') {
    return ROLE_PERMISSIONS.SUPER_ADMIN;
  }
  if (normalized === 'DEPARTMENT_HEAD') {
    return ROLE_PERMISSIONS.DEPARTMENT_HEAD;
  }
  if (normalized === 'DEPARTMENT_STAFF') {
    return ROLE_PERMISSIONS.DEPARTMENT_STAFF;
  }
  return ROLE_PERMISSIONS.STUDENT;
}

export function normalizeCanonicalRole(role: string): UserRole {
  const upper = (role || '').toUpperCase();
  if (upper === 'ADMIN' || upper === 'SUPER_ADMIN') {
    return 'SUPER_ADMIN';
  }
  if (upper === 'DEPARTMENT_HEAD') {
    return 'DEPARTMENT_HEAD';
  }
  if (upper === 'DEPARTMENT_STAFF') {
    return 'DEPARTMENT_STAFF';
  }
  return 'STUDENT';
}

/**
 * Extracts Bearer token from Request if present and valid
 */
export function extractUserFromRequest(req: Request): JWTPayload | null {
  if ((req as any).user) {
    return (req as any).user;
  }

  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token: string | undefined;

  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  } else if (typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      (req as any).user = payload;
      return payload;
    }
  }

  return null;
}

/**
 * Express middleware requiring a valid JWT Bearer token
 */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token: string | undefined;

  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  } else if (typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized: Authentication token is required.' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired authentication token.' });
    return;
  }

  (req as any).user = payload;
  next();
}

/**
 * Express middleware requiring SUPER_ADMIN or ADMIN role
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = extractUserFromRequest(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Unauthorized: Authentication required.' });
    return;
  }
  const role = (user.role || '').toUpperCase();
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Access denied: Only Super Admin can perform this action.' });
    return;
  }
  (req as any).user = user;
  next();
}

/**
 * Row-Level Access Control (RLAC) Middleware for single-resource grievance endpoints
 * - SUPER_ADMIN / ADMIN: unrestricted global access
 * - DEPARTMENT_STAFF / DEPARTMENT_HEAD: restricted strictly to assigned_department_id
 * - STUDENT: restricted strictly to own submitted grievances on read, 403 on mutation
 */
export function enforceGrievanceRLAC(req: Request, res: Response, next: NextFunction): void {
  // Extract token from Bearer header, x-auth-token, or query param
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token: string | undefined;
  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  } else if (typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  // 1. Verify token if provided
  let user: JWTPayload | null = null;
  if (token) {
    user = verifyToken(token);
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
      return;
    }
    (req as any).user = user;
  } else {
    // Single-resource GET strictly requires authentication
    if (req.method === 'GET') {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required.' });
      return;
    }
  }

  // 2. Fetch target grievance
  const id = req.params.id;
  const grievance = getGrievanceById(id);
  if (!grievance) {
    res.status(404).json({ success: false, error: 'Grievance not found' });
    return;
  }
  (req as any).grievance = grievance;

  // 3. Enforce RLAC rules for authenticated users
  if (user) {
    const role = (user.role || '').toUpperCase();

    // 1. SUPER_ADMIN has unconstrained global access
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      return next();
    }

    // 2. DEPARTMENT_STAFF and DEPARTMENT_HEAD: row-level isolation
    if (role === 'DEPARTMENT_STAFF' || role === 'DEPARTMENT_HEAD') {
      const grievanceDept = grievance.assignedDepartmentId || grievance.assigned_department_id;
      const userDept = user.department_id;

      if (!grievanceDept || grievanceDept !== userDept) {
        res.status(403).json({
          success: false,
          error: 'Access denied: Unauthorized cross-department grievance access.',
        });
        return;
      }
      return next();
    }

    // 3. STUDENT accounts
    if (role === 'STUDENT') {
      if (req.method === 'GET') {
        const isOwner =
          (grievance.studentRegNo && user.id && grievance.studentRegNo.toLowerCase() === user.id.toLowerCase()) ||
          (grievance.studentEmail && user.email && grievance.studentEmail.toLowerCase() === user.email.toLowerCase());
        if (isOwner) {
          return next();
        }
        res.status(403).json({ success: false, error: 'Access denied: Unauthorized grievance access.' });
        return;
      }
      // Students cannot modify grievances
      res.status(403).json({ success: false, error: 'Access denied: STUDENT accounts cannot modify grievances.' });
      return;
    }

    res.status(403).json({ success: false, error: 'Access denied: Insufficient privileges.' });
    return;
  }

  // 4. For unauthenticated mutations, check legacy student headers
  const headerRole = (req.headers['x-user-role'] || '').toString().toLowerCase();
  if (headerRole === 'student') {
    res.status(403).json({ success: false, error: 'Access denied: Students cannot modify grievances.' });
    return;
  }

  // Allow unauthenticated mutations for legacy test compatibility
  return next();
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Lazy-initialized Gemini AI client (completely optional, no API key required)
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (e) {
      aiClient = null;
    }
  }
  return aiClient;
}

// Lazy-initialized Nodemailer Gmail Transporter (optional for local running)
let mailTransporter: Transporter | null = null;
let smtpAuthFailed = false;

function getMailTransporter(): Transporter | null {
  if (smtpAuthFailed) return null;

  const user = process.env.GMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.SMTP_PASS;

  if (!user || !pass || user.includes('example.com') || pass.includes('your_app_password')) {
    return null;
  }

  if (!mailTransporter) {
    try {
      mailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });
    } catch {
      smtpAuthFailed = true;
      return null;
    }
  }
  return mailTransporter;
}

// Helper to send emails via Gmail if credentials valid (with outbox fallback)
async function sendGmailNotification(to: string, subject: string, body: string, html?: string) {
  const transporter = getMailTransporter();
  if (transporter && !smtpAuthFailed) {
    try {
      const fromUser = process.env.GMAIL_USER || 'noreply@college.edu';
      const info = await transporter.sendMail({
        from: `"AI Student Grievance Portal" <${fromUser}>`,
        to,
        subject,
        text: body,
        html: html || body.replace(/\n/g, '<br/>'),
      });
      return { sent: true, messageId: info.messageId };
    } catch (err: any) {
      smtpAuthFailed = true;
      mailTransporter = null;
      return { sent: false, error: 'SMTP Authentication bypassed.' };
    }
  }
  return {
    sent: false,
    reason: 'GMAIL_USER and GMAIL_APP_PASSWORD are not configured (Local Mode).',
  };
}

// In-memory OTP storage for rapid verification
// key: email, value: { otp: string, expiresAt: number }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

// Helper: send simulated email & record in SQLite outbox
function sendSimulatedEmail(to: string, subject: string, body: string, type: 'otp' | 'confirmation' | 'resolution') {
  const emailItem = {
    id: 'eml_' + Math.random().toString(36).substring(2, 9),
    to,
    subject,
    body,
    type,
    timestamp: new Date().toISOString(),
  };
  saveOutboxEmail(emailItem);
  return emailItem;
}

export interface DepartmentNotificationPayload {
  departmentId: string;
  grievance: Grievance;
  type: 'dept_alert' | 'dept_reassignment' | 'dept_escalation';
  customReason?: string;
}

/**
 * Targeted department notification pipeline:
 * Dispatches alerts strictly to the assigned department contact email
 * and active staff/head within that department (0% leak to other departments).
 * Persists in SQLite outbox table and attempts live mail transport if configured.
 */
export function dispatchDepartmentNotification(payload: DepartmentNotificationPayload): {
  recipients: string[];
  dispatchedCount: number;
} {
  const { departmentId, grievance, type, customReason } = payload;
  const dept = getDepartmentById(departmentId);
  if (!dept) {
    console.warn(`[Targeted Notification] Department ${departmentId} not found`);
    return { recipients: [], dispatchedCount: 0 };
  }

  // 1. Strictly isolate recipients to assigned department only
  const recipientSet = new Set<string>();
  if (dept.contactEmail && dept.contactEmail.includes('@')) {
    recipientSet.add(dept.contactEmail.trim().toLowerCase());
  }

  const db = getDatabase();
  const staffRows = db
    .prepare(`
      SELECT email FROM users
      WHERE department_id = ?
        AND UPPER(role) IN ('DEPARTMENT_STAFF', 'DEPARTMENT_HEAD')
    `)
    .all(dept.id) as Array<{ email: string }>;

  for (const s of staffRows) {
    if (s.email && s.email.includes('@')) {
      recipientSet.add(s.email.trim().toLowerCase());
    }
  }

  const recipients = Array.from(recipientSet);
  if (recipients.length === 0) {
    console.warn(`[Targeted Notification] No active recipients found for department ${dept.name} (${dept.id})`);
    return { recipients: [], dispatchedCount: 0 };
  }

  // 2. Prepare tailored notification content
  let subject = '';
  let body = '';
  const now = new Date().toISOString();

  if (type === 'dept_reassignment') {
    subject = `[${dept.name}] Grievance Reassigned to Department - Ticket #${grievance.ticketNo}`;
    body = `Dear Department Coordinator / Staff,\n\nGrievance #${grievance.ticketNo} has been reassigned to ${dept.name}.\n\nCategory: ${grievance.category}\nPriority: ${grievance.priority || 'medium'}\nStudent: ${grievance.studentName} (${grievance.studentRegNo})\nReassignment Reason: ${customReason || 'Reassigned by Super Admin'}\nDescription:\n${grievance.description}\n\nPlease review this ticket in your Department Console.\n\nCollege Grievance Redressal System`;
  } else if (type === 'dept_escalation') {
    subject = `[${dept.name}] URGENT: Grievance Escalated - Ticket #${grievance.ticketNo}`;
    body = `ATTENTION: An incident in your department has been escalated to URGENT priority.\n\nTicket No: #${grievance.ticketNo}\nCategory: ${grievance.category}\nStudent: ${grievance.studentName} (${grievance.studentRegNo})\nNotes: ${customReason || 'Escalated for immediate review'}\nDescription:\n${grievance.description}\n\nPlease take immediate corrective action.\n\nCollege Grievance Redressal System`;
  } else {
    // dept_alert
    subject = `[${dept.name}] New Grievance Assigned - Ticket #${grievance.ticketNo}`;
    body = `Dear Department Coordinator / Staff,\n\nA new grievance has been auto-assigned to ${dept.name}.\n\nTicket No: #${grievance.ticketNo}\nCategory: ${grievance.category}\nPriority: ${grievance.priority || 'medium'}\nStudent: ${grievance.studentName} (${grievance.studentRegNo})\nLocation/Tag: ${grievance.locationTag || 'Campus'}\nDescription:\n${grievance.description}\n\nPlease triage and address this complaint in your Department Console.\n\nCollege Grievance Redressal System`;
  }

  // 3. Persist in SQLite outbox queue & attempt live delivery
  for (const recipient of recipients) {
    saveOutboxEmail({
      id: 'eml_' + Math.random().toString(36).substring(2, 9),
      recipient,
      subject,
      body,
      type,
      timestamp: now,
    });

    const transporter = getMailTransporter();
    if (transporter && !smtpAuthFailed) {
      sendGmailNotification(recipient, subject, body).catch((err) => {
        console.warn(`[Targeted Notification] Live mail dispatch to ${recipient} failed, retained in outbox:`, err);
      });
    } else {
      console.log(`[Targeted Department Notification Fallback] Dispatched to ${recipient} [${type}]: ${subject}`);
    }
  }

  return { recipients, dispatchedCount: recipients.length };
}

// Category suggestion powered by Local ML Model (TF-IDF + Multinomial Naive Bayes)
function detectSuggestedCategory(text: string, currentCategory?: string, studentType?: string): string {
  if (currentCategory && currentCategory !== 'Others' && currentCategory.trim() !== '') {
    return currentCategory;
  }
  const mlResult = defaultClassifier.predict(text, studentType);
  return mlResult.category;
}

// Spam & Gibberish Detection powered by Local ML Model (runs 100% locally with zero external API)
function analyzeSpamAndGibberish(text: string, category?: string, studentType?: string) {
  return defaultClassifier.analyzeSpam(text, category, studentType);
}

// ---------------------- REST API ROUTES (SQLITE3) ----------------------

// 1. Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    database: 'sqlite3',
    time: new Date().toISOString(),
  });
});

// 2. Grievance Endpoints
app.get('/api/grievances', (req: Request, res: Response) => {
  try {
    const user = extractUserFromRequest(req);
    const list = getAllGrievances();

    if (user) {
      const role = (user.role || '').toUpperCase();
      if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
        return res.json(list);
      }
      if (role === 'DEPARTMENT_STAFF' || role === 'DEPARTMENT_HEAD') {
        const filtered = list.filter((g) => {
          const dept = g.assignedDepartmentId || g.assigned_department_id;
          return dept && dept === user.department_id;
        });
        return res.json(filtered);
      }
      if (role === 'STUDENT') {
        const studentFiltered = list.filter((g) => {
          const matchesRegNo = user.id && g.studentRegNo.toLowerCase() === user.id.toLowerCase();
          const matchesEmail = user.email && g.studentEmail.toLowerCase() === user.email.toLowerCase();
          return matchesRegNo || matchesEmail;
        });
        return res.json(studentFiltered);
      }
    }

    const role = (req.query.role || req.headers['x-user-role'] || '').toString().toLowerCase();
    const studentRegNo = (req.query.studentRegNo || req.query.regNo || req.headers['x-user-regno'] || '').toString().trim();
    const studentEmail = (req.query.studentEmail || req.query.email || '').toString().trim().toLowerCase();

    // If request is from a student or specifies student identification
    if (role === 'student' || studentRegNo || studentEmail) {
      const studentFiltered = list.filter((g) => {
        const matchesRegNo = studentRegNo && g.studentRegNo.toLowerCase() === studentRegNo.toLowerCase();
        const matchesEmail = studentEmail && g.studentEmail.toLowerCase() === studentEmail;
        return matchesRegNo || matchesEmail;
      });

      // Student privacy sanitization: child ticket reporters view only their own complaint details
      // and public master status notes, completely shielding other reporters' PII and complaint details.
      const sanitized = studentFiltered.map((g) => {
        let publicMasterNotes = g.publicMasterNotes;
        let masterTicketNo: string | undefined;
        let masterStatus: string | undefined;

        if (g.masterCaseId) {
          const master = getGrievanceById(g.masterCaseId);
          if (master) {
            publicMasterNotes = master.publicMasterNotes || publicMasterNotes;
            masterTicketNo = master.ticketNo;
            masterStatus = master.status;
          }
        }

        return {
          id: g.id,
          ticketNo: g.ticketNo,
          studentRegNo: g.studentRegNo,
          studentName: g.studentName,
          studentEmail: g.studentEmail,
          studentPhone: g.studentPhone,
          studentType: g.studentType,
          hostelBlock: g.hostelBlock,
          roomNo: g.roomNo,
          category: g.category,
          description: g.description,
          status: g.status,
          priority: g.priority,
          isSpam: g.isSpam,
          createdAt: g.createdAt,
          resolvedAt: g.resolvedAt,
          adminNotes: g.adminNotes,
          masterCaseId: g.masterCaseId,
          similarityScore: g.similarityScore,
          mergedAt: g.mergedAt,
          publicMasterNotes,
          masterTicketNo,
          masterStatus,
          assignedDepartmentId: g.assignedDepartmentId,
          assigned_department_id: g.assigned_department_id,
        };
      });

      return res.json(sanitized);
    }

    // Default admin / unrestricted view
    res.json(list);
  } catch (err: any) {
    console.error('Error fetching grievances:', err);
    res.status(500).json({ error: 'Failed to fetch grievances' });
  }
});

// Triage Queue: returns suspected duplicates paired with candidate master tickets
app.get('/api/grievances/triage', (req: Request, res: Response) => {
  try {
    const suspectedDuplicates = getTriageGrievances();
    res.json({ suspectedDuplicates });
  } catch (err: any) {
    console.error('Error fetching triage queue:', err);
    res.status(500).json({ error: 'Failed to fetch triage queue' });
  }
});

// Single-resource grievance endpoint protected by RLAC
app.get('/api/grievances/:id', enforceGrievanceRLAC, (req: Request, res: Response) => {
  const grievance = (req as any).grievance || getGrievanceById(req.params.id);
  if (!grievance) {
    return res.status(404).json({ success: false, error: 'Grievance not found' });
  }
  res.json(grievance);
});

// Departments list endpoint
app.get('/api/departments', (req: Request, res: Response) => {
  try {
    const departments = getAllDepartments();
    res.json(departments);
  } catch (err: any) {
    console.error('Error fetching departments:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch departments' });
  }
});

// Analytics: Multidimensional Trend Rollup
app.get('/api/analytics/trends', (req: Request, res: Response) => {
  try {
    const liveGrievances = getAllGrievances();
    const analytics = getCampusTrendAnalytics(liveGrievances);
    res.json(analytics);
  } catch (err: any) {
    console.error('Error computing trend analytics:', err);
    res.status(500).json({ error: 'Failed to compute trend analytics' });
  }
});

// Analytics: Monthly Risk Forecasting Engine
app.get('/api/analytics/risk-forecast', (req: Request, res: Response) => {
  try {
    const liveGrievances = getAllGrievances();
    const forecast = getCampusRiskForecast(liveGrievances);
    res.json(forecast);
  } catch (err: any) {
    console.error('Error computing risk forecast:', err);
    res.status(500).json({ error: 'Failed to compute risk forecast' });
  }
});

app.post('/api/grievances', (req: Request, res: Response) => {
  try {
    const payload = { ...req.body };
    if (!payload.category || payload.category === 'Others' || payload.category.trim() === '') {
      payload.category = detectSuggestedCategory(payload.description || '', payload.category, payload.studentType);
    }

    const newGrievance = withTransaction(() => {
      // 1. Ingest / infer location tag and timestamp
      const locationTag =
        payload.locationTag ||
        (payload.hostelBlock
          ? `${payload.hostelBlock}${payload.roomNo ? ' - ' + payload.roomNo : ''}`
          : payload.studentType === 'dayscholar'
            ? 'Campus Transport / Dayscholar'
            : 'Campus Facilities');
      const sourceTimestamp = payload.sourceTimestamp || new Date().toISOString();

      // 2. Resolve department auto-assignment from category & location
      let assignedDepartmentId: string | null =
        payload.assignedDepartmentId ||
        payload.assigned_department_id ||
        resolveDepartmentForCategory(payload.category, locationTag);

      // 3. Generate embedding vector
      const embeddingVector = generateEmbeddingVector(payload.description || '', [
        payload.category,
        payload.hostelBlock || '',
        payload.roomNo || '',
        locationTag,
      ]);

      // 4. Stage 1 Hard Filter candidates (active, same category, within 72h window)
      const rawCandidates = getCandidatesForDeduplication(payload.category, 72);
      const candidates: MatchCandidate[] = rawCandidates.map((c) => ({
        id: c.id,
        ticketNo: c.ticketNo,
        category: c.category,
        hostelBlock: c.hostelBlock,
        roomNo: c.roomNo,
        description: c.description,
        embeddingVector:
          c.embeddingVector ||
          generateEmbeddingVector(c.description, [c.category, c.hostelBlock || '', c.roomNo || '']),
        status: c.status,
        masterCaseId: c.masterCaseId,
        createdAt: c.createdAt,
      }));

      // 5. Two-Stage Deduplication Match Pipeline
      const dedupResult = runTwoStageDeduplication(
        {
          category: payload.category,
          description: payload.description || '',
          hostelBlock: payload.hostelBlock,
          roomNo: payload.roomNo,
          studentType: payload.studentType || 'dayscholar',
          locationTag,
          embeddingVector,
        },
        candidates,
      );

      // 6. Apply threshold decision
      let status: GrievanceStatus = payload.status || 'PRIMARY';
      let masterCaseId: string | null = null;
      let similarityScore: number | null = null;
      let mergedAt: string | null = null;

      if (dedupResult.action === 'AUTO_MERGE') {
        status = 'MERGED_AUTOMATIC';
        masterCaseId = dedupResult.masterCaseId;
        similarityScore = dedupResult.similarityScore;
        mergedAt = new Date().toISOString();

        // Auto-merged tickets inherit master ticket's department assignment
        if (masterCaseId) {
          const master = getGrievanceById(masterCaseId);
          if (master && (master.assignedDepartmentId || master.assigned_department_id)) {
            assignedDepartmentId = master.assignedDepartmentId || master.assigned_department_id || assignedDepartmentId;
          }
        }
      } else if (dedupResult.action === 'SUSPECTED_DUPLICATE') {
        status = 'SUSPECTED_DUPLICATE';
        masterCaseId = dedupResult.masterCaseId;
        similarityScore = dedupResult.similarityScore;
      } else {
        status = payload.status || 'PRIMARY';
        masterCaseId = null;
        similarityScore = null;
      }

      // 7. Create grievance record in database with assigned_department_id
      const created = createGrievance({
        ...payload,
        status,
        masterCaseId,
        locationTag,
        sourceTimestamp,
        embeddingVector,
        similarityScore: similarityScore ?? undefined,
        mergedAt: mergedAt ?? undefined,
        assignedDepartmentId,
        assigned_department_id: assignedDepartmentId,
      });

      // 8. Enqueue notification in SQLite outbox for student reporter
      if (status === 'MERGED_AUTOMATIC') {
        const emailBody = `Dear ${payload.studentName || 'Student'},\n\nYour complaint has been automatically consolidated under Master Ticket #${dedupResult.matchedTicketNo || 'MASTER'} as an identical issue was already reported. You will automatically receive updates and resolution confirmation.\n\nThank you,\nCollege Grievance Cell.`;
        sendSimulatedEmail(
          payload.studentEmail || 'student@college.edu',
          `Grievance Consolidated - Ticket #${created.ticketNo}`,
          emailBody,
          'confirmation',
        );
      } else {
        const emailBody = `Dear ${payload.studentName || 'Student'},\n\nWe got your complaint (Ticket: #${created.ticketNo}, Category: ${created.category}).\n\nOnce the problem has been resolved we will notify you. Thank you.\n\nCollege Grievance Redressal Cell.`;
        sendSimulatedEmail(
          payload.studentEmail || 'student@college.edu',
          `Grievance Registered - Ticket #${created.ticketNo}`,
          emailBody,
          'confirmation',
        );
      }

      // 9. Dispatch targeted notification to assigned department contact & active staff
      if (assignedDepartmentId) {
        dispatchDepartmentNotification({
          departmentId: assignedDepartmentId,
          grievance: created,
          type: 'dept_alert',
        });
      }

      return created;
    });

    res.status(201).json(newGrievance);
  } catch (err: any) {
    console.error('Error creating grievance:', err);
    res.status(400).json({ error: err.message || 'Failed to create grievance' });
  }
});

// Admin manual merge endpoint
app.post('/api/grievances/merge', (req: Request, res: Response) => {
  try {
    const { masterId, childId } = req.body;
    if (!masterId || !childId) {
      return res.status(400).json({ error: 'masterId and childId are required' });
    }

    const result = withTransaction(() => {
      const master = getGrievanceById(masterId);
      const child = getGrievanceById(childId);
      if (!master) throw new Error(`Master ticket ${masterId} not found`);
      if (!child) throw new Error(`Child ticket ${childId} not found`);

      const masterDept = master.assignedDepartmentId || master.assigned_department_id;
      const updatedChild = updateGrievance(childId, {
        status: 'MERGED_AUTOMATIC',
        masterCaseId: master.id,
        mergedAt: new Date().toISOString(),
        assignedDepartmentId: masterDept,
        assigned_department_id: masterDept,
      } as any);

      if (!updatedChild) throw new Error('Failed to merge ticket');

      // Enqueue linking notification to child ticket reporter
      sendSimulatedEmail(
        child.studentEmail,
        `Grievance Merged - Ticket #${child.ticketNo}`,
        `Dear ${child.studentName},\n\nYour grievance #${child.ticketNo} has been merged under Master Ticket #${master.ticketNo}. You will receive resolution updates when the master case is resolved.`,
        'confirmation',
      );

      return {
        success: true,
        masterCaseId: master.id,
        childTicketId: child.id,
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error merging tickets:', err);
    res.status(400).json({ error: err.message || 'Failed to merge tickets' });
  }
});

// Admin manual detach endpoint
app.post('/api/grievances/detach', (req: Request, res: Response) => {
  try {
    const { childId } = req.body;
    if (!childId) {
      return res.status(400).json({ error: 'childId is required' });
    }

    const result = withTransaction(() => {
      const child = getGrievanceById(childId);
      if (!child) throw new Error(`Ticket ${childId} not found`);

      const updated = updateGrievance(childId, {
        status: 'PRIMARY',
        masterCaseId: null,
        similarityScore: null,
        mergedAt: null,
      });

      if (!updated) throw new Error('Failed to detach ticket');

      return {
        success: true,
        detachedTicketId: child.id,
        newStatus: 'PRIMARY',
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error detaching ticket:', err);
    res.status(400).json({ error: err.message || 'Failed to detach ticket' });
  }
});

// Admin public master notes update endpoint
app.put('/api/grievances/:id/master-notes', enforceGrievanceRLAC, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { publicMasterNotes } = req.body;
    if (typeof publicMasterNotes !== 'string') {
      return res.status(400).json({ error: 'publicMasterNotes string is required' });
    }

    const updated = updateGrievance(id, { publicMasterNotes });
    if (!updated) {
      return res.status(404).json({ error: 'Grievance not found' });
    }

    res.json({
      success: true,
      id: updated.id,
      publicMasterNotes: updated.publicMasterNotes || '',
    });
  } catch (err: any) {
    console.error('Error updating master notes:', err);
    res.status(400).json({ error: err.message || 'Failed to update master notes' });
  }
});

app.put('/api/grievances/:id', enforceGrievanceRLAC, (req: Request, res: Response) => {
  try {
    const updated = withTransaction(() => {
      const prev = getGrievanceById(req.params.id);
      const updatedRecord = updateGrievance(req.params.id, req.body);
      if (!updatedRecord) {
        return null;
      }

      // Master ticket resolution broadcast fan-out
      if (req.body.status === 'resolved' || (updatedRecord.status === 'resolved' && prev?.status !== 'resolved')) {
        // 1. Notify master ticket reporter
        sendSimulatedEmail(
          updatedRecord.studentEmail,
          `Grievance Resolved - Ticket #${updatedRecord.ticketNo}`,
          `Dear ${updatedRecord.studentName},\n\nYour grievance (Ticket #${updatedRecord.ticketNo}, Category: ${updatedRecord.category}) has been resolved.\n\n${updatedRecord.publicMasterNotes || updatedRecord.adminNotes ? 'Notes: ' + (updatedRecord.publicMasterNotes || updatedRecord.adminNotes) + '\n\n' : ''}Thank you for your patience.`,
          'resolution',
        );

        // 2. Broadcast resolution to all subscribed child ticket reporters
        const children = getChildGrievances(updatedRecord.id);
        for (const child of children) {
          if (child.status !== 'resolved') {
            updateGrievance(child.id, {
              status: 'resolved',
              resolvedAt: new Date().toISOString(),
            });
          }

          sendSimulatedEmail(
            child.studentEmail,
            `Grievance Resolved - Master Case #${updatedRecord.ticketNo}`,
            `Dear ${child.studentName},\n\nThe master issue (Case #${updatedRecord.ticketNo}, Category: ${updatedRecord.category}) linked to your ticket #${child.ticketNo} has been marked as resolved.\n\n${updatedRecord.publicMasterNotes || updatedRecord.adminNotes ? 'Public Resolution Notes: ' + (updatedRecord.publicMasterNotes || updatedRecord.adminNotes) + '\n\n' : ''}Thank you,\nCollege Grievance Redressal Team.`,
            'resolution',
          );
        }
      }

      // Priority escalation alert trigger
      if (req.body.priority === 'urgent' && prev?.priority !== 'urgent') {
        const deptId = updatedRecord.assignedDepartmentId || updatedRecord.assigned_department_id;
        if (deptId) {
          dispatchDepartmentNotification({
            departmentId: deptId,
            grievance: updatedRecord,
            type: 'dept_escalation',
            customReason: 'Ticket priority escalated to urgent',
          });
        }
      }

      return updatedRecord;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Grievance not found' });
    }

    res.json(updated);
  } catch (err: any) {
    console.error('Error updating grievance:', err);
    res.status(400).json({ error: err.message || 'Failed to update grievance' });
  }
});

// ==================== SUPER ADMIN REASSIGNMENT & MANAGEMENT ====================

// Reassignment handler shared between /api/admin/grievances/:id/reassign and /api/grievances/:id/reassign
const handleGrievanceReassign = (req: Request, res: Response) => {
  try {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required.' });
    }
    const role = (user.role || '').toUpperCase();
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Access denied: Only Super Admin can reassign grievances.' });
    }

    const { id } = req.params;
    const { departmentId, reason } = req.body;

    if (!departmentId) {
      return res.status(400).json({ success: false, error: 'departmentId is required.' });
    }

    const targetDept = getDepartmentById(departmentId);
    if (!targetDept) {
      return res.status(400).json({ success: false, error: `Department ${departmentId} does not exist.` });
    }

    const grievance = getGrievanceById(id);
    if (!grievance) {
      return res.status(404).json({ success: false, error: 'Grievance not found.' });
    }

    const prevDeptId = grievance.assignedDepartmentId || grievance.assigned_department_id || null;

    const result = withTransaction(() => {
      const updated = updateGrievance(grievance.id, {
        assignedDepartmentId: targetDept.id,
        assigned_department_id: targetDept.id,
      } as any);

      if (!updated) {
        throw new Error('Failed to update grievance department assignment.');
      }

      const auditRecord = recordAuditLog({
        entityType: 'grievance',
        entityId: grievance.id,
        action: 'REASSIGN_DEPARTMENT',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        previousState: JSON.stringify({ assignedDepartmentId: prevDeptId }),
        newState: JSON.stringify({ assignedDepartmentId: targetDept.id }),
        reason: reason || 'Super Admin reassignment',
      });

      return { updated, auditRecord };
    });

    // Targeted reassignment alert exclusively to the newly assigned department
    dispatchDepartmentNotification({
      departmentId: targetDept.id,
      grievance: result.updated,
      type: 'dept_reassignment',
      customReason: reason,
    });

    res.status(200).json({
      success: true,
      newDepartmentId: targetDept.id,
      assignedDepartmentId: targetDept.id,
      grievance: result.updated,
      auditLog: result.auditRecord,
    });
  } catch (err: any) {
    console.error('Error reassigning grievance:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to reassign grievance' });
  }
};

// Super Admin Grievance Reassignment with Atomic Audit Log & Targeted Reassignment Alert
app.post('/api/admin/grievances/:id/reassign', handleGrievanceReassign);
app.patch('/api/grievances/:id/reassign', handleGrievanceReassign);
app.post('/api/grievances/:id/reassign', handleGrievanceReassign);

// Department Staff / Head Request Re-Assignment to Super Admin
app.post('/api/grievances/:id/request-reassign', (req: Request, res: Response) => {
  try {
    const user = extractUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required.' });
    }

    const { id } = req.params;
    const { suggestedDepartmentId, reason } = req.body;

    const grievance = getGrievanceById(id);
    if (!grievance) {
      return res.status(404).json({ success: false, error: 'Grievance not found.' });
    }

    const role = (user.role || '').toUpperCase();
    const isSuperAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const currentTicketDept = grievance.assignedDepartmentId || grievance.assigned_department_id || null;

    if (!isSuperAdmin) {
      if (role !== 'DEPARTMENT_STAFF' && role !== 'DEPARTMENT_HEAD') {
        return res.status(403).json({ success: false, error: 'Access denied: Only department staff or heads can request reassignment.' });
      }
      if (user.department_id && currentTicketDept && user.department_id !== currentTicketDept) {
        return res.status(403).json({ success: false, error: 'Access denied: You can only request reassignment for tickets assigned to your department.' });
      }
    }

    let targetDeptName = 'Unspecified';
    if (suggestedDepartmentId) {
      const targetDept = getDepartmentById(suggestedDepartmentId);
      if (targetDept) {
        targetDeptName = targetDept.name;
      }
    }

    const requestNote = `[Reassignment Request by ${user.role} (${user.email}) to Department: ${targetDeptName}]: ${reason || 'Requested transfer by staff'}`;
    const existingNotes = grievance.adminNotes ? `${grievance.adminNotes}\n\n${requestNote}` : requestNote;

    const updated = updateGrievance(grievance.id, {
      adminNotes: existingNotes,
    });

    const auditRecord = recordAuditLog({
      entityType: 'grievance',
      entityId: grievance.id,
      action: 'REQUEST_REASSIGNMENT',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      previousState: JSON.stringify({ assignedDepartmentId: currentTicketDept }),
      newState: JSON.stringify({ suggestedDepartmentId }),
      reason: reason || 'Staff requested ticket reassignment',
    });

    res.json({
      success: true,
      message: 'Reassignment request recorded and forwarded to Super Admin queue.',
      grievance: updated,
      auditLog: auditRecord,
    });
  } catch (err: any) {
    console.error('Error requesting reassignment:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to request reassignment' });
  }
});

// Admin Department CRUD
app.get('/api/admin/departments', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const onlyActive = req.query.onlyActive === 'true';
    const departments = getAllDepartments(!onlyActive);
    res.json({ success: true, departments });
  } catch (err: any) {
    console.error('Error fetching admin departments:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch departments' });
  }
});

app.post('/api/admin/departments', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const { name, code, contactEmail, isActive } = req.body;
    if (!name || !code || !contactEmail) {
      return res.status(400).json({ success: false, error: 'name, code, and contactEmail are required.' });
    }
    const existing = getDepartmentByCode(code);
    if (existing) {
      return res.status(409).json({ success: false, error: `Department code ${code} already exists.` });
    }
    const dept = createDepartment({ name, code, contactEmail, isActive });
    const user = (req as any).user;
    recordAuditLog({
      entityType: 'department',
      entityId: dept.id,
      action: 'CREATE_DEPARTMENT',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      newState: JSON.stringify(dept),
      reason: 'Super Admin department creation',
    });
    res.status(201).json({ success: true, department: dept });
  } catch (err: any) {
    console.error('Error creating department:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create department' });
  }
});

app.put('/api/admin/departments/:id', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const dept = getDepartmentById(req.params.id);
    if (!dept) {
      return res.status(404).json({ success: false, error: 'Department not found.' });
    }
    const updated = updateDepartment(dept.id, req.body);
    const user = (req as any).user;
    recordAuditLog({
      entityType: 'department',
      entityId: dept.id,
      action: 'UPDATE_DEPARTMENT',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      previousState: JSON.stringify(dept),
      newState: JSON.stringify(updated),
      reason: 'Super Admin department update',
    });
    res.json({ success: true, department: updated });
  } catch (err: any) {
    console.error('Error updating department:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update department' });
  }
});

// Admin Routing Rules CRUD
app.get('/api/admin/routing-rules', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const rules = getAllRoutingRules();
    res.json({ success: true, rules });
  } catch (err: any) {
    console.error('Error fetching routing rules:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch routing rules' });
  }
});

app.post('/api/admin/routing-rules', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const { category, departmentId, locationTagPattern, priorityOrder, priorityOverride, isActive } = req.body;
    if (!category || !departmentId) {
      return res.status(400).json({ success: false, error: 'category and departmentId are required.' });
    }
    const dept = getDepartmentById(departmentId);
    if (!dept) {
      return res.status(400).json({ success: false, error: `Department ${departmentId} does not exist.` });
    }
    const rule = createRoutingRule({
      category,
      departmentId: dept.id,
      locationTagPattern,
      priorityOrder: priorityOrder ? parseInt(priorityOrder, 10) : 0,
      priorityOverride,
      isActive,
    });
    const user = (req as any).user;
    recordAuditLog({
      entityType: 'routing_rule',
      entityId: rule.id,
      action: 'CREATE_ROUTING_RULE',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      newState: JSON.stringify(rule),
      reason: 'Super Admin routing rule creation',
    });
    res.status(201).json({ success: true, rule });
  } catch (err: any) {
    console.error('Error creating routing rule:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create routing rule' });
  }
});

app.put('/api/admin/routing-rules/:id', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const rule = getRoutingRuleById(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Routing rule not found.' });
    }
    if (req.body.departmentId) {
      const dept = getDepartmentById(req.body.departmentId);
      if (!dept) {
        return res.status(400).json({ success: false, error: `Department ${req.body.departmentId} does not exist.` });
      }
      req.body.departmentId = dept.id;
    }
    const updated = updateRoutingRule(rule.id, req.body);
    const user = (req as any).user;
    recordAuditLog({
      entityType: 'routing_rule',
      entityId: rule.id,
      action: 'UPDATE_ROUTING_RULE',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      previousState: JSON.stringify(rule),
      newState: JSON.stringify(updated),
      reason: 'Super Admin routing rule update',
    });
    res.json({ success: true, rule: updated });
  } catch (err: any) {
    console.error('Error updating routing rule:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update routing rule' });
  }
});

app.delete('/api/admin/routing-rules/:id', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const rule = getRoutingRuleById(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Routing rule not found.' });
    }
    deleteRoutingRule(rule.id);
    const user = (req as any).user;
    recordAuditLog({
      entityType: 'routing_rule',
      entityId: rule.id,
      action: 'DELETE_ROUTING_RULE',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      previousState: JSON.stringify(rule),
      reason: 'Super Admin routing rule deletion',
    });
    res.json({ success: true, message: 'Routing rule deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting routing rule:', err);
    res.status(500).json({ success: false, error: 'Failed to delete routing rule' });
  }
});

// Admin User Department Credential Provisioning
app.post('/api/admin/users/assign-department', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const { userId, regNo, email, departmentId, role } = req.body;
    const identifier = (userId || regNo || email || '').toString().trim();
    if (!identifier) {
      return res.status(400).json({ success: false, error: 'userId, regNo, or email is required.' });
    }

    let deptId: string | null = null;
    if (departmentId) {
      const dept = getDepartmentById(departmentId);
      if (!dept) {
        return res.status(400).json({ success: false, error: `Department ${departmentId} does not exist.` });
      }
      deptId = dept.id;
    }

    const validRoles: UserRole[] = ['DEPARTMENT_STAFF', 'DEPARTMENT_HEAD', 'SUPER_ADMIN', 'STUDENT'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: `Invalid role: ${role}. Valid roles are: ${validRoles.join(', ')}` });
    }

    const updated = updateUserDepartment(identifier, deptId, role);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const user = (req as any).user;
    recordAuditLog({
      entityType: 'user',
      entityId: updated.id,
      action: 'ASSIGN_USER_DEPARTMENT',
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      newState: JSON.stringify({ departmentId: deptId, role: updated.role }),
      reason: 'Super Admin user credential and department assignment',
    });

    res.json({ success: true, user: updated });
  } catch (err: any) {
    console.error('Error assigning user department:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to assign user department' });
  }
});

// Admin Audit Logs Viewer
app.get('/api/admin/audit-logs', requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const { entityType, entityId, actorId } = req.query;
    const logs = getAuditLogs({
      entityType: typeof entityType === 'string' ? entityType : undefined,
      entityId: typeof entityId === 'string' ? entityId : undefined,
      actorId: typeof actorId === 'string' ? actorId : undefined,
    });
    res.json({ success: true, auditLogs: logs });
  } catch (err: any) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

// Explicit Grievance Escalation Endpoint
app.post('/api/grievances/:id/escalate', (req: Request, res: Response) => {
  try {
    const user = extractUserFromRequest(req);
    const grievance = getGrievanceById(req.params.id);
    if (!grievance) {
      return res.status(404).json({ success: false, error: 'Grievance not found.' });
    }

    // RLAC: department staff/head can only escalate tickets in their own department
    if (user) {
      const role = (user.role || '').toUpperCase();
      if (role === 'DEPARTMENT_STAFF' || role === 'DEPARTMENT_HEAD') {
        const ticketDept = grievance.assignedDepartmentId || grievance.assigned_department_id;
        if (ticketDept !== user.department_id) {
          return res.status(403).json({ success: false, error: 'Access denied: Cannot escalate grievance belonging to another department.' });
        }
      } else if (role === 'STUDENT') {
        return res.status(403).json({ success: false, error: 'Access denied: Students cannot escalate grievances directly.' });
      }
    }

    const { reason } = req.body;
    const updated = updateGrievance(grievance.id, { priority: 'urgent' });
    if (!updated) {
      return res.status(500).json({ success: false, error: 'Failed to escalate grievance.' });
    }

    const deptId = updated.assignedDepartmentId || updated.assigned_department_id;
    if (deptId) {
      dispatchDepartmentNotification({
        departmentId: deptId,
        grievance: updated,
        type: 'dept_escalation',
        customReason: reason || 'Ticket manually escalated to urgent priority',
      });
    }

    if (user) {
      recordAuditLog({
        entityType: 'grievance',
        entityId: updated.id,
        action: 'ESCALATE_GRIEVANCE',
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        previousState: JSON.stringify({ priority: grievance.priority }),
        newState: JSON.stringify({ priority: 'urgent' }),
        reason: reason || 'Grievance escalated',
      });
    }

    res.json({ success: true, grievance: updated });
  } catch (err: any) {
    console.error('Error escalating grievance:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to escalate grievance' });
  }
});

// 3. User Endpoints
app.get('/api/users/:regNo', (req: Request, res: Response) => {
  try {
    const user = getUserByRegNo(req.params.regNo);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { passwordHash: _, ...publicProfile } = user;
    res.json(publicProfile);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/users', (req: Request, res: Response) => {
  try {
    const user = upsertUser(req.body);
    res.json(user);
  } catch (err: any) {
    console.error('Error saving user:', err);
    res.status(400).json({ error: err.message || 'Failed to save user profile' });
  }
});

// 4. Authentication Endpoints

function handleAdminLogin(req: Request, res: Response) {
  const { regNo, email, identifier: rawId, password } = req.body;
  const identifier = (rawId || regNo || email || '').toString().trim();

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: 'Register Number / Email and Password are required.',
    });
  }

  let user = getUserByRegNo(identifier);
  if (!user) {
    user = getUserByEmail(identifier);
  }

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials: User not found.',
    });
  }

  if (user.passwordHash && user.passwordHash !== password.toString().trim()) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials: Incorrect password.',
    });
  }

  const roleUpper = (user.role || '').toUpperCase();

  // Reject STUDENT accounts with HTTP 403 Forbidden
  if (roleUpper === 'STUDENT') {
    return res.status(403).json({
      success: false,
      error: 'Access denied: STUDENT accounts are not permitted to access administrative portal.',
      role: 'STUDENT',
    });
  }

  // Canonical role & permissions
  const canonicalRole = normalizeCanonicalRole(user.role);
  const permissions = getPermissionsForRole(canonicalRole);
  const departmentId = user.departmentId || (user as any).department_id || null;

  const token = signToken({
    id: user.id,
    email: user.email,
    role: canonicalRole,
    department_id: departmentId,
    permissions,
  });

  const redirectUrl =
    canonicalRole === 'SUPER_ADMIN'
      ? '/admin/dashboard'
      : '/admin/department/dashboard';

  const { passwordHash: _, ...publicUser } = user;

  return res.json({
    success: true,
    token,
    user: {
      ...publicUser,
      role: canonicalRole,
      departmentId,
      department_id: departmentId,
      permissions,
    },
    redirectUrl,
  });
}

app.post('/api/auth/admin/login', (req: Request, res: Response) => {
  try {
    return handleAdminLogin(req, res);
  } catch (err: any) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during admin authentication' });
  }
});

// Single Unified Admin Login Endpoint (Alias as required by spec)
app.post('/api/auth/admin-login', (req: Request, res: Response) => {
  try {
    return handleAdminLogin(req, res);
  } catch (err: any) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during admin authentication' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    if (req.body.portal === 'admin') {
      return handleAdminLogin(req, res);
    }

    const { regNo, email, identifier: rawId, password } = req.body;
    const identifier = (rawId || regNo || email || '').toString().trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Register Number / Email and Password are required.' });
    }

    const authResult = verifyUserCredentials(identifier, password);
    if (authResult.success && authResult.user) {
      const canonicalRole = normalizeCanonicalRole(authResult.user.role);
      const permissions = getPermissionsForRole(canonicalRole);
      const departmentId = authResult.user.departmentId || (authResult.user as any).department_id || null;

      const token = signToken({
        id: authResult.user.id,
        email: authResult.user.email,
        role: canonicalRole,
        department_id: departmentId,
        permissions,
      });

      return res.json({
        success: true,
        token,
        user: {
          ...authResult.user,
          departmentId,
          department_id: departmentId,
          permissions,
        },
      });
    } else {
      return res.status(401).json({ error: authResult.error || 'Invalid credentials' });
    }
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
});

// Real User Direct Registration Endpoint
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { regNo, name, email, password, department, gender, studentType, phone, hostelBlock, roomNo } = req.body;

    if (!regNo || !name || !email || !password) {
      return res.status(400).json({ error: 'Register Number, Name, Email, and Password are required.' });
    }

    const cleanRegNo = regNo.toString().trim().toUpperCase();
    const cleanEmail = email.toString().trim().toLowerCase();

    // Check if Register Number is already registered
    const existingReg = getUserByRegNo(cleanRegNo);
    if (existingReg) {
      return res.status(409).json({ error: `An account with Register Number "${cleanRegNo}" already exists. Please sign in instead.` });
    }

    // Check if Email is already in use
    const existingEmail = getUserByEmail(cleanEmail);
    if (existingEmail) {
      return res.status(409).json({ error: `An account with email "${cleanEmail}" already exists. Please sign in instead.` });
    }

    const newUser = upsertUser({
      regNo: cleanRegNo,
      name: name.toString().trim(),
      email: cleanEmail,
      department: department || undefined,
      gender: gender || 'Male',
      studentType: studentType || 'hosteller',
      phone: phone ? phone.toString().trim() : '',
      hostelBlock: studentType === 'hosteller' ? hostelBlock : undefined,
      roomNo: studentType === 'hosteller' ? (roomNo ? roomNo.toString().trim() : undefined) : undefined,
      role: 'student',
      isEmailVerified: true,
      password: password.toString().trim(),
    });

    return res.status(201).json({ success: true, user: newUser });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: err.message || 'Failed to complete registration.' });
  }
});

// 5. Request OTP for Signup / Verification (Optional real email delivery)
app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
  const { email, regNo, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins
  otpStore.set(email.toLowerCase(), { otp, expiresAt });

  const subject = 'Verification Code (OTP) - AI Student Grievance Portal';
  const textBody = `Hello ${name || 'Student'},\n\nYour 6-digit One-Time Password (OTP) for verification and registration at the AI Student Grievance Portal is: ${otp}\n\nThis code is valid for 5 minutes. Please do not share this OTP with anyone.\n\nWarm regards,\nCollege Student Grievance Redressal Cell`;
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 520px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #1e3a8a, #312e81); padding: 16px 20px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 700;">AI Student Grievance Portal</h2>
        <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 12px;">Student Signup Verification</p>
      </div>
      <p style="font-size: 14px; margin-bottom: 12px;">Hello <strong>${name || 'Student'}</strong>,</p>
      <p style="font-size: 13px; color: #475569; margin-bottom: 16px;">Use the following 6-digit One-Time Password (OTP) to complete your student registration:</p>
      <div style="background-color: #f8fafc; border: 1px border-dashed #cbd5e1; padding: 18px; text-align: center; border-radius: 12px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #2563eb; font-family: monospace;">${otp}</span>
      </div>
      <p style="font-size: 12px; color: #64748b; margin-top: 16px;">This OTP is valid for <strong>5 minutes</strong>. If you did not initiate this request, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0 16px 0;" />
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">Campus Redressal & Bull; Confidential & Automated Notice</p>
    </div>
  `;

  // 1. Record in local SQLite outbox
  const sentSimulated = sendSimulatedEmail(email, subject, textBody, 'otp');

  // 2. Dispatch real email via Gmail Nodemailer if credentials exist (optional)
  let sentViaGmail = false;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const gmailResult = await sendGmailNotification(email, subject, textBody, htmlBody);
    sentViaGmail = Boolean(gmailResult.sent);
  }

  res.json({
    success: true,
    message: sentViaGmail
      ? `OTP code sent directly to ${email} via Gmail.`
      : `Verification code sent to ${email}.`,
    email,
    sentViaGmail,
    sentEmail: sentSimulated,
  });
});

// 6. Verify OTP
app.post('/api/auth/verify-otp', (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const record = otpStore.get(email.toLowerCase());
  if (!record) {
    return res.status(400).json({ error: 'No OTP found or expired. Please request a new one.' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid OTP. Please check the code and try again.' });
  }

  // OTP is valid
  otpStore.delete(email.toLowerCase());
  res.json({ success: true, message: 'OTP verified successfully' });
});

// 7. AI Local ML Classification Endpoint (Runs 100% locally with zero external API key)
app.post('/api/ai/classify-complaint', async (req: Request, res: Response) => {
  const { text, category, studentType } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Complaint text is required' });
  }

  const trimmed = text.trim();

  // Run local ML Model (Multinomial Naive Bayes + TF-IDF Vector Space Classifier)
  const spamAnalysis = defaultClassifier.analyzeSpam(trimmed, category, studentType);
  const mlPrediction = defaultClassifier.predict(trimmed, studentType);

  res.json({
    isSpam: spamAnalysis.isSpam,
    reason: spamAnalysis.reason,
    confidence: spamAnalysis.isSpam ? spamAnalysis.confidence : mlPrediction.confidence,
    suggestedCategory: spamAnalysis.isSpam ? (category || 'Others') : mlPrediction.category,
    suggestedIcon: mlPrediction.icon,
    isUrgent: mlPrediction.isUrgent,
    topFeatures: mlPrediction.topFeatures,
    probabilities: mlPrediction.probabilities,
    model: mlPrediction.model,
  });
});

// 7b. ML Model Metadata & Diagnostics Endpoint
app.get('/api/ai/ml-model-info', (req: Request, res: Response) => {
  res.json(defaultClassifier.getMetadata());
});

// 8. Trigger Automated Email Notifications (Grievance Confirmation & Resolution Done)
app.post('/api/notifications/send', async (req: Request, res: Response) => {
  const { to, type, ticketNo, studentName, category, customMessage } = req.body;
  if (!to || !type) {
    return res.status(400).json({ error: 'Recipient and notification type are required' });
  }

  let subject = '';
  let body = '';

  if (type === 'confirmation') {
    subject = `Grievance Registered - Ticket #${ticketNo || 'NEW'}`;
    body = `Dear ${studentName || 'Student'},\n\nWe got your complaint (Ticket: #${ticketNo || 'NEW'}, Category: ${category || 'General'}).\n\nOnce the problem been taken care of we will notify you. Thank you.\n\nCollege Grievance Redressal Cell.`;
  } else if (type === 'resolution') {
    subject = `Grievance Resolved - Ticket #${ticketNo || 'TKT'}`;
    body = `Dear ${studentName || 'Student'},\n\nThis is to notify you that your complaint (Ticket: #${ticketNo || 'TKT'}, Category: ${category || 'General'}) has been taken care of and marked as Done.\n\n${customMessage ? 'Admin Note: ' + customMessage + '\n\n' : ''}Thanks for notifying the College management about the issue.\n\nWarm regards,\nCollege Grievance & Hostel Welfare Team.`;
  } else {
    subject = `Notice from College Grievance Cell`;
    body = customMessage || 'Update regarding your grievance submission.';
  }

  const sentSimulated = sendSimulatedEmail(to, subject, body, type);
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    await sendGmailNotification(to, subject, body);
  }

  res.json({ success: true, email: sentSimulated });
});

// 9. Get Outbox (Email simulation viewer so student/admin can inspect outgoing notices)
app.get('/api/notifications/outbox', (req: Request, res: Response) => {
  const { email } = req.query;
  const emails = getOutboxEmails(typeof email === 'string' ? email : undefined);
  res.json({ outbox: emails });
});

// 10. Serve Graphify Knowledge Graph Interactive Visualization & Report
app.get('/graph', (req: Request, res: Response) => {
  const graphHtmlPath = path.join(process.cwd(), 'graphify-out', 'graph.html');
  if (fs.existsSync(graphHtmlPath)) {
    res.sendFile(graphHtmlPath);
  } else {
    res.status(404).send('Graph visualization not found. Run `npm run graphify` to build.');
  }
});

app.get('/api/graph/summary', (req: Request, res: Response) => {
  const reportPath = path.join(process.cwd(), 'graphify-out', 'GRAPH_REPORT.md');
  if (fs.existsSync(reportPath)) {
    res.type('text/markdown').send(fs.readFileSync(reportPath, 'utf-8'));
  } else {
    res.status(404).json({ error: 'Graph report not found. Run `npm run graphify` to build.' });
  }
});

// ---------------------- VITE / STATIC SERVING ----------------------
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Student Grievance System running locally on:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`📦 Database: SQLite3 (${path.join(process.cwd(), 'database.sqlite')})`);
    console.log(`🔑 No external API key required!`);
    console.log(`======================================================\n`);
  });
}

start();
