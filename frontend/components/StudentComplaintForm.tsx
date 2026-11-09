'use client';

/**
 * frontend/components/StudentComplaintForm.tsx
 * 
 * Production Student Grievance Submission Portal.
 * Key Invariants:
 * 1. Live keystroke gating on submit button: disabled live while typing invalid inputs without post-click error banners.
 * 2. Harassment & Ragging acceptance: teasing, bullying, eve-teasing, mocking accepted without requiring campus building name.
 * 3. Strict Off-Campus Rejection: cinemas, malls, Swiggy, Zomato, video games, flights rejected with disabled submit button.
 * 4. Persistent SpeechRecognition voice engine using useRef hooks.
 * 5. Permanent removal of legacy clarity indicator.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Send,
  AlertTriangle,
  FileText,
  Loader2,
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
  Building,
} from 'lucide-react';
import { UserProfile, Grievance, PriorityLevel } from '../types';
import { createGrievanceApi } from '../lib/api';
import {
  defaultClassifier,
  ClassificationResult,
  DEPARTMENT_NAME_MAP,
} from '../lib/classifier';

interface StudentComplaintFormProps {
  user: UserProfile;
  onBack: () => void;
  onSubmitSuccess: (ticket: Grievance) => void;
}

// Inline Markdown Parser for Live Preview Tab
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
  // Main complaint description state
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  // Interactive UI states
  const [isFocused, setIsFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);

  // Undo memory for cleared text
  const [clearedText, setClearedText] = useState<string | null>(null);

  // Voice speech-to-text persistent lifecycle & buffers (useRef handles)
  const [isListening, setIsListening] = useState(false);
  const [micStatusMsg, setMicStatusMsg] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);
  const baseTextRef = useRef<string>('');
  const finalizedTranscriptRef = useRef<string>('');
  const fatalErrorRef = useRef<boolean>(false);

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
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Synchronous Client-Side ML Evaluation on Every Keystroke (<1ms)
  const aiRealtime: ClassificationResult = defaultClassifier.classifyComplaint(
    description,
    user.studentType
  );

  const charCount = description.length;
  const wordCount = description.trim().split(/\s+/).filter(Boolean).length;

  // Textarea typing handler with debounce
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 400);
  };

  // Markdown formatting helper
  const applyFormatting = (prefix: string, suffix: string = prefix, defaultPlaceholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = description.substring(start, end);
    const replacement = selectedText || defaultPlaceholder;

    const newText =
      description.substring(0, start) +
      prefix +
      replacement +
      suffix +
      description.substring(end);

    setDescription(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = selectedText
        ? end + prefix.length + suffix.length
        : start + prefix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos + replacement.length);
    }, 0);
  };

  const handleClearText = () => {
    if (description.trim()) {
      setClearedText(description);
      setDescription('');
    }
  };

  const handleUndoClear = () => {
    if (clearedText !== null) {
      setDescription(clearedText);
      setClearedText(null);
    }
  };

  // Rock-Solid SpeechRecognition Voice Engine using persistent useRef handles
  const toggleVoiceInput = () => {
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      setMicStatusMsg('Speech recognition is not supported in this browser. Please type directly.');
      setTimeout(() => setMicStatusMsg(null), 4000);
      return;
    }

    if (isListeningRef.current) {
      isListeningRef.current = false;
      setIsListening(false);
      try {
        recognitionRef.current?.stop();
      } catch {}
      return;
    }

    // Start listening session
    setMicStatusMsg(null);
    fatalErrorRef.current = false;
    baseTextRef.current = description.trim();
    finalizedTranscriptRef.current = '';

    try {
      if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        try {
          recognition.lang = 'en-IN';
        } catch {
          recognition.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        }

        recognition.onstart = () => {
          isListeningRef.current = true;
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          let currentFinal = '';
          let currentInterim = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              currentFinal += transcript + ' ';
            } else {
              currentInterim += transcript;
            }
          }

          if (currentFinal) {
            finalizedTranscriptRef.current = (
              finalizedTranscriptRef.current + ' ' + currentFinal
            ).trim();
          }

          const combinedText = [
            baseTextRef.current,
            finalizedTranscriptRef.current,
            currentInterim.trim(),
          ]
            .filter(Boolean)
            .join(' ');

          setDescription(combinedText);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition warning:', event.error);
          if (
            event.error === 'not-allowed' ||
            event.error === 'service-not-allowed'
          ) {
            fatalErrorRef.current = true;
            isListeningRef.current = false;
            setIsListening(false);
            setMicStatusMsg('Microphone access denied. Please grant microphone permission in your browser.');
            setTimeout(() => setMicStatusMsg(null), 5000);
          } else if (event.error === 'audio-capture') {
            fatalErrorRef.current = true;
            isListeningRef.current = false;
            setIsListening(false);
            setMicStatusMsg('No microphone detected. Please connect an audio input device.');
            setTimeout(() => setMicStatusMsg(null), 5000);
          } else if (event.error === 'network') {
            fatalErrorRef.current = true;
            isListeningRef.current = false;
            setIsListening(false);
            setMicStatusMsg('Network error encountered during voice recognition.');
            setTimeout(() => setMicStatusMsg(null), 5000);
          }
        };

        recognition.onend = () => {
          if (isListeningRef.current && !fatalErrorRef.current) {
            try {
              recognition.start();
              return;
            } catch (err) {
              console.warn('Speech recognition auto-restart failed:', err);
            }
          }
          isListeningRef.current = false;
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }

      recognitionRef.current.start();
      isListeningRef.current = true;
      setIsListening(true);
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
      isListeningRef.current = false;
      setIsListening(false);
    }
  };

  const handleCopyTicket = (ticketNo: string) => {
    navigator.clipboard.writeText(ticketNo);
    setCopiedTicketNo(true);
    setTimeout(() => setCopiedTicketNo(false), 2500);
  };

  // Submission handler with live gating: guarantees zero post-click error banners
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiRealtime.isValidComplaint) {
      return; // Silent no-op without displaying post-submit error banner
    }
    setErrorMsg('');

    const trimmed = description.trim();
    if (!trimmed || trimmed.length < 10) {
      return;
    }
    if (trimmed.length > 1000) {
      setErrorMsg('Grievance description must not exceed 1,000 characters.');
      return;
    }

    setSubmitting(true);
    setSubmitStep('1/3 Analyzing complaint intent & category...');

    try {
      const ticketNo = `TKT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newGrievance: Grievance = {
        id: `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        ticketNo,
        studentName: user.name,
        studentRegNo: user.regNo,
        studentEmail: user.email,
        studentPhone: user.phone,
        studentType: user.studentType,
        gender: user.gender,
        hostelBlock: user.hostelBlock || '',
        roomNo: user.roomNo || '',
        category: aiRealtime.category || 'Others',
        departmentId: aiRealtime.departmentId || 'dept-hostel-admin',
        description: trimmed,
        priority: aiRealtime.priority as PriorityLevel,
        isUrgent: aiRealtime.isUrgent,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setSubmitStep('2/3 Submitting grievance to Redressal Cell...');
      const created = await createGrievanceApi(newGrievance);

      setSubmitStep('3/3 Dispatched to Operational Department');
      setSubmittedTicket(created);
      onSubmitSuccess(created);
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrorMsg(err?.message || 'Failed to submit grievance. Please check your network connection.');
    } finally {
      setSubmitting(false);
      setSubmitStep('');
    }
  };

  // Keyboard shortcut: Cmd+Enter / Ctrl+Enter triggers submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (aiRealtime.isValidComplaint && !submitting && description.trim().length >= 10) {
        handleSubmit();
      }
    }
  };

  // Confirmation Success View
  if (submittedTicket) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 animate-fade-in">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden text-center p-8">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
            Grievance Submitted Successfully!
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
            Your grievance has been validated by the campus ML gatekeeper and routed to{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {DEPARTMENT_NAME_MAP[submittedTicket.departmentId || ''] || 'Campus Redressal Cell'}
            </span>
            .
          </p>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left max-w-md mx-auto mb-6 space-y-2.5">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">Tracking Ticket Number:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  #{submittedTicket.ticketNo}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyTicket(submittedTicket.ticketNo)}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
                  title="Copy Ticket ID"
                >
                  {copiedTicketNo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Assigned Category:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{submittedTicket.category}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Initial Priority:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                submittedTicket.priority === 'Critical' || submittedTicket.isUrgent
                  ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
              }`}>
                {submittedTicket.priority}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSubmittedTicket(null);
                setDescription('');
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Submit Another Grievance
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Return to Student Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 animate-fade-in">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{user.name}</span>
          <span>·</span>
          <span className="font-mono">{user.regNo}</span>
        </div>
      </div>

      {/* Main Complaint Editor Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {/* Editor Title & Mode Tabs */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">Lodge a Campus Grievance</h1>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('write')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'write'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Write</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>
        </div>

        {/* Markdown Toolbar */}
        {activeTab === 'write' && (
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-1 text-slate-600 dark:text-slate-400 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyFormatting('**', '**', 'bold text')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormatting('*', '*', 'italic text')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormatting('<u>', '</u>', 'underlined text')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormatting('~~', '~~', 'strikethrough text')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
              <button
                type="button"
                onClick={() => applyFormatting('- ', '', 'list item')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormatting('1. ', '', 'numbered item')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormatting('> ', '', 'quoted text')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Quote"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormatting('`', '`', 'code snippet')}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                title="Inline Code"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {clearedText && (
                <button
                  type="button"
                  onClick={handleUndoClear}
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Undo Clear</span>
                </button>
              )}
              {description.trim() && (
                <button
                  type="button"
                  onClick={handleClearText}
                  className="text-[11px] text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Text Area & Preview Body */}
        <div className="p-4">
          {activeTab === 'write' ? (
            <textarea
              ref={textareaRef}
              id="grievance-description-input"
              value={description}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              rows={6}
              placeholder="Describe your campus grievance in detail (e.g. continuous water leakage in Block A room 204, Wi-Fi connectivity drops in library 2nd floor, or report harassment / bullying)..."
              className="w-full text-xs sm:text-sm bg-transparent border-0 focus:outline-hidden text-slate-900 dark:text-white placeholder-slate-400 resize-none leading-relaxed"
            />
          ) : (
            <div className="min-h-[160px] max-h-[420px] overflow-y-auto text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
              {description.trim() ? (
                parseInlineMarkdown(description)
              ) : (
                <span className="italic text-slate-400">No content entered yet. Type in the Write tab to see markdown preview.</span>
              )}
            </div>
          )}
        </div>

        {/* Live Classifier Feedback & Submission Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Left: Live Classification Status Badge */}
          <div className="flex items-center flex-wrap gap-2">
            {aiRealtime.isValidComplaint ? (
              <div
                id="live-classification-pill"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs font-medium text-blue-900 dark:text-blue-100 animate-fade-in"
              >
                <span>{aiRealtime.icon}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Category:</span>
                <span className="font-bold">{aiRealtime.category}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-[10px] font-mono font-bold">
                  {Math.round(aiRealtime.confidence * 100)}%
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 text-[10px] font-medium">
                  {DEPARTMENT_NAME_MAP[aiRealtime.departmentId] || 'Campus Redressal'}
                </span>
                {aiRealtime.isUrgent && (
                  <span className="px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300 text-[10px] font-extrabold uppercase tracking-wide">
                    Urgent
                  </span>
                )}
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400"
                title="Live Campus Grievance Gatekeeper"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Enter a specific campus-related grievance to enable submission</span>
              </div>
            )}

            {/* Voice Dictation Button with persistent useRef handles */}
            <div className="relative inline-flex items-center gap-2">
              {micStatusMsg && (
                <div
                  id="mic-status-msg"
                  className="text-[11px] text-amber-600 dark:text-amber-400 font-medium px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 animate-fade-in"
                >
                  {micStatusMsg}
                </div>
              )}

              {isListening && (
                <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1 bg-red-600 text-white shadow-lg shadow-red-500/30 rounded-full text-[11px] font-semibold animate-pulse z-30 pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>Listening... speak now</span>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 sm:left-auto sm:right-3 sm:translate-x-0 w-2 h-2 bg-red-600 rotate-45" />
                </div>
              )}

              <button
                type="button"
                id="voice-dictation-btn"
                onClick={toggleVoiceInput}
                aria-label={isListening ? 'Stop voice recording' : 'Voice dictation (speech-to-text)'}
                aria-pressed={isListening}
                title={isListening ? 'Stop voice recording' : 'Voice dictation (speech-to-text)'}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isListening
                    ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/30 animate-pulse'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:border-blue-300'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Right: Word Count & Gated Submit Button */}
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <div className="text-right text-[11px] font-mono text-slate-400">
              <span className="text-slate-600 dark:text-slate-300 font-semibold">{wordCount}</span> w ·{' '}
              <span className={charCount > 900 ? 'text-amber-600 font-bold' : ''}>
                {charCount}/1000
              </span>
            </div>

            <button
              id="submit-grievance-btn"
              type="button"
              onClick={() => handleSubmit()}
              disabled={!aiRealtime.isValidComplaint || submitting || description.trim().length < 10}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer transform hover:scale-102 active:scale-98"
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

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Helpful Campus Redressal Commitments Banner */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-blue-500 shrink-0" />
          <span>Automated dispatch to Hostel Warden, Estate Works & Anti-Ragging Cell</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          <span>End-to-End Confidentiality Guaranteed</span>
        </div>
      </div>
    </div>
  );
};
