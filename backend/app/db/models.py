"""
SQLAlchemy 2.0 Async ORM Models for Campus Grievance System.
Defines normalized models: Department, User, Complaint (with pgvector Vector(384)),
ComplaintUpvote, CategoryRoutingRule, AuditLog, Notification, and OtpSession (OtpCode).
Full bidirectional camelCase/snake_case property parity for TypeScript contracts.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    String,
    Text,
    Boolean,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    text,
    func,
    JSON,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates
from pgvector.sqlalchemy import Vector

try:
    from backend.app.db.session import Base
except ImportError:
    try:
        from app.db.session import Base
    except ImportError:
        from backend.db.base import Base


def _parse_iso_datetime(val: Any) -> Optional[datetime]:
    """Parse an ISO 8601 string or datetime into a timezone-aware datetime object."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo is not None else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    raise TypeError(f"Expected datetime, str, or None, got {type(val).__name__}")


# ============================================================================
# 1. DEPARTMENT MODEL
# ============================================================================

class Department(Base):
    """Administrative and operational departments managing grievances."""
    __tablename__ = "departments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    users: Mapped[List["User"]] = relationship(
        "User", back_populates="department_rel", foreign_keys="User.department_id"
    )
    complaints: Mapped[List["Complaint"]] = relationship(
        "Complaint", back_populates="assigned_department", foreign_keys="Complaint.assigned_department_id"
    )
    routing_rules: Mapped[List["CategoryRoutingRule"]] = relationship(
        "CategoryRoutingRule",
        back_populates="department",
        cascade="save-update, merge",
        passive_deletes=True,
        foreign_keys="CategoryRoutingRule.department_id",
    )

    # TypeScript camelCase parity properties
    @property
    def contactEmail(self) -> str:
        return self.contact_email

    @contactEmail.setter
    def contactEmail(self, value: str) -> None:
        self.contact_email = value

    @property
    def headEmail(self) -> str:
        return self.contact_email

    @headEmail.setter
    def headEmail(self, value: str) -> None:
        self.contact_email = value

    @property
    def isActive(self) -> bool:
        return self.is_active

    @isActive.setter
    def isActive(self, value: bool) -> None:
        self.is_active = value

    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    @property
    def updatedAt(self) -> str:
        return self.updated_at.isoformat() if self.updated_at else ""

    @updatedAt.setter
    def updatedAt(self, val: Any) -> None:
        self.updated_at = _parse_iso_datetime(val)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "contactEmail": self.contact_email,
            "contact_email": self.contact_email,
            "headEmail": self.contact_email,
            "isActive": self.is_active,
            "is_active": self.is_active,
            "slaHours": 48,
            "sla_hours": 48,
            "categories": [],
            "createdAt": self.createdAt,
            "updatedAt": self.updatedAt,
        }


# ============================================================================
# 2. USER MODEL
# ============================================================================

class User(Base):
    """Students, department staff, department heads, and super administrators."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    reg_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    department: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    gender: Mapped[str] = mapped_column(String(16), default="Male", server_default="Male", nullable=False)
    student_type: Mapped[str] = mapped_column(
        String(32), default="hosteller", server_default="hosteller", nullable=False
    )
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hostel_block: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    room_no: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    role: Mapped[str] = mapped_column(
        String(32), default="STUDENT", server_default="STUDENT", nullable=False, index=True
    )
    is_email_verified: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    department_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Relationships
    department_rel: Mapped[Optional["Department"]] = relationship(
        "Department", back_populates="users", foreign_keys=[department_id]
    )
    complaints: Mapped[List["Complaint"]] = relationship(
        "Complaint",
        back_populates="student_user",
        primaryjoin="foreign(Complaint.student_reg_no) == User.reg_no",
    )
    upvotes: Mapped[List["ComplaintUpvote"]] = relationship(
        "ComplaintUpvote", back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    # TypeScript camelCase parity properties
    @property
    def regNo(self) -> str:
        return self.reg_no

    @regNo.setter
    def regNo(self, val: str) -> None:
        self.reg_no = val

    @property
    def studentType(self) -> str:
        return self.student_type

    @studentType.setter
    def studentType(self, val: str) -> None:
        self.student_type = val

    @property
    def hostelBlock(self) -> Optional[str]:
        return self.hostel_block

    @hostelBlock.setter
    def hostelBlock(self, val: Optional[str]) -> None:
        self.hostel_block = val

    @property
    def roomNo(self) -> Optional[str]:
        return self.room_no

    @roomNo.setter
    def roomNo(self, val: Optional[str]) -> None:
        self.room_no = val

    @property
    def isEmailVerified(self) -> bool:
        return self.is_email_verified

    @isEmailVerified.setter
    def isEmailVerified(self, val: bool) -> None:
        self.is_email_verified = val

    @property
    def passwordHash(self) -> Optional[str]:
        return self.password_hash

    @passwordHash.setter
    def passwordHash(self, val: Optional[str]) -> None:
        self.password_hash = val

    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    @property
    def departmentId(self) -> Optional[str]:
        return self.department_id

    @departmentId.setter
    def departmentId(self, val: Optional[str]) -> None:
        self.department_id = val

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "regNo": self.reg_no,
            "reg_no": self.reg_no,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "departmentId": self.department_id,
            "department_id": self.department_id,
            "phone": self.phone,
            "gender": self.gender,
            "studentType": self.student_type,
            "hostelBlock": self.hostel_block,
            "roomNo": self.room_no,
            "createdAt": self.createdAt,
        }


# ============================================================================
# 3. COMPLAINT MODEL
# ============================================================================

class Complaint(Base):
    """
    Grievance record containing student reporting details, classification,
    resolution status, department routing, and pgvector embedding for semantic deduplication.
    """
    __tablename__ = "complaints"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ticket_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    student_reg_no: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    student_name: Mapped[str] = mapped_column(String(128), nullable=False)
    student_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    student_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    student_type: Mapped[str] = mapped_column(
        String(32), default="hosteller", server_default="hosteller", nullable=False
    )
    hostel_block: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    room_no: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="pending", server_default="pending", nullable=False, index=True
    )
    priority: Mapped[str] = mapped_column(
        String(32), default="medium", server_default="medium", nullable=False
    )
    is_spam: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    spam_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_classification: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    master_case_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("complaints.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location_tag: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(384), nullable=True)
    similarity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    merged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    public_master_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_department_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Deduplication and HNSW vector index
    __table_args__ = (
        Index("idx_complaints_dedup", "category", "created_at"),
        Index(
            "idx_complaints_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    # Relationships
    assigned_department: Mapped[Optional["Department"]] = relationship(
        "Department", back_populates="complaints", foreign_keys=[assigned_department_id]
    )
    master_case: Mapped[Optional["Complaint"]] = relationship(
        "Complaint", remote_side=[id], back_populates="duplicate_cases", foreign_keys=[master_case_id]
    )
    duplicate_cases: Mapped[List["Complaint"]] = relationship(
        "Complaint", back_populates="master_case", foreign_keys=[master_case_id]
    )
    student_user: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="complaints",
        primaryjoin="foreign(Complaint.student_reg_no) == User.reg_no",
    )
    upvotes: Mapped[List["ComplaintUpvote"]] = relationship(
        "ComplaintUpvote", back_populates="complaint", cascade="all, delete-orphan", passive_deletes=True
    )

    # TypeScript camelCase parity properties
    @property
    def ticketNo(self) -> str:
        return self.ticket_no

    @ticketNo.setter
    def ticketNo(self, val: str) -> None:
        self.ticket_no = val

    @property
    def studentRegNo(self) -> str:
        return self.student_reg_no

    @studentRegNo.setter
    def studentRegNo(self, val: str) -> None:
        self.student_reg_no = val

    @property
    def studentName(self) -> str:
        return self.student_name

    @studentName.setter
    def studentName(self, val: str) -> None:
        self.student_name = val

    @property
    def studentEmail(self) -> str:
        return self.student_email

    @studentEmail.setter
    def studentEmail(self, val: str) -> None:
        self.student_email = val

    @property
    def studentPhone(self) -> Optional[str]:
        return self.student_phone

    @studentPhone.setter
    def studentPhone(self, val: Optional[str]) -> None:
        self.student_phone = val

    @property
    def studentType(self) -> str:
        return self.student_type

    @studentType.setter
    def studentType(self, val: str) -> None:
        self.student_type = val

    @property
    def hostelBlock(self) -> Optional[str]:
        return self.hostel_block

    @hostelBlock.setter
    def hostelBlock(self, val: Optional[str]) -> None:
        self.hostel_block = val

    @property
    def roomNo(self) -> Optional[str]:
        return self.room_no

    @roomNo.setter
    def roomNo(self, val: Optional[str]) -> None:
        self.room_no = val

    @property
    def isSpam(self) -> bool:
        return self.is_spam

    @isSpam.setter
    def isSpam(self, val: bool) -> None:
        self.is_spam = val

    @property
    def spamReason(self) -> Optional[str]:
        return self.spam_reason

    @spamReason.setter
    def spamReason(self, val: Optional[str]) -> None:
        self.spam_reason = val

    @property
    def aiClassification(self) -> Optional[Dict[str, Any]]:
        return self.ai_classification

    @aiClassification.setter
    def aiClassification(self, val: Optional[Dict[str, Any]]) -> None:
        self.ai_classification = val

    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    @property
    def resolvedAt(self) -> Optional[str]:
        return self.resolved_at.isoformat() if self.resolved_at else None

    @resolvedAt.setter
    def resolvedAt(self, val: Any) -> None:
        self.resolved_at = _parse_iso_datetime(val)

    @property
    def adminNotes(self) -> Optional[str]:
        return self.admin_notes

    @adminNotes.setter
    def adminNotes(self, val: Optional[str]) -> None:
        self.admin_notes = val

    @property
    def masterCaseId(self) -> Optional[str]:
        return self.master_case_id

    @masterCaseId.setter
    def masterCaseId(self, val: Optional[str]) -> None:
        self.master_case_id = val

    @property
    def duplicateOfId(self) -> Optional[str]:
        return self.master_case_id

    @duplicateOfId.setter
    def duplicateOfId(self, val: Optional[str]) -> None:
        self.master_case_id = val

    @property
    def locationTag(self) -> Optional[str]:
        return self.location_tag

    @locationTag.setter
    def locationTag(self, val: Optional[str]) -> None:
        self.location_tag = val

    @property
    def sourceTimestamp(self) -> Optional[str]:
        return self.source_timestamp.isoformat() if self.source_timestamp else None

    @sourceTimestamp.setter
    def sourceTimestamp(self, val: Any) -> None:
        self.source_timestamp = _parse_iso_datetime(val)

    @property
    def embeddingVector(self) -> Optional[List[float]]:
        return list(self.embedding) if self.embedding is not None else None

    @embeddingVector.setter
    def embeddingVector(self, val: Optional[List[float]]) -> None:
        self.embedding = val

    @validates("embedding")
    def validate_embedding(self, key: str, value: Any) -> Any:
        """
        Validate 384-dimensional vector embedding in Python.
        Enforces dimension parity across both PostgreSQL and SQLite fallback environments.
        """
        if value is not None and isinstance(value, (list, tuple)):
            if len(value) != 384:
                raise ValueError(
                    f"Complaint.embedding must have exactly 384 dimensions, got {len(value)}"
                )
        return value

    @property
    def similarityScore(self) -> Optional[float]:
        return self.similarity_score

    @similarityScore.setter
    def similarityScore(self, val: Optional[float]) -> None:
        self.similarity_score = val

    @property
    def mergedAt(self) -> Optional[str]:
        return self.merged_at.isoformat() if self.merged_at else None

    @mergedAt.setter
    def mergedAt(self, val: Any) -> None:
        self.merged_at = _parse_iso_datetime(val)

    @property
    def publicMasterNotes(self) -> Optional[str]:
        return self.public_master_notes

    @publicMasterNotes.setter
    def publicMasterNotes(self, val: Optional[str]) -> None:
        self.public_master_notes = val

    @property
    def assignedDepartmentId(self) -> Optional[str]:
        return self.assigned_department_id

    @assignedDepartmentId.setter
    def assignedDepartmentId(self, val: Optional[str]) -> None:
        self.assigned_department_id = val

    @property
    def departmentId(self) -> Optional[str]:
        return self.assigned_department_id

    @departmentId.setter
    def departmentId(self, val: Optional[str]) -> None:
        self.assigned_department_id = val

    @property
    def upvoteCount(self) -> int:
        if "upvotes" in getattr(self, "__dict__", {}):
            return len(self.upvotes)
        return 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "ticketId": self.ticket_no,
            "ticketNo": self.ticket_no,
            "ticket_no": self.ticket_no,
            "regNo": self.student_reg_no,
            "studentRegNo": self.student_reg_no,
            "student_reg_no": self.student_reg_no,
            "studentName": self.student_name,
            "student_name": self.student_name,
            "studentEmail": self.student_email,
            "student_email": self.student_email,
            "studentPhone": self.student_phone,
            "student_phone": self.student_phone,
            "studentType": self.student_type,
            "student_type": self.student_type,
            "category": self.category,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "isSpam": self.is_spam,
            "is_spam": self.is_spam,
            "departmentId": self.assigned_department_id,
            "assignedDepartmentId": self.assigned_department_id,
            "assigned_department_id": self.assigned_department_id,
            "masterCaseId": self.master_case_id,
            "master_case_id": self.master_case_id,
            "duplicateOfId": self.master_case_id,
            "locationTag": self.location_tag,
            "location_tag": self.location_tag,
            "hostelBlock": self.hostel_block,
            "hostel_block": self.hostel_block,
            "roomNo": self.room_no,
            "room_no": self.room_no,
            "similarityScore": self.similarity_score,
            "similarity_score": self.similarity_score,
            "createdAt": self.createdAt,
            "created_at": self.createdAt,
            "resolvedAt": self.resolvedAt,
            "resolved_at": self.resolvedAt,
            "adminNotes": self.admin_notes,
            "admin_notes": self.admin_notes,
            "publicMasterNotes": self.public_master_notes,
            "public_master_notes": self.public_master_notes,
            "embedding": self.embeddingVector,
            "upvoteCount": self.upvoteCount,
            "upvote_count": self.upvoteCount,
        }


# ============================================================================
# 4. COMPLAINT UPVOTE MODEL
# ============================================================================

class ComplaintUpvote(Base):
    """Student peer upvotes endorsing campus grievances."""
    __tablename__ = "complaint_upvotes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("complaint_id", "user_id", name="uq_complaint_user_upvote"),
    )

    # Relationships
    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="upvotes")
    user: Mapped["User"] = relationship("User", back_populates="upvotes")

    # TypeScript camelCase parity properties
    @property
    def complaintId(self) -> str:
        return self.complaint_id

    @complaintId.setter
    def complaintId(self, val: str) -> None:
        self.complaint_id = val

    @property
    def userId(self) -> str:
        return self.user_id

    @userId.setter
    def userId(self, val: str) -> None:
        self.user_id = val

    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "complaintId": self.complaint_id,
            "complaint_id": self.complaint_id,
            "userId": self.user_id,
            "user_id": self.user_id,
            "createdAt": self.createdAt,
            "created_at": self.createdAt,
        }


# ============================================================================
# 5. CATEGORY ROUTING RULE MODEL
# ============================================================================

class CategoryRoutingRule(Base):
    """Auto-routing mapping between complaint categories and responsible departments."""
    __tablename__ = "category_routing_rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    category: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    department_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    priority_override: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    location_tag_pattern: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    priority_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    department: Mapped["Department"] = relationship(
        "Department", back_populates="routing_rules", foreign_keys=[department_id]
    )

    # TypeScript camelCase parity properties
    @property
    def departmentId(self) -> str:
        return self.department_id

    @departmentId.setter
    def departmentId(self, val: str) -> None:
        self.department_id = val

    @property
    def priorityOverride(self) -> Optional[str]:
        return self.priority_override

    @priorityOverride.setter
    def priorityOverride(self, val: Optional[str]) -> None:
        self.priority_override = val

    @property
    def locationTagPattern(self) -> Optional[str]:
        return self.location_tag_pattern

    @locationTagPattern.setter
    def locationTagPattern(self, val: Optional[str]) -> None:
        self.location_tag_pattern = val

    @property
    def priorityOrder(self) -> int:
        return self.priority_order

    @priorityOrder.setter
    def priorityOrder(self, val: int) -> None:
        self.priority_order = val

    @property
    def isActive(self) -> bool:
        return self.is_active

    @isActive.setter
    def isActive(self, val: bool) -> None:
        self.is_active = val

    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    @property
    def updatedAt(self) -> str:
        return self.updated_at.isoformat() if self.updated_at else ""

    @updatedAt.setter
    def updatedAt(self, val: Any) -> None:
        self.updated_at = _parse_iso_datetime(val)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "category": self.category,
            "departmentId": self.department_id,
            "department_id": self.department_id,
            "priorityOverride": self.priority_override,
            "locationTagPattern": self.location_tag_pattern,
            "priorityOrder": self.priority_order,
            "isActive": self.is_active,
            "createdAt": self.createdAt,
            "updatedAt": self.updatedAt,
        }


# ============================================================================
# 6. AUDIT LOG MODEL
# ============================================================================

class AuditLog(Base):
    """Immutable audit trail for all administrative actions, reassignments, and cascading resolutions."""
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    previous_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    __table_args__ = (
        Index("idx_audit_entity", "entity_type", "entity_id"),
        Index("idx_audit_actor", "actor_id"),
        Index("idx_audit_created", "created_at"),
    )

    # TypeScript camelCase parity properties
    @property
    def entityType(self) -> str:
        return self.entity_type

    @entityType.setter
    def entityType(self, val: str) -> None:
        self.entity_type = val

    @property
    def entityId(self) -> str:
        return self.entity_id

    @entityId.setter
    def entityId(self, val: str) -> None:
        self.entity_id = val

    @property
    def actorId(self) -> str:
        return self.actor_id

    @actorId.setter
    def actorId(self, val: str) -> None:
        self.actor_id = val

    @property
    def actorEmail(self) -> str:
        return self.actor_email

    @actorEmail.setter
    def actorEmail(self, val: str) -> None:
        self.actor_email = val

    @property
    def actorRole(self) -> str:
        return self.actor_role

    @actorRole.setter
    def actorRole(self, val: str) -> None:
        self.actor_role = val

    @property
    def previousState(self) -> Optional[str]:
        return self.previous_state

    @previousState.setter
    def previousState(self, val: Optional[str]) -> None:
        self.previous_state = val

    @property
    def newState(self) -> Optional[str]:
        return self.new_state

    @newState.setter
    def newState(self, val: Optional[str]) -> None:
        self.new_state = val

    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "entityType": self.entity_type,
            "entity_type": self.entity_type,
            "entityId": self.entity_id,
            "entity_id": self.entity_id,
            "action": self.action,
            "actorId": self.actor_id,
            "actor_id": self.actor_id,
            "actorEmail": self.actor_email,
            "actor_email": self.actor_email,
            "actorRole": self.actor_role,
            "actor_role": self.actor_role,
            "previousState": self.previous_state,
            "previous_state": self.previous_state,
            "newState": self.new_state,
            "new_state": self.new_state,
            "reason": self.reason,
            "timestamp": self.timestamp.isoformat() if self.timestamp else "",
            "createdAt": self.createdAt,
            "created_at": self.createdAt,
        }


# ============================================================================
# 7. NOTIFICATION MODEL
# ============================================================================

class Notification(Base):
    """Outbox notification record for dispatched emails and internal alerts."""
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_notifications_recipient", "recipient"),
        Index("idx_notifications_timestamp", "timestamp"),
    )

    # TypeScript camelCase parity properties
    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    @property
    def userId(self) -> Optional[str]:
        return getattr(self, "_user_id", self.recipient)

    @userId.setter
    def userId(self, val: Optional[str]) -> None:
        self._user_id = val
        if val is not None and not getattr(self, "recipient", None):
            self.recipient = val

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "recipient": self.recipient,
            "userId": self.userId,
            "subject": self.subject,
            "body": self.body,
            "type": self.type,
            "timestamp": self.timestamp.isoformat() if self.timestamp else "",
            "createdAt": self.createdAt,
            "created_at": self.createdAt,
        }


# ============================================================================
# 8. OTP SESSION MODEL (WITH OTPCODE ALIAS)
# ============================================================================

class OtpSession(Base):
    """Active and historical OTP verification sessions."""
    __tablename__ = "otp_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    otp_code: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_used: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    __table_args__ = (
        Index("idx_otp_session_email_expires", "email", "expires_at"),
        Index("idx_otp_session_created", "created_at"),
    )

    # TypeScript camelCase parity properties
    @property
    def otpCode(self) -> str:
        return self.otp_code

    @otpCode.setter
    def otpCode(self, val: str) -> None:
        self.otp_code = val

    @property
    def createdAt(self) -> str:
        return self.created_at.isoformat() if self.created_at else ""

    @createdAt.setter
    def createdAt(self, val: Any) -> None:
        self.created_at = _parse_iso_datetime(val)

    @property
    def expiresAt(self) -> Optional[str]:
        return self.expires_at.isoformat() if self.expires_at else None

    @expiresAt.setter
    def expiresAt(self, val: Any) -> None:
        self.expires_at = _parse_iso_datetime(val)

    @property
    def isUsed(self) -> bool:
        return self.is_used

    @isUsed.setter
    def isUsed(self, val: bool) -> None:
        self.is_used = val

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "otpCode": self.otp_code,
            "otp_code": self.otp_code,
            "createdAt": self.createdAt,
            "created_at": self.createdAt,
            "expiresAt": self.expiresAt,
            "expires_at": self.expiresAt,
            "isUsed": self.is_used,
            "is_used": self.is_used,
            "attempts": self.attempts,
        }


# Backward compatibility alias and table registration for legacy test metadata introspection
OtpCode = OtpSession

from sqlalchemy import Table, Column

Table(
    "otp_codes",
    Base.metadata,
    Column("id", String(64), primary_key=True),
    Column("email", String(255), nullable=False),
    Column("otp_code", String(8), nullable=False),
    Column("created_at", DateTime(timezone=True), default=func.now()),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("is_used", Boolean, default=False),
    Column("attempts", Integer, default=0),
    extend_existing=True,
)

__all__ = [
    "Department",
    "User",
    "Complaint",
    "ComplaintUpvote",
    "CategoryRoutingRule",
    "AuditLog",
    "Notification",
    "OtpSession",
    "OtpCode",
    "_parse_iso_datetime",
]
