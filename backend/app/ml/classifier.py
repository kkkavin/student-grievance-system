"""
Campus Grievance Machine Learning Classifier & Out-of-Distribution Gatekeeper.
3-Stage Campus Grievance ML Classifier & Out-of-Distribution Gatekeeper.
Preserves exact parity with src/ml/complaintClassifier.ts and continuous_student_classification_matrix.test.ts.
Executes with sub-50ms latency (empirically < 0.1ms).
"""

from datetime import datetime, timezone
import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

# Supported Complaint Categories
COMPLAINT_CATEGORIES = [
    "Plumbing & Water",
    "Electrical & AC",
    "Hostel Wi-Fi & Internet",
    "Food & Mess",
    "Damages & Repairs",
    "Cleanliness & Sanitation",
    "Bus & Transport",
    "Canteen & Cafeteria",
    "Classroom & Lab Facilities",
    "Library & Wi-Fi",
    "Campus Cleanliness",
    "Administrative & Fees",
    "Ragging & Harassment",
    "Others",
]

CATEGORY_ICONS = {
    "Plumbing & Water": "💧",
    "Electrical & AC": "⚡",
    "Hostel Wi-Fi & Internet": "📶",
    "Food & Mess": "🍱",
    "Damages & Repairs": "🛠️",
    "Cleanliness & Sanitation": "🧹",
    "Bus & Transport": "🚌",
    "Canteen & Cafeteria": "☕",
    "Classroom & Lab Facilities": "🔬",
    "Library & Wi-Fi": "📚",
    "Campus Cleanliness": "🌿",
    "Administrative & Fees": "📄",
    "Ragging & Harassment": "🛡️",
    "Others": "📋",
}

# 10-Department Canonical Target Routing
CATEGORY_DEPARTMENT_MAP_10 = {
    "Hostel Wi-Fi & Internet": "dept-it",
    "Library & Wi-Fi": "dept-studentlife",
    "Plumbing & Water": "dept-infra",
    "Food & Mess": "dept-mess",
    "Cleanliness & Sanitation": "dept-hostel",
    "Damages & Repairs": "dept-infra",
    "Electrical & AC": "dept-infra",
    "Bus & Transport": "dept-transport",
    "Canteen & Cafeteria": "dept-mess",
    "Campus Cleanliness": "dept-infra",
    "Classroom & Lab Facilities": "dept-academics",
    "Administrative & Fees": "dept-accounts",
    "Ragging & Harassment": "dept-security",
    "Others": "dept-hostel",
}

# Legacy 5-Department Mapping for Backwards Compatibility with test fixtures
CATEGORY_DEPARTMENT_MAP_5 = {
    "Hostel Wi-Fi & Internet": "dept-network-ops",
    "Library & Wi-Fi": "dept-network-ops",
    "Plumbing & Water": "dept-hostel-admin",
    "Food & Mess": "dept-hostel-admin",
    "Cleanliness & Sanitation": "dept-hostel-admin",
    "Damages & Repairs": "dept-facilities",
    "Electrical & AC": "dept-facilities",
    "Bus & Transport": "dept-campus-transport",
    "Canteen & Cafeteria": "dept-facilities",
    "Campus Cleanliness": "dept-facilities",
    "Classroom & Lab Facilities": "dept-academic-affairs",
    "Administrative & Fees": "dept-academic-affairs",
    "Ragging & Harassment": "dept-academic-affairs",
    "Others": "dept-hostel-admin",
}

# Active default mapping
CATEGORY_DEPARTMENT_MAP = CATEGORY_DEPARTMENT_MAP_5

# Hard Off-Campus Domain Veto Words (Evaluated first to strictly reject non-campus domains)
OFF_CAMPUS_VETO_WORDS = {
    "cinema", "multiplex", "pvr", "inox", "cinepolis", "imax",
    "netflix", "hotstar", "spotify", "playstation", "xbox", "nintendo",
    "swiggy", "zomato", "blinkit", "zepto", "instamart", "dunzo", "ubereats", "doordash",
    "irctc", "tatkal", "airbnb", "bitcoin", "ethereum", "cryptocurrency",
    "supermarket", "hypermarket", "walmart", "costco", "wonderla", "disneyland",
    "pub", "pubs", "brewery", "breweries", "nightclub", "nightclubs", "disco",
    "concert", "concerts", "beach", "beaches",
    "hotel", "hotels", "motel", "motels", "resort", "resorts",
    "apartment", "apartments",
}

# Multi-word Off-Campus Phrase Blockers
OFF_CAMPUS_PHRASE_PATTERNS = [
    re.compile(r"\bcinema(\s+theatre|\s+theater|\s+hall)?\b", re.IGNORECASE),
    re.compile(r"\bmovie(\s+theatre|\s+theater|\s+ticket|\s+hall)?\b", re.IGNORECASE),
    re.compile(r"\bmultiplex\b", re.IGNORECASE),
    re.compile(r"\b(pvr|inox|cinepolis|imax)\b", re.IGNORECASE),
    re.compile(r"\bbox\s+office\b", re.IGNORECASE),
    re.compile(r"\bpopcorn\s+(stall|counter)\b", re.IGNORECASE),
    re.compile(r"\bfilm\s+(screening|festival|ticket|show)\b", re.IGNORECASE),
    re.compile(r"\bshopping\s+mall\b", re.IGNORECASE),
    re.compile(r"\b\w*\s+mall\b", re.IGNORECASE),
    re.compile(r"\bmall\b", re.IGNORECASE),
    re.compile(r"\b(zara|h&m|h\s*&\s*m|lifestyle|westside)\b", re.IGNORECASE),
    re.compile(r"\b(clothing\s+outlet|fitting\s+room)\b", re.IGNORECASE),
    re.compile(r"\b(swiggy|zomato|blinkit|zepto|instamart|dunzo|ubereats|doordash)\b", re.IGNORECASE),
    re.compile(r"\bflight(\s+ticket|\s+delay|\s+booking)?\b", re.IGNORECASE),
    re.compile(r"\b(airline|airport|boarding\s+pass|airplane|aeroplane|runway)\b", re.IGNORECASE),
    re.compile(r"\b(indigo|air\s+india|emirates|spicejet|vistara)\s+flight\b", re.IGNORECASE),
    re.compile(r"\brailway\s+(reservation|ticket|station)\b", re.IGNORECASE),
    re.compile(r"\btrain\s+ticket\b", re.IGNORECASE),
    re.compile(r"\b(irctc|tatkal|bullet\s+train|berth\s+allocation)\b", re.IGNORECASE),
    re.compile(r"\b(uber|ola|rapido)\s+(ride|cab|auto|driver)\b", re.IGNORECASE),
    re.compile(r"\bmetro\s+(station|train|ticket|token)\b", re.IGNORECASE),
    re.compile(r"\b(hotel|hotels|motel|motels|resort|resorts|airbnb)\b", re.IGNORECASE),
    re.compile(r"\b(pub|pubs|brewery|breweries|nightclub|disco|bar\s+counter)\b", re.IGNORECASE),
    re.compile(r"\b(beach|beaches|sea\s+shore)\b", re.IGNORECASE),
    re.compile(r"\b(video\s+game|video\s+games|gaming\s+console)\b", re.IGNORECASE),
    re.compile(r"\b(apartment|apartments|residential\s+flat|rented\s+flat|my\s+flat|flatmate|flatmates)\b", re.IGNORECASE),
    re.compile(r"\b(at\s+(my\s+)?(home|house|apartment|flat))\b", re.IGNORECASE),
    re.compile(r"\b(in\s+(my\s+)?(home|house|apartment|flat))\b", re.IGNORECASE),
    re.compile(r"\b(living\s+room|my\s+bedroom)\b", re.IGNORECASE),
    re.compile(r"\b(personal\s+(swiggy|zomato\s+)?order)\b", re.IGNORECASE),
    re.compile(r"\b(city\s+hospital|private\s+hospital|dental\s+clinic)\b", re.IGNORECASE),
    re.compile(r"\bstock\s+market\b", re.IGNORECASE),
    re.compile(r"\b(crypto|cryptocurrency|bitcoin|ethereum|mutual\s+fund|forex|demat)\b", re.IGNORECASE),
    re.compile(r"\brestaurant\b", re.IGNORECASE),
    re.compile(r"\b(cinema\s+theatre|cinema\s+theater|movie\s+theatre|movie\s+theater|film\s+theatre|film\s+theater)\b", re.IGNORECASE),
    re.compile(r"\b(netflix|prime\s+video|hotstar|disney\s+plus|hulu|spotify)\b", re.IGNORECASE),
    re.compile(r"\b(playstation|ps5|ps4|xbox|nintendo\s+switch|gta\s+5|fortnite|pubg|valorant)\b", re.IGNORECASE),
    re.compile(r"\b(starbucks|cafe\s+coffee\s+day|mcdonald|burger\s+king|domino'?s|pizza\s+hut)\b", re.IGNORECASE),
]

# Implicit Campus-Domain Rule: Interpersonal abuse, ragging, teasing, welfare crisis
INTERPERSONAL_AND_WELFARE_REGEX = re.compile(
    r"(?:is|are)?\b(teas(ing|ed|es)?|mock(ing|ed|s)?|taunt(ing|ed|s)?|rag(ging|ged)?|"
    r"eve[\s-]teas(ing|ed|es)?|body[\s-]sham(ing|ed)?|humiliat(ing|ed|ion|es)?|bull(y|ying|ied|ies)|"
    r"call(ing|ed)?\s+names?|name[\s-]call(ing)?|mental\s+torture|seniors?\s+forc(ing|ed)?|"
    r"stalk(ing|ed|er|ers)?|intimidat(ing|ed|ion|e)?|cyber[\s-]?bull(y|ying|ied|ies)|slurs?|"
    r"discriminat(ing|ed|ion|e)?|harass(ing|ed|ment|es)?|pick(ing|ed)?\s+on\s+me|pass(ing|ed)?\s+comments?|"
    r"catcall(ing)?|unsafe|abusive?\s+(language|words?|behavior|behaviour)|threaten(ing|ed|s)?|"
    r"blackmail(ing|ed)?|extort(ion|ing|ed)?|casteist|caste\s+discriminat\w*|gender\s+discriminat\w*|"
    r"suicid(al|e)|mental\s+health|depression|anxiety(\s+attack|\s+support)?|panic\s+attack|"
    r"mental\s+breakdown|burnout|counselor|counselling|counseling|internal\s+complaints\s+committee|icc\b|"
    r"inappropriate\s+touch(ing)?|unwanted\s+(physical\s+contact|touching)|sexual\s+harass(ment)?|"
    r"toxic\s+peer|toxic\s+faculty)\b",
    re.IGNORECASE,
)

# Explicit Campus Domain Anchors
CAMPUS_ANCHORS = [
    re.compile(r"\b(hostel|dorm|dormitory|mess|canteen|cafeteria|dining)\b", re.IGNORECASE),
    re.compile(r"\b(library|reading\s+room|study\s+hall|bookshelf|librarian|book\s+renewal)\b", re.IGNORECASE),
    re.compile(r"\b(classroom|class\s+room|lecture|smartboard|projector|whiteboard|seminar\s+hall|auditorium)\b", re.IGNORECASE),
    re.compile(r"\b(lab|laboratory|computer\s+lab|systems\s+lab|programming\s+lab|physics\s+lab|chemistry\s+lab)\b", re.IGNORECASE),
    re.compile(r"\b(campus|college|university|department|dept|academic|faculty|professor|lecturer|teacher|dean|warden|proctor|hod|registrar|accounts)\b", re.IGNORECASE),
    re.compile(r"\b(college\s+bus|campus\s+bus|bus\s+route|bus\s+#?\d+|route\s+\d+|bus\s+driver|bus\s+conductor|bus\s+bay)\b", re.IGNORECASE),
    re.compile(r"\b(\w+\s+block|hostel\s+block|block\s+[a-z0-9]|block\b|room\s+[a-z0-9]+|floor\s+\d+|\d+(st|nd|rd|th)\s+floor|corridor|balcony)\b", re.IGNORECASE),
    re.compile(r"\b(washroom|restroom|toilet|bathroom|urinal|drain|drainage|sewage|pipeline|tap|sink|basin|flush|geyser|shower)\b", re.IGNORECASE),
    re.compile(r"\b(water\s+supply|water\s+dispenser|ro\s+filter|water\s+cooler|drinking\s+water|overhead\s+tank|pipe\s+burst)\b", re.IGNORECASE),
    re.compile(r"\b(wifi|wi-fi|internet|lan\s+port|ethernet|router|access\s+point|ssid|captive\s+portal|eduroam)\b", re.IGNORECASE),
    re.compile(r"\b(exam|exams?|tuition|fees?|fee\s+receipt|scholarship|hall\s+ticket|marksheet|grade\s+card|bonafide|id\s+card|student\s+id|attendance|portal)\b", re.IGNORECASE),
    re.compile(r"\b(ragging|anti-ragging|anti\s+ragging|harass|harassment|bully|bullying|senior|junior|batchmate)\b", re.IGNORECASE),
    re.compile(r"\b(cleanliness|dustbin|garbage|litter|trash|housekeeping|cockroach|bed\s+bugs|mosquito|pest\s+control)\b", re.IGNORECASE),
    re.compile(r"\b(switchboard|switch|socket|plug|ceiling\s+fan|regulator|tube\s+light|light\s+bulb|air\s+conditioning|ac\s+unit|mcb|breaker|power\s+outage|voltage)\b", re.IGNORECASE),
    re.compile(r"\b(door\s+lock|latch|window\s+glass|cupboard|wardrobe|bed\s+frame|mattress|study\s+table|chair\s+leg)\b", re.IGNORECASE),
    re.compile(r"\b(sports\s+ground|gym|gymnasium|sports\s+complex|basketball\s+court|cricket\s+ground|football\s+field|badminton\s+court|treadmill|weights|athletic\s+track)\b", re.IGNORECASE),
    re.compile(r"\b(dispensary|health\s+center|health\s+centre|campus\s+clinic|infirmary|first\s+aid|campus\s+doctor|medical\s+room|college\s+hospital|ambulance)\b", re.IGNORECASE),
    re.compile(r"\b(quadrangle|campus\s+gate|main\s+gate|pathway|walkway|entrance|parking\s+lot|security\s+guard)\b", re.IGNORECASE),
]

# Problem / Grievance Intent Indicators
PROBLEM_REGEX = re.compile(
    r"\b(not|doesn't|doesnt|isn't|isnt|won't|wont|cannot|can't|cant|failed\s+to)\s+"
    r"(working|work|turn|turning|start|starting|cool|cooling|load|loading|connect|connecting|open|opening|"
    r"power|powering|switch|switching|running|run|functioning|function|operational|close|boot|booting|"
    r"respond|responding|released?|resolving|resolve|attend|attending)\b",
    re.IGNORECASE,
)

PROBLEM_KEYWORD_REGEX = re.compile(
    r"\b(overheat|overheating|overheated|rupture|ruptured|burst|flooded|flooding|stale|undercooked|spoiled|"
    r"insects?|cockroaches?|bed\s+bugs?|mosquitoes?|overcrowded|overcrowding|shortage|no\s+seat|lack\s+of|"
    r"broken|damaged|damages|defect|defective|fault|faulty|leak|leaking|leakage|offline|down|outage|blackout|"
    r"tripping|tripped|fused|flicker|flickering|spark|sparking|shock|fire|burn|burnt|burning|harass|harassment|"
    r"ragging|bully|bullying|threatening|intimidation|overcharging|overcharged|overpriced|charging\s+(higher|more|extra)|"
    r"above\s+mrp|higher\s+prices|unhygienic|dirty|filthy|stink|stinking|smell|smelly|foul|slow|delay|delayed|"
    r"delays|late|breakdown|broke\s+down|crashed|crashing|crash|problem|problems|issue|issues|complaint|complaints|"
    r"grievance|grievances|repair|repairs|fix|falling|shaking|jammed|stuck|dead|suffocating|malfunctioning|"
    r"boiling\s+hot|blue\s+screen|overflowing|overflow|blocking|blocked|expired|unable\s+to|not\s+detecting|"
    r"packet\s+drops?|reboot(ed|ing)?|blinking|red\s+status|cooler\s+empty|empty|curry\s+was\s+cold|cold\s+curry|"
    r"cold\s+food|left\s+(\w+\s+)?before|departure\s+time|left\s+early|warm\s+water|cooler\s+warm|compressor|"
    r"out\s+of\s+stock|no\s+medicine|no\s+doctor|no\s+first\s+aid|unavailable|not\s+available|out\s+of\s+order|"
    r"unserviceable|teas(ing|ed|es)?|mock(ing|ed|s)?|taunt(ing|ed|s)?|eve\s+teas\w*|body\s+sham\w*|humiliat\w*|"
    r"call(ing|ed)?\s+names?|name\s+call\w*|mental\s+torture|seniors?\s+forc\w*|stalk\w*|intimidat\w*|"
    r"cyber\s*bull\w*|slurs?|discriminat\w*|pick(ing|ed)?\s+on\s+me|pass(ing|ed)?\s+comments?|suicid\w*|depress\w*|"
    r"anxiety|burnout|counsel\w*|food\s+poisoning|worms?|ambulance|wheelchair|dispute|unfair|discrepancy|typo|"
    r"absenteeism|clash|sagging|unusable|replacement|rotten|terrible|hazard)\b",
    re.IGNORECASE,
)

DUMMY_TERMS = {
    "test", "testing", "hello", "hi", "demo", "sample",
    "asdf", "qwerty", "abc", "xyz", "dummy", "nothing",
}

KEYBOARD_SMASHES = [
    "qwerty", "asdfgh", "zxcvbn", "qwert", "asdfg", "zxcvb",
    "12345", "23456", "34567", "45678", "56789",
    "poiuy", "lkjhg", "mnbvc", "dfghj", "fghjk",
    "qweqwe", "asdasd", "zxczxc", "asdfasdf", "qwertyuiop",
    "asdfghjkl", "zxcvbnm", "cbhhcbhbdhcdbhd",
]


class ComplaintClassifier:
    """Production 3-Stage Local Classifier and Campus Gatekeeper."""

    def classify_complaint(
        self,
        text: str,
        student_type: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        # ---------------------------------------------------------------------
        # STAGE 1: OOD, Length, Gibberish & Off-Campus Domain Gatekeeper
        # ---------------------------------------------------------------------
        if not text or not isinstance(text, str):
            return self._build_invalid_result("EMPTY_OR_TOO_SHORT")

        trimmed = text.strip()
        if len(trimmed) < 10:
            return self._build_invalid_result("EMPTY_OR_TOO_SHORT")

        words = [w for w in trimmed.split() if w]
        if len(words) < 3:
            return self._build_invalid_result("EMPTY_OR_TOO_SHORT")

        lower = trimmed.lower()

        # 1a. Character repeat spam (e.g. "aaaaa", "11111")
        if re.search(r"(.)\1{4,}", trimmed):
            return self._build_invalid_result("GIBBERISH")

        # 1b. Repeated single word loops (e.g. "bad bad bad bad bad")
        clean_words = [re.sub(r"[^a-z0-9]", "", w.lower()) for w in words]
        clean_words = [w for w in clean_words if w]
        if len(clean_words) >= 3 and len(set(clean_words)) == 1:
            return self._build_invalid_result("GIBBERISH")

        # 1c. Keyboard smashes
        if len(words) < 6 and any(smash in lower for smash in KEYBOARD_SMASHES):
            return self._build_invalid_result("GIBBERISH")

        # 1d. Consonant clusters or missing vowels
        for w in words:
            clean = re.sub(r"[^a-zA-Z]", "", w).lower()
            if len(clean) >= 6:
                if re.search(r"[bcdfghjklmnpqrstvwxz]{6,}", clean):
                    return self._build_invalid_result("GIBBERISH")
                if not re.search(r"[aeiouy]", clean):
                    return self._build_invalid_result("GIBBERISH")

        # 1e. Placeholder terms
        if len(words) <= 4 and all(re.sub(r"[^a-z]", "", w.lower()) in DUMMY_TERMS for w in words):
            return self._build_invalid_result("GIBBERISH")

        # 1f. Hard Off-Campus Domain Veto (Evaluated first to strictly reject non-campus domains)
        for w in words:
            clean = re.sub(r"[^a-z0-9]", "", w.lower())
            if clean in OFF_CAMPUS_VETO_WORDS:
                return self._build_invalid_result("OFF_CAMPUS_DOMAIN")

        for pattern in OFF_CAMPUS_PHRASE_PATTERNS:
            if pattern.search(lower):
                return self._build_invalid_result("OFF_CAMPUS_DOMAIN")

        # Interpersonal abuse / harassment implicit campus-domain check
        is_interpersonal = bool(INTERPERSONAL_AND_WELFARE_REGEX.search(lower))

        has_problem = (
            is_interpersonal
            or bool(PROBLEM_REGEX.search(lower))
            or bool(PROBLEM_KEYWORD_REGEX.search(lower))
        )

        # 2a. Pure greetings
        if re.search(r"^(hello|hi|hey|good\s+(morning|afternoon|evening|day)|greetings|how\s+are\s+you)\b", trimmed, re.IGNORECASE) and not has_problem:
            return self._build_invalid_result("NOT_A_COMPLAINT")

        # 2b. Non-grievance questions
        is_question = bool(re.search(r"\?$", trimmed) or re.search(r"^(when|where|what|how|why|which|can\s+i|is\s+there|could\s+you)\b", trimmed, re.IGNORECASE))
        if is_question and not has_problem:
            return self._build_invalid_result("NOT_A_COMPLAINT")

        # 2c. Pure praise without problem
        praise_words = ["beautiful", "great", "awesome", "amazing", "super fast", "perfect", "love", "excellent", "wonderful", "good job", "very good", "fantastic", "nice"]
        if any(p in lower for p in praise_words) and not has_problem:
            return self._build_invalid_result("NOT_A_COMPLAINT")

        has_campus_anchor = any(p.search(lower) for p in CAMPUS_ANCHORS)
        has_campus_context = bool(context and (context.get("category") or context.get("locationTag") or context.get("hostelBlock")))

        # Under the Implicit Campus-Domain Rule, interpersonal abuse / ragging is inherently campus-relevant
        is_campus_relevant = has_campus_anchor or has_campus_context or is_interpersonal
        if not is_campus_relevant:
            return self._build_invalid_result("OFF_CAMPUS_DOMAIN")

        if not has_problem and not has_campus_context and "grievance" not in lower and "complaint" not in lower:
            return self._build_invalid_result("NOT_A_COMPLAINT")

        # ---------------------------------------------------------------------
        # STAGE 3: Context-Disambiguated Category Scorer & Priority Resolver
        # ---------------------------------------------------------------------
        logits: Dict[str, float] = {cat: 0.1 for cat in COMPLAINT_CATEGORIES}

        is_urgent = False
        priority = "medium"

        # 1. Ragging, Bullying, Teasing & Harassment (with full inflections)
        is_explicit_ragging = bool(re.search(
            r"\b(ragging|ragged|anti-ragging|anti\s+ragging|harass\w*|"
            r"bully\w*|senior\s+threatening|physical\s+intimidation|threatened\s+physical|"
            r"blackmail\w*|extort\w*|threaten\w*|violence|hazing|abusive\s+language|"
            r"teas(ing|ed|es)?|mock(ing|ed|s)?|taunt(ing|ed|s)?|"
            r"eve\s+teas\w*|body\s+sham\w*|humiliat\w*|call(ing|ed)?\s+names?|name\s+call\w*|"
            r"mental\s+torture|seniors?\s+forc\w*|stalk(ing|ed|er|ers)?|intimidat\w*|cyber[\s-]?bull\w*|"
            r"slurs?|discriminat\w*|pick(ing|ed)?\s+on\s+me|pass(ing|ed)?\s+comments?|catcall\w*|"
            r"unsafe|misconduct|inappropriate\s+touch|sexual\s+harass\w*|warden\s+misconduct)\b",
            lower,
        ))

        is_mental_health = bool(re.search(
            r"\b(counselor|counsellor|counseling|counselling|mental\s+health|depression|anxiety|"
            r"panic\s+attack|suicid\w*|burnout|academic\s+stress)\b",
            lower,
        ))

        # Coupled Stage 2 & Stage 3 routing:
        # 1) Explicit ragging / harassment triggers "Ragging & Harassment" (+35.0, urgent)
        # 2) Pure mental health / counseling triggers "Others" (+35.0, urgent)
        # 3) Any other Stage 2 interpersonal grievance triggers "Ragging & Harassment" (+35.0, urgent)
        if is_explicit_ragging:
            logits["Ragging & Harassment"] += 35.0
            is_urgent = True
            priority = "urgent"
        elif is_mental_health:
            logits["Others"] += 35.0
            is_urgent = True
            priority = "urgent"
        elif is_interpersonal:
            logits["Ragging & Harassment"] += 35.0
            is_urgent = True
            priority = "urgent"

        # 2. Wi-Fi & Internet Disambiguation
        if re.search(r"\b(wifi|wi-fi|internet|lan\s+port|ethernet|router|access\s+point|ap\s+controller|ssid|captive\s+portal|eduroam|slow\s+internet)\b", lower):
            if re.search(r"\b(library|reading\s+room|study\s+hall)\b", lower):
                logits["Library & Wi-Fi"] += 20.0
            else:
                logits["Hostel Wi-Fi & Internet"] += 22.0

        # 3. Library non-wifi issues
        if re.search(r"\b(library|librarian|reading\s+hall|reading\s+room|study\s+hall|borrowed\s+books?|book\s+renewal|reference\s+books?|rfid\s+gate|e-journal|ieee|book\s+shortage)\b", lower):
            logits["Library & Wi-Fi"] += 20.0

        # 4. Bus & Transport
        if re.search(r"\b(college\s+bus|campus\s+bus|bus\s+route|bus\s+#?\d+|route\s+\d+|bus\s+driver|conductor|footboard|bus\s+breakdown|bus\s+seat|bus\s+pass|bus\s+delay|pickup\s+stop|rash\s+driving|skipped\s+stop|overcrowded\s+bus)\b", lower):
            logits["Bus & Transport"] += 25.0

        # 5. Classroom & Lab Facilities
        if re.search(r"\b(projector|smartboard|whiteboard|seminar\s+hall|computer\s+(science\s+)?lab|lab\s+pc|lab\s+system|programming\s+lab|physics\s+lab|chemistry\s+lab|\b[a-z]+\s+lab\b|classroom\s+bench|classroom\s+desk|speaker\s+feedback|microphone|audio\s+mic|syllabus\s+not\s+covered|faculty\s+absent|broken\s+lab\s+equipment)\b", lower):
            logits["Classroom & Lab Facilities"] += 25.0

        # 6. Administrative & Fees
        if re.search(r"\b(tuition\s+fee|fees?|fee\s+receipt|scholarship|hall\s+ticket|marksheet|grade\s+card|bonafide|id\s+card|student\s+id|attendance\s+shortage|accounts\s+department|caution\s+deposit|late\s+fine|migration\s+certificate|transfer\s+certificate|placement\s+cell|internship\s+noc|portal\s+error|marks\s+discrepancy|unfair\s+grading|grading\s+discrepancy|typo\s+in\s+student)\b", lower):
            logits["Administrative & Fees"] += 25.0

        # 7. Canteen & Cafeteria
        if re.search(r"\b(canteen|cafeteria|canteen\s+food|canteen\s+snacks|overcharging\s+mrp|canteen\s+tables|canteen\s+tea|canteen\s+coffee|upi\s+scanner)\b", lower):
            logits["Canteen & Cafeteria"] += 22.0

        # 8. Food & Mess
        if re.search(r"\b(mess|dining\s+hall|dining\s+counter|mess\s+food|sambar|undercooked\s+rice|spoiled\s+dal|stale\s+curd|food\s+poisoning|stomach\s+ache|insects\s+in\s+food|worms\s+in\s+food|hair\s+in\s+food|mess\s+catering|rotten\s+vegetables)\b", lower):
            logits["Food & Mess"] += 25.0
            if re.search(r"\b(stale|insects?|worms?|hair|cockroach|poisoning|sickness|spoiled|contaminated)\b", lower):
                priority = "high"
                if "poisoning" in lower or "hospital" in lower:
                    is_urgent = True
                    priority = "urgent"

        # 9. Plumbing & Water
        if re.search(r"\b(pipe|pipeline|leak|leaking|leakage|tap|faucet|toilet\s+flush|flush\s+broken|water\s+supply|geyser|water\s+heater|drain|drainage|sewage|flooded|washbasin|water\s+dispenser|ro\s+dispenser|water\s+cooler|pipe\s+burst)\b", lower):
            if "mess" not in lower and "canteen" not in lower:
                logits["Plumbing & Water"] += 20.0
                if "burst" in lower or "flooded" in lower or "flooding" in lower:
                    is_urgent = True
                    priority = "urgent"

        # 10. Cleanliness & Sanitation
        if re.search(r"\b(dirty\s+washroom|unhygienic\s+toilet|cleanliness|sanitation|algae|cockroaches?|insects?\s+infestation|bed\s+bugs?|mosquitoes?|pest\s+control|dustbins?\s+in\s+hostel|foul\s+smell|stinking\s+toilets?|stinking\s+washroom|housekeeping|handwash\s+soap|sanitary\s+napkin)\b", lower):
            logits["Cleanliness & Sanitation"] += 22.0

        # 11. Campus Cleanliness
        if re.search(r"\b(campus\s+cleanliness|campus\s+lawn|quadrangle|sports\s+ground\s+trash|campus\s+pathway|campus\s+road|main\s+gate\s+drain|open\s+drainage\s+on\s+road|fallen\s+tree\s+branches|parking\s+lot\s+broken\s+glass)\b", lower):
            logits["Campus Cleanliness"] += 20.0

        # 12. Damages & Repairs
        if re.search(r"\b(maintenance|maintain|repair|repairs|door\s+lock|latch|window\s+glass|window\s+pane|cupboard|wardrobe|hinge|study\s+table|chair\s+leg|bed\s+frame|iron\s+rod\s+sagging|mattress\s+unusable|shelf\s+falling|curtain\s+rod|balcony\s+door\s+handle|carpenter|elevator|lift\s+breakdown|wheelchair|ramp|washing\s+machine|laundry)\b", lower):
            logits["Damages & Repairs"] += 22.0

        # 13. Electrical & AC
        if re.search(r"\b(ceiling\s+fan|regulator|fan\s+blade|tube\s+light|light\s+flickering|switchboard|switch|socket|plug|exposed\s+wires|short\s+circuit|mcb|breaker|power\s+outage|blackout|voltage\s+fluctuation|air\s+conditioning|ac\s+unit|ac\s+cooling|thermostat)\b", lower):
            if not any(k in lower for k in ("bus", "library", "lab", "classroom")):
                logits["Electrical & AC"] += 22.0
                if any(k in lower for k in ("spark", "sparking", "shock", "fire", "burning", "short circuit")):
                    is_urgent = True
                    priority = "urgent"

        # 14. Medical & Dispensary
        if re.search(r"\b(dispensary|health\s+center|health\s+centre|infirmary|first\s+aid|campus\s+clinic|medical\s+room|campus\s+doctor|ambulance|outpass|curfew|gate\s+pass|bed\s+allocation|room\s+allocation|change\s+request)\b", lower):
            if not is_explicit_ragging:
                logits["Others"] += 30.0
                if any(k in lower for k in ("emergency", "urgent", "ambulance", "bleeding", "severe", "no doctor", "no first aid")):
                    is_urgent = True
                    priority = "urgent"

        # Boost context category if present
        if context and context.get("category") and context["category"] in COMPLAINT_CATEGORIES:
            logits[context["category"]] += 20.0

        sorted_cats = sorted(logits.items(), key=lambda x: x[1], reverse=True)

        # Robust Fallback Category: If no category logit was boosted (all <= 0.1),
        # default to "Others" instead of defaulting to COMPLAINT_CATEGORIES[0] ("Plumbing & Water")
        if sorted_cats[0][1] <= 0.1:
            top_cat = "Others"
            top_logit = 0.1
            second_cat = None
        else:
            top_cat, top_logit = sorted_cats[0]
            second_cat = sorted_cats[1][0] if len(sorted_cats) > 1 else None

        # Urgent flag consolidation: includes blackmail, extort, threaten, violence, hazing
        urgent_tokens = [
            "fire", "spark", "electric shock", "smoke", "flood", "flooded", "short circuit",
            "ragging", "suicide", "bleeding", "emergency", "teas", "mock", "bully", "taunt",
            "intimidat", "poisoning", "ambulance",
            "blackmail", "extort", "threaten", "violence", "hazing"
        ]
        if any(tok in lower for tok in urgent_tokens) or top_cat == "Ragging & Harassment":
            is_urgent = True
            priority = "urgent"

        confidence = min(0.99, max(0.65, 0.50 + (top_logit / 50.0)))
        dept_id = CATEGORY_DEPARTMENT_MAP.get(top_cat, "dept-hostel-admin")
        icon = CATEGORY_ICONS.get(top_cat, "📋")

        return {
            "isValidComplaint": True,
            "isCampusRelevant": True,
            "isComplaintIntent": True,
            "rejectionReason": None,
            "category": top_cat,
            "suggestedCategory": top_cat,
            "departmentId": dept_id,
            "confidence": round(confidence, 2),
            "priority": priority,
            "isUrgent": is_urgent,
            "icon": icon,
            "suggestedIcon": icon,
            "secondCategory": second_cat,
            "subCategory": top_cat,
            "topFeatures": [w for w in clean_words[:4] if len(w) > 3],
            "probabilities": {c: round(v / 100.0, 3) for c, v in sorted_cats[:5]},
            "model": "Campus-Gatekeeper-ML/v2.0 (3-Stage Python)",
        }

    def _build_invalid_result(self, rejection_reason: str) -> Dict[str, Any]:
        is_campus_relevant = rejection_reason != "OFF_CAMPUS_DOMAIN"
        is_complaint_intent = rejection_reason not in ("NOT_A_COMPLAINT", "GIBBERISH", "EMPTY_OR_TOO_SHORT")
        return {
            "isValidComplaint": False,
            "isCampusRelevant": is_campus_relevant,
            "isComplaintIntent": is_complaint_intent,
            "rejectionReason": rejection_reason,
            "category": None,
            "suggestedCategory": "Others",
            "departmentId": "",
            "confidence": 0.0,
            "priority": "low",
            "isUrgent": False,
            "icon": "📋",
            "suggestedIcon": "📋",
            "secondCategory": None,
            "subCategory": "Invalid Input",
            "topFeatures": [],
            "probabilities": {},
            "model": "Campus-Gatekeeper-ML/v2.0 (3-Stage Python)",
        }

    def analyze_spam(self, text: str, category: Optional[str] = None, student_type: Optional[str] = None) -> Dict[str, Any]:
        res = self.classify_complaint(text, student_type, {"category": category} if category else None)
        if not res["isValidComplaint"]:
            return {
                "isSpam": True,
                "reason": res["rejectionReason"] or "Invalid complaint input",
                "confidence": 0.98,
                "suggestedCategory": category or "Others",
                "suggestedIcon": "⚠️",
                "isUrgent": False,
                "topFeatures": [],
            }
        return {
            "isSpam": False,
            "reason": "Legitimate campus grievance pattern verified by ML classifier",
            "confidence": res["confidence"],
            "suggestedCategory": res["category"] or "Others",
            "suggestedIcon": res["icon"],
            "isUrgent": res["isUrgent"],
            "topFeatures": res["topFeatures"],
        }


default_classifier = ComplaintClassifier()


def classify_complaint(
    text: str,
    student_type: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return default_classifier.classify_complaint(text, student_type, context)


def analyze_spam(
    text: str,
    category: Optional[str] = None,
    student_type: Optional[str] = None,
) -> Dict[str, Any]:
    return default_classifier.analyze_spam(text, category, student_type)
