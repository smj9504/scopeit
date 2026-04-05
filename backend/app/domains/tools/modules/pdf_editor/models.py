"""
ScopeIt - PDF Editor Models
"""
import enum

from sqlalchemy import Column, String, Text, Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, JSONB, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.common.utils import generate_uuid


class PdfDocument(Base):
    __tablename__ = "pdf_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    page_count = Column(Integer, nullable=False, default=1)
    mime_type = Column(String(100), default="application/pdf")

    source_type = Column(String(50), nullable=False, default="upload")
    source_id = Column(UUID(as_uuid=True))

    annotations = Column(JSONB, default=[])

    thumbnail_path = Column(String(500))
    is_active = Column(Boolean, default=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    company = relationship("Company")
    creator = relationship("User", foreign_keys=[created_by])
    sign_requests = relationship("SignRequest", back_populates="document", cascade="all, delete-orphan")


class SignRequestStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    SIGNED = "signed"
    DECLINED = "declined"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class SignRequest(Base):
    __tablename__ = "sign_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("pdf_documents.id", ondelete="CASCADE"), nullable=False)

    sent_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    sender_email = Column(String(255), nullable=False)
    sender_name = Column(String(255), nullable=False)

    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"))
    recipient_email = Column(String(255), nullable=False)
    recipient_name = Column(String(255), nullable=False)

    sign_fields = Column(JSONB, default=[])

    email_subject = Column(String(500))
    email_message = Column(Text)

    status = Column(String(20), nullable=False, default="draft", index=True)

    access_token = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)

    sent_at = Column(TIMESTAMP(timezone=True))
    viewed_at = Column(TIMESTAMP(timezone=True))
    signed_at = Column(TIMESTAMP(timezone=True))
    declined_at = Column(TIMESTAMP(timezone=True))

    signed_file_path = Column(String(500))
    signature_data = Column(Text)
    signature_type = Column(String(20))
    signature_font = Column(String(100))
    signer_ip = Column(String(45))
    signer_user_agent = Column(String(500))

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    company = relationship("Company")
    document = relationship("PdfDocument", back_populates="sign_requests")
    sender = relationship("User", foreign_keys=[sent_by])
    customer = relationship("Customer")
    audit_events = relationship("SignAuditEvent", back_populates="sign_request", cascade="all, delete-orphan")


class SignAuditEvent(Base):
    __tablename__ = "sign_audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)

    sign_request_id = Column(UUID(as_uuid=True), ForeignKey("sign_requests.id", ondelete="CASCADE"), nullable=False, index=True)

    event_type = Column(String(50), nullable=False)
    actor_email = Column(String(255))
    actor_ip = Column(String(45))
    actor_user_agent = Column(String(500))
    event_metadata = Column("metadata", JSONB, default={})

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    sign_request = relationship("SignRequest", back_populates="audit_events")


class CompanyDocument(Base):
    __tablename__ = "company_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    name = Column(String(255), nullable=False)
    description = Column(Text)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    page_count = Column(Integer, default=1)
    thumbnail_path = Column(String(500))

    category = Column(String(100))
    tags = Column(ARRAY(String(100)), default=[])

    use_count = Column(Integer, default=0)
    last_used_at = Column(TIMESTAMP(timezone=True))

    is_active = Column(Boolean, default=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    company = relationship("Company")
    uploader = relationship("User", foreign_keys=[uploaded_by])
