"""
ScopeIt - PDF Editor Tool Schemas

Pydantic models for the PDF editor tool, covering document management,
page operations, annotations, signing workflow, and company document library.
"""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime


# ============================================
# PDF DOCUMENT SCHEMAS
# ============================================

class PdfDocumentCreate(BaseModel):
    name: str
    source_type: str = "upload"
    source_id: Optional[str] = None


class PdfDocumentUpdate(BaseModel):
    name: Optional[str] = None


class PdfDocumentResponse(BaseModel):
    id: str
    name: str
    file_size: int
    page_count: int
    mime_type: str
    source_type: str
    source_id: Optional[str] = None
    annotations: list = []
    thumbnail_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PdfDocumentListResponse(BaseModel):
    items: list[PdfDocumentResponse]
    total: int
    skip: int
    limit: int


# ============================================
# PAGE OPERATION SCHEMAS
# ============================================

class MergeDocumentsRequest(BaseModel):
    document_ids: list[str] = Field(..., min_length=2)
    name: Optional[str] = None


class PageReorderRequest(BaseModel):
    page_order: list[int]  # 0-indexed new order


class PageDeleteRequest(BaseModel):
    page_numbers: list[int]  # 1-indexed pages to remove


class PageRotateRequest(BaseModel):
    rotations: dict[str, int]  # {"1": 90, "3": 180} - page_number: degrees


# ============================================
# ANNOTATION SCHEMAS
# ============================================

class AnnotationStyle(BaseModel):
    font_family: Optional[str] = None
    font_size: Optional[int] = None
    font_weight: Optional[str] = None       # normal, bold
    font_style: Optional[str] = None        # normal, italic
    text_decoration: Optional[str] = None  # none, underline
    color: Optional[str] = None
    background_color: Optional[str] = None
    border_color: Optional[str] = None
    border_width: Optional[int] = None
    opacity: Optional[float] = None


class Annotation(BaseModel):
    id: str
    type: str  # text, image, drawing, stamp, sign_field
    page: int
    x: float
    y: float
    width: float
    height: float
    rotation: float = 0
    content: str = ""
    style: AnnotationStyle = AnnotationStyle()


class AnnotationSaveRequest(BaseModel):
    annotations: list[Annotation]


# ============================================
# IMPORT SCHEMAS
# ============================================

class ImportEstimateRequest(BaseModel):
    estimate_id: str
    template: str = "classic"


class ImportInvoiceRequest(BaseModel):
    invoice_id: str
    template: str = "classic"


class ImportCompanyDocRequest(BaseModel):
    company_document_id: str


# ============================================
# SIGN REQUEST SCHEMAS
# ============================================

class SignFieldDef(BaseModel):
    page: int
    x: float
    y: float
    width: float
    height: float
    type: str = "signature"  # signature, date, name, initials
    label: Optional[str] = None


class SignRequestCreate(BaseModel):
    document_id: str
    recipient_email: str
    recipient_name: str
    customer_id: Optional[str] = None
    sender_email: Optional[str] = None
    sender_name: Optional[str] = None
    sign_fields: list[SignFieldDef]
    email_subject: Optional[str] = None
    email_message: Optional[str] = None
    expires_in_days: int = 14


class SignRequestResponse(BaseModel):
    id: str
    document_id: str = Field(serialization_alias="documentId")
    document_name: Optional[str] = Field(default=None, serialization_alias="documentName")
    recipient_email: str = Field(serialization_alias="recipientEmail")
    recipient_name: str = Field(serialization_alias="recipientName")
    sender_email: str = Field(serialization_alias="senderEmail")
    sender_name: str = Field(serialization_alias="senderName")
    customer_id: Optional[str] = Field(default=None, serialization_alias="customerId")
    status: str
    sign_fields: list = Field(default=[], serialization_alias="signFields")
    email_subject: Optional[str] = Field(default=None, serialization_alias="emailSubject")
    email_message: Optional[str] = Field(default=None, serialization_alias="emailMessage")
    expires_at: Optional[datetime] = Field(default=None, serialization_alias="expiresAt")
    sent_at: Optional[datetime] = Field(default=None, serialization_alias="sentAt")
    viewed_at: Optional[datetime] = Field(default=None, serialization_alias="viewedAt")
    signed_at: Optional[datetime] = Field(default=None, serialization_alias="signedAt")
    declined_at: Optional[datetime] = Field(default=None, serialization_alias="declinedAt")
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: Optional[datetime] = Field(default=None, serialization_alias="updatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SignRequestListResponse(BaseModel):
    items: list[SignRequestResponse]
    total: int
    skip: int
    limit: int


class SignViewResponse(BaseModel):
    document_name: str = Field(serialization_alias="documentName")
    sender_name: str = Field(serialization_alias="senderName")
    sender_email: str = Field(serialization_alias="senderEmail")
    company_name: Optional[str] = Field(default=None, serialization_alias="companyName")
    company_logo_url: Optional[str] = Field(default=None, serialization_alias="companyLogoUrl")
    page_count: int = Field(serialization_alias="pageCount")
    sign_fields: list = Field(default=[], serialization_alias="signFields")
    status: str
    expires_at: datetime = Field(serialization_alias="expiresAt")

    model_config = ConfigDict(populate_by_name=True)


class SignSubmitRequest(BaseModel):
    signature_data: str  # base64 PNG
    signature_type: str = "draw"  # "draw" or "type"
    signature_font: Optional[str] = None  # font name if type mode
    signed_fields: list[dict] = []


class SignDeclineRequest(BaseModel):
    reason: Optional[str] = None


# ============================================
# SIGN AUDIT SCHEMAS
# ============================================

class SignAuditEventResponse(BaseModel):
    id: str
    event_type: str = Field(serialization_alias="eventType")
    actor_email: Optional[str] = Field(default=None, serialization_alias="actorEmail")
    actor_ip: Optional[str] = Field(default=None, serialization_alias="actorIp")
    event_metadata: dict = Field(default={}, serialization_alias="eventMetadata")
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ============================================
# COMPANY DOCUMENT SCHEMAS
# ============================================

class CompanyDocumentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: list[str] = []


class CompanyDocumentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None


class CompanyDocumentResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    file_size: int
    mime_type: str
    page_count: int
    thumbnail_url: Optional[str] = None
    tags: list[str] = []
    use_count: int = 0
    last_used_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CompanyDocumentListResponse(BaseModel):
    items: list[CompanyDocumentResponse]
    total: int
    skip: int
    limit: int
