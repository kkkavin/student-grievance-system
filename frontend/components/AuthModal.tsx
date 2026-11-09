'use client';

/**
 * frontend/components/AuthModal.tsx
 * 
 * Rapid Demo Authentication & Unified Portal Login Modal.
 * Provides instant one-click Quick Demo Login across:
 * - Super Admin (Dr. Rajeshwari)
 * - All 10 Department Admins (100% department coverage)
 * - 4 Representative Student Personas
 * Plus standard Email + Dev OTP (123456) / Password and Student Sign Up with OTP verification.
 */

import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Shield,
  User,
  Lock,
  Mail,
  Building,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  X,
  KeyRound,
  Utensils,
  Bus,
  Zap,
  AlertOctagon,
  Stethoscope,
  Briefcase,
  BookOpen,
  Wifi,
  ChevronRight,
} from 'lucide-react';
import { UserProfile, StudentType } from '../types';
import { HOSTEL_BLOCKS, DEPARTMENT_OPTIONS } from '../data/constants';
import { loginUserApi, registerUserApi, adminLoginApi } from '../lib/api';
import { sendOTPEmail, verifyOTPEmail } from '../services/sendEmailOTP';

export interface DemoAccount {
  name: string;
  title: string;
  email: string;
  regNo?: string;
  password: string;
  devOtp: string;
  role: 'SUPER_ADMIN' | 'DEPARTMENT_ADMIN' | 'STUDENT';
  departmentName: string;
  departmentCode: string;
  category: 'super_admin' | 'dept_admin' | 'student';
  badgeColor: string;
  icon: React.ElementType;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  // 1. Super Admin
  {
    name: 'Dr. Rajeshwari',
    title: 'Dean - Student Affairs',
    email: 'admin@campus.edu',
    regNo: 'ADMIN-001',
    password: 'Admin@123',
    devOtp: '123456',
    role: 'SUPER_ADMIN',
    departmentName: 'Office of Student Affairs',
    departmentCode: 'GLOBAL',
    category: 'super_admin',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800',
    icon: Shield,
  },

  // 2. All 10 Department Admins (100% Department Coverage)
  {
    name: 'Prof. Sundaram',
    title: 'Chief Warden',
    email: 'hostel.admin@campus.edu',
    regNo: 'STAFF-HOSTEL',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Hostel & Accommodation',
    departmentCode: 'HOSTEL',
    category: 'dept_admin',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800',
    icon: Building,
  },
  {
    name: 'Dr. Meenakshi',
    title: 'Mess Director',
    email: 'mess.admin@campus.edu',
    regNo: 'STAFF-MESS',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Mess & Canteen',
    departmentCode: 'MESS',
    category: 'dept_admin',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
    icon: Utensils,
  },
  {
    name: 'Er. Karthikeyan',
    title: 'Head - IT & ERP',
    email: 'it.admin@campus.edu',
    regNo: 'STAFF-IT',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'IT & ERP Infrastructure',
    departmentCode: 'IT_ERP',
    category: 'dept_admin',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-200 dark:border-cyan-800',
    icon: Wifi,
  },
  {
    name: 'Dr. Ramanathan',
    title: 'Dean - Academic Affairs',
    email: 'academics.admin@campus.edu',
    regNo: 'STAFF-ACAD',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Academics & Labs',
    departmentCode: 'ACADEMICS',
    category: 'dept_admin',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800',
    icon: GraduationCap,
  },
  {
    name: 'Er. Balasubramanian',
    title: 'Estate Officer',
    email: 'infra.admin@campus.edu',
    regNo: 'STAFF-INFRA',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Infrastructure & Maintenance',
    departmentCode: 'INFRA',
    category: 'dept_admin',
    badgeColor: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/60 dark:text-yellow-200 dark:border-yellow-800',
    icon: Zap,
  },
  {
    name: 'Mr. Saravanan',
    title: 'Transport Manager',
    email: 'transport.admin@campus.edu',
    regNo: 'STAFF-TRANS',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Campus Transport',
    departmentCode: 'TRANSPORT',
    category: 'dept_admin',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
    icon: Bus,
  },
  {
    name: 'Col. Natarajan',
    title: 'Chief Security Officer',
    email: 'security.admin@campus.edu',
    regNo: 'STAFF-SEC',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Anti-Ragging & Security',
    departmentCode: 'SECURITY',
    category: 'dept_admin',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
    icon: AlertOctagon,
  },
  {
    name: 'Dr. Shanthi',
    title: 'Chief Medical Officer',
    email: 'medical.admin@campus.edu',
    regNo: 'STAFF-MED',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Medical & Wellness',
    departmentCode: 'MEDICAL',
    category: 'dept_admin',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800',
    icon: Stethoscope,
  },
  {
    name: 'Mr. Venkatraman',
    title: 'Finance Officer',
    email: 'accounts.admin@campus.edu',
    regNo: 'STAFF-ACC',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Administration & Finance',
    departmentCode: 'ACCOUNTS',
    category: 'dept_admin',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    icon: Briefcase,
  },
  {
    name: 'Dr. Padmavathi',
    title: 'Dean - Student Life',
    email: 'studentlife.admin@campus.edu',
    regNo: 'STAFF-LIFE',
    password: 'Dept@123',
    devOtp: '123456',
    role: 'DEPARTMENT_ADMIN',
    departmentName: 'Library, Sports & Placement',
    departmentCode: 'STUDENTLIFE',
    category: 'dept_admin',
    badgeColor: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-800',
    icon: BookOpen,
  },

  // 3. Representative Student Personas
  {
    name: 'Kavin Kumar',
    title: 'Final Year CSE Hosteller (Block C-304)',
    email: 'kavin@student.campus.edu',
    regNo: '2023CSE042',
    password: 'Student@123',
    devOtp: '123456',
    role: 'STUDENT',
    departmentName: 'Computer Science (CSE)',
    departmentCode: 'CSE',
    category: 'student',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
    icon: User,
  },
  {
    name: 'Ananya Sharma',
    title: '3rd Year ECE Hosteller (Block A-108)',
    email: 'ananya@student.campus.edu',
    regNo: '2023ECE015',
    password: 'Student@123',
    devOtp: '123456',
    role: 'STUDENT',
    departmentName: 'Electronics & Comm (ECE)',
    departmentCode: 'ECE',
    category: 'student',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900',
    icon: User,
  },
  {
    name: 'Rahul Verma',
    title: '2nd Year MECH Dayscholar (Route 14 Bus)',
    email: 'rahul@student.campus.edu',
    regNo: '2022MECH088',
    password: 'Student@123',
    devOtp: '123456',
    role: 'STUDENT',
    departmentName: 'Mechanical Engg (MECH)',
    departmentCode: 'MECH',
    category: 'student',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    icon: User,
  },
  {
    name: 'Priya Ramasamy',
    title: '1st Year IT Hosteller (Block B-212)',
    email: 'priya@student.campus.edu',
    regNo: '2024IT021',
    password: 'Student@123',
    devOtp: '123456',
    role: 'STUDENT',
    departmentName: 'Information Tech (IT)',
    departmentCode: 'IT',
    category: 'student',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    icon: User,
  },
];

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: UserProfile, redirectUrl?: string) => void;
  onClose?: () => void;
  initialTab?: 'demo' | 'student' | 'admin' | 'signup' | 'login';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  initialTab = 'demo',
}) => {
  const normalizeTab = (t: string): 'demo' | 'student' | 'admin' | 'signup' => {
    if (t === 'login') return 'student';
    if (t === 'demo' || t === 'student' || t === 'admin' || t === 'signup') return t;
    return 'demo';
  };

  const [activeTab, setActiveTab] = useState<'demo' | 'student' | 'admin' | 'signup'>(normalizeTab(initialTab));
  const [demoCategoryFilter, setDemoCategoryFilter] = useState<'all' | 'super_admin' | 'dept_admin' | 'student'>('all');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizeTab(initialTab));
    }
  }, [initialTab]);

  // Standard student login state
  const [studentIdentifier, setStudentIdentifier] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [studentAuthMode, setStudentAuthMode] = useState<'password' | 'otp'>('password');
  const [studentError, setStudentError] = useState('');

  // Admin login state
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminAuthMode, setAdminAuthMode] = useState<'password' | 'otp'>('password');
  const [adminError, setAdminError] = useState('');

  // Signup form state
  const [signupRegNo, setSignupRegNo] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<string>(DEPARTMENT_OPTIONS[0]);
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [studentType, setStudentType] = useState<StudentType>('hosteller');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hostelBlock, setHostelBlock] = useState(HOSTEL_BLOCKS[0]);
  const [roomNo, setRoomNo] = useState('');

  // OTP Verification state
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpSentMessage, setOtpSentMessage] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Common loading & message states
  const [loading, setLoading] = useState(false);
  const [activeLoggingRole, setActiveLoggingRole] = useState<string | null>(null);

  // 30-second cooldown timer for Resend OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldownSeconds > 0) {
      timer = setInterval(() => {
        setCooldownSeconds((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cooldownSeconds]);

  if (!isOpen) return null;

  // -------------------------------------------------------------------------
  // 1. One-Click Instant Quick Demo Login
  // -------------------------------------------------------------------------
  const handleQuickDemoLogin = async (account: DemoAccount) => {
    setLoading(true);
    setActiveLoggingRole(account.email);
    setStudentError('');
    setAdminError('');

    try {
      if (account.category === 'student') {
        const res = await loginUserApi(account.regNo || account.email, account.password);
        onSuccess(res.user, '/student/dashboard');
      } else {
        const res = await adminLoginApi(account.email, account.password);
        onSuccess(res.user, res.redirectUrl);
      }
    } catch (err: any) {
      console.error('Quick Demo Login error:', err);
      const msg = err?.message || 'Authentication failed. Please verify the backend is running.';
      if (account.category === 'student') setStudentError(msg);
      else setAdminError(msg);
    } finally {
      setLoading(false);
      setActiveLoggingRole(null);
    }
  };

  // -------------------------------------------------------------------------
  // 2. Standard Student Login
  // -------------------------------------------------------------------------
  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError('');
    setLoading(true);

    try {
      const cred = studentAuthMode === 'otp' ? '123456' : studentPassword;
      const res = await loginUserApi(studentIdentifier.trim(), cred);
      onSuccess(res.user, '/student/dashboard');
    } catch (err: any) {
      console.error('Student login error:', err);
      setStudentError(err?.message || 'Invalid credentials or student not found.');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // 3. Standard Administrative Console Login
  // -------------------------------------------------------------------------
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setLoading(true);

    try {
      const cred = adminAuthMode === 'otp' ? '123456' : adminPassword;
      const res = await adminLoginApi(adminIdentifier.trim(), cred);
      onSuccess(res.user, res.redirectUrl);
    } catch (err: any) {
      console.error('Admin login error:', err);
      setAdminError(err?.message || 'Invalid administrative credentials.');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // 4. Student Signup & OTP Verification Handlers
  // -------------------------------------------------------------------------
  const handleInitiateSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError('');

    const cleanRegNo = signupRegNo.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanRegNo || !cleanName || !cleanPhone || !cleanEmail || !cleanPassword) {
      setStudentError('Please fill in all mandatory fields.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setStudentError('Please enter a valid email address.');
      return;
    }

    if (cleanPassword.length < 6) {
      setStudentError('Password must be at least 6 characters long.');
      return;
    }

    if (studentType === 'hosteller' && !roomNo.trim()) {
      setStudentError('Please specify your hostel room number.');
      return;
    }

    setLoading(true);
    try {
      const result = await sendOTPEmail({
        email: cleanEmail,
        name: cleanName,
        regNo: cleanRegNo,
      });

      if (result.success) {
        setEnteredOtp('');
        setStep('otp');
        setCooldownSeconds(30);
        setOtpSentMessage(result.message || `Verification code sent to ${cleanEmail}. (Dev OTP: 123456)`);
      } else {
        setStudentError(result.message || 'Failed to dispatch verification OTP.');
      }
    } catch (err: any) {
      setStudentError(err?.message || 'Error generating OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError('');

    const cleanRegNo = signupRegNo.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const cleanOtp = enteredOtp.trim();

    if (!cleanOtp) {
      setStudentError('Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      const verifyResult = await verifyOTPEmail(cleanEmail, cleanOtp);
      if (!verifyResult.success) {
        setStudentError(verifyResult.message || 'Invalid or expired OTP code.');
        setLoading(false);
        return;
      }

      const user = await registerUserApi({
        regNo: cleanRegNo,
        name: cleanName,
        department,
        gender,
        studentType,
        phone: cleanPhone,
        email: cleanEmail,
        hostelBlock: studentType === 'hosteller' ? hostelBlock : undefined,
        roomNo: studentType === 'hosteller' ? roomNo.trim() : undefined,
        role: 'STUDENT',
        password: cleanPassword,
      });

      onSuccess(user, '/student/dashboard');
    } catch (err: any) {
      setStudentError(err?.message || 'Registration failed after OTP verification.');
    } finally {
      setLoading(false);
    }
  };

  const filteredDemoAccounts = DEMO_ACCOUNTS.filter((acc) => {
    if (demoCategoryFilter === 'all') return true;
    return acc.category === demoCategoryFilter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 w-full max-w-2xl overflow-hidden my-auto sm:my-6 transition-all">
        {/* Banner Header */}
        <div className="relative px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
              <GraduationCap className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">AI Grievance Redressal System</h2>
              <p className="text-xs text-blue-100 opacity-90">Anna University Campus Portal Authentication</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white cursor-pointer"
              aria-label="Close authentication modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1.5 gap-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('demo')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'demo'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/60 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Quick Demo Login</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('student')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'student'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200/60 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Student Login</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs border border-slate-200/60 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Console</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('signup')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'signup'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs border border-slate-200/60 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Student Sign Up</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 max-h-[78vh] overflow-y-auto">
          {/* TAB 1: QUICK DEMO LOGIN (Rapid Evaluator Selector) */}
          {activeTab === 'demo' && (
            <div id="quick-demo-login-panel" className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Instant Evaluator One-Click Login</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                    Click any persona below to authenticate instantly. Dev OTP <span className="font-mono font-bold">123456</span> is active on all accounts.
                  </p>
                </div>
                {/* Category Filter Pills */}
                <div className="flex gap-1 self-stretch sm:self-auto">
                  {(['all', 'super_admin', 'dept_admin', 'student'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDemoCategoryFilter(cat)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        demoCategoryFilter === cat
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-white'
                      }`}
                    >
                      {cat === 'all' ? 'All (15)' : cat === 'super_admin' ? 'Super Admin' : cat === 'dept_admin' ? 'Depts (10)' : 'Students (4)'}
                    </button>
                  ))}
                </div>
              </div>

              {studentError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{studentError}</span>
                </div>
              )}

              {/* Grid of Demo Personas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredDemoAccounts.map((acc) => {
                  const Icon = acc.icon;
                  const isCurrentLogging = loading && activeLoggingRole === acc.email;
                  const buttonId =
                    acc.category === 'super_admin'
                      ? 'demo-login-superadmin-btn'
                      : acc.category === 'dept_admin'
                      ? `demo-login-dept-${acc.departmentCode.toLowerCase()}-btn`
                      : `demo-login-student-${acc.name.split(' ')[0].toLowerCase()}-btn`;

                  return (
                    <button
                      key={acc.email}
                      type="button"
                      id={buttonId}
                      disabled={loading}
                      onClick={() => handleQuickDemoLogin(acc)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 relative group ${acc.badgeColor}`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wide opacity-80">
                            {acc.departmentName}
                          </span>
                          <span className="p-1 rounded-md bg-white/60 dark:bg-slate-900/60 shadow-2xs">
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                        </div>
                        <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                          <span>{acc.name}</span>
                          {acc.regNo && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/5 dark:bg-white/10">
                              {acc.regNo}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] opacity-75 truncate mt-0.5">{acc.title}</div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-[10px]">
                        <span className="font-mono opacity-80 truncate max-w-[170px]">{acc.email}</span>
                        <span className="font-bold inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                          {isCurrentLogging ? 'Logging in...' : 'Sign In'}
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: STANDARD STUDENT LOGIN */}
          {activeTab === 'student' && (
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200">
                <span className="font-medium">Student Authentication</span>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-blue-200 dark:border-slate-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setStudentAuthMode('password')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      studentAuthMode === 'password' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentAuthMode('otp')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      studentAuthMode === 'otp' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Dev OTP (123456)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  College Register Number or Email Address *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="student-identifier-input"
                    type="text"
                    required
                    placeholder="e.g. 2023CSE042 or kavin@student.campus.edu"
                    value={studentIdentifier}
                    onChange={(e) => setStudentIdentifier(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {studentAuthMode === 'password' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Student Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="student-password-input"
                      type="password"
                      required
                      placeholder="Enter student account password"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Universal Development OTP Code *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="student-dev-otp-input"
                      type="text"
                      maxLength={6}
                      defaultValue="123456"
                      readOnly
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 rounded-xl"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Development OTP code <span className="font-mono font-bold">123456</span> is pre-filled and accepted universally.
                  </p>
                </div>
              )}

              {studentError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{studentError}</span>
                </div>
              )}

              <button
                id="student-login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In as Student'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 3: ADMINISTRATIVE CONSOLE LOGIN */}
          {activeTab === 'admin' && (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="flex items-center justify-between p-2 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/60 text-xs text-purple-900 dark:text-purple-200">
                <span className="font-medium">Administrative Redressal Console</span>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-purple-200 dark:border-slate-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setAdminAuthMode('password')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      adminAuthMode === 'password' ? 'bg-purple-600 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminAuthMode('otp')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      adminAuthMode === 'otp' ? 'bg-purple-600 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Dev OTP (123456)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Administrative Identifier (Email / Staff ID) *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="admin-email-input"
                    type="text"
                    required
                    placeholder="e.g. admin@campus.edu or hostel.admin@campus.edu"
                    value={adminIdentifier}
                    onChange={(e) => setAdminIdentifier(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>

              {adminAuthMode === 'password' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Administrative Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="admin-password-input"
                      type="password"
                      required
                      placeholder="Enter administrative password (Admin@123 / Dept@123)"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Universal Development OTP Code *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      id="admin-dev-otp-input"
                      type="text"
                      maxLength={6}
                      defaultValue="123456"
                      readOnly
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-purple-600 dark:text-purple-400 rounded-xl"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Development OTP code <span className="font-mono font-bold">123456</span> validates all administrative accounts.
                  </p>
                </div>
              )}

              {adminError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{adminError}</span>
                </div>
              )}

              <button
                id="admin-login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In to Administrative Console'}</span>
                <Shield className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 4: STUDENT SIGN UP */}
          {activeTab === 'signup' && (
            <div>
              {step === 'form' ? (
                <form onSubmit={handleInitiateSignup} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Register Number *
                      </label>
                      <input
                        id="signup-regno-input"
                        type="text"
                        required
                        placeholder="e.g. 2024CS109"
                        value={signupRegNo}
                        onChange={(e) => setSignupRegNo(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg uppercase focus:bg-white dark:focus:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Full Name *
                      </label>
                      <input
                        id="signup-name-input"
                        type="text"
                        required
                        placeholder="e.g. Priya Nair"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Department *
                    </label>
                    <select
                      id="signup-department-select"
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                    >
                      {DEPARTMENT_OPTIONS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Gender *
                      </label>
                      <select
                        id="signup-gender-select"
                        value={gender}
                        onChange={(e) => setGender(e.target.value as any)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Residence Type *
                      </label>
                      <select
                        id="signup-student-type-select"
                        value={studentType}
                        onChange={(e) => setStudentType(e.target.value as any)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                      >
                        <option value="hosteller">Hosteller</option>
                        <option value="dayscholar">Day Scholar</option>
                      </select>
                    </div>
                  </div>

                  {studentType === 'hosteller' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Hostel Block *
                        </label>
                        <select
                          id="signup-hostel-block-select"
                          value={hostelBlock}
                          onChange={(e) => setHostelBlock(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                        >
                          {HOSTEL_BLOCKS.map((block) => (
                            <option key={block} value={block}>
                              {block}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Room Number *
                        </label>
                        <input
                          id="signup-room-no-input"
                          type="text"
                          required
                          placeholder="e.g. 302"
                          value={roomNo}
                          onChange={(e) => setRoomNo(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Phone Number *
                      </label>
                      <input
                        id="signup-phone-input"
                        type="tel"
                        required
                        placeholder="e.g. 9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Email Address *
                      </label>
                      <input
                        id="signup-email-input"
                        type="email"
                        required
                        placeholder="e.g. student@college.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Password (min 6 characters) *
                    </label>
                    <input
                      id="signup-password-input"
                      type="password"
                      required
                      placeholder="Create a secure password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                    />
                  </div>

                  {studentError && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span>{studentError}</span>
                    </div>
                  )}

                  <button
                    id="signup-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <span>{loading ? 'Dispatched OTP...' : 'Send Verification OTP'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                /* STEP 2: OTP VERIFICATION */
                <form onSubmit={handleVerifyOtpAndRegister} className="space-y-4">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{otpSentMessage || 'Verification code sent to your registered email.'}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Enter 6-Digit OTP Code *
                    </label>
                    <input
                      id="signup-otp-input"
                      type="text"
                      maxLength={6}
                      required
                      placeholder="123456"
                      value={enteredOtp}
                      onChange={(e) => setEnteredOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full py-2.5 text-center text-lg tracking-widest font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Note: In development and test environments, universal OTP code <span className="font-mono font-bold">123456</span> verifies immediately.
                    </p>
                  </div>

                  {studentError && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span>{studentError}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('form')}
                      className="py-2 px-3 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      id="verify-otp-btn"
                      type="submit"
                      disabled={loading || enteredOtp.length !== 6}
                      className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <span>{loading ? 'Verifying...' : 'Verify OTP & Complete Registration'}</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
