import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { preFilterComplaint } from '../lib/classifier';

describe('Comprehensive Classification Matrix & Routing Test Suite', () => {
  describe('1. Ragging, Harassment & Bullying Classification (Implicit Campus-Relevant)', () => {
    const harassmentCases = [
      'Seniors are teasing me in the corridor every single day',
      'A group of students is mocking and bullying me daily',
      'Eve teasing near the main gate by boys passing vulgar comments',
      'My roommate is ragging and humiliating me in front of everyone',
      'Someone is cyberbullying me in the class group with nasty rumors',
      'Boys are teasing and passing comments whenever I walk alone',
      'Continuous taunting and body shaming by senior students',
      'Senior students are calling names and humiliating me during break',
      'Facing severe mental torture and intimidation from senior batchmates',
      'Seniors forcing me to do their project records and wash clothes',
      'A student has been stalking me from library to my room after evening classes',
      'Severe intimidation and physical threats by group of hostel boys',
      'Someone is posting abusive slurs and cyberbullying in WhatsApp group',
      'Facing caste discrimination and slurs during lab viva sessions',
      'Group of senior boys picking on me and snatching my college bag repeatedly',
      'Senior student demanded money and threatened physical assault if reported',
      'Verbal harassment and abusive language directed towards female students',
      'Severe ragging in room 114 seniors locked door and harassing first year students',
      'Anti ragging emergency forced to do personal chores for seniors under threat',
      'Threatening messages and psychological harassment from college senior',
      'Hostel warden misconduct and intimidation of first year students during inspection',
      'Eve teasing by rowdy students blocking the pathway near gate',
      'Physical bullying and intimidation incident near hostel at night',
      'Harassment and blackmail by group of students near sports complex',
      'Seniors forcing junior students to do squats and abusive ragging',
      'Sexual harassment and inappropriate touching in the crowded campus hallway',
      'Internal complaints committee ICC report regarding senior harassment',
      'Dark campus pathway near back gate is unsafe with boys catcalling',
      'Security guard misconduct and verbal intimidation towards female hosteller',
      'Roommate is bullying me and throwing my books out of the room',
    ];

    for (let i = 0; i < harassmentCases.length; i++) {
      const tc = harassmentCases[i];
      test(`HARASS-${String(i + 1).padStart(2, '0')}: "${tc.slice(0, 45)}..."`, () => {
        const res = preFilterComplaint(tc);
        assert.equal(res.isValid, true, `Expected valid for "${tc}"`);
        assert.equal(res.canSubmit, true, `Submit button must be enabled for "${tc}"`);
        assert.equal(res.isHarassment, true, `Must be flagged as harassment: "${tc}"`);
        assert.equal(res.suggestedCategory, 'Ragging & Harassment');
        assert.equal(res.priority, 'urgent');
        assert.ok(res.departmentId, 'Must have a valid departmentId');
      });
    }
  });

  describe('2. Multi-Department Category Routing Matrix', () => {
    const departmentCases = [
      // Hostel Administration & Damages
      { text: 'Hostel room door lock is broken and latch will not close securely' },
      { text: 'Window glass pane is cracked and broken cold wind blowing into room 204' },
      { text: 'Water pipe leaking continuously under bathroom sink in hostel block A' },

      // Food & Mess
      { text: 'The food served in hostel mess was cold and rice was completely undercooked' },
      { text: 'Found insect and worm in lunch meal served in hostel mess dining hall' },
      { text: 'Mess food quality is terrible rotten vegetables used in evening curry' },

      // Transport & Logistics
      { text: 'College bus arrived 45 minutes late students marked absent for first period' },
      { text: 'Severe overcrowding in college bus number 7 students forced to stand on footboard' },
      { text: 'College bus route 14 broke down in the middle of highway missed morning lecture' },

      // Maintenance & Infrastructure (Network / Electrical)
      { text: 'Hostel wifi router is offline and internet connection is completely down in Block C' },
      { text: 'Air conditioning AC unit in room not cooling blowing warm air' },
      { text: 'Tube light flickering constantly causing severe headache in classroom' },

      // Academic Affairs
      { text: 'Internal exam marksheet has unfair grading discrepancy and marks entered incorrectly' },
      { text: 'Attendance shortage warning sent by mistake medical certificates were ignored by portal' },

      // Library Services
      { text: 'Library RFID digital entry barrier gate is malfunctioning and blocking students' },

      // Sports & Campus Facilities
      { text: 'Open drainage ditch near football ground overflowing and plastic waste accumulated' },

      // Health & Medical Services
      { text: 'College dispensary has no first aid medicine or doctor available' },

      // Administrative & Fees
      { text: 'Exam hall ticket blocked on student portal showing tuition fee pending error falsely' },
    ];

    for (let i = 0; i < departmentCases.length; i++) {
      const tc = departmentCases[i];
      test(`DEPT-${String(i + 1).padStart(2, '0')}: "${tc.text.slice(0, 45)}..."`, () => {
        const res = preFilterComplaint(tc.text);
        assert.equal(res.isValid, true, `Expected valid complaint for: "${tc.text}"`);
        assert.equal(res.canSubmit, true, `Submit button enabled for: "${tc.text}"`);
        assert.equal(res.isSpam, false, `Must not be spam for: "${tc.text}"`);
        assert.ok(res.departmentId, `Department must be assigned for: "${tc.text}"`);
      });
    }
  });

  describe('3. Off-Campus Commercial & Non-Complaint Rejection Matrix', () => {
    const rejectionCases = [
      { text: 'Dominos pizza delivered cold and late to my home in the city', reasonPattern: 'off-campus' },
      { text: 'Swiggy delivery boy forgot the garlic bread order at my private apartment', reasonPattern: 'off-campus' },
      { text: 'Zomato restaurant food order was terrible and cold outside campus', reasonPattern: 'off-campus' },
      { text: 'Amazon prime delivery was delayed by two days at my hometown address', reasonPattern: 'off-campus' },
      { text: 'Movie theater popcorn was too expensive and screen projector was dim', reasonPattern: 'off-campus' },
      { text: 'IRCTC train was delayed by 3 hours from Chennai Central station', reasonPattern: 'off-campus' },
      { text: 'Indigo flight baggage was delayed at the international airport', reasonPattern: 'off-campus' },
      { text: 'Crypto Bitcoin price crashed and my wallet app is showing error', reasonPattern: 'off-campus' },
      { text: 'Steam video game server connection lost during multiplayer match', reasonPattern: 'off-campus' },
    ];

    for (let i = 0; i < rejectionCases.length; i++) {
      const tc = rejectionCases[i];
      test(`REJECT-${String(i + 1).padStart(2, '0')}: "${tc.text.slice(0, 45)}..."`, () => {
        const res = preFilterComplaint(tc.text);
        assert.equal(res.isValid, false, `Off-campus issue must be rejected: "${tc.text}"`);
        assert.equal(res.canSubmit, false, `Submit button must be disabled for: "${tc.text}"`);
        assert.equal(res.isSpam, true, `Must be flagged as spam: "${tc.text}"`);
      });
    }
  });
});
