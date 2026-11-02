import React, { useState } from 'react';
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
  X
} from 'lucide-react';
import { UserProfile, StudentType } from '../types';
import { HOSTEL_BLOCKS, DEPARTMENT_OPTIONS } from '../data/constants';
import { loginUserApi, registerUserApi } from '../api';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: UserProfile) => void;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onSuccess, onClose }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'signup' | 'admin'>('login');

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

  // Signup state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

  // Handle Admin login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    try {
      const user = await loginUserApi(adminEmail, adminPassword);
      onSuccess(user);
    } catch (err: any) {
      console.error('Admin login error:', err);
      setLoginError(err?.message || 'Invalid Admin credentials or unauthorized access.');
    } finally {
      setLoading(false);
    }
  };

  // Handle direct student registration for real users
  const handleSignup = async (e: React.FormEvent) => {
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
      console.error('Signup error:', err);
      setErrorMsg(err?.message || 'Registration failed. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 w-full max-w-lg overflow-hidden my-6">
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
                  Authorized personnel only. Please sign in with your administrative credentials.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Admin Email *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="admin-email-input"
                    type="email"
                    required
                    placeholder="admin@college.edu"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Admin Master Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="admin-password-input"
                    type="password"
                    required
                    placeholder="Enter admin password"
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
                {loading ? 'Authenticating Admin...' : 'Open Redressal Cell Control Panel'}
                <Shield className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* TAB 3: STUDENT SIGNUP */}
          {activeTab === 'signup' && (
            <div>
              <form onSubmit={handleSignup} className="space-y-3">
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
                    {loading ? 'Creating Student Account...' : 'Complete Registration'}
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
