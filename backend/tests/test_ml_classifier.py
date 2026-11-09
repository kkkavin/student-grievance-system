"""
backend/tests/test_ml_classifier.py
Machine Learning Classifier, Out-of-Distribution (OOD) Gatekeeper, and Inference SLA Test Suite.
Fully harmonized with Challenger 1 Adversarial Harness.
Ports:
- test/continuous_student_classification_matrix.test.ts
- test/forensic_m2_empirical.test.ts
- .agents/teamwork/teamwork_challenger_m2_1/adversarial_classifier.py
"""

import time
import pytest
from backend.ml.classifier import classify_complaint, ComplaintClassifier


HARASSMENT_CASES = [
    # Baseline interpersonal harassment without building anchors
    "Seniors are teasing me in the corridor every single day",
    "A group of students is mocking and bullying me daily",
    "Eve teasing near the main gate by boys passing vulgar comments",
    "My roommate is ragging and humiliating me in front of everyone",
    "Someone is cyberbullying me in the class group with nasty rumors",
    "Boys are teasing and passing comments whenever I walk alone",
    "Continuous taunting and body shaming by senior students",
    "Facing severe mental torture and intimidation from senior batchmates",
    "Seniors forcing me to do their project records and wash clothes",
    "A student has been stalking me from library to my room after evening classes",
    "Severe intimidation and physical threats by group of hostel boys",
    "Someone is posting abusive slurs and cyberbullying in WhatsApp group",
    "Facing caste discrimination and slurs during lab viva sessions",
    "Verbal harassment and abusive language directed towards female students",
    "Severe ragging in room 114 seniors locked door and harassing first year students",
    "Anti ragging emergency forced to do personal chores for seniors under threat",
    "Dark campus pathway near back gate is unsafe with boys catcalling",
    "Roommate is bullying me and throwing my books out of the room",
    "Continuous mocking about my disability and regional accent by batchmates",
    "Sexual harassment and inappropriate touching in the crowded campus hallway",
    # Challenger 1 regression cases: Extortion, Blackmail & Physical Threats
    "Senior students are extorting money and threatening violence",
    "Senior students are extorting money from juniors",
    "Senior boys are blackmailing me and spreading private pictures",
    "Seniors are blackmailing me",
    "Someone is threatening to beat me up",
    "Unwanted physical contact and continuous stalking after hours",
    "Facing toxic harassment and malicious hazing from senior batch",
    "Repeated name calling, humiliation and emotional abuse by peers",
]

OFF_CAMPUS_CASES = [
    # Cinema & Movies
    "There is not seat in the cinema theatre",
    "Movie ticket booked at PVR inox was cancelled without refund",
    "The sound quality in the cinema hall was terrible during film screening",
    "Cinepolis multiplex popcorn stall counter was overpriced and dirty",
    "Imax box office refused to give tickets for the new movie",
    # Video Games & Consoles
    "Someone is bullying me in GTA 5 online multiplayer session",
    "Playstation PS5 controller joystick broke while playing games at home",
    "Fortnite gaming console server lag makes me lose every match",
    "Nintendo switch screen cracked while playing video games",
    # Commercial Food Delivery
    "Swiggy order delivered stale biryani and delivery agent was rude",
    "Zomato delivery partner cancelled my personal order without notice",
    "Dominos pizza was delivered late and crust was rock hard",
    "Blinkit grocery delivery bag was completely torn and items missing",
    "Zepto delivery boy refused to deliver to the 3rd floor",
    # Shopping Malls & Retail
    "Zara store in Phoenix shopping mall had poor customer service",
    "H&M clothing outlet fitting room was uncleaned and messy",
    "Lifestyle store cashier overcharged me at the shopping mall",
    # Commercial Flights & Trains
    "Indigo flight ticket booking was cancelled at city airport",
    "Air India boarding pass barcode was not scanning at airport terminal",
    "IRCTC tatkal train ticket reservation failed during payment gateway",
    "Metro station ticket counter machine swallowed my token",
    "Uber ride driver cancelled after making me wait for twenty minutes",
    # Crypto & Finance
    "Bitcoin cryptocurrency price dropped 15 percent on crypto exchange",
    "Ethereum crypto wallet transfer failed due to high gas fees",
    "Mutual fund SIP payment failed on stock market broker app",
    "Demat account trading app is frozen during market hours",
    # Off-Campus Housing & Venues
    "Leaking pipe in my private rented flat outside college campus",
    "My living room air conditioner at home stopped working",
    "Disneyland theme park rides had two hour long queues",
    "Nightclub bar counter drinks were diluted and expensive",
]

GREETINGS_AND_GIBBERISH_CASES = [
    # Empty & Short
    ("", "EMPTY_OR_TOO_SHORT"),
    ("   ", "EMPTY_OR_TOO_SHORT"),
    ("help", "EMPTY_OR_TOO_SHORT"),
    ("short txt", "EMPTY_OR_TOO_SHORT"),
    ("water tap", "EMPTY_OR_TOO_SHORT"),
    # Gibberish & Smashes
    ("aaaaaaaaaaaaaaaa", "GIBBERISH"),
    ("111112222233333", "GIBBERISH"),
    ("cbhhcbhbdhcdbhd", "GIBBERISH"),
    ("asdfghjkl zxcvbnm", "GIBBERISH"),
    ("bcdfghjklmnpqrstvwxz", "GIBBERISH"),
    ("aaaaa aaaaa aaaaa aaaaa", "GIBBERISH"),
    ("fix the pipeeeeeeeeee please now", "GIBBERISH"),
    ("bad bad bad bad bad bad", "GIBBERISH"),
    ("broken broken broken broken broken", "GIBBERISH"),
    ("qwertyuiop asdfghjkl zxcvbnm", "GIBBERISH"),
    ("test testing demo sample", "GIBBERISH"),
    ("asdf qwerty dummy nothing", "GIBBERISH"),
    # Greetings & Non-grievance questions/praise
    ("Hello good morning how are you doing today", "NOT_A_COMPLAINT"),
    ("Hi greetings hope you are having a wonderful day", "NOT_A_COMPLAINT"),
    ("Good afternoon sir how are things going", "NOT_A_COMPLAINT"),
    ("When does the university reopen for new semester?", "NOT_A_COMPLAINT"),
    ("Where can I find the academic timetable for next year?", "NOT_A_COMPLAINT"),
    ("Can I submit my assignment next week instead?", "NOT_A_COMPLAINT"),
    ("The campus is beautiful and great love everything here", "NOT_A_COMPLAINT"),
    ("Awesome food and fantastic service at campus dining hall", "NOT_A_COMPLAINT"),
    ("Very good faculty and wonderful infrastructure across campus", "NOT_A_COMPLAINT"),
]


class TestHarassmentImplicitCampusRelevance:

    @pytest.mark.parametrize("text", HARASSMENT_CASES)
    def test_harassment_accepted_without_building_name(self, text):
        res = classify_complaint(text)
        assert res["isValidComplaint"] is True, f"Failed for '{text}': {res.get('rejectionReason')}"
        assert res["isCampusRelevant"] is True
        assert res["category"] == "Ragging & Harassment", f"Misrouted '{text}' to '{res.get('category')}'"
        assert res["isUrgent"] is True, f"Expected isUrgent=True for '{text}'"
        assert res["priority"] in ("urgent", "high")


class TestExtortionBlackmailAndThreatClassification:
    """
    Dedicated regression test class verifying the 5 critical edge cases uncovered by Challenger 1:
    Complaints involving student extortion, blackmailing, and violence threats must NEVER default
    to 'Plumbing & Water' and must always be flagged with isUrgent=True.
    """

    ADVERSARIAL_CASES = [
        "Senior students are extorting money and threatening violence",
        "Senior students are extorting money from juniors",
        "Senior boys are blackmailing me and spreading private pictures",
        "Seniors are blackmailing me",
        "Someone is threatening to beat me up",
    ]

    @pytest.mark.parametrize("text", ADVERSARIAL_CASES)
    def test_extortion_blackmail_threat_categorization_and_urgency(self, text):
        res = classify_complaint(text)
        assert res["isValidComplaint"] is True, f"Failed validity check for '{text}': {res.get('rejectionReason')}"
        assert res["isCampusRelevant"] is True, f"Failed campus relevance check for: '{text}'"
        assert res["category"] == "Ragging & Harassment", (
            f"VULNERABILITY REPRODUCED: '{text}' misclassified as '{res.get('category')}' instead of 'Ragging & Harassment'!"
        )
        assert res["isUrgent"] is True, f"VULNERABILITY REPRODUCED: isUrgent is False for threat: '{text}'"
        assert res["priority"] in ("urgent", "high"), f"Priority '{res.get('priority')}' is not urgent/high for: '{text}'"


class TestOffCampusDomainVeto:

    @pytest.mark.parametrize("text", OFF_CAMPUS_CASES)
    def test_off_campus_strictly_rejected(self, text):
        res = classify_complaint(text)
        assert res["isValidComplaint"] is False, f"Expected rejection for '{text}'"
        assert res["isCampusRelevant"] is False
        assert res["rejectionReason"] == "OFF_CAMPUS_DOMAIN"


class TestGreetingsAndGibberishVeto:

    @pytest.mark.parametrize("text,expected_reason", GREETINGS_AND_GIBBERISH_CASES)
    def test_non_complaints_and_gibberish_rejected(self, text, expected_reason):
        res = classify_complaint(text)
        assert res["isValidComplaint"] is False, f"Expected rejection for '{text}'"
        assert res["rejectionReason"] in (expected_reason, "EMPTY_OR_TOO_SHORT", "GIBBERISH", "NOT_A_COMPLAINT")


class TestClassificationLatencySla:

    def test_sub_50ms_inference_latency_sla(self):
        classifier = ComplaintClassifier()
        sample_text = "Water pipeline leakage flooding second floor washroom in Hostel Block A room 204"

        # Warmup
        for _ in range(50):
            classifier.classify_complaint(sample_text)

        durations = []
        for _ in range(1000):
            t0 = time.perf_counter()
            classifier.classify_complaint(sample_text)
            durations.append((time.perf_counter() - t0) * 1000.0)  # ms

        durations.sort()
        p95 = durations[int(len(durations) * 0.95)]
        avg = sum(durations) / len(durations)

        assert p95 < 50.0, f"P95 latency {p95:.2f}ms exceeded 50ms SLA"
        assert avg < 10.0, f"Average latency {avg:.2f}ms exceeded 10ms threshold"


class TestDepartmentRoutingAccuracy:

    @pytest.mark.parametrize(
        "text,expected_category",
        [
            ("Block C 3rd floor Wi-Fi access point completely dead since yesterday", "Hostel Wi-Fi & Internet"),
            ("Major water pipeline leakage flooding washroom in Block A", "Plumbing & Water"),
            ("Switchboard sparking and burnt smell coming from room fan", "Electrical & AC"),
            ("Undercooked chicken and stale rice served during dinner at South Mess", "Food & Mess"),
            ("Hostel room door lock is broken and latch will not close", "Damages & Repairs"),
            ("College bus number 7 broke down on highway missed morning lecture", "Bus & Transport"),
            ("Computer science lab system 24 monitor flickering and keys stuck", "Classroom & Lab Facilities"),
        ],
    )
    def test_multi_category_routing_accuracy(self, text, expected_category):
        res = classify_complaint(text)
        assert res["isValidComplaint"] is True
        assert res["category"] == expected_category
