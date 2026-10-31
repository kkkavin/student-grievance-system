import express, { Request, Response } from 'express';
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
  upsertUser,
  verifyUserCredentials,
  saveOutboxEmail,
  getOutboxEmails,
  getDatabase,
} from './db.ts';
import { defaultClassifier } from './src/ml/complaintClassifier.ts';

dotenv.config();

// Initialize SQLite database eagerly
getDatabase();

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
    const list = getAllGrievances();
    res.json(list);
  } catch (err: any) {
    console.error('Error fetching grievances:', err);
    res.status(500).json({ error: 'Failed to fetch grievances' });
  }
});

app.post('/api/grievances', (req: Request, res: Response) => {
  try {
    const payload = { ...req.body };
    if (!payload.category || payload.category === 'Others' || payload.category.trim() === '') {
      payload.category = detectSuggestedCategory(payload.description || '', payload.category, payload.studentType);
    }
    const newGrievance = createGrievance(payload);
    res.status(201).json(newGrievance);
  } catch (err: any) {
    console.error('Error creating grievance:', err);
    res.status(400).json({ error: err.message || 'Failed to create grievance' });
  }
});

app.put('/api/grievances/:id', (req: Request, res: Response) => {
  try {
    const updated = updateGrievance(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Grievance not found' });
    }
    res.json(updated);
  } catch (err: any) {
    console.error('Error updating grievance:', err);
    res.status(400).json({ error: err.message || 'Failed to update grievance' });
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
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { regNo, email, password } = req.body;
    const identifier = (regNo || email || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Register Number / Email and Password are required.' });
    }

    const authResult = verifyUserCredentials(identifier, password);
    if (authResult.success) {
      return res.json({ success: true, user: authResult.user });
    } else {
      return res.status(401).json({ error: authResult.error || 'Invalid credentials' });
    }
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
});

// 5. Request OTP for Signup / Verification (Completely works locally with zero API key)
app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
  const { email, regNo, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins
  otpStore.set(email.toLowerCase(), { otp, expiresAt });

  console.log(`\n========================================`);
  console.log(`🔑 [LOCAL AUTH] Verification OTP for ${email}: ${otp}`);
  console.log(`========================================\n`);

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
      : `Verification OTP generated: ${otp}. (Check console or in-app notification)`,
    email,
    otpCode: otp,
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
