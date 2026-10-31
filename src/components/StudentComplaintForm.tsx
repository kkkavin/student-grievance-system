import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Send,
  AlertTriangle,
  FileText,
  Loader2,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Mic,
  MicOff,
  RotateCcw,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  Edit3,
  Shield,
  Zap,
  Droplets,
  Wifi,
  Utensils,
  Bus,
  Wrench,
  Building,
  GraduationCap
} from 'lucide-react';
import { UserProfile, Grievance, PriorityLevel } from '../types';
import { createGrievanceApi } from '../api';
import { defaultClassifier, ClassificationResult } from '../ml/complaintClassifier';

interface StudentComplaintFormProps {
  user: UserProfile;
  onBack: () => void;
  onSubmitSuccess: (ticket: Grievance) => void;
}

// ---------------------------------------------------------------------------
// Real-time Local ML Model Category & Urgency Classifier
// ---------------------------------------------------------------------------
function detectRealTimeCategory(text: string, studentType?: string): ClassificationResult {
  return defaultClassifier.predict(text, studentType);
}

// ---------------------------------------------------------------------------
// Text Clarity & Actionability Evaluator
// ---------------------------------------------------------------------------
function evaluateClarity(text: string): { label: string; tone: 'idle' | 'short' | 'good' | 'great'; tip: string } {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;

  if (trimmed.length === 0) {
    return {
      label: 'AI Ready',
      tone: 'idle',
      tip: 'Type your grievance below. The AI handles categorization automatically.',
    };
  }
  if (trimmed.length < 16 || words < 4) {
    return {
      label: 'Add More Detail',
      tone: 'short',
      tip: 'Include specific location (e.g. room #, floor, or bus route) for prompt action.',
    };
  }
  if (words < 12) {
    return {
      label: 'Good Clarity',
      tone: 'good',
      tip: 'Clear complaint description detected.',
    };
  }
  return {
    label: 'High Precision & Actionable',
    tone: 'great',
    tip: 'Excellent detail. Your ticket will be expedited.',
  };
}

// ---------------------------------------------------------------------------
// Quick Prompt Starter Templates (Minimalist & Compact)
// ---------------------------------------------------------------------------
const PROMPT_TEMPLATES = [
  {
    id: 'water',
    title: '💧 Water leak',
    template: `Location: Hostel Block A, Room 204\nProblem: Continuous water leakage from washroom tap\nDuration: Started today morning\nUrgency: High`,
  },
  {
    id: 'wifi',
    title: '📶 Wi-Fi',
    template: `Location: Block C 2nd Floor / Room 312\nProblem: Hostel Wi-Fi signal drops frequently and disconnects during study hours\nDevice: Laptop & Phone`,
  },
  {
    id: 'electric',
    title: '⚡ Power / Fan',
    template: `Location: Classroom 402 / Hostel Room 118\nProblem: Ceiling fan making loud sparking noise and regulator is stuck\nUrgency: Urgent repair required`,
  },
  {
    id: 'mess',
    title: '🍱 Mess food',
    template: `Location: Main Dining Hall (Counter 2)\nMeal Time: Lunch\nProblem: Food served cold and water dispenser is empty\nSuggested Fix: Refill drinking water and maintain food temperature`,
  },
  {
    id: 'bus',
    title: '🚌 Bus route',
    template: `Route No: College Bus #14 (via Main Junction)\nProblem: Bus arrived 30 minutes late and was heavily overcrowded\nDate & Time: Morning 8:15 AM`,
  },
  {
    id: 'lab',
    title: '🔬 Lab PC',
    template: `Location: Lab 3 (Systems Lab)\nProblem: System #24 monitor flickering and keyboard keys stuck\nImpact: Unable to run programming lab exercises`,
  },
  {
    id: 'safety',
    title: '🛡️ Safety report',
    template: `Strictly Confidential Safety Notice:\nLocation: Near Campus Ground / Block B corridor\nDetails: Severe harassment incident observed\nUrgency: Immediate confidential action requested`,
  },
];

// ---------------------------------------------------------------------------
// Inline Markdown Parser for Live Preview Tab
// ---------------------------------------------------------------------------
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|<u>[^<]+<\/u>|~~[^~]+~~|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={match.index} className="font-bold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={match.index} className="italic text-slate-800 dark:text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('<u>') && token.endsWith('</u>')) {
      tokens.push(
        <span key={match.index} className="underline underline-offset-2 decoration-blue-500">
          {token.slice(3, -4)}
        </span>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      tokens.push(
        <span key={match.index} className="line-through opacity-70">
          {token.slice(2, -2)}
        </span>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-blue-600 dark:text-blue-300 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.substring(lastIndex));
  }

  return tokens.length > 0 ? tokens : [text];
}

export const StudentComplaintForm: React.FC<StudentComplaintFormProps> = ({
  user,
  onBack,
  onSubmitSuccess,
}) => {
  // Main complaint text state
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  // Interactive UI states
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);

  // Undo memory for cleared text
  const [clearedText, setClearedText] = useState<string | null>(null);

  // Voice speech-to-text
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Submitting & confirmation
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState<Grievance | null>(null);
  const [copiedTicketNo, setCopiedTicketNo] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea dynamically as content grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.max(160, Math.min(scrollHeight, 420))}px`;
    }
  }, [description, activeTab]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Handle typing detection for responsive glow animations
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    setIsTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1200);
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Real-time AI categorization & clarity evaluation
  const aiRealtime = detectRealTimeCategory(description, user.studentType);
  const clarity = evaluateClarity(description);

  // Text formatting insertion helper
  const insertFormatting = (prefix: string, suffix: string = '', defaultPlaceholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = description.substring(start, end);
    const textToWrap = selectedText || defaultPlaceholder;
    const replacement = `${prefix}${textToWrap}${suffix}`;

    const updatedText = description.substring(0, start) + replacement + description.substring(end);
    setDescription(updatedText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectedText ? start : start + prefix.length,
        selectedText ? start + replacement.length : start + prefix.length + defaultPlaceholder.length
      );
    }, 15);
  };

  // Line prefix formatting (bullets, numbers, quotes)
  const insertLinePrefix = (linePrefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = description.substring(start, end);

    if (selectedText.includes('\n') || selectedText.length > 0) {
      const formatted = selectedText
        .split('\n')
        .map((line) => `${linePrefix} ${line.replace(/^([•\-\*]|\d+\.|\>)\s*/, '')}`)
        .join('\n');
      const updatedText = description.substring(0, start) + formatted + description.substring(end);
      setDescription(updatedText);
    } else {
      const before = description.substring(0, start);
      const after = description.substring(start);
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      const insertion = (needsNewline ? '\n' : '') + `${linePrefix} `;
      setDescription(before + insertion + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + insertion.length, start + insertion.length);
      }, 15);
    }
  };

  // Auto sentence capitalization
  const handleAutoCapitalize = () => {
    if (!description.trim()) return;
    const capitalized = description.replace(
      /(^\s*|[.!?]\s+)([a-z])/g,
      (_, prefix, char) => prefix + char.toUpperCase()
    );
    setDescription(capitalized);
  };

  // Clear text with undo feature
  const handleClear = () => {
    if (!description) return;
    setClearedText(description);
    setDescription('');
  };

  const handleUndoClear = () => {
    if (clearedText !== null) {
      setDescription(clearedText);
      setClearedText(null);
    }
  };

  // Speech to text toggle
  const toggleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        'Speech recognition is supported in Google Chrome, Microsoft Edge, and Safari. You can type directly in the box below.'
      );
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setDescription((prev) => (prev ? prev + ' ' : '') + finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition warning:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
      setIsListening(false);
    }
  };

  // Copy Ticket ID helper
  const handleCopyTicket = (ticketNo: string) => {
    navigator.clipboard.writeText(ticketNo);
    setCopiedTicketNo(true);
    setTimeout(() => setCopiedTicketNo(false), 2500);
  };

  // Submission handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const trimmed = description.trim();
    if (!trimmed) {
      setErrorMsg('Please describe your grievance in the text box before submitting.');
      return;
    }
    if (trimmed.length > 1000) {
      setErrorMsg('Grievance description must not exceed 1,000 characters.');
      return;
    }

    setSubmitting(true);
    setSubmitStep('1/3 Running Local ML Model classification...');

    try {
      // 1. Send to Local ML Classifier endpoint (works 100% locally with zero external API key)
      let aiResult = {
        isSpam: false,
        reason: 'Legitimate student grievance',
        confidence: aiRealtime.confidence || 0.95,
        suggestedCategory: aiRealtime.category,
        model: aiRealtime.model,
        topFeatures: aiRealtime.topFeatures,
      };

      try {
        const aiRes = await fetch('/api/ai/classify-complaint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmed,
            category: aiRealtime.category,
            studentType: user.studentType,
          }),
        });
        if (aiRes.ok) {
          aiResult = await aiRes.json();
        }
      } catch (err) {
        console.warn('AI classification notice (using client heuristic):', err);
      }

      // Check if flagged as spam / random smash
      if (aiResult.isSpam) {
        setErrorMsg(
          `⚠️ Notice: ${aiResult.reason}. Please describe your grievance with specific details (such as room number, floor, or specific problem).`
        );
        setSubmitting(false);
        return;
      }

      setSubmitStep('2/3 Auto-categorizing & routing to college redressal cell...');

      const assignedCategory = aiResult.suggestedCategory || aiRealtime.category;
      const isUrgent =
        assignedCategory.toLowerCase().includes('ragging') ||
        assignedCategory.toLowerCase().includes('harass') ||
        trimmed.toLowerCase().includes('urgent') ||
        trimmed.toLowerCase().includes('emergency') ||
        aiRealtime.isUrgent;

      const priority: PriorityLevel = isUrgent ? 'urgent' : 'medium';
      const ticketNo = `GRV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const grievancePayload: Grievance = {
        id: 'tkt_' + Math.random().toString(36).substring(2, 9),
        ticketNo,
        studentRegNo: user.regNo || 'STUDENT',
        studentName: user.name || 'Student',
        studentEmail: user.email || 'student@college.edu',
        studentPhone: user.phone || '9876543210',
        studentType: user.studentType || 'dayscholar',
        hostelBlock: user.studentType === 'hosteller' ? (user.hostelBlock || 'Block A') : undefined,
        roomNo: user.studentType === 'hosteller' ? (user.roomNo || 'N/A') : undefined,
        category: assignedCategory,
        description: trimmed,
        status: 'pending',
        priority,
        isSpam: aiResult.isSpam,
        spamReason: aiResult.reason,
        aiClassification: aiResult,
        createdAt: new Date().toISOString(),
      };

      setSubmitStep('3/3 Saving ticket & generating confirmation...');

      // Save to SQLite via backend REST API
      const savedGrievance = await createGrievanceApi(grievancePayload);

      // Automated email notification dispatch
      try {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: savedGrievance.studentEmail,
            type: 'confirmation',
            ticketNo: savedGrievance.ticketNo,
            studentName: savedGrievance.studentName,
            category: savedGrievance.category,
          }),
        });
      } catch (notifErr) {
        console.warn('Confirmation notice fallback:', notifErr);
      }

      // Show celebratory confirmation view
      setSubmittedTicket(savedGrievance);
    } catch (err: any) {
      setErrorMsg('Failed to submit grievance: ' + (err?.message || 'Server connection error'));
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = description.length;
  const wordCount = description.trim() ? description.trim().split(/\s+/).length : 0;

  // -------------------------------------------------------------------------
  // SUCCESS CELEBRATION VIEW
  // -------------------------------------------------------------------------
  if (submittedTicket) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 animate-fade-in">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 sm:p-10 text-center relative overflow-hidden">
          {/* Ambient celebration halo */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-br from-emerald-500/20 via-blue-500/20 to-purple-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Success Icon */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/25 mb-6 relative">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Grievance Ticket Lodged!
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-md mx-auto">
            Your complaint has been successfully analyzed by AI and routed directly to the college redressal authorities.
          </p>

          {/* Ticket Details Pill */}
          <div className="my-8 p-5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700 max-w-md mx-auto text-left space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Ticket Reference
              </span>
              <button
                onClick={() => handleCopyTicket(submittedTicket.ticketNo)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 cursor-pointer"
              >
                {copiedTicketNo ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Ticket ID</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-xl sm:text-2xl font-mono font-extrabold text-slate-900 dark:text-white tracking-wide">
              {submittedTicket.ticketNo}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Auto Category</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {submittedTicket.category}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Assigned Priority</span>
                <span
                  className={`font-semibold capitalize ${
                    submittedTicket.priority === 'urgent'
                      ? 'text-red-600 dark:text-red-400 font-bold'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {submittedTicket.priority || 'medium'}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <button
              id="success-view-dashboard-btn"
              onClick={() => onSubmitSuccess(submittedTicket)}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>View in Dashboard</span>
            </button>
            <button
              onClick={() => {
                setSubmittedTicket(null);
                setDescription('');
              }}
              className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              <span>Lodge Another Grievance</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // MAIN COMPLAINT FORM INTERFACE
  // -------------------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* 1. Header Navigation & Student Context Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-home-btn"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group cursor-pointer w-fit"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Back to Dashboard</span>
        </button>

        {/* Student Context Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs text-[11px] text-slate-600 dark:text-slate-300">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-slate-900 dark:text-white">{user.name}</span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="font-mono text-slate-500 dark:text-slate-400">{user.regNo}</span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            {user.studentType === 'hosteller'
              ? `${user.hostelBlock || 'Hostel'} · Room ${user.roomNo || 'N/A'}`
              : 'Dayscholar'}
          </span>
        </div>
      </div>

      {/* 2. Hero Title Section */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/60 dark:to-indigo-950/60 border border-blue-200/60 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-spin-slow" />
          <span>Local ML Auto-Triage Active (100% Offline)</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Describe Your Grievance
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
          Simply type what happened below. A small local ML model automatically classifies the department, sets priority, and alerts the college redressal team. No category selection required.
        </p>
      </div>

      {/* 3. Quick Starter Templates (Minimalist Chips - No Scrollbar, Fits Cleanly) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 inline-flex items-center gap-1 mr-1 select-none">
          <Sparkles className="w-3 h-3 text-blue-500" />
          <span>Starters:</span>
        </span>
        {PROMPT_TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.id}
            type="button"
            onClick={() => {
              if (description && !confirm('Insert template and append to your text?')) return;
              setDescription((prev) => (prev ? prev + '\n\n' : '') + tmpl.template);
            }}
            className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200/90 dark:bg-slate-800/80 dark:hover:bg-slate-700/90 border border-slate-200/70 dark:border-slate-700/70 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 text-[11px] font-medium transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            {tmpl.title}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/80 rounded-2xl flex items-start gap-3 text-xs text-red-700 dark:text-red-300 animate-shake">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="leading-relaxed">{errorMsg}</div>
        </div>
      )}

      {/* 4. THE DYNAMIC GLOWING AI CHATBOT TEXTBOX CONTAINER */}
      <div className="relative group">
        {/* Ambient Pulsing Aura Layer behind the textbox */}
        <div
          className={`absolute -inset-1.5 sm:-inset-2 rounded-3xl transition-all duration-700 pointer-events-none -z-10 ${
            isFocused || isTyping
              ? 'bg-gradient-to-r from-blue-600 via-indigo-600 via-purple-600 to-cyan-500 opacity-80 blur-2xl animate-ai-aurora-fast'
              : 'bg-gradient-to-r from-blue-500/30 via-indigo-500/30 via-purple-500/30 to-cyan-500/30 opacity-40 blur-xl animate-ai-aurora'
          }`}
        />

        {/* Outer Glowing Border Ring */}
        <div className="relative p-[1.5px] rounded-3xl bg-gradient-to-r from-blue-500 via-indigo-500 via-purple-500 to-cyan-400 animate-ai-aurora shadow-xl transition-shadow">
          {/* Inner Surface with Glassmorphic Depth */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[calc(1.5rem-1.5px)] p-4 sm:p-5 flex flex-col transition-colors">
            
            {/* Top Toolbar: Formatting Controls + Tabs Switcher */}
            <div className="pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              {/* Left: Rich Text Formatting Tools */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                <button
                  type="button"
                  title="Bold (Ctrl+B)"
                  onClick={() => insertFormatting('**', '**', 'bold text')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Italic (Ctrl+I)"
                  onClick={() => insertFormatting('*', '*', 'italic text')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Underline"
                  onClick={() => insertFormatting('<u>', '</u>', 'underlined text')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Strikethrough"
                  onClick={() => insertFormatting('~~', '~~', 'strikethrough text')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Strikethrough className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

                <button
                  type="button"
                  title="Bullet List"
                  onClick={() => insertLinePrefix('•')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Numbered List"
                  onClick={() => insertLinePrefix('1.')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <ListOrdered className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Quote Block"
                  onClick={() => insertLinePrefix('>')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Quote className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Code / Reference Tag"
                  onClick={() => insertFormatting('`', '`', 'ref-code')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Code className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

                {/* Auto Capitalize */}
                <button
                  type="button"
                  title="Format & Capitalize Sentences"
                  onClick={handleAutoCapitalize}
                  className="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-colors cursor-pointer hidden sm:block"
                >
                  Aa Clean
                </button>
              </div>

              {/* Right: Write vs Preview Mode Switcher */}
              <div className="flex items-center gap-2">
                {clearedText && (
                  <button
                    type="button"
                    onClick={handleUndoClear}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Undo Clear</span>
                  </button>
                )}

                {description && !clearedText && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[11px] text-slate-400 hover:text-red-500 transition-colors cursor-pointer px-1.5 py-0.5"
                    title="Clear text"
                  >
                    Clear
                  </button>
                )}

                <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setActiveTab('write')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === 'write'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Write</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      activeTab === 'preview'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Middle: Content Area (Write vs Preview) */}
            {activeTab === 'write' ? (
              <div className="relative min-h-[160px]">
                <textarea
                  ref={textareaRef}
                  id="complaint-description-textarea"
                  required
                  rows={6}
                  value={description}
                  onChange={handleTextChange}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your issue with clarity... (e.g. location, specific problem, timing). Our AI engine classifies the category and assigns the redressal officer automatically."
                  className="ai-chatbot-textarea w-full p-2 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none font-sans leading-relaxed focus:outline-none transition-all"
                />
              </div>
            ) : (
              /* PREVIEW TAB */
              <div className="min-h-[160px] p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                  <span className="font-semibold uppercase tracking-wider">
                    Simulated Redressal Board View
                  </span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">
                    Category: {aiRealtime.category}
                  </span>
                </div>
                {description.trim() ? (
                  <div className="space-y-2 text-sm leading-relaxed">
                    {description.split('\n').map((line, idx) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <div key={idx} className="h-1.5" />;
                      if (trimmed.startsWith('>')) {
                        return (
                          <blockquote
                            key={idx}
                            className="border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 px-3 py-1.5 rounded-r-lg text-slate-700 dark:text-slate-300 italic"
                          >
                            {parseInlineMarkdown(trimmed.replace(/^>\s*/, ''))}
                          </blockquote>
                        );
                      }
                      if (/^[\*\-\•]\s+/.test(trimmed)) {
                        return (
                          <div key={idx} className="flex items-start gap-2 pl-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                            <span>{parseInlineMarkdown(trimmed.replace(/^[\*\-\•]\s+/, ''))}</span>
                          </div>
                        );
                      }
                      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
                      if (numMatch) {
                        return (
                          <div key={idx} className="flex items-start gap-2 pl-2">
                            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                              {numMatch[1]}.
                            </span>
                            <span>{parseInlineMarkdown(numMatch[2])}</span>
                          </div>
                        );
                      }
                      return <p key={idx}>{parseInlineMarkdown(line)}</p>;
                    })}
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-slate-400 italic">
                    Start typing your complaint in the Write tab to see formatted preview here.
                  </div>
                )}
              </div>
            )}

            {/* Bottom Bar: AI Feedback Badges + Actions */}
            <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              
              {/* Left Group: AI Auto-Detected Category Pill & Voice Mic */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Auto-detected category badge powered by Local ML Model */}
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/80 border border-blue-200/80 dark:border-slate-700 text-xs font-semibold text-blue-700 dark:text-blue-300 shadow-2xs"
                  title={`Local ML Classification: ${aiRealtime.category} (${Math.round(aiRealtime.confidence * 100)}% confidence score)`}
                >
                  <span>{aiRealtime.icon}</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    ML Category:
                  </span>
                  <span className="font-bold">{aiRealtime.category}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-[10px] font-mono font-bold">
                    {Math.round(aiRealtime.confidence * 100)}%
                  </span>
                  {aiRealtime.isUrgent && (
                    <span className="px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300 text-[10px] font-extrabold uppercase tracking-wide">
                      Urgent
                    </span>
                  )}
                </div>

                {/* ML Key Features Token Micro-Pill */}
                {aiRealtime.topFeatures.length > 0 && description.trim().length > 10 && (
                  <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                    <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="text-slate-400 text-[10px]">ML Tokens:</span>
                    <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                      {aiRealtime.topFeatures.join(', ')}
                    </span>
                  </div>
                )}

                {/* Clarity indicator */}
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${
                    clarity.tone === 'great'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                      : clarity.tone === 'good'
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                      : clarity.tone === 'short'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                  }`}
                  title={clarity.tip}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>{clarity.label}</span>
                </div>

                {/* Voice speech mic button with popup positioned directly on top */}
                <div className="relative inline-flex items-center">
                  {isListening && (
                    <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 bg-red-600 text-white shadow-lg shadow-red-500/30 rounded-full text-[11px] font-semibold animate-pulse z-30 pointer-events-none">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      <span>Listening... speak now</span>
                      {/* Downward tooltip indicator arrow */}
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 sm:left-auto sm:right-3 sm:translate-x-0 w-2 h-2 bg-red-600 rotate-45" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    title={isListening ? 'Stop voice recording' : 'Voice dictation (speech-to-text)'}
                    className={`p-2 rounded-xl border transition-all cursor-pointer ${
                      isListening
                        ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/30 animate-pulse'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:border-blue-300'
                    }`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Right Group: Character Count + Glowing Submit Button */}
              <div className="flex items-center justify-between sm:justify-end gap-3">
                <div className="text-right text-[11px] font-mono text-slate-400">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">{wordCount}</span> w ·{' '}
                  <span className={charCount > 900 ? 'text-amber-600 font-bold' : ''}>
                    {charCount}/1000
                  </span>
                </div>

                {/* Mandated Submit Button with AI Gradient Glow */}
                <button
                  id="submit-grievance-btn"
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer transform hover:scale-102 active:scale-98"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{submitStep || 'Submitting Grievance...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Grievance</span>
                      <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
                        ⌘↵
                      </kbd>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 5. Helpful Information & Redressal Commitments */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-blue-500 shrink-0" />
          <span>Automated dispatch to Hostel Warden, Estate Works & Redressal Cell</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>Anti-Ragging Zero Tolerance</span>
        </div>
      </div>
    </div>
  );
};
