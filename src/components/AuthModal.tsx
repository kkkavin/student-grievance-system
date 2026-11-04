import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Shield,
  User,
  Lock,
  Mail,
  Phone,
  Building,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  X,
  KeyRound,
  Utensils,
  Droplets,
  Bus,
  Zap,
  AlertOctagon,
} from 'lucide-react';
import { UserProfile, StudentType } from '../types';
import { HOSTEL_BLOCKS, DEPARTMENT_OPTIONS } from '../data/constants';
import { loginUserApi, registerUserApi, adminLoginApi } from '../api';
import { sendOTPEmail, verifyOTPEmail } from '../services/sendEmailOTP';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: UserProfile, redirectUrl?: string) => void;
  onClose?: () => void;
  initialTab?: 'login' | 'signup' | 'admin';
}

export const TEST_STAFF_CREDENTIALS = [
  {
    department: 'Admin',
    name: 'Super Admin',
    email: 'admin.grievance@college.edu',
    password: 'adminpass123',
    role: 'SUPER_ADMIN',
    badge: 'Super Admin',
    tag: 'Global Redressal Console',
    color: 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 dark:text-purple-200 dark:border-purple-800',
    icon: Shield,
  },
  {
    department: 'Hostel Welfare',
    name: 'Hostel Welfare Officer',
    email: 'hostel.welfare@college.edu',
    password: 'adminpass123',
    role: 'STAFF',
    badge: 'Hostel Welfare',
    tag: 'Hostel Administration',
    color: 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-200 dark:border-blue-800',
    icon: Building,
  },
  {
    department: 'Food & Mess',
    name: 'Food & Mess Supervisor',
    email: 'food.mess@college.edu',
    password: 'adminpass123',
    role: 'STAFF',
    badge: 'Food & Mess',
    tag: 'Canteen & Mess Redressal',
    color: 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 dark:text-amber-200 dark:border-amber-800',
    icon: Utensils,
  },
  {
    department: 'Plumbing & Water',
    name: 'Plumbing & Water In-Charge',
    email: 'plumbing.water@college.edu',
    password: 'adminpass123',
    role: 'STAFF',
    badge: 'Plumbing & Water',
    tag: 'Hostel Works Crew',
    color: 'bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border-cyan-200 dark:bg-cyan-950/40 dark:hover:bg-cyan-900/60 dark:text-cyan-200 dark:border-cyan-800',
    icon: Droplets,
  },
  {
    department: 'Transport',
    name: 'Transport Officer',
    email: 'transport@college.edu',
    password: 'adminpass123',
    role: 'STAFF',
    badge: 'Transport',
    tag: 'Campus Transport Dept',
    color: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-800',
    icon: Bus,
  },
  {
    department: 'Electrical & AC',
    name: 'Electrical & AC Maintenance Staff',
    email: 'electrical.ac@college.edu',
    password: 'adminpass123',
    role: 'STAFF',
    badge: 'Electrical & AC',
    tag: 'Facilities & Estate',
    color: 'bg-yellow-50 hover:bg-yellow-100 text-yellow-900 border-yellow-200 dark:bg-yellow-950/40 dark:hover:bg-yellow-900/60 dark:text-yellow-200 dark:border-yellow-800',
    icon: Zap,
  },
  {
    department: 'Anti-Ragging Committee',
    name: 'Anti-Ragging Committee Officer',
    email: 'antiragging@college.edu',
    password: 'adminpass123',
    role: 'STAFF',
    badge: 'Anti-Ragging',
    tag: 'Confidential Safety Cell',
    color: 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-200 dark:border-rose-800',
    icon: AlertOctagon,
  },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  initialTab = 'login',
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'signup' | 'admin'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Login state (blank by default for student login)
  const [loginRegNo, setLoginRegNo] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Admin login state (unpopulated by default for security)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

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

  // Signup state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  // Handle student login with Reg No + Password
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    try {
      const user = await loginUserApi(loginRegNo, loginPassword);
      onSuccess(user);
    } catch (err: any) {
      console.error('Login error:', err);
      setLoginError(err?.message || 'Invalid credentials or student not found. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Unified Admin / Department Staff login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    try {
      const res = await adminLoginApi(adminEmail, adminPassword);
      onSuccess(res.user, res.redirectUrl);
    } catch (err: any) {
      console.error('Admin login error:', err);
      setLoginError(err?.message || 'Invalid Admin credentials or unauthorized access.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1 of Signup: Validate form and dispatch OTP to student email
  const handleInitiateSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanRegNo = signupRegNo.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanRegNo || !cleanName || !cleanPhone || !cleanEmail || !cleanPassword) {
      setErrorMsg('Please fill in all mandatory fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address (e.g. student@college.edu).');
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (studentType === 'hosteller' && !roomNo.trim()) {
      setErrorMsg('Please specify your hostel room number.');
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
        setOtpSentMessage(result.message || `Verification code dispatched to ${cleanEmail}.`);
      } else {
        setErrorMsg(result.message || 'Failed to dispatch verification OTP to your email.');
      }
    } catch (err: any) {
      console.error('Signup OTP initiation error:', err);
      setErrorMsg(err?.message || 'Error generating OTP. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 of Signup: Verify entered 6-digit OTP and complete student registration
  const handleVerifyOtpAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanRegNo = signupRegNo.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const cleanOtp = enteredOtp.trim();

    if (!cleanOtp) {
      setErrorMsg('Please enter the 6-digit OTP code.');
      return;
    }

    if (cleanOtp.length !== 6) {
      setErrorMsg('Please enter a complete 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      // 1. Validate OTP with backend/service
      const verifyResult = await verifyOTPEmail(cleanEmail, cleanOtp);
      if (!verifyResult.success) {
        setErrorMsg(verifyResult.message || 'Invalid or expired OTP code.');
        setLoading(false);
        return;
      }

      // 2. Complete student account registration
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
        role: 'student',
        password: cleanPassword,
      });

      onSuccess(user);
    } catch (err: any) {
      console.error('Verification & registration error:', err);
      setErrorMsg(err?.message || 'Registration failed after OTP verification. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP with cooldown timer
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || loading) return;
    setErrorMsg('');
    setLoading(true);

    try {
      const result = await sendOTPEmail({
        email: email.trim(),
        name: name.trim(),
        regNo: signupRegNo.trim().toUpperCase(),
      });

      if (result.success) {
        setEnteredOtp('');
        setCooldownSeconds(30);
        setOtpSentMessage(result.message || `Resent verification code to ${email.trim()}.`);
      } else {
        setErrorMsg(result.message || 'Failed to resend verification OTP.');
      }
    } catch (err: any) {
      setErrorMsg('Failed to resend verification OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 w-full max-w-lg overflow-hidden my-auto sm:my-6">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 relative">
          {onClose && (
            <button
              id="close-auth-modal-btn"
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Close / Go Back"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20">
              <GraduationCap className="w-7 h-7 text-blue-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">AI Student Grievance Portal</h2>
              <p className="text-xs text-blue-200/90 mt-0.5">Campus Redressal & Anti-Ragging Cell</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 bg-white/10 p-1 rounded-xl mt-6">
            <button
              id="tab-login-btn"
              type="button"
              onClick={() => {
                setActiveTab('login');
                setLoginError('');
                setErrorMsg('');
                setStep('form');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              Student Login
            </button>
            <button
              id="tab-signup-btn"
              type="button"
              onClick={() => {
                setActiveTab('signup');
                setErrorMsg('');
                setStep('form');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              Student Sign Up
            </button>
            <button
              id="tab-admin-btn"
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setLoginError('');
                setErrorMsg('');
                setStep('form');
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              Admin Access
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* TAB 1: STUDENT LOGIN */}
          {activeTab === 'login' && (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  College Register Number *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="student-login-regno"
                    type="text"
                    required
                    placeholder="e.g. 2023CS042"
                    value={loginRegNo}
                    onChange={(e) => setLoginRegNo(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl uppercase font-mono tracking-wider focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="student-login-password"
                    type="password"
                    required
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {loginError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                id="student-login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {loading ? 'Authenticating...' : 'Sign In as Student'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 2: ADMIN ACCESS */}
          {activeTab === 'admin' && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-xl text-xs text-indigo-900 dark:text-indigo-300">
                <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>
                  Unified administrative portal for Super Admin, Department Heads, and Staff. Authenticate to access your assigned queue.
                </span>
              </div>

              {/* Quick-Fill Department Staff Test Credentials */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Quick-Fill Test Credentials
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Click to auto-populate</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {TEST_STAFF_CREDENTIALS.map((cred) => {
                    const IconComponent = cred.icon;
                    const isSelected = adminEmail.toLowerCase() === cred.email.toLowerCase();
                    return (
                      <button
                        key={cred.department}
                        type="button"
                        id={`test-cred-${cred.department.toLowerCase().replace(/[^a-z0-9]/g, '-')}-btn`}
                        onClick={() => {
                          setAdminEmail(cred.email);
                          setAdminPassword(cred.password);
                          setLoginError('');
                        }}
                        className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/80'
                            : cred.color
                        }`}
                        title={`Select ${cred.name} (${cred.email})`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold truncate max-w-[85px]">{cred.department}</span>
                          <IconComponent className="w-3 h-3 shrink-0 opacity-75" />
                        </div>
                        <div className="text-[9px] opacity-75 truncate">{cred.email}</div>
                      </button>
                    );
                  })}
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
                    placeholder="e.g. admin.grievance@college.edu or hostel.welfare@college.edu"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="admin-password-input"
                    type="password"
                    required
                    placeholder="Enter password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {loginError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                id="admin-login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In to Administrative Console'}</span>
                <Shield className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 3: STUDENT SIGNUP */}
          {activeTab === 'signup' && (
            <div>
              {step === 'form' ? (
                /* STEP 1: REGISTRATION FORM */
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
                        placeholder="e.g. 2024EC109"
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Gender
                      </label>
                      <select
                        id="signup-gender-select"
                        value={gender}
                        onChange={(e) => setGender(e.target.value as any)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Residency Type *
                      </label>
                      <div className="flex gap-2">
                        <button
                          id="select-type-hosteller-btn"
                          type="button"
                          onClick={() => setStudentType('hosteller')}
                          className={`flex-1 py-1.5 text-xs rounded-lg font-medium border cursor-pointer ${
                            studentType === 'hosteller'
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300 font-semibold'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Hosteller
                        </button>
                        <button
                          id="select-type-dayscholar-btn"
                          type="button"
                          onClick={() => setStudentType('dayscholar')}
                          className={`flex-1 py-1.5 text-xs rounded-lg font-medium border cursor-pointer ${
                            studentType === 'dayscholar'
                              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300 font-semibold'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Dayscholar
                        </button>
                      </div>
                    </div>
                  </div>

                  {studentType === 'hosteller' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50/40 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/60">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Hostel Block
                        </label>
                        <select
                          id="signup-hostel-block-select"
                          value={hostelBlock}
                          onChange={(e) => setHostelBlock(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg"
                        >
                          {HOSTEL_BLOCKS.map((hb) => (
                            <option key={hb} value={hb}>
                              {hb}
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
                          placeholder="e.g. B-204"
                          value={roomNo}
                          onChange={(e) => setRoomNo(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg"
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
                        College Email Address *
                      </label>
                      <input
                        id="signup-email-input"
                        type="email"
                        required
                        placeholder="student@college.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Choose Account Password *
                    </label>
                    <input
                      id="signup-password-input"
                      type="password"
                      required
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-800"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    id="submit-signup-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs"
                  >
                    {loading ? 'Dispatching Verification OTP...' : 'Proceed to OTP Verification'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* STEP 2: OTP VERIFICATION MODAL */
                <form onSubmit={handleVerifyOtpAndRegister} className="space-y-4">
                  <div className="text-center p-4 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl">
                    <KeyRound className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Email OTP Verification</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{otpSentMessage}</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                      Enter the 6-Digit OTP Code
                    </label>
                    <input
                      id="signup-otp-input"
                      type="text"
                      maxLength={6}
                      required
                      autoFocus
                      placeholder="• • • • • •"
                      value={enteredOtp}
                      onChange={(e) => setEnteredOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-48 mx-auto block text-center tracking-widest text-lg font-mono font-bold py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Resend OTP Bar with Cooldown Timer */}
                  <div className="flex items-center justify-between text-xs px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <span className="text-slate-500 dark:text-slate-400">Didn't receive the email?</span>
                    <button
                      id="resend-otp-btn"
                      type="button"
                      disabled={cooldownSeconds > 0 || loading}
                      onClick={handleResendOtp}
                      className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      {cooldownSeconds > 0 ? `Resend OTP in ${cooldownSeconds}s` : 'Resend OTP'}
                    </button>
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 text-center">
                      {errorMsg}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      id="back-to-signup-form-btn"
                      type="button"
                      onClick={() => {
                        setStep('form');
                        setErrorMsg('');
                      }}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-xl font-medium cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      id="verify-otp-submit-btn"
                      type="submit"
                      disabled={loading || enteredOtp.trim().length !== 6}
                      className="flex-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {loading ? 'Verifying OTP...' : 'Verify OTP & Complete Sign Up'}
                      <CheckCircle2 className="w-3.5 h-3.5" />
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
