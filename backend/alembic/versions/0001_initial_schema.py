"""Initial schema migration: pgvector extension, 8 core tables, HNSW index, and views.

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-11-08
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector

# Revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # 1. Enable pgvector extension before any table referencing Vector
    if is_postgres:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Table: departments
    op.create_table(
        "departments",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("code", sa.String(length=64), unique=True, nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_departments_code", "departments", ["code"], unique=True)
    op.create_index("idx_departments_active", "departments", ["is_active"])

    # 3. Table: users
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("reg_no", sa.String(length=64), unique=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("department", sa.String(length=128), nullable=True),
        sa.Column("gender", sa.String(length=16), server_default="Male", nullable=False),
        sa.Column("student_type", sa.String(length=32), server_default="hosteller", nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("email", sa.String(length=255), unique=True, nullable=False),
        sa.Column("hostel_block", sa.String(length=64), nullable=True),
        sa.Column("room_no", sa.String(length=32), nullable=True),
        sa.Column("role", sa.String(length=32), server_default="STUDENT", nullable=False),
        sa.Column("is_email_verified", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("department_id", sa.String(length=64), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_users_regno", "users", ["reg_no"], unique=True)
    op.create_index("idx_users_email", "users", ["email"], unique=True)
    op.create_index("idx_users_department", "users", ["department_id"])
    op.create_index("idx_users_role", "users", ["role"])

    # 4. Table: complaints
    vector_type = Vector(384) if is_postgres else sa.Text()
    json_type = JSONB() if is_postgres else sa.JSON()

    op.create_table(
        "complaints",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("ticket_no", sa.String(length=64), unique=True, nullable=False),
        sa.Column("student_reg_no", sa.String(length=64), nullable=False),
        sa.Column("student_name", sa.String(length=128), nullable=False),
        sa.Column("student_email", sa.String(length=255), nullable=False),
        sa.Column("student_phone", sa.String(length=32), nullable=True),
        sa.Column("student_type", sa.String(length=32), server_default="hosteller", nullable=False),
        sa.Column("hostel_block", sa.String(length=64), nullable=True),
        sa.Column("room_no", sa.String(length=32), nullable=True),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("priority", sa.String(length=32), server_default="medium", nullable=False),
        sa.Column("is_spam", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("spam_reason", sa.Text(), nullable=True),
        sa.Column("ai_classification", json_type, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.Column("master_case_id", sa.String(length=64), sa.ForeignKey("complaints.id", ondelete="SET NULL"), nullable=True),
        sa.Column("location_tag", sa.String(length=255), nullable=True),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("embedding", vector_type, nullable=True),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("public_master_notes", sa.Text(), nullable=True),
        sa.Column("assigned_department_id", sa.String(length=64), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_complaints_ticket_no", "complaints", ["ticket_no"], unique=True)
    op.create_index("idx_complaints_student_reg", "complaints", ["student_reg_no"])
    op.create_index("idx_complaints_student_email", "complaints", ["student_email"])
    op.create_index("idx_complaints_status", "complaints", ["status"])
    op.create_index("idx_complaints_master_case", "complaints", ["master_case_id"])
    op.create_index("idx_complaints_assigned_dept", "complaints", ["assigned_department_id"])
    op.create_index("idx_complaints_dedup", "complaints", ["category", "created_at"])

    # Vector HNSW Index on PostgreSQL
    if is_postgres:
        op.execute(
            "CREATE INDEX IF NOT EXISTS idx_complaints_embedding_hnsw "
            "ON complaints USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64);"
        )

    # 5. Table: complaint_upvotes
    op.create_table(
        "complaint_upvotes",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("complaint_id", sa.String(length=64), sa.ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_upvotes_complaint", "complaint_upvotes", ["complaint_id"])
    op.create_index("idx_upvotes_user", "complaint_upvotes", ["user_id"])
    op.create_index("uq_complaint_user_upvote", "complaint_upvotes", ["complaint_id", "user_id"], unique=True)

    # 6. Table: category_routing_rules
    op.create_table(
        "category_routing_rules",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("category", sa.String(length=128), unique=True, nullable=False),
        sa.Column("department_id", sa.String(length=64), sa.ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("priority_override", sa.String(length=32), nullable=True),
        sa.Column("location_tag_pattern", sa.String(length=255), nullable=True),
        sa.Column("priority_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_routing_category", "category_routing_rules", ["category"], unique=True)
    op.create_index("idx_routing_dept", "category_routing_rules", ["department_id"])

    # 7. Table: audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("actor_id", sa.String(length=64), nullable=False),
        sa.Column("actor_email", sa.String(length=255), nullable=False),
        sa.Column("actor_role", sa.String(length=32), nullable=False),
        sa.Column("previous_state", sa.Text(), nullable=True),
        sa.Column("new_state", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_audit_entity", "audit_logs", ["entity_type", "entity_id"])
    op.create_index("idx_audit_actor", "audit_logs", ["actor_id"])
    op.create_index("idx_audit_created", "audit_logs", ["created_at"])

    # 8. Table: notifications
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("recipient", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_notifications_recipient", "notifications", ["recipient"])
    op.create_index("idx_notifications_timestamp", "notifications", ["timestamp"])

    # 9. Table: otp_sessions
    op.create_table(
        "otp_sessions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("otp_code", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_used", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("idx_otp_session_email_expires", "otp_sessions", ["email", "expires_at"])
    op.create_index("idx_otp_session_created", "otp_sessions", ["created_at"])

    # 10. Backward compatibility database views on PostgreSQL
    if is_postgres:
        op.execute("CREATE OR REPLACE VIEW grievances AS SELECT * FROM complaints;")
        op.execute("CREATE OR REPLACE VIEW outbox AS SELECT * FROM notifications;")
        op.execute("CREATE OR REPLACE VIEW otp_codes AS SELECT * FROM otp_sessions;")


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.execute("DROP VIEW IF EXISTS otp_codes;")
        op.execute("DROP VIEW IF EXISTS outbox;")
        op.execute("DROP VIEW IF EXISTS grievances;")

    op.drop_table("otp_sessions")
    op.drop_table("notifications")
    op.drop_table("audit_logs")
    op.drop_table("category_routing_rules")
    op.drop_table("complaint_upvotes")
    op.drop_table("complaints")
    op.drop_table("users")
    op.drop_table("departments")

    if is_postgres:
        op.execute("DROP EXTENSION IF EXISTS vector CASCADE;")
