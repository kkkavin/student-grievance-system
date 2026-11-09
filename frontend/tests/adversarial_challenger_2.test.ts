/**
 * frontend/tests/adversarial_challenger_2.test.ts
 * 
 * Milestone 3 Adversarial Challenge Suite 2:
 * 1. Live keystroke gating simulation on StudentComplaintForm (submit button live disabled on invalid, click & Enter silent no-op)
 * 2. Harassment & Safety Acceptance Stress Harness (25+ cases without building names accepted and routed to Ragging & Harassment with elevated priority)
 * 3. Commercial Off-Campus & Gibberish Rejection Stress Harness (25+ cases strictly rejected and submit disabled)
 * 4. Hard Veto Tamper Resistance & Keystroke State Transition Invariants
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyComplaint,
  preFilterComplaint,
  defaultClassifier,
} from '../lib/classifier';

describe('Adversarial Challenger Suite 2: Live Gating, Harassment Routing & Off-Campus Rejection', () => {

  // =========================================================================
  // TASK 1: Live Keystroke Gating & Submit Button Invariants
  // =========================================================================
  describe('Task 1: Live Keystroke Gating & Submit Button Invariants', () => {
    const formSourcePath = path.resolve(process.cwd(), 'components/StudentComplaintForm.tsx');

    test('TC-ADV-GATE-01: StudentComplaintForm.tsx enforces live disabled attribute on #submit-grievance-btn', () => {
      assert.ok(fs.existsSync(formSourcePath), 'StudentComplaintForm.tsx must exist');
      const formContent = fs.readFileSync(formSourcePath, 'utf-8');

      // Check submit button id and disabled attribute
      assert.ok(
        formContent.includes('id="submit-grievance-btn"'),
        'Submit button must have id="submit-grievance-btn"'
      );
      assert.ok(
        formContent.includes('disabled={!aiRealtime.isValidComplaint || submitting || description.trim().length < 10}'),
        'Submit button must be live-disabled on invalid complaint, submitting state, or length < 10'
      );
    });

    test('TC-ADV-GATE-02: handleSubmit silently short-circuits on invalid complaint without post-click error banner', () => {
      const formContent = fs.readFileSync(formSourcePath, 'utf-8');

      // Verify early return in handleSubmit before any errorMsg is set
      const handleSubmitMatch = formContent.match(/const handleSubmit\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*setSubmitting\(true\)/);
      assert.ok(handleSubmitMatch, 'handleSubmit function must exist with pre-submit guards');
      const guardBody = handleSubmitMatch[1];

      assert.ok(
        guardBody.includes('if (!aiRealtime.isValidComplaint)'),
        'handleSubmit must check !aiRealtime.isValidComplaint'
      );
      assert.ok(
        guardBody.includes('return;'),
        'handleSubmit must silently return on invalid complaint'
      );
      // Ensure no error banner like "Please fix errors" is injected on submit click
      assert.ok(
        !guardBody.includes("setErrorMsg('Please fix"),
        'Must not set post-click error banner on invalid input'
      );
      assert.ok(
        !guardBody.includes("setErrorMsg('Invalid complaint"),
        'Must not set post-click error banner on invalid input'
      );
    });

    test('TC-ADV-GATE-03: Keyboard submission (Ctrl+Enter / Cmd+Enter) is strictly gated', () => {
      const formContent = fs.readFileSync(formSourcePath, 'utf-8');

      // Verify handleKeyDown checks aiRealtime.isValidComplaint
      const handleKeyDownMatch = formContent.match(/const handleKeyDown\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\};/);
      assert.ok(handleKeyDownMatch, 'handleKeyDown function must exist');
      const keyBody = handleKeyDownMatch[1];

      assert.ok(keyBody.includes('aiRealtime.isValidComplaint'), 'Enter submission must check aiRealtime.isValidComplaint');
      assert.ok(keyBody.includes('description.trim().length >= 10'), 'Enter submission must check length >= 10');
    });

    test('TC-ADV-GATE-04: Simulated incremental keystroke typing correctly transitions button disabled state', () => {
      // Simulate typing keystroke by keystroke
      const typingStream = [
        { text: '', expectedDisabled: true, label: 'empty' },
        { text: 'S', expectedDisabled: true, label: '1 char' },
        { text: 'Sen', expectedDisabled: true, label: '3 chars' },
        { text: 'Senior', expectedDisabled: true, label: '6 chars' },
        { text: 'Seniors ', expectedDisabled: true, label: '8 chars' },
        { text: 'Seniors are', expectedDisabled: true, label: '11 chars but incomplete intent' },
        { text: 'Seniors are teasing me in corridor every single day', expectedDisabled: false, label: 'valid harassment grievance' },
      ];

      for (const step of typingStream) {
        const aiRealtime = defaultClassifier.classifyComplaint(step.text);
        const submitting = false;
        const isDisabled = !aiRealtime.isValidComplaint || submitting || step.text.trim().length < 10;
        assert.equal(
          isDisabled,
          step.expectedDisabled,
          `At step "${step.label}" ("${step.text}"), expected disabled=${step.expectedDisabled}, got ${isDisabled}`
        );
      }
    });

    test('TC-ADV-GATE-05: Submitting while invalid silently no-ops with zero state mutation', () => {
      // Harness simulating handleSubmit logic
      const simulateSubmission = (text: string) => {
        const aiRealtime = defaultClassifier.classifyComplaint(text);
        let errorMsg = '';
        let submissionDispatched = false;

        // Exact guard from StudentComplaintForm.tsx lines 360-370
        if (!aiRealtime.isValidComplaint) {
          return { handled: false, errorMsg, submissionDispatched };
        }
        errorMsg = '';
        const trimmed = text.trim();
        if (!trimmed || trimmed.length < 10) {
          return { handled: false, errorMsg, submissionDispatched };
        }

        submissionDispatched = true;
        return { handled: true, errorMsg, submissionDispatched };
      };

      const invalidSamples = [
        '',
        'help',
        'hello world how are you',
        'Dominos pizza delivery was late',
        'Swiggy order missing biryani box',
        'qwertyuiop asdfghjkl zxcvbnm',
        'bad bad bad bad bad bad bad bad',
        'Watching Netflix movie at home',
        'Bitcoin crypto wallet crashed',
      ];

      for (const inv of invalidSamples) {
        const outcome = simulateSubmission(inv);
        assert.equal(outcome.handled, false, `Must silent no-op for invalid: "${inv}"`);
        assert.equal(outcome.errorMsg, '', `Must not show errorMsg for invalid: "${inv}"`);
        assert.equal(outcome.submissionDispatched, false, `Must never dispatch API for invalid: "${inv}"`);
      }
    });
  });

  // =========================================================================
  // TASK 2: Harassment & Safety Acceptance Stress Harness (25+ Cases without Building Names)
  // =========================================================================
  describe('Task 2: Harassment & Safety Acceptance (25+ Cases Without Building Names)', () => {
    // Verified: none of these inputs contain physical campus buildings/rooms
    // (no "block", "hostel", "room", "classroom", "lab", "hall", "library", "mess", "canteen")
    const harassmentAdversarialCases = [
      'Seniors are teasing me relentlessly every single day',
      'A group of students is mocking and bullying me daily',
      'Eve teasing near the main gate with vulgar comments',
      'Facing severe ragging and humiliation from my peers',
      'Someone is cyberbullying me and posting nasty rumors online',
      'Boys are teasing and passing comments whenever I walk alone',
      'Continuous taunting and body shaming by senior students',
      'Senior students are calling names and humiliating me during break',
      'Facing severe mental torture and intimidation from senior batchmates',
      'Seniors forcing me to do their assignments and clean their shoes',
      'A student has been stalking me continuously after evening classes',
      'Severe intimidation and physical threats by a group of boys',
      'Someone is posting abusive slurs and harassing me on social media',
      'Facing caste discrimination and casteist slurs during oral evaluation',
      'Group of senior boys picking on me and snatching my bag repeatedly',
      'Senior student demanded money and threatened physical assault if reported',
      'Verbal harassment and abusive language directed towards female students',
      'Anti ragging emergency forced to obey seniors under threat of violence',
      'Threatening messages and psychological harassment from college senior',
      'Extortion and blackmail threats regarding private personal information',
      'Seniors forcing junior students to do squats and abusive hazing',
      'Sexual harassment and inappropriate touching in the crowded walkway',
      'Internal complaints committee ICC report regarding senior harassment',
      'Dark pathway near back gate is unsafe with boys catcalling',
      'Unwanted physical contact and persistent stalking behaviour by student',
      'Physical bullying and intimidation incident late in the evening',
      'Senior students are blackmailing me for cash and threatening harm',
    ];

    test(`Verify exactly ${harassmentAdversarialCases.length} harassment cases (exceeds 20 requirement)`, () => {
      assert.ok(harassmentAdversarialCases.length >= 20, 'Must have at least 20 test cases');
    });

    for (let i = 0; i < harassmentAdversarialCases.length; i++) {
      const text = harassmentAdversarialCases[i];
      test(`HARASS-ADV-${String(i + 1).padStart(2, '0')}: "${text.slice(0, 48)}..."`, () => {
        // 1. Verify absence of physical building names in prompt
        const buildingPattern = /\b(hostel|dorm|dormitory|block\s+[a-z0-9]|room\s+[a-z0-9]+|classroom|laboratory|mess\s+hall|canteen)\b/i;
        assert.ok(
          !buildingPattern.test(text),
          `Input must NOT rely on physical building names: "${text}"`
        );

        // 2. Classify via preFilterComplaint
        const res = preFilterComplaint(text);

        // 3. Invariants
        assert.equal(res.isValid, true, `Complaint must be valid: "${text}"`);
        assert.equal(res.canSubmit, true, `Submit button must be enabled: "${text}"`);
        assert.equal(res.isSpam, false, `Must not be marked as spam: "${text}"`);
        assert.equal(res.isHarassment, true, `Must be identified as harassment: "${text}"`);
        assert.equal(res.suggestedCategory, 'Ragging & Harassment', `Must route to Ragging & Harassment: "${text}"`);
        assert.ok(
          res.priority === 'urgent' || res.priority === 'critical',
          `Priority must be elevated (urgent/critical), got "${res.priority}" for "${text}"`
        );
        assert.ok(res.departmentId, `Must have a target departmentId assigned: "${text}"`);

        // 4. Raw classifier validation
        const raw = classifyComplaint(text);
        assert.equal(raw.isValidComplaint, true);
        assert.equal(raw.isCampusRelevant, true, 'Interpersonal abuse must be inherently campus relevant');
        assert.equal(raw.category, 'Ragging & Harassment');
        assert.equal(raw.isUrgent, true, 'Ragging grievances must be flagged urgent');
        assert.equal(raw.priority, 'Critical', 'Raw priority must be Critical');
      });
    }
  });

  // =========================================================================
  // TASK 3: Commercial Off-Campus & Gibberish Rejection Stress Harness (25+ Cases)
  // =========================================================================
  describe('Task 3: Commercial Off-Campus & Gibberish Rejection (25+ Cases)', () => {
    const rejectionAdversarialCases = [
      // Commercial Delivery (Swiggy, Zomato, Domino's, etc.)
      { text: 'Swiggy delivery driver did not deliver my food order to my apartment', type: 'delivery' },
      { text: 'Zomato delivery was completely delayed and biryani was freezing cold', type: 'delivery' },
      { text: 'Dominos pizza delivered cold and burnt to my home in the city', type: 'delivery' },
      { text: 'Zepto grocery delivery cancelled my ice cream order without warning', type: 'delivery' },
      { text: 'Blinkit 10 minute delivery took over two hours at my rented flat', type: 'delivery' },

      // Entertainment / Cinema / Malls
      { text: 'Cinema theater movie ticket was overpriced and screen had bad sound', type: 'entertainment' },
      { text: 'PVR multiplex seats were torn and air conditioning was switched off', type: 'entertainment' },
      { text: 'Inox box office counter charged extra fees for 3D glasses', type: 'entertainment' },
      { text: 'Shopping mall clothing outlet fitting room was filthy and crowded', type: 'entertainment' },
      { text: 'Zara store inside the city mall refused refund on defective shirt', type: 'entertainment' },

      // Streaming & Gaming
      { text: 'Netflix subscription shows error code when streaming movies on my TV', type: 'streaming' },
      { text: 'Hotstar video playback keeps buffering during the live cricket match', type: 'streaming' },
      { text: 'Spotify premium app is crashing continuously on my Android phone', type: 'streaming' },
      { text: 'Steam video game multiplayer server crashed during my tournament match', type: 'gaming' },
      { text: 'PlayStation PS5 network login is failing and GTA 5 servers are down', type: 'gaming' },
      { text: 'Xbox live subscription charged my credit card without my authorization', type: 'gaming' },

      // Travel / Transport / Airlines / Railways
      { text: 'Indigo flight was delayed by four hours at the international airport', type: 'travel' },
      { text: 'Air India airline lost my checked luggage on the morning flight', type: 'travel' },
      { text: 'IRCTC tatkal train ticket booking portal crashed during payment', type: 'travel' },
      { text: 'Railway reservation counter berth allocation was cancelled by agent', type: 'travel' },
      { text: 'Uber cab driver cancelled ride after demanding double cash fare', type: 'travel' },
      { text: 'Ola cab ride charged surge pricing during heavy rain in the city', type: 'travel' },

      // Crypto / Finance / Personal
      { text: 'Bitcoin crypto price crashed and my exchange wallet app is locked', type: 'finance' },
      { text: 'Ethereum cryptocurrency transaction failed on the decentralized exchange', type: 'finance' },
      { text: 'Mutual fund demat account SIP transaction failed due to bank server', type: 'finance' },

      // Greetings / Questions / Praise
      { text: 'Hello good morning to everyone hope you all are having a great day', type: 'greeting' },
      { text: 'Hi there how are you doing today is everything going fine', type: 'greeting' },
      { text: 'Can anyone tell me what time the sun sets in this city today?', type: 'question' },
      { text: 'The weather today is truly beautiful and wonderful with pleasant breeze', type: 'praise' },

      // Gibberish & Dummy text
      { text: 'qwertyuiop asdfghjkl zxcvbnm random keyboard smash test string', type: 'gibberish' },
      { text: 'cbhhcbhbdhcdbhd bcdfghjklmnpqrstvwxz completely unpronounceable text', type: 'gibberish' },
      { text: 'bad bad bad bad bad bad bad bad bad bad bad bad', type: 'loop' },
      { text: 'test testing sample demo hello hi nothing dummy', type: 'dummy' },
    ];

    test(`Verify exactly ${rejectionAdversarialCases.length} rejection cases (exceeds 25 requirement)`, () => {
      assert.ok(rejectionAdversarialCases.length >= 25, 'Must have at least 25 rejection test cases');
    });

    for (let i = 0; i < rejectionAdversarialCases.length; i++) {
      const { text, type } = rejectionAdversarialCases[i];
      test(`REJECT-ADV-${String(i + 1).padStart(2, '0')} [${type}]: "${text.slice(0, 48)}..."`, () => {
        const res = preFilterComplaint(text);
        assert.equal(res.isValid, false, `Off-campus/non-complaint MUST be invalid: "${text}"`);
        assert.equal(res.canSubmit, false, `Submit button MUST be disabled: "${text}"`);
        assert.equal(res.isSpam, true, `Must be flagged as spam: "${text}"`);

        // Test raw classifier rejection
        const raw = classifyComplaint(text);
        assert.equal(raw.isValidComplaint, false);
        assert.ok(raw.rejectionReason, `Must provide rejection reason for "${text}"`);
      });
    }
  });

  // =========================================================================
  // TASK 4: Hard Veto Tamper Resistance (Off-Campus + Campus Words Attack)
  // =========================================================================
  describe('Task 4: Hard Veto Tamper Resistance (Off-Campus Spoofing Attacks)', () => {
    // Attack vector: Attacker attempts to sneak off-campus commercial items by appending campus keywords
    const spoofingAttacks = [
      'My Swiggy food delivery was missing burger at the hostel campus gate',
      'Zomato delivery order was cold and late near classroom building',
      'Dominos pizza delivered stale pizza to my hostel room 304',
      'Cinema movie ticket at PVR multiplex was booked from campus library',
      'Watching Netflix movies on my phone in the hostel corridor and it buffered',
      'Indigo flight ticket booking cancelled while sitting in college bus',
      'IRCTC train tatkal reservation failed on campus hostel wifi',
      'Bitcoin cryptocurrency wallet error while sitting in academic lab',
      'Steam video game multiplayer lag while playing in college dorm',
    ];

    for (let i = 0; i < spoofingAttacks.length; i++) {
      const text = spoofingAttacks[i];
      test(`TAMPER-ADV-${String(i + 1).padStart(2, '0')}: "${text.slice(0, 50)}..."`, () => {
        const res = preFilterComplaint(text);
        // Stage 1 hard veto words/phrases must prevail over campus keywords
        assert.equal(
          res.isValid,
          false,
          `Commercial off-campus entity must be strictly rejected even with campus tokens: "${text}"`
        );
        assert.equal(res.canSubmit, false, `Submit button must remain disabled: "${text}"`);
      });
    }
  });
});
