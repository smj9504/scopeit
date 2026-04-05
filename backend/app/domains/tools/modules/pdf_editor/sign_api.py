from __future__ import annotations

"""
ScopeIt - E-Sign API

Two routers:
  router        - authenticated endpoints under /api/tools/pdf-editor/sign/
  public_router - public (token-based) endpoints under /api/sign/
"""
import io
import logging
import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.domains.tools.dependencies import require_tool_access
from app.domains.tools.modules.pdf_editor.models import SignRequest
from app.domains.tools.modules.pdf_editor.schemas import (
    SignAuditEventResponse,
    SignDeclineRequest,
    SignRequestCreate,
    SignRequestListResponse,
    SignRequestResponse,
    SignSubmitRequest,
    SignViewResponse,
)
from app.domains.tools.modules.pdf_editor.sign_service import SignService
from app.domains.user.models import User

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

router = APIRouter()
public_router = APIRouter()

_gate = require_tool_access("pdf_editor")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _to_sign_response(req: SignRequest, include_sign_url: bool = False) -> dict:
    resp = {
        "id": str(req.id),
        "documentId": str(req.document_id),
        "documentName": req.document.name if req.document else None,
        "recipientEmail": req.recipient_email,
        "recipientName": req.recipient_name,
        "senderEmail": req.sender_email,
        "senderName": req.sender_name,
        "customerId": str(req.customer_id) if req.customer_id else None,
        "status": req.status,
        "signFields": req.sign_fields or [],
        "emailSubject": req.email_subject,
        "emailMessage": req.email_message,
        "expiresAt": req.expires_at,
        "sentAt": req.sent_at,
        "viewedAt": req.viewed_at,
        "signedAt": req.signed_at,
        "declinedAt": req.declined_at,
        "createdAt": req.created_at,
        "updatedAt": req.updated_at,
    }
    if include_sign_url and req.access_token:
        resp["sign_url"] = f"{settings.FRONTEND_URL}/sign/{req.access_token}"
    return resp


# ===========================================================================
# Authenticated endpoints  (prefix: /api/tools/pdf-editor/sign)
# ===========================================================================


@router.post("/requests", status_code=201)
async def create_sign_request(
    data: SignRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Create a new sign request (status: draft)."""
    service = SignService(db)
    sign_req = service.create_sign_request(
        company_id=current_user.company_id,
        user_id=current_user.id,
        document_id=UUID(data.document_id),
        recipient_email=data.recipient_email,
        recipient_name=data.recipient_name,
        sender_email=data.sender_email or current_user.email,
        sender_name=data.sender_name if hasattr(data, "sender_name") and data.sender_name
            else (current_user.full_name or current_user.email),
        sign_fields=data.sign_fields,
        customer_id=UUID(data.customer_id) if data.customer_id else None,
        email_subject=data.email_subject,
        email_message=data.email_message,
        expires_in_days=data.expires_in_days,
    )
    return _to_sign_response(sign_req)


@router.get("/requests")
async def list_sign_requests(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """List sign requests for the current company."""
    service = SignService(db)
    items, total = service.list_sign_requests(
        company_id=current_user.company_id,
        status=status,
        skip=skip,
        limit=limit,
    )
    return {
        "items": [_to_sign_response(r) for r in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/requests/{request_id}")
async def get_sign_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Get a single sign request detail (includes document name)."""
    service = SignService(db)
    sign_req = service.get_sign_request(
        company_id=current_user.company_id,
        request_id=request_id,
    )
    if not sign_req:
        raise HTTPException(status_code=404, detail="Sign request not found")
    return _to_sign_response(sign_req)


@router.post("/requests/{request_id}/send")
async def send_sign_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Send the signing invitation email to the recipient."""
    from app.core.email import email_service

    service = SignService(db)
    sign_req = service.send_sign_request(
        company_id=current_user.company_id,
        request_id=request_id,
    )
    # Only include sign_url when email is not configured (dev fallback)
    return _to_sign_response(
        sign_req,
        include_sign_url=not email_service.is_configured(),
    )


@router.post("/requests/{request_id}/reminder")
async def send_reminder(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Send a reminder email to the recipient."""
    service = SignService(db)
    sign_req = service.send_reminder(
        company_id=current_user.company_id,
        request_id=request_id,
    )
    return _to_sign_response(sign_req)


@router.post("/requests/{request_id}/cancel")
async def cancel_sign_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Cancel a pending sign request."""
    service = SignService(db)
    sign_req = service.cancel_sign_request(
        company_id=current_user.company_id,
        request_id=request_id,
    )
    return _to_sign_response(sign_req)


@router.get("/requests/{request_id}/audit")
async def get_audit_trail(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Retrieve the full audit trail for a sign request."""
    service = SignService(db)
    events = service.get_audit_trail(
        company_id=current_user.company_id,
        request_id=request_id,
    )
    return [
        {
            "id": str(e.id),
            "eventType": e.event_type,
            "actorEmail": e.actor_email,
            "actorIp": e.actor_ip,
            "eventMetadata": e.event_metadata or {},
            "createdAt": e.created_at,
        }
        for e in events
    ]


@router.get("/requests/{request_id}/signed-document")
async def download_signed_document(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Download the signed PDF once the request has been completed."""
    service = SignService(db)
    sign_req = service.get_sign_request(
        company_id=current_user.company_id,
        request_id=request_id,
    )
    if not sign_req:
        raise HTTPException(status_code=404, detail="Sign request not found")
    if sign_req.status != "signed":
        raise HTTPException(
            status_code=400, detail="Document has not been signed yet"
        )
    if not sign_req.signed_file_path or not os.path.exists(sign_req.signed_file_path):
        raise HTTPException(
            status_code=404, detail="Signed document file not found"
        )

    doc_name = sign_req.document.name if sign_req.document else "signed"
    # Strip original extension to avoid names like "photo.jpg_signed.pdf"
    base_name = os.path.splitext(doc_name)[0]
    filename = f"{base_name}_signed.pdf"
    return FileResponse(
        sign_req.signed_file_path,
        media_type="application/pdf",
        filename=filename,
    )


# ===========================================================================
# Public endpoints  (prefix: /api/sign)
# ===========================================================================


@public_router.get("/view/{token}")
async def view_document(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    View document metadata before signing (public, token-based).
    Transitions status from 'sent' to 'viewed' on first access.
    """
    ip = request.client.host if request.client else ""
    user_agent = request.headers.get("user-agent", "")

    service = SignService(db)
    sign_req = service.view_document(token=token, ip=ip, user_agent=user_agent)

    doc = sign_req.document
    company = sign_req.company

    return {
        "documentName": doc.name if doc else "Document",
        "senderName": sign_req.sender_name,
        "senderEmail": sign_req.sender_email,
        "recipientName": sign_req.recipient_name,
        "companyName": company.name if company else None,
        "companyLogoUrl": None,
        "pageCount": doc.page_count if doc else 0,
        "signFields": sign_req.sign_fields or [],
        "status": sign_req.status,
        "expiresAt": sign_req.expires_at,
    }


@public_router.get("/view/{token}/page/{page_num}")
async def get_page_image(
    token: str,
    page_num: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Render a specific page (1-indexed) of the document as a PNG image.
    Used by the public signing UI to display pages without exposing the PDF URL.
    """
    service = SignService(db)
    sign_req = service.get_by_token(token)
    if not sign_req:
        raise HTTPException(status_code=404, detail="Sign request not found")
    if sign_req.status in ("cancelled", "expired"):
        raise HTTPException(
            status_code=410,
            detail="This signing request is no longer available",
        )

    doc = sign_req.document
    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found")

    if page_num < 1 or page_num > doc.page_count:
        raise HTTPException(
            status_code=400,
            detail=f"page_num must be between 1 and {doc.page_count}",
        )

    mime = (doc.mime_type or "").lower()

    # ── Image files: serve directly ──
    if mime.startswith("image/"):
        media_type = mime if mime in ("image/png", "image/jpeg", "image/webp") else "image/jpeg"
        return FileResponse(doc.file_path, media_type=media_type)

    # ── PDF: rasterise the requested page ──
    try:
        from pdf2image import convert_from_path  # type: ignore

        images = convert_from_path(
            doc.file_path,
            first_page=page_num,
            last_page=page_num,
            size=(1200, None),
        )
    except ImportError:
        # pdf2image / poppler not installed — fall back to serving the raw file
        return FileResponse(doc.file_path, media_type=mime or "application/pdf")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Page rendering is unavailable: {exc}",
        ) from exc

    if not images:
        raise HTTPException(status_code=404, detail="Page could not be rendered")

    buf = io.BytesIO()
    images[0].save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@public_router.post("/submit/{token}")
async def submit_signature(
    token: str,
    data: SignSubmitRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Submit a completed signature for the document."""
    ip = request.client.host if request.client else ""
    user_agent = request.headers.get("user-agent", "")

    service = SignService(db)
    sign_req = service.submit_signature(
        token=token,
        signature_data=data.signature_data,
        signature_type=data.signature_type,
        signature_font=data.signature_font or "",
        ip=ip,
        user_agent=user_agent,
    )
    return {"status": sign_req.status, "signed_at": sign_req.signed_at}


@public_router.post("/decline/{token}")
async def decline_signature(
    token: str,
    data: SignDeclineRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Decline to sign the document."""
    ip = request.client.host if request.client else ""
    user_agent = request.headers.get("user-agent", "")

    service = SignService(db)
    sign_req = service.decline_signature(
        token=token,
        reason=data.reason or "",
        ip=ip,
        user_agent=user_agent,
    )
    return {"status": sign_req.status, "declined_at": sign_req.declined_at}
