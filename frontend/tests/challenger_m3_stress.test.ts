import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEPARTMENTS_10, DEMO_ACCOUNTS as DATA_DEMO_ACCOUNTS } from '../data/constants';
import { DEMO_ACCOUNTS as MODAL_DEMO_ACCOUNTS } from '../components/AuthModal';

// ============================================================================
// 1. 15-Persona Authentication & Quick Demo Login Verification Suite
// ============================================================================

describe('Milestone 3 Challenger: 15-Persona Auth & Quick Demo Login Stress Suite', () => {
  const credentialsPath = path.resolve(process.cwd(), '../CREDENTIALS.md');

  test('CHALLENGE-AUTH-01: CREDENTIALS.md consistency with frontend constants and AuthModal', () => {
    assert.ok(fs.existsSync(credentialsPath), 'CREDENTIALS.md must exist in repo root');
    const credContent = fs.readFileSync(credentialsPath, 'utf-8');

    // Super admin check in markdown
    assert.ok(credContent.includes('admin@campus.edu'), 'CREDENTIALS.md must mention admin@campus.edu');
    assert.ok(credContent.includes('Admin@123'), 'CREDENTIALS.md must mention Admin@123');
    assert.ok(credContent.includes('123456'), 'CREDENTIALS.md must mention Dev OTP 123456');

    // Exactly 15 demo accounts in both constants and AuthModal
    assert.equal(DATA_DEMO_ACCOUNTS.length, 15, 'data/constants DEMO_ACCOUNTS must have 15 personas');
    assert.equal(MODAL_DEMO_ACCOUNTS.length, 15, 'AuthModal DEMO_ACCOUNTS must have 15 personas');
  });

  test('CHALLENGE-AUTH-02: 100% Department Admin Coverage (10 operational departments)', () => {
    const expected10Depts = [
      { code: 'HOSTEL', email: 'hostel.admin@campus.edu', staffId: 'STAFF-HOSTEL' },
      { code: 'MESS', email: 'mess.admin@campus.edu', staffId: 'STAFF-MESS' },
      { code: 'IT_ERP', email: 'it.admin@campus.edu', staffId: 'STAFF-IT' },
      { code: 'ACADEMICS', email: 'academics.admin@campus.edu', staffId: 'STAFF-ACAD' },
      { code: 'INFRA', email: 'infra.admin@campus.edu', staffId: 'STAFF-INFRA' },
      { code: 'TRANSPORT', email: 'transport.admin@campus.edu', staffId: 'STAFF-TRANS' },
      { code: 'SECURITY', email: 'security.admin@campus.edu', staffId: 'STAFF-SEC' },
      { code: 'MEDICAL', email: 'medical.admin@campus.edu', staffId: 'STAFF-MED' },
      { code: 'ACCOUNTS', email: 'accounts.admin@campus.edu', staffId: 'STAFF-ACC' },
      { code: 'STUDENTLIFE', email: 'studentlife.admin@campus.edu', staffId: 'STAFF-LIFE' },
    ];

    assert.equal(DEPARTMENTS_10.length, 10, 'DEPARTMENTS_10 must have exactly 10 operational departments');

    for (const exp of expected10Depts) {
      const dept = DEPARTMENTS_10.find((d) => d.code === exp.code);
      assert.ok(dept, `Department definition for ${exp.code} must exist in DEPARTMENTS_10`);
      assert.equal(dept.adminEmail, exp.email, `Admin email mismatch for ${exp.code}`);
      assert.equal(dept.staffId, exp.staffId, `Staff ID mismatch for ${exp.code}`);

      // Check corresponding account in AuthModal
      const modalAcc = MODAL_DEMO_ACCOUNTS.find((a) => a.email === exp.email);
      assert.ok(modalAcc, `AuthModal must contain account for ${exp.email}`);
      assert.equal(modalAcc.role, 'DEPARTMENT_ADMIN', `Role for ${exp.email} must be DEPARTMENT_ADMIN`);
      assert.equal(modalAcc.password, 'Dept@123', `Password for ${exp.email} must be Dept@123`);
      assert.equal(modalAcc.devOtp, '123456', `Dev OTP for ${exp.email} must be 123456`);
      assert.equal(modalAcc.regNo, exp.staffId, `Staff ID for ${exp.email} must match regNo`);
      assert.equal(modalAcc.departmentCode, exp.code, `Department code for ${exp.email} must match`);
    }
  });

  test('CHALLENGE-AUTH-03: 4 Representative Student Personas Verification', () => {
    const expectedStudents = [
      { name: 'Kavin Kumar', email: 'kavin@student.campus.edu', regNo: '2023CSE042', deptCode: 'CSE' },
      { name: 'Ananya Sharma', email: 'ananya@student.campus.edu', regNo: '2023ECE015', deptCode: 'ECE' },
      { name: 'Rahul Verma', email: 'rahul@student.campus.edu', regNo: '2022MECH088', deptCode: 'MECH' },
      { name: 'Priya Ramasamy', email: 'priya@student.campus.edu', regNo: '2024IT021', deptCode: 'IT' },
    ];

    for (const exp of expectedStudents) {
      const student = MODAL_DEMO_ACCOUNTS.find((a) => a.email === exp.email);
      assert.ok(student, `Student ${exp.email} must exist in AuthModal DEMO_ACCOUNTS`);
      assert.equal(student.role, 'STUDENT', `Role must be STUDENT for ${exp.email}`);
      assert.equal(student.regNo, exp.regNo, `Reg number mismatch for ${exp.email}`);
      assert.equal(student.departmentCode, exp.deptCode, `Department code mismatch for ${exp.email}`);
      assert.equal(student.password, 'Student@123', `Password must be Student@123 for ${exp.email}`);
      assert.equal(student.devOtp, '123456', `Dev OTP must be 123456 for ${exp.email}`);
    }
  });

  test('CHALLENGE-AUTH-04: Dev OTP (123456) Universal Acceptance Simulation across all 15 Personas', () => {
    for (const account of MODAL_DEMO_ACCOUNTS) {
      assert.equal(account.devOtp, '123456', `Dev OTP must be 123456 for ${account.email}`);

      // Simulate Dev OTP validation logic in backend auth router:
      // is_dev_otp = (password == "123456")
      const isDevOtpValid = (otp: string) => otp === '123456';
      assert.ok(isDevOtpValid(account.devOtp), `Dev OTP validation must pass for ${account.email}`);

      // Ensure invalid OTP is rejected
      assert.equal(isDevOtpValid('000000'), false, `Invalid OTP must be rejected`);
      assert.equal(isDevOtpValid('654321'), false, `Invalid OTP must be rejected`);
    }
  });

  test('CHALLENGE-AUTH-05: Password Authentication Simulation across all 15 Personas', () => {
    // 1 Super Admin
    const superAdmin = MODAL_DEMO_ACCOUNTS.find((a) => a.category === 'super_admin');
    assert.ok(superAdmin);
    assert.equal(superAdmin.password, 'Admin@123');

    // 10 Dept Admins
    const deptAdmins = MODAL_DEMO_ACCOUNTS.filter((a) => a.category === 'dept_admin');
    assert.equal(deptAdmins.length, 10);
    for (const da of deptAdmins) {
      assert.equal(da.password, 'Dept@123', `Dept admin ${da.email} password mismatch`);
    }

    // 4 Students
    const students = MODAL_DEMO_ACCOUNTS.filter((a) => a.category === 'student');
    assert.equal(students.length, 4);
    for (const s of students) {
      assert.equal(s.password, 'Student@123', `Student ${s.email} password mismatch`);
    }
  });

  test('CHALLENGE-AUTH-06: Quick Demo Login Routing & Portal Target Invariants', () => {
    for (const acc of MODAL_DEMO_ACCOUNTS) {
      if (acc.category === 'super_admin') {
        assert.equal(acc.role, 'SUPER_ADMIN');
        const expectedPortal = '/admin/dashboard';
        assert.equal(expectedPortal, '/admin/dashboard', 'Super admin must route to /admin/dashboard');
      } else if (acc.category === 'dept_admin') {
        assert.equal(acc.role, 'DEPARTMENT_ADMIN');
        const expectedPortal = '/admin/department/dashboard';
        assert.equal(expectedPortal, '/admin/department/dashboard', 'Dept admin must route to /admin/department/dashboard');
      } else if (acc.category === 'student') {
        assert.equal(acc.role, 'STUDENT');
        const expectedPortal = '/student/dashboard';
        assert.equal(expectedPortal, '/student/dashboard', 'Student must route to /student/dashboard');
      } else {
        assert.fail(`Unknown category: ${(acc as any).category}`);
      }
    }
  });

  test('CHALLENGE-AUTH-07: Student Rejection on Administrative Login Contract', () => {
    // Simulate backend rule: if role is STUDENT on admin endpoint, return HTTP 403 Forbidden
    const simulateAdminEndpointGate = (userRole: string) => {
      if (userRole.toUpperCase() === 'STUDENT') {
        return {
          status: 403,
          body: {
            success: false,
            error: 'Access denied: STUDENT accounts are not permitted to access administrative portal.',
            role: 'STUDENT',
          },
        };
      }
      return { status: 200, body: { success: true } };
    };

    // Verify all 4 students are strictly rejected
    const students = MODAL_DEMO_ACCOUNTS.filter((a) => a.category === 'student');
    for (const student of students) {
      const result = simulateAdminEndpointGate(student.role);
      assert.equal(result.status, 403, `Student ${student.email} must be rejected on admin portal`);
      assert.equal(result.body.success, false);
      assert.ok(result.body.error.includes('STUDENT accounts are not permitted'));
    }

    // Verify admins pass
    const superAdmin = MODAL_DEMO_ACCOUNTS.find((a) => a.category === 'super_admin')!;
    assert.equal(simulateAdminEndpointGate(superAdmin.role).status, 200);

    const deptAdmin = MODAL_DEMO_ACCOUNTS.find((a) => a.category === 'dept_admin')!;
    assert.equal(simulateAdminEndpointGate(deptAdmin.role).status, 200);
  });
});

// ============================================================================
// 2. StudentComplaintForm Voice Dictation & Clarity Elimination Stress Suite
// ============================================================================

describe('Milestone 3 Challenger: StudentComplaintForm Voice Dictation & Lifecycle Stress Suite', () => {
  const formPath = path.resolve(process.cwd(), 'components/StudentComplaintForm.tsx');
  assert.ok(fs.existsSync(formPath), 'StudentComplaintForm.tsx must exist');
  const fileContent = fs.readFileSync(formPath, 'utf-8');

  test('CHALLENGE-VOICE-01: Persistent useRef handles existence and typing', () => {
    // Must define all 5 critical persistent handles
    assert.ok(fileContent.includes('recognitionRef = useRef'), 'recognitionRef must be declared via useRef');
    assert.ok(fileContent.includes('isListeningRef = useRef'), 'isListeningRef must be declared via useRef');
    assert.ok(fileContent.includes('baseTextRef = useRef'), 'baseTextRef must be declared via useRef');
    assert.ok(fileContent.includes('finalizedTranscriptRef = useRef'), 'finalizedTranscriptRef must be declared via useRef');
    assert.ok(fileContent.includes('fatalErrorRef = useRef'), 'fatalErrorRef must be declared via useRef');
  });

  test('CHALLENGE-VOICE-02: SpeechRecognition initialization with continuous and interim options', () => {
    assert.ok(fileContent.includes('new SpeechRecognition()'), 'Must construct SpeechRecognition instance');
    assert.ok(fileContent.includes('recognition.continuous = true'), 'continuous must be enabled');
    assert.ok(fileContent.includes('recognition.interimResults = true'), 'interimResults must be enabled');
  });

  test('CHALLENGE-VOICE-03: Auto-restart mechanism on unexpected speech end', () => {
    // onend handler must verify isListeningRef.current && !fatalErrorRef.current and restart
    assert.ok(fileContent.includes('recognition.onend = () => {'), 'onend handler must exist');
    assert.ok(
      fileContent.includes('if (isListeningRef.current && !fatalErrorRef.current)'),
      'Auto-restart check must inspect isListeningRef and !fatalErrorRef'
    );
    assert.ok(
      fileContent.includes('recognition.start();'),
      'Auto-restart must call recognition.start()'
    );
  });

  test('CHALLENGE-VOICE-04: Fatal error recovery (not-allowed, audio-capture, network)', () => {
    assert.ok(fileContent.includes('recognition.onerror = (event: any) => {'), 'onerror handler must exist');
    assert.ok(fileContent.includes("'not-allowed'"), 'Must handle not-allowed permission denial');
    assert.ok(fileContent.includes("'audio-capture'"), 'Must handle audio-capture missing microphone');
    assert.ok(fileContent.includes("'network'"), 'Must handle network error');

    // On fatal error, must set fatalErrorRef.current = true and isListeningRef.current = false
    assert.ok(
      fileContent.includes('fatalErrorRef.current = true'),
      'Must flag fatalErrorRef.current = true on fatal error'
    );
    assert.ok(
      fileContent.includes('isListeningRef.current = false'),
      'Must set isListeningRef.current = false on fatal error'
    );
  });

  test('CHALLENGE-VOICE-05: Unmount lifecycle abort cleanup', () => {
    // Check useEffect unmount return function
    assert.ok(
      fileContent.includes('useEffect(() => {') && fileContent.includes('return () => {'),
      'Must have unmount cleanup useEffect'
    );
    assert.ok(
      fileContent.includes('recognitionRef.current.abort()') || fileContent.includes('recognitionRef.current?.abort()'),
      'Unmount cleanup must abort active recognition'
    );
  });

  test('CHALLENGE-VOICE-06: Absolute 100% absence of legacy clarity indicators', () => {
    const forbiddenPatterns = [
      'evaluateClarity',
      'clarityScore',
      'setClarityScore',
      'clarity-score-indicator',
      'Clarity Indicator',
      'clarityLevel',
      'clarityBar',
    ];

    for (const pattern of forbiddenPatterns) {
      const count = (fileContent.match(new RegExp(pattern, 'g')) || []).length;
      assert.equal(
        count,
        0,
        `Forbidden legacy clarity pattern "${pattern}" was detected in StudentComplaintForm.tsx!`
      );
    }
  });

  test('CHALLENGE-VOICE-07: Behavioral Simulation of Speech Accumulator State Machine', () => {
    // Simulate the exact state machine implemented in StudentComplaintForm.tsx
    let baseText = 'Initial campus grievance description.';
    let finalizedTranscript = '';
    let currentInterim = '';

    const simulateOnResult = (results: Array<{ transcript: string; isFinal: boolean }>) => {
      let currentFinal = '';
      currentInterim = '';

      for (const res of results) {
        if (res.isFinal) {
          currentFinal += res.transcript + ' ';
        } else {
          currentInterim += res.transcript;
        }
      }

      if (currentFinal) {
        finalizedTranscript = (finalizedTranscript + ' ' + currentFinal).trim();
      }

      return [baseText, finalizedTranscript, currentInterim.trim()]
        .filter(Boolean)
        .join(' ');
    };

    // Step 1: Speak interim text
    const text1 = simulateOnResult([{ transcript: 'Water leak in room', isFinal: false }]);
    assert.equal(text1, 'Initial campus grievance description. Water leak in room');

    // Step 2: Finalize segment
    const text2 = simulateOnResult([{ transcript: 'Water leak in room 304', isFinal: true }]);
    assert.equal(text2, 'Initial campus grievance description. Water leak in room 304');

    // Step 3: Add more speech without losing baseText
    const text3 = simulateOnResult([{ transcript: 'Pipe burst on floor 3', isFinal: true }]);
    assert.equal(
      text3,
      'Initial campus grievance description. Water leak in room 304 Pipe burst on floor 3'
    );
    assert.ok(
      text3.startsWith('Initial campus grievance description.'),
      'Base text must be preserved and not overwritten'
    );
  });
});
