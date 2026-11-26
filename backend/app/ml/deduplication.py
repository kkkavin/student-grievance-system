"""
Hybrid Dense Vector Cosine & Lexical Deduplication Engine.
Combines 384-dimensional dense vector embeddings with lexical token overlap.
Supports auto-merge (>=0.92), suspected duplicate triage flagging (0.80-0.91),
atomic parent-child clustering, and cascading resolution.
"""

from datetime import datetime, timezone, timedelta
import logging
import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.ml.deduplication")

VECTOR_DIMENSION = 384
AUTO_MERGE_THRESHOLD = 0.92
SUSPECTED_DUPLICATE_THRESHOLD = 0.80

STOPWORDS = {
    "a", "about", "above", "after", "again", "all", "am", "an", "and", "any", "are", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
    "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
    "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
    "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "me", "more",
    "most", "my", "myself", "of", "off", "on", "once", "only", "or", "other", "our", "ours",
    "ourselves", "out", "over", "own", "same", "she", "should", "so", "some", "such", "than",
    "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "with", "would", "you",
    "your", "yours", "yourself", "yourselves", "please", "kindly", "regards", "sir", "madam",
}


def fnv1a_hash(text: str) -> int:
    """32-bit FNV-1a hash matching frontend and seeding pipeline."""
    h = 2166136261
    for char in text:
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def tokenize(text: str) -> Set[str]:
    """Tokenizes text into cleaned lowercase alphanumeric lemmas."""
    if not text:
        return set()
    words = re.findall(r"\b[a-z0-9]+\b", text.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 2}


def jaccard_similarity(text_a: str, text_b: str) -> float:
    """Computes Jaccard token overlap between two strings."""
    tokens_a = tokenize(text_a)
    tokens_b = tokenize(text_b)
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    return round(intersection / union, 4) if union > 0 else 0.0


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Computes cosine similarity between two numeric vectors with duplicate overlap compensation."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0

    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    raw_cosine = max(0.0, min(1.0, dot / (norm_a * norm_b)))

    # Count shared active non-zero components for overlap ratio compensation
    non_zero_a = sum(1 for x in vec_a if abs(x) > 0.0001)
    non_zero_b = sum(1 for x in vec_b if abs(x) > 0.0001)
    shared = sum(1 for a, b in zip(vec_a, vec_b) if abs(a) > 0.0001 and abs(b) > 0.0001)

    min_active = min(non_zero_a, non_zero_b)
    overlap_ratio = shared / min_active if min_active > 0 else 0.0

    sim = raw_cosine
    if raw_cosine >= 0.70 and overlap_ratio >= 0.75:
        boost = (1.0 - raw_cosine) * (overlap_ratio - 0.65) * 0.90
        sim = max(raw_cosine, min(0.96, raw_cosine + boost))

    return round(max(0.0, min(1.0, sim)), 4)


compute_cosine_similarity = cosine_similarity


def generate_embedding_vector(
    text: str,
    domain_tags: Optional[List[str]] = None,
    dim: int = VECTOR_DIMENSION,
) -> List[float]:
    """Generates deterministic 384-dimensional L2-normalized float vector."""
    vec = [0.0] * dim
    combined = f"{' '.join(domain_tags or [])} {text}".lower()
    tokens = re.findall(r"[a-z0-9#_-]+", combined)

    if not tokens:
        vec[0] = 1.0
        return vec

    tf_map: Dict[str, float] = {}
    for tok in tokens:
        if tok not in STOPWORDS and len(tok) >= 2:
            tf_map[tok] = tf_map.get(tok, 0.0) + 1.0

    if not tf_map:
        vec[0] = 1.0
        return vec

    for tok, count in tf_map.items():
        sublinear_tf = 1.0 + math.log(max(1.0, count))
        slot = abs(fnv1a_hash(tok)) % dim
        vec[slot] += sublinear_tf

    # L2 Euclidean unit normalization
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0.0:
        return [float(x / norm) for x in vec]
    vec[0] = 1.0
    return vec


class EmbeddingService:
    """
    Lazy singleton embedding service.
    Attempts loading sentence_transformers.SentenceTransformer("all-MiniLM-L6-v2").
    Automatically falls back to deterministic 384-dimensional n-gram/TF-IDF vectorizer if
    sentence-transformers is uninstalled, unavailable, or offline.
    """
    _instance: Optional["EmbeddingService"] = None

    def __init__(self):
        self._model = None
        self._model_load_attempted = False
        self._use_sentence_transformers = False

    @classmethod
    def get_instance(cls) -> "EmbeddingService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_model(self) -> None:
        if self._model_load_attempted:
            return
        self._model_load_attempted = True
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer("all-MiniLM-L6-v2")
            self._use_sentence_transformers = True
            logger.info("Successfully loaded SentenceTransformer('all-MiniLM-L6-v2')")
        except Exception as exc:
            logger.info(
                f"sentence_transformers unavailable ({type(exc).__name__}). "
                f"Using deterministic 384-d vectorizer fallback."
            )
            self._model = None
            self._use_sentence_transformers = False

    def compute_embedding(self, text: str) -> List[float]:
        """Returns 384-dimensional L2-normalized float vector."""
        self._load_model()
        if self._use_sentence_transformers and self._model is not None:
            try:
                emb = self._model.encode(text, normalize_embeddings=True)
                return [float(x) for x in emb.tolist()]
            except Exception as exc:
                logger.warning(f"sentence_transformers encode failed ({exc}), falling back to deterministic vectorizer.")
        return generate_embedding_vector(text, dim=VECTOR_DIMENSION)

    def compute_cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        return compute_cosine_similarity(vec_a, vec_b)


def compute_embedding(text: str) -> List[float]:
    """Computes 384-dimensional vector embedding delegating to lazy singleton EmbeddingService."""
    return EmbeddingService.get_instance().compute_embedding(text)


async def find_semantic_duplicate(
    new_text: str,
    department_id: Optional[str],
    db: AsyncSession,
    threshold: float = 0.82,
    new_ticket_meta: Optional[Dict[str, Any]] = None,
) -> Optional[Any]:
    """
    Queries open/pending grievances in the same department and computes cosine similarity.
    If similarity > threshold (0.82), returns matched parent grievance.
    Automatically flattens transitive duplicates to root parent ticket.
    """
    try:
        from backend.app.db.models import Grievance
    except ImportError:
        from app.db.models import Grievance

    if not new_text or not new_text.strip():
        return None

    svc = EmbeddingService.get_instance()
    new_vec = svc.compute_embedding(new_text)

    # Exclude resolved/closed/rejected tickets
    stmt = select(Grievance).where(
        Grievance.status.not_in([
            "resolved", "Resolved", "RESOLVED",
            "closed", "Closed", "CLOSED",
            "rejected", "Rejected", "REJECTED",
        ])
    )
    if department_id:
        stmt = stmt.where(Grievance.assigned_department_id == department_id)

    res = await db.execute(stmt)
    candidates = res.scalars().all()

    best_match = None
    best_sim = 0.0

    for cand in candidates:
        if new_ticket_meta:
            cand_dict = cand.to_dict() if hasattr(cand, "to_dict") else {
                "category": getattr(cand, "category", ""),
                "hostel_block": getattr(cand, "hostel_block", ""),
                "room_no": getattr(cand, "room_no", ""),
                "location_tag": getattr(cand, "location_tag", ""),
            }
            if not check_location_adjacency(new_ticket_meta, cand_dict):
                continue

        cand_vec = cand.embedding
        if not cand_vec or len(cand_vec) != VECTOR_DIMENSION:
            cand_vec = svc.compute_embedding(cand.description or "")
        sim = svc.compute_cosine_similarity(new_vec, cand_vec)
        if sim > threshold and sim > best_sim:
            best_sim = sim
            best_match = cand

    if best_match:
        # Transitive duplicate flattening: traverse up to the root parent
        root = best_match
        visited = {root.id}
        while root.duplicate_of_id or getattr(root, "master_case_id", None):
            parent_id = root.duplicate_of_id or root.master_case_id
            if not parent_id or parent_id in visited:
                break
            visited.add(parent_id)
            p_res = await db.execute(select(Grievance).where(Grievance.id == parent_id))
            parent_obj = p_res.scalar_one_or_none()
            if parent_obj:
                root = parent_obj
            else:
                break
        setattr(root, "_similarity_score", best_sim)
        return root

    return None


def compute_hybrid_similarity(
    emb_a: Optional[List[float]],
    emb_b: Optional[List[float]],
    text_a: str,
    text_b: str,
) -> float:
    """Computes 70% dense vector cosine + 30% lexical Jaccard similarity."""
    jaccard = jaccard_similarity(text_a, text_b)
    if emb_a and emb_b and len(emb_a) == len(emb_b) and len(emb_a) == VECTOR_DIMENSION:
        cosine = compute_cosine_similarity(emb_a, emb_b)
        return round(0.70 * cosine + 0.30 * jaccard, 4)
    return round(jaccard, 4)


def extract_floor_from_room(room_no: Optional[str]) -> Optional[int]:
    if not room_no:
        return None
    clean = str(room_no).strip().upper()
    if "GROUND" in clean or clean.startswith("G-") or clean.startswith("G0"):
        return 0
    m = re.search(r"(?:[A-Z]-)?([0-9])([0-9]{2})", clean)
    if m:
        return int(m.group(1))
    m = re.search(r"([0-9]+)(?:ST|ND|RD|TH)?\s*FLOOR", clean)
    if m:
        return int(m.group(1))
    return None


def extract_route_number(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    m = re.search(r"(?:route|bus)\s*#?\s*([0-9]+)", str(text), re.IGNORECASE)
    return m.group(1) if m else None


def normalize_block(block: Optional[str]) -> str:
    if not block:
        return ""
    return re.sub(r"\(.*?\)|hostel|\s+", " ", str(block).lower()).strip()


def check_location_adjacency(
    new_ticket: Dict[str, Any], candidate: Dict[str, Any], category: Optional[str] = None
) -> bool:
    """Checks location adjacency between incoming ticket and candidate."""
    cat = (category or new_ticket.get("category") or "").lower()

    # Bus & Transport
    if "bus" in cat or "transport" in cat:
        r1 = extract_route_number(new_ticket.get("location_tag") or new_ticket.get("description"))
        r2 = extract_route_number(candidate.get("location_tag") or candidate.get("description"))
        if r1 and r2:
            return r1 == r2
        return True

    # Hostel / Living facility
    is_hostel = (
        (new_ticket.get("student_type") or new_ticket.get("studentType") or "").lower() == "hosteller"
        or bool(new_ticket.get("hostel_block") or new_ticket.get("hostelBlock"))
        or bool(candidate.get("hostel_block") or candidate.get("hostelBlock"))
        or any(k in cat.lower() for k in ("hostel", "plumb", "clean", "damages"))
    )
    if is_hostel:
        b1 = normalize_block(new_ticket.get("hostel_block") or new_ticket.get("hostelBlock"))
        b2 = normalize_block(candidate.get("hostel_block") or candidate.get("hostelBlock"))
        if b1 and b2 and b1 != b2:
            return False

        f1 = extract_floor_from_room(new_ticket.get("room_no") or new_ticket.get("roomNo"))
        f2 = extract_floor_from_room(candidate.get("room_no") or candidate.get("roomNo"))
        if f1 is not None and f2 is not None:
            return abs(f1 - f2) <= 1
        return True

    # Network / Wi-Fi
    if "wi-fi" in cat.lower() or "internet" in cat.lower() or "network" in cat.lower():
        b1 = normalize_block(new_ticket.get("hostel_block") or new_ticket.get("hostelBlock") or new_ticket.get("location_tag") or new_ticket.get("locationTag"))
        b2 = normalize_block(candidate.get("hostel_block") or candidate.get("hostelBlock") or candidate.get("location_tag") or candidate.get("locationTag"))
        if b1 and b2 and b1 != b2:
            return False
        return True

    return True


def evaluate_deduplication(
    incoming_text: str,
    incoming_embedding: Optional[List[float]],
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Evaluates incoming complaint against candidates.
    Returns deduplication result with match candidates, auto-merge flag, and primary ID.
    """
    matches = []
    best_score = 0.0
    best_candidate = None

    for cand in candidates:
        cand_text = f"{cand.get('title', '')} {cand.get('description', '')}".strip()
        cand_emb = cand.get("embedding")
        score = compute_hybrid_similarity(incoming_embedding, cand_emb, incoming_text, cand_text)

        if score >= 0.70:
            match_type = "exact_duplicate" if score >= AUTO_MERGE_THRESHOLD else ("near_duplicate" if score >= 0.85 else "semantic_match")
            match_item = {
                "complaintId": cand.get("id"),
                "ticketId": cand.get("ticket_id") or cand.get("ticketId") or cand.get("id"),
                "ticketNo": cand.get("ticket_no") or cand.get("ticketNo") or cand.get("id"),
                "title": cand.get("title", ""),
                "description": cand.get("description", ""),
                "similarityScore": score,
                "status": cand.get("status", "Active"),
                "createdAt": cand.get("created_at") or cand.get("createdAt") or "",
                "department": cand.get("department_name") or cand.get("department") or "",
                "matchType": match_type,
            }
            matches.append(match_item)
            if score > best_score:
                best_score = score
                best_candidate = cand

    matches.sort(key=lambda x: x["similarityScore"], reverse=True)

    is_duplicate = best_score >= SUSPECTED_DUPLICATE_THRESHOLD
    auto_merged = best_score >= AUTO_MERGE_THRESHOLD

    master_id = None
    if best_candidate:
        master_id = best_candidate.get("master_case_id") or best_candidate.get("id")

    return {
        "isDuplicate": is_duplicate,
        "autoMerged": auto_merged,
        "confidence": best_score,
        "clusterId": master_id,
        "primaryId": master_id,
        "parentTicketId": best_candidate.get("ticket_id") or best_candidate.get("ticketNo") or best_candidate.get("id") if best_candidate else None,
        "matchCandidates": matches,
    }


def run_two_stage_deduplication(
    new_ticket: Dict[str, Any],
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Runs 2-stage deduplication: hard filter -> dense cosine matching."""
    if not candidates:
        return {
            "action": "PRIMARY",
            "status": "PRIMARY",
            "masterCaseId": None,
            "similarityScore": None,
            "matchedTicketNo": None,
            "matchCandidates": [],
        }

    # Stage 1: Hard filter
    norm_new_cat = (new_ticket.get("category") or "").strip().lower()
    now_ts = datetime.now(timezone.utc).timestamp()
    max_window_seconds = 72 * 3600  # 72 hours

    stage1_candidates = []
    for cand in candidates:
        if cand.get("status") in ("MERGED_AUTOMATIC", "merged", "resolved"):
            continue
        norm_cand_cat = (cand.get("category") or "").strip().lower()
        if norm_cand_cat != norm_new_cat:
            continue

        created_at = cand.get("created_at") or cand.get("createdAt")
        if created_at:
            try:
                dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                if (now_ts - dt.timestamp()) > max_window_seconds:
                    continue
            except Exception:
                pass

        if not check_location_adjacency(new_ticket, cand):
            continue

        stage1_candidates.append(cand)

    if not stage1_candidates:
        return {
            "action": "PRIMARY",
            "status": "PRIMARY",
            "masterCaseId": None,
            "similarityScore": None,
            "matchedTicketNo": None,
            "matchCandidates": [],
        }

    # Stage 2: Dense cosine similarity
    new_vec = new_ticket.get("embedding") or generate_embedding_vector(
        new_ticket.get("description", ""),
        [new_ticket.get("category", ""), new_ticket.get("hostel_block", ""), new_ticket.get("room_no", "")],
    )

    best_candidate = None
    best_score = -1.0
    matches = []

    for cand in stage1_candidates:
        cand_vec = cand.get("embedding") or generate_embedding_vector(
            cand.get("description", ""),
            [cand.get("category", ""), cand.get("hostel_block", ""), cand.get("room_no", "")],
        )
        sim = compute_cosine_similarity(new_vec, cand_vec)

        if sim >= 0.70:
            match_type = "exact_duplicate" if sim >= AUTO_MERGE_THRESHOLD else ("near_duplicate" if sim >= 0.85 else "semantic_match")
            matches.append({
                "complaintId": cand.get("id"),
                "ticketNo": cand.get("ticket_no") or cand.get("ticketNo"),
                "description": cand.get("description", ""),
                "similarityScore": sim,
                "status": cand.get("status"),
                "createdAt": cand.get("created_at") or cand.get("createdAt"),
                "matchType": match_type,
            })
            if sim > best_score:
                best_score = sim
                best_candidate = cand

    matches.sort(key=lambda x: x["similarityScore"], reverse=True)

    if not best_candidate or best_score < SUSPECTED_DUPLICATE_THRESHOLD:
        return {
            "action": "PRIMARY",
            "status": "PRIMARY",
            "masterCaseId": None,
            "similarityScore": best_score if best_score > 0 else None,
            "matchedTicketNo": best_candidate.get("ticket_no") if best_candidate else None,
            "matchCandidates": matches,
        }

    master_id = best_candidate.get("master_case_id") or best_candidate.get("id")

    if best_score >= AUTO_MERGE_THRESHOLD:
        return {
            "action": "AUTO_MERGE",
            "status": "MERGED_AUTOMATIC",
            "masterCaseId": master_id,
            "similarityScore": best_score,
            "matchedTicketNo": best_candidate.get("ticket_no") or best_candidate.get("ticketNo"),
            "matchCandidates": matches,
        }

    return {
        "action": "SUSPECTED_DUPLICATE",
        "status": "SUSPECTED_DUPLICATE",
        "masterCaseId": master_id,
        "similarityScore": best_score,
        "matchedTicketNo": best_candidate.get("ticket_no") or best_candidate.get("ticketNo"),
        "matchCandidates": matches,
    }


def group_semantic_grievances(
    grievances: List[Dict[str, Any]],
    threshold: float = AUTO_MERGE_THRESHOLD,
) -> List[Dict[str, Any]]:
    """Partitions grievances into parent-child clusters preserving partition conservation."""
    if not grievances:
        return []

    # Sort ascending by creation timestamp (earliest submitted is designated Parent)
    sorted_items = sorted(
        grievances,
        key=lambda g: str(g.get("created_at") or g.get("createdAt") or ""),
    )

    clusters: List[Dict[str, Any]] = []
    used_ids: Set[str] = set()

    for item in sorted_items:
        item_id = item.get("id")
        if item_id in used_ids:
            continue

        item_vec = item.get("embedding") or generate_embedding_vector(
            item.get("description", ""),
            [item.get("category", ""), item.get("hostel_block", ""), item.get("room_no", "")],
        )

        matched_cluster = None
        best_score = 0.0

        for cluster in clusters:
            parent = cluster["parent"]
            # Category and location adjacency guardrail
            if parent.get("category") != item.get("category"):
                continue
            if not check_location_adjacency(item, parent):
                continue

            parent_vec = parent.get("embedding") or generate_embedding_vector(
                parent.get("description", ""),
                [parent.get("category", ""), parent.get("hostel_block", ""), parent.get("room_no", "")],
            )
            sim = compute_cosine_similarity(item_vec, parent_vec)
            if sim >= threshold and sim > best_score:
                best_score = sim
                matched_cluster = cluster

        if matched_cluster:
            matched_cluster["children"].append(item)
            matched_cluster["totalCount"] += 1
            used_ids.add(item_id)
        else:
            clusters.append({
                "parent": item,
                "children": [],
                "totalCount": 1,
                "matchScore": None,
            })
            used_ids.add(item_id)

    return clusters


async def cascade_resolve_ticket_tree(
    db: AsyncSession,
    master_id: str,
    admin_notes: Optional[str] = None,
    actor_email: Optional[str] = None,
) -> Dict[str, Any]:
    """Atomically resolves a master complaint and all linked child cases with N+1 notification fanout."""
    from app.db.models import Complaint, Notification, AuditLog

    now = datetime.now(timezone.utc)

    # 1. Fetch master ticket
    res = await db.execute(select(Complaint).where(Complaint.id == master_id))
    master = res.scalar_one_or_none()
    if not master:
        raise ValueError(f"Complaint {master_id} not found")

    # 2. Fetch children
    child_res = await db.execute(select(Complaint).where(Complaint.master_case_id == master_id))
    children = child_res.scalars().all()

    # 3. Update master
    master.status = "resolved"
    master.resolved_at = now
    if admin_notes:
        master.admin_notes = admin_notes

    child_ids = []
    # 4. Cascade to all children
    for child in children:
        child.status = "resolved"
        child.resolved_at = now
        child_ids.append(child.id)

    # 5. Fan-out N+1 notifications to outbox
    all_tickets = [master] + list(children)
    for tkt in all_tickets:
        if tkt.student_email:
            notif = Notification(
                id=f"notif-res-{tkt.id}-{int(now.timestamp())}",
                recipient=tkt.student_email,
                subject=f"Grievance {tkt.ticket_no} Resolved",
                body=f"Your grievance '{tkt.description[:60]}...' has been resolved. Notes: {admin_notes or 'Issue resolved by department'}.",
                type="resolution_alert",
            )
            db.add(notif)

    # 6. Audit log
    import json
    audit = AuditLog(
        id=f"audit-casc-{master.id}-{int(now.timestamp())}",
        entity_type="complaint",
        entity_id=master.id,
        action="cascading_resolution",
        actor_email=actor_email or "system@campus.edu",
        actor_role="staff",
        new_state=json.dumps({"status": "resolved", "resolvedChildren": child_ids}),
    )
    db.add(audit)

    await db.commit()

    return {
        "success": True,
        "parent": master.to_dict(),
        "resolvedChildrenCount": len(child_ids),
        "childIds": child_ids,
    }
