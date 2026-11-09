import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preFilterComplaint } from '../lib/classifier';

describe('Student Complaint Form & Classifier Logic Suite', () => {
  describe('Live Keystroke Gating & Classification Rules', () => {
    test('TC-FORM-01: Empty or brief description fails validation', () => {
      const resEmpty = preFilterComplaint('');
      assert.equal(resEmpty.isValid, false, 'Empty description must be invalid');
      assert.equal(resEmpty.canSubmit, false, 'Submit button must be disabled for empty text');

      const resShort = preFilterComplaint('help');
      assert.equal(resShort.isValid, false, 'Short description (< 10 chars) must be invalid');
      assert.equal(resShort.canSubmit, false, 'Submit button must be disabled for short text');
    });

    test('TC-FORM-02: Valid on-campus complaints are immediately submittable', () => {
      const validCases = [
        'Water leakage in washroom of Ramanujan Hostel Block A third floor',
        'Wi-Fi signal not connecting in the library digital reading room',
        'Ceiling fan making loud noise and sparking in classroom 402',
        'Mess food served cold and stale in the evening dining hall',
        'College bus route 7 delayed by over 45 minutes this morning',
      ];

      for (const text of validCases) {
        const res = preFilterComplaint(text);
        assert.equal(res.isValid, true, `Expected valid for "${text}"`);
        assert.equal(res.canSubmit, true, `Submit button must be enabled for "${text}"`);
        assert.equal(res.isSpam, false, `Must not be flagged as spam: "${text}"`);
      }
    });

    test('TC-FORM-03: Bullying & Harassment accepted without explicit building names', () => {
      const harassmentCases = [
        'Seniors are teasing me in the corridor every single day',
        'Seniors forcing me to do their project records and wash clothes',
        'Boys are teasing and passing comments whenever I walk alone',
        'Facing severe ragging and humiliation from hostel seniors',
        'Someone is cyberbullying me and posting threats in class group',
      ];

      for (const text of harassmentCases) {
        const res = preFilterComplaint(text);
        assert.equal(res.isValid, true, `Harassment complaint must be accepted: "${text}"`);
        assert.equal(res.canSubmit, true, `Submit button must be enabled: "${text}"`);
        assert.equal(res.isSpam, false, `Must not be marked as spam: "${text}"`);
        assert.equal(res.isHarassment, true, `Must be identified as harassment: "${text}"`);
        assert.equal(res.suggestedCategory, 'Ragging & Harassment', `Category must be Ragging & Harassment: "${text}"`);
        assert.equal(res.priority, 'urgent', `Priority must be elevated to urgent: "${text}"`);
        assert.ok(res.departmentId, `Target department must exist: "${text}"`);
      }
    });

    test('TC-FORM-04: Off-campus commercial grievances are strictly rejected', () => {
      const offCampusCases = [
        'Dominos pizza delivery boy delivered cold pizza at my home outside campus',
        'Zomato delivery order was delayed by 30 minutes in city center',
        'Swiggy order missing chicken burger delivered to my private apartment',
        'Amazon parcel delivery guy was rude at my off-campus residence',
        'Cinema theater sound was too loud during movie in shopping mall',
        'Flight tickets booked on MakeMyTrip were cancelled without refund',
      ];

      for (const text of offCampusCases) {
        const res = preFilterComplaint(text);
        assert.equal(res.isValid, false, `Off-campus issue must be rejected: "${text}"`);
        assert.equal(res.canSubmit, false, `Submit button must be disabled for: "${text}"`);
        assert.equal(res.isSpam, true, `Must be marked as spam: "${text}"`);
      }
    });
  });

  describe('Voice Recognition & Clarity Elimination Integrity', () => {
    const formPath = path.resolve(process.cwd(), 'components/StudentComplaintForm.tsx');

    test('TC-FORM-05: Clarity indicator is permanently removed from StudentComplaintForm', () => {
      assert.ok(fs.existsSync(formPath), 'StudentComplaintForm.tsx must exist');

      const content = fs.readFileSync(formPath, 'utf-8');
      
      // Clarity functions and indicators must NOT exist
      assert.ok(!content.includes('evaluateClarity'), 'evaluateClarity must not exist in form');
      assert.ok(!content.includes('clarityScore'), 'clarityScore state must not exist in form');
      assert.ok(!content.includes('clarity-score-indicator'), 'clarity-score-indicator DOM id must not exist');
      assert.ok(!content.includes('Clarity Indicator'), 'Clarity Indicator text must not exist');
    });

    test('TC-FORM-06: SpeechRecognition uses persistent useRef hooks and handles lifecycle', () => {
      const content = fs.readFileSync(formPath, 'utf-8');

      // Must use useRef for recognition instance and transcript accumulation
      assert.ok(content.includes('useRef'), 'Must use useRef');
      assert.ok(content.includes('recognitionRef'), 'Must maintain recognitionRef handle');
      assert.ok(content.includes('finalizedTranscriptRef') || content.includes('isListeningRef'), 'Must maintain transcript ref');
      assert.ok(content.includes('isListening'), 'Must track listening state');
      assert.ok(content.includes('toggleVoiceInput') || content.includes('startListening'), 'Must have voice input handler');
    });

    test('TC-FORM-07: Submit button gating without post-click error banners', () => {
      const content = fs.readFileSync(formPath, 'utf-8');

      // Submit button must have id="submit-grievance-btn" and live disabled attribute
      assert.ok(content.includes('id="submit-grievance-btn"'), 'Must have #submit-grievance-btn');
      assert.ok(content.includes('disabled={!aiRealtime.isValidComplaint'), 'Submit button must be bound to classifier validity');
      assert.ok(!content.includes('Please fix the errors below before submitting'), 'No post-click error banner');
    });
  });
});
