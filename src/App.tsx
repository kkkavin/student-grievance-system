import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  User,
  LogOut,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Inbox,
  Filter,
  Sun,
  Moon,
  Layers,
} from 'lucide-react';
import { UserProfile, Grievance, PriorityLevel, StudentType } from './types';
import { INITIAL_GRIEVANCES } from './data/initialData';
import { DAYSCHOLAR_CATEGORIES } from './data/constants';
import { AuthModal } from './components/AuthModal';
import { StudentComplaintForm } from './components/StudentComplaintForm';
import { AdminDashboard } from './components/AdminDashboard';
import { DepartmentDashboard } from './components/DepartmentDashboard';
import { FAQSection } from './components/FAQSection';
import { ProfileModal } from './components/ProfileModal';
import { fetchGrievances, updateGrievanceApi, resolveGrievanceCascadeApi, saveUserApi, clearAuthToken } from './api';

export default function App() {
  // Current user state (persisted across page reloads via localStorage)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const savedUser = localStorage.getItem('grievance_portal_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('grievance_portal_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('grievance_portal_user');
    }
  }, [currentUser]);

  const [currentPath, setCurrentPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? window.location.pathname : '/';
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'signup' | 'admin'>('login');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [activeView, setActiveView] = useState<'home' | 'new_complaint'>('home');
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Synchronize client-side URL routing
  useEffect(() => {
    const handleLocationChange = () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname;
      setCurrentPath(path);
      if (path === '/admin/login') {
        setAuthInitialTab('admin');
        setIsAuthModalOpen(true);
      }
    };

    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Dark Mode state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Derived user roles
  const userRoleUpper = (currentUser?.role || '').toUpperCase();
  const isSuperAdmin = userRoleUpper === 'SUPER_ADMIN' || userRoleUpper === 'ADMIN';
  const isDepartmentStaff = userRoleUpper === 'DEPARTMENT_STAFF' || userRoleUpper === 'DEPARTMENT_HEAD';

  // Live complaints list
  const [grievances, setGrievances] = useState<Grievance[]>(() => {
    try {
      const savedUser = localStorage.getItem('grievance_portal_user');
      return savedUser ? INITIAL_GRIEVANCES : [];
    } catch {
      return [];
    }
  });

  // Fetch grievances from backend with strict role and authentication filtering
  const loadGrievances = async () => {
    try {
      if (!currentUser) {
        setGrievances([]);
        return;
      }

      if (isSuperAdmin || isDepartmentStaff) {
        const list = await fetchGrievances();
        if (Array.isArray(list)) {
          setGrievances(list);
        }
      } else {
        const list = await fetchGrievances({
          role: 'student',
          studentRegNo: currentUser.regNo,
          studentEmail: currentUser.email,
        });
        if (Array.isArray(list)) {
          setGrievances(list);
        }
      }
    } catch (err) {
      console.warn('Grievances fetch notice (using current state):', err);
    }
  };

  useEffect(() => {
    loadGrievances();
    // Poll every 4s for fresh updates from backend
    const interval = setInterval(loadGrievances, 4000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Handle student submitted complaint
  const handleGrievanceSubmitted = (newTicket: Grievance) => {
    setGrievances((prev) => {
      const existingKeys = new Set(
        prev.map((g) => (g.ticketNo || g.id).trim().toUpperCase())
      );
      const newKey = (newTicket.ticketNo || newTicket.id).trim().toUpperCase();
      if (existingKeys.has(newKey)) {
        return prev;
      }
      return [newTicket, ...prev];
    });
    setActiveView('home');
    setSuccessBanner(
      `Grievance ticket #${newTicket.ticketNo} registered successfully!`
    );
    // Auto-dismiss banner after 8s
    setTimeout(() => {
      setSuccessBanner(null);
    }, 8000);
  };

  // Admin marks complaint priority
  const handleUpdatePriority = async (id: string, priority: PriorityLevel) => {
    setGrievances((prev) =>
      prev.map((g) => (g.id === id ? { ...g, priority } : g))
    );

    try {
      await updateGrievanceApi(id, { priority });
    } catch (err) {
      console.warn('Priority update fallback:', err);
    }
  };

  // Admin marks complaint "Done" and dispatches automated notice
  const handleMarkDone = async (id: string, customResolutionNote?: string) => {
    const target = grievances.find((g) => g.id === id);
    if (!target) return;

    const resolvedAt = new Date().toISOString();
    const adminNotes = customResolutionNote || 'Resolved by administration.';

    // Optimistically resolve parent and all linked child complaints simultaneously
    setGrievances((prev) =>
      prev.map((g) =>
        g.id === id || g.masterCaseId === id || (target.ticketNo && g.masterTicketNo === target.ticketNo)
          ? { ...g, status: 'resolved', resolvedAt, adminNotes }
          : g
      )
    );

    // Call cascading resolution endpoint
    try {
      const res = await resolveGrievanceCascadeApi(id, adminNotes);
      if (res && Array.isArray(res.childIds) && res.childIds.length > 0) {
        setGrievances((prev) =>
          prev.map((g) =>
            res.childIds.includes(g.id)
              ? { ...g, status: 'resolved', resolvedAt, adminNotes }
              : g
          )
        );
      }
    } catch (err) {
      console.warn('Cascading resolution fallback to single update:', err);
      try {
        await updateGrievanceApi(id, {
          status: 'resolved',
          resolvedAt,
          adminNotes,
        });
      } catch (fallbackErr) {
        console.warn('Mark done update fallback error:', fallbackErr);
      }
    }

    // Trigger automated resolution notification
    try {
      await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: target.studentEmail,
          type: 'resolution',
          ticketNo: target.ticketNo,
          studentName: target.studentName,
          category: target.category,
          customMessage: customResolutionNote,
        }),
      });
    } catch (err) {
      console.warn('Failed to send resolution email:', err);
    }
  };

  // Admin re-opens complaint
  const handleReopen = async (id: string) => {
    const target = grievances.find((g) => g.id === id);
    if (!target) return;

    const updatedTicket: Grievance = {
      ...target,
      status: 'pending',
      resolvedAt: undefined,
    };

    setGrievances((prev) =>
      prev.map((g) => (g.id === id ? updatedTicket : g))
    );

    // Update database
    try {
      await updateGrievanceApi(id, {
        status: 'pending',
        resolvedAt: null as any,
      });
    } catch (err) {
      console.warn('Reopen update fallback:', err);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('grievance_portal_user');
    clearAuthToken();
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
      setCurrentPath('/');
    }
    setIsAuthModalOpen(true);
    setActiveView('home');
  };

  const handleLoginSuccess = (user: UserProfile, redirectUrl?: string) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    setActiveView('home');

    // Dynamic Role Routing
    const roleUpper = (user.role || '').toUpperCase();
    let targetPath = redirectUrl;
    if (!targetPath) {
      if (roleUpper === 'SUPER_ADMIN' || roleUpper === 'ADMIN') {
        targetPath = '/admin/dashboard';
      } else if (roleUpper === 'DEPARTMENT_STAFF' || roleUpper === 'DEPARTMENT_HEAD') {
        targetPath = '/admin/department/dashboard';
      } else {
        targetPath = '/';
      }
    }

    if (typeof window !== 'undefined' && targetPath) {
      window.history.pushState({}, '', targetPath);
      setCurrentPath(targetPath);
    }
  };

  // Filter and reverse-chronologically sort complaints for current student
  const studentGrievances = grievances
    .filter(
      (g) => currentUser && (g.studentRegNo === currentUser.regNo || g.studentEmail === currentUser.email)
    )
    .sort((a, b) => {
      const timeA = new Date(a.resolvedAt || a.createdAt).getTime();
      const timeB = new Date(b.resolvedAt || b.createdAt).getTime();
      return timeB - timeA;
    });

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-100 dark:selection:bg-blue-900 selection:text-blue-900 dark:selection:text-blue-100 transition-colors">
      {/* ========================================================================= */}
      {/* 1. HEADER SECTION (Student Grievance name top-left, Profile UI top-right) */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          {/* Top Left: Student Grievance Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              id="brand-logo-btn"
              onClick={() => setActiveView('home')}
              className="flex items-center gap-2 sm:gap-2.5 text-left group cursor-pointer min-h-[44px] min-w-0"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-sm sm:text-base md:text-lg tracking-tight text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors block leading-tight truncate">
                  Student Grievance System
                </span>
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 block truncate max-w-[130px] min-[400px]:max-w-[180px] sm:max-w-none">
                  AI-Powered College Redressal Cell
                </span>
              </div>
            </button>
          </div>

          {/* Top Right: Dark Mode Toggle + Profile UI / Login Controls */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* DARK MODE TOGGLE BUTTON */}
            <button
              id="dark-mode-toggle-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700 flex items-center justify-center shrink-0"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
              <span className="sr-only">Toggle Theme</span>
            </button>

            {currentUser ? (
              <div className="relative">
                {/* Profile Interactive Dropdown Trigger */}
                <button
                  id="user-profile-dropdown-btn"
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="flex items-center gap-1.5 sm:gap-2 pl-2 sm:pl-2.5 pr-2.5 sm:pr-3 py-1.5 sm:py-1 min-h-[44px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block text-left text-xs">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      {isSuperAdmin
                        ? 'Super Administrator'
                        : isDepartmentStaff
                        ? currentUser.role === 'DEPARTMENT_HEAD'
                          ? 'Dept. Head'
                          : 'Dept. Staff'
                        : currentUser.regNo}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5 sm:ml-1 shrink-0" />
                </button>

                {/* Profile Dropdown Dialogue Box */}
                {isUserDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsUserDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 sm:w-52 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50">
                      <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
                      </div>

                      <button
                        id="dropdown-profile-option"
                        onClick={() => {
                          setIsUserDropdownOpen(false);
                          setIsProfileModalOpen(true);
                        }}
                        className="w-full text-left px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <User className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>Profile</span>
                      </button>

                      <button
                        id="dropdown-logout-option"
                        onClick={() => {
                          setIsUserDropdownOpen(false);
                          setIsLogoutConfirmOpen(true);
                        }}
                        className="w-full text-left px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2.5 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                id="header-login-btn"
                onClick={() => setIsAuthModalOpen(true)}
                className="min-h-[44px] px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] sm:text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center shrink-0"
              >
                Login / Sign Up
              </button>
            )}
          </div>
        </div>
      </header>

      {/* SUCCESS CONFIRMATION BANNER */}
      {successBanner && (
        <div
          id="system-success-banner"
          className="bg-emerald-600 text-white py-3 px-3 sm:px-4 shadow-sm transition-all"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-xs font-medium">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate sm:overflow-visible sm:whitespace-normal">{successBanner}</span>
            </div>
            <button
              onClick={() => setSuccessBanner(null)}
              className="text-white/80 hover:text-white font-bold p-2 sm:p-1 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN BODY CONTENT */}
      {/* ========================================================================= */}
      <main className="flex-1">
        {/* CASE 1: Student is in "New Complaint" Page */}
        {activeView === 'new_complaint' && currentUser && (
          <StudentComplaintForm
            user={currentUser}
            onBack={() => setActiveView('home')}
            onSubmitSuccess={handleGrievanceSubmitted}
          />
        )}

        {/* CASE 2: Super Admin Dashboard View */}
        {activeView === 'home' && isSuperAdmin && (
          <AdminDashboard
            grievances={grievances}
            onUpdatePriority={handleUpdatePriority}
            onMarkDone={handleMarkDone}
            onReopen={handleReopen}
          />
        )}

        {/* CASE 3: Scoped Department Console View */}
        {activeView === 'home' && isDepartmentStaff && (
          <DepartmentDashboard
            currentUser={currentUser!}
            initialGrievances={grievances}
            onLogout={handleLogout}
          />
        )}

        {/* CASE 4: Student Perspective Homepage */}
        {activeView === 'home' && !isSuperAdmin && !isDepartmentStaff && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-10">
            {/* Student Hero Banner with Action Button */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-10 shadow-lg">
              <div className="relative z-10 max-w-2xl space-y-3.5 sm:space-y-4">
                <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[11px] sm:text-xs font-medium text-blue-200 border border-white/10 max-w-full">
                  <Sparkles className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                  <span className="truncate">College Grievance Redressal & Anti-Ragging Portal</span>
                </div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
                  Have a problem on campus or in your hostel?
                </h1>
                <p className="text-xs sm:text-sm md:text-base text-slate-300 leading-relaxed">
                  Lodge complaints regarding hostel damages, water leakage, Wi-Fi, mess food, bus routes, or any college trouble. Our automated local triage prioritizes authentic issues directly with management.
                </p>

                {/* THE MANDATED STUDENT COMPLAINT BUTTON */}
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    id="lodge-complaint-hero-btn"
                    onClick={() => {
                      if (!currentUser) {
                        setIsAuthModalOpen(true);
                      } else {
                        setActiveView('new_complaint');
                      }
                    }}
                    className="relative group w-full sm:w-auto min-h-[44px] justify-center px-6 py-3.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 hover:from-blue-400 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all flex items-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <PlusCircle className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300 shrink-0" />
                    <span>Lodge Complaint</span>
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-white/20 text-white/95 shrink-0">
                      AI Triage
                    </span>
                  </button>
                </div>
              </div>

              {/* Decorative graphic element */}
              <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-12 translate-y-12">
                <GraduationCap className="w-96 h-96 text-white" />
              </div>
            </div>

            {/* Student's Past Submitted Complaints Tracking */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    Your Lodged Grievances
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Track real-time status and resolution from the hostel and college authorities
                  </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-2.5">
                  <button
                    onClick={() => {
                      if (!currentUser) {
                        setIsAuthModalOpen(true);
                      } else {
                        setActiveView('new_complaint');
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>New Complaint</span>
                  </button>

                  <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-2 sm:py-1.5 rounded-xl border border-blue-100 dark:border-blue-900 shrink-0">
                    {studentGrievances.length} Registered
                  </span>
                </div>
              </div>

              {studentGrievances.length === 0 ? (
                <div className="p-6 sm:p-8 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl space-y-4 shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">No complaints registered yet</div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                      Facing hostel water leaks, Wi-Fi outages, or mess issues? Click below to lodge a complaint with automated AI classification.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (!currentUser) {
                        setIsAuthModalOpen(true);
                      } else {
                        setActiveView('new_complaint');
                      }
                    }}
                    className="w-full sm:w-auto min-h-[44px] justify-center inline-flex items-center gap-2 px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Lodge First Grievance</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                  {studentGrievances.map((item) => {
                    const isMerged =
                      Boolean(item.masterTicketNo) ||
                      Boolean(item.masterCaseId) ||
                      item.status === 'MERGED_AUTOMATIC' ||
                      item.status === 'MERGED';

                    return (
                      <div
                        key={item.id}
                        id={`student-ticket-card-${item.id}`}
                        className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all space-y-3.5 flex flex-col justify-between"
                      >
                        <div className="space-y-2.5">
                          {/* Header Row: Ticket No & Status Pill */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                              {item.ticketNo}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                                item.status === 'resolved'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800'
                                  : item.status === 'in_progress'
                                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800'
                                  : item.status === 'MERGED_AUTOMATIC' || item.status === 'MERGED'
                                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800'
                                  : item.status === 'SUSPECTED_DUPLICATE'
                                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800'
                                  : 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800'
                              }`}
                            >
                              {item.status === 'resolved'
                                ? 'Resolved'
                                : item.status === 'in_progress'
                                ? 'In Progress'
                                : item.status === 'MERGED_AUTOMATIC' || item.status === 'MERGED'
                                ? 'Consolidated'
                                : item.status === 'SUSPECTED_DUPLICATE'
                                ? 'Under Review'
                                : 'Under Review'}
                            </span>
                          </div>

                          {/* Dedicated Consolidation Banner (Persists even when resolved) */}
                          {isMerged && (
                            <div
                              id={`student-consolidation-banner-${item.id}`}
                              className="flex items-center gap-2 p-2.5 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 rounded-xl text-xs text-purple-900 dark:text-purple-200"
                            >
                              <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                              <div className="leading-tight">
                                <span className="font-semibold">Consolidated with Master Case </span>
                                <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                                  #{item.masterTicketNo || item.masterCaseId || 'Incident'}
                                </span>
                                <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">
                                  Cluster incident — all administrative actions and updates are synchronized.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Category Tag */}
                          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                            {item.category}
                          </div>

                          {/* Student's OWN Complaint Description (Zero other students' data) */}
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                            {item.description}
                          </p>
                        </div>

                        {/* Public Master Case Notes Callout */}
                        {item.publicMasterNotes && (
                          <div
                            id={`student-master-notes-${item.id}`}
                            className="p-3 bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl text-xs text-purple-950 dark:text-purple-200 space-y-1"
                          >
                            <div className="flex items-center gap-1.5 font-bold text-purple-900 dark:text-purple-300 text-[11px]">
                              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                              <span>📢 Public Master Case Update:</span>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                              {item.publicMasterNotes}
                            </p>
                          </div>
                        )}

                        {/* Admin Action Notes Callout */}
                        {item.adminNotes && (
                          <div
                            id={`student-admin-notes-${item.id}`}
                            className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-950 dark:text-emerald-200 space-y-1"
                          >
                            <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Admin Action Note:</span>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                              {item.adminNotes}
                            </p>
                          </div>
                        )}

                        {/* Card Footer: Timestamp & Room Details */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                          <span>Submitted {new Date(item.createdAt).toLocaleDateString()}</span>
                          {item.roomNo && <span>Room {item.roomNo}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MANDATED REQUIREMENT 2: FAQs at the end of the page */}
            <FAQSection />
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 3. MODALS & SUB-COMPONENTS */}
      {/* ========================================================================= */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialTab={authInitialTab}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />

      {currentUser && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          user={currentUser}
          onClose={() => setIsProfileModalOpen(false)}
          onSave={async (updatedUser) => {
            setCurrentUser(updatedUser);
            localStorage.setItem('grievance_portal_user', JSON.stringify(updatedUser));
            try {
              await saveUserApi(updatedUser);
            } catch (err) {
              console.warn('Profile update fallback:', err);
            }
            setSuccessBanner('Profile information updated successfully!');
            setTimeout(() => setSuccessBanner(null), 4000);
          }}
        />
      )}

      {/* Logout Confirmation Dialogue Box */}
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 max-w-sm w-full p-5 sm:p-6 text-center space-y-4 my-auto">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Confirm Logout</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to log out of the Student Grievance System?
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                id="cancel-logout-modal-btn"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="flex-1 min-h-[44px] py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                id="confirm-logout-modal-btn"
                onClick={() => {
                  setIsLogoutConfirmOpen(false);
                  handleLogout();
                }}
                className="flex-1 min-h-[44px] py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs flex items-center justify-center"
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Campus Outbox Modal */}
      {/* ========================================================================= */}
      {/* 4. FOOTER */}
      {/* ========================================================================= */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 mt-12 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Student Grievance Redressal System
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
