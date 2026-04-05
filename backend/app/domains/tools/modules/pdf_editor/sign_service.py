"""
ScopeIt - E-Sign Service
"""
import os
import secrets
from datetime import datetime, timedelta
from io import BytesIO
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.email import email_service
from app.domains.tools.modules.pdf_editor.models import (
    PdfDocument,
    SignAuditEvent,
    SignRequest,
    SignRequestStatus,
)


class SignService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(48)

    def _log_event(
        self,
        sign_request_id: UUID,
        event_type: str,
        actor_email: str = None,
        actor_ip: str = None,
        actor_user_agent: str = None,
        metadata: dict = None,
    ):
        event = SignAuditEvent(
            sign_request_id=sign_request_id,
            event_type=event_type,
            actor_email=actor_email,
            actor_ip=actor_ip,
            actor_user_agent=actor_user_agent,
            event_metadata=metadata or {},
        )
        self.db.add(event)

    # ------------------------------------------------------------------
    # Authenticated (company-scoped) operations
    # ------------------------------------------------------------------

    def create_sign_request(
        self,
        company_id: UUID,
        user_id: UUID,
        document_id: UUID,
        recipient_email: str,
        recipient_name: str,
        sender_email: str,
        sender_name: str,
        sign_fields: list,
        customer_id: UUID = None,
        email_subject: str = None,
        email_message: str = None,
        expires_in_days: int = 14,
    ) -> SignRequest:
        # Verify document exists and belongs to company
        doc = (
            self.db.query(PdfDocument)
            .filter(
                PdfDocument.id == document_id,
                PdfDocument.company_id == company_id,
                PdfDocument.is_active == True,
            )
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        sign_req = SignRequest(
            company_id=company_id,
            document_id=document_id,
            sent_by=user_id,
            sender_email=sender_email,
            sender_name=sender_name,
            customer_id=customer_id,
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            sign_fields=[
                f.dict() if hasattr(f, "dict") else f for f in sign_fields
            ],
            email_subject=email_subject or f"Signature requested: {doc.name}",
            email_message=email_message,
            access_token=self._generate_token(),
            expires_at=datetime.utcnow() + timedelta(days=expires_in_days),
        )
        self.db.add(sign_req)
        self.db.flush()

        self._log_event(sign_req.id, "created", actor_email=sender_email)
        self.db.commit()
        self.db.refresh(sign_req)
        return sign_req

    def send_sign_request(
        self, company_id: UUID, request_id: UUID
    ) -> SignRequest:
        sign_req = (
            self.db.query(SignRequest)
            .filter(
                SignRequest.id == request_id,
                SignRequest.company_id == company_id,
            )
            .first()
        )
        if not sign_req:
            raise HTTPException(status_code=404, detail="Sign request not found")
        if sign_req.status not in ("draft",):
            raise HTTPException(
                status_code=400, detail="Can only send draft requests"
            )

        sign_url = f"{settings.FRONTEND_URL}/sign/{sign_req.access_token}"
        html = self._build_sign_email(sign_req, sign_url)
        email_service.send_email(
            to_email=sign_req.recipient_email,
            subject=sign_req.email_subject or "Please sign this document",
            html_content=html,
            reply_to=sign_req.sender_email,
            from_display_name=f"{sign_req.sender_name} via ScopeIt" if sign_req.sender_name else None,
        )

        sign_req.status = "sent"
        sign_req.sent_at = datetime.utcnow()
        self._log_event(sign_req.id, "sent", actor_email=sign_req.sender_email)
        self.db.commit()
        self.db.refresh(sign_req)
        return sign_req

    def send_reminder(
        self, company_id: UUID, request_id: UUID
    ) -> SignRequest:
        sign_req = (
            self.db.query(SignRequest)
            .filter(
                SignRequest.id == request_id,
                SignRequest.company_id == company_id,
            )
            .first()
        )
        if not sign_req:
            raise HTTPException(
                status_code=404, detail="Sign request not found"
            )
        if sign_req.status not in ("sent", "viewed"):
            raise HTTPException(
                status_code=400,
                detail="Can only send reminders for sent/viewed requests",
            )

        sign_url = f"{settings.FRONTEND_URL}/sign/{sign_req.access_token}"
        html = self._build_reminder_email(sign_req, sign_url)
        email_service.send_email(
            to_email=sign_req.recipient_email,
            subject=f"Reminder: Please sign {sign_req.document.name if sign_req.document else 'document'}",
            html_content=html,
            reply_to=sign_req.sender_email,
            from_display_name=(
                f"{sign_req.sender_name} via ScopeIt"
                if sign_req.sender_name else None
            ),
        )

        self._log_event(
            sign_req.id,
            "reminder_sent",
            actor_email=sign_req.sender_email,
        )
        self.db.commit()
        self.db.refresh(sign_req)
        return sign_req

    def cancel_sign_request(
        self, company_id: UUID, request_id: UUID
    ) -> SignRequest:
        sign_req = (
            self.db.query(SignRequest)
            .filter(
                SignRequest.id == request_id,
                SignRequest.company_id == company_id,
            )
            .first()
        )
        if not sign_req:
            raise HTTPException(status_code=404, detail="Sign request not found")
        if sign_req.status in ("signed", "cancelled"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel {sign_req.status} request",
            )

        sign_req.status = "cancelled"
        self._log_event(
            sign_req.id, "cancelled", actor_email=sign_req.sender_email
        )
        self.db.commit()
        self.db.refresh(sign_req)
        return sign_req

    def list_sign_requests(
        self,
        company_id: UUID,
        status: str = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple:
        query = self.db.query(SignRequest).filter(
            SignRequest.company_id == company_id
        )
        if status:
            query = query.filter(SignRequest.status == status)
        total = query.count()
        items = (
            query.order_by(SignRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        return items, total

    def get_sign_request(
        self, company_id: UUID, request_id: UUID
    ) -> Optional[SignRequest]:
        return (
            self.db.query(SignRequest)
            .filter(
                SignRequest.id == request_id,
                SignRequest.company_id == company_id,
            )
            .first()
        )

    def get_audit_trail(self, company_id: UUID, request_id: UUID) -> list:
        sign_req = self.get_sign_request(company_id, request_id)
        if not sign_req:
            raise HTTPException(status_code=404, detail="Sign request not found")
        return (
            self.db.query(SignAuditEvent)
            .filter(SignAuditEvent.sign_request_id == request_id)
            .order_by(SignAuditEvent.created_at.asc())
            .all()
        )

    # ------------------------------------------------------------------
    # Public signing (token-based, no auth)
    # ------------------------------------------------------------------

    def get_by_token(self, token: str) -> Optional[SignRequest]:
        return (
            self.db.query(SignRequest)
            .filter(SignRequest.access_token == token)
            .first()
        )

    def view_document(
        self, token: str, ip: str, user_agent: str
    ) -> SignRequest:
        sign_req = self.get_by_token(token)
        if not sign_req:
            raise HTTPException(status_code=404, detail="Sign request not found")
        if sign_req.status in ("cancelled", "expired"):
            raise HTTPException(
                status_code=410,
                detail="This signing request is no longer available",
            )
        if datetime.utcnow() > sign_req.expires_at.replace(tzinfo=None):
            sign_req.status = "expired"
            self._log_event(sign_req.id, "expired")
            self.db.commit()
            raise HTTPException(
                status_code=410,
                detail="This signing request has expired",
            )

        if sign_req.status == "sent":
            sign_req.status = "viewed"
            sign_req.viewed_at = datetime.utcnow()

        self._log_event(
            sign_req.id,
            "viewed",
            actor_email=sign_req.recipient_email,
            actor_ip=ip,
            actor_user_agent=user_agent,
        )
        self.db.commit()
        self.db.refresh(sign_req)
        return sign_req

    def submit_signature(
        self,
        token: str,
        signature_data: str,
        signature_type: str,
        signature_font: str,
        ip: str,
        user_agent: str,
    ) -> SignRequest:
        sign_req = self.get_by_token(token)
        if not sign_req:
            raise HTTPException(status_code=404, detail="Sign request not found")
        if sign_req.status == "signed":
            raise HTTPException(status_code=400, detail="Document already signed")
        if sign_req.status in ("cancelled", "expired"):
            raise HTTPException(
                status_code=410,
                detail="This signing request is no longer available",
            )
        if datetime.utcnow() > sign_req.expires_at.replace(tzinfo=None):
            sign_req.status = "expired"
            self.db.commit()
            raise HTTPException(status_code=410, detail="Expired")

        sign_req.signature_data = signature_data
        sign_req.signature_type = signature_type
        sign_req.signature_font = signature_font
        sign_req.signer_ip = ip
        sign_req.signer_user_agent = user_agent
        sign_req.status = "signed"
        sign_req.signed_at = datetime.utcnow()

        try:
            signed_path = self._burn_signature(sign_req)
            sign_req.signed_file_path = signed_path
        except Exception:
            pass  # Signature data is still saved even if burn fails

        self._log_event(
            sign_req.id,
            "signed",
            actor_email=sign_req.recipient_email,
            actor_ip=ip,
            actor_user_agent=user_agent,
            metadata={"signature_type": signature_type},
        )
        self.db.commit()
        self.db.refresh(sign_req)

        # Notify the sender that the document has been signed
        self._send_signed_notification(sign_req)

        # Send a copy of the signed document to the signer
        self._send_signer_copy(sign_req)

        return sign_req

    def decline_signature(
        self, token: str, reason: str, ip: str, user_agent: str
    ) -> SignRequest:
        sign_req = self.get_by_token(token)
        if not sign_req:
            raise HTTPException(status_code=404, detail="Sign request not found")
        if sign_req.status in ("signed", "cancelled"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot decline {sign_req.status} request",
            )

        sign_req.status = "declined"
        sign_req.declined_at = datetime.utcnow()

        self._log_event(
            sign_req.id,
            "declined",
            actor_email=sign_req.recipient_email,
            actor_ip=ip,
            actor_user_agent=user_agent,
            metadata={"reason": reason},
        )
        self.db.commit()
        self.db.refresh(sign_req)
        return sign_req

    # ------------------------------------------------------------------
    # PDF signature burning
    # ------------------------------------------------------------------

    def _burn_signature(self, sign_req: SignRequest) -> str:
        """Burn signature image into the document at the designated sign fields."""
        import base64

        doc = sign_req.document
        if not doc or not os.path.exists(doc.file_path):
            raise ValueError("Source document not found")

        mime = (doc.mime_type or "").lower()
        sig_bytes = base64.b64decode(sign_req.signature_data)
        doc_dir = os.path.dirname(doc.file_path)

        if mime.startswith("image/"):
            return self._burn_signature_image(
                sign_req, sig_bytes, doc_dir
            )
        else:
            return self._burn_signature_pdf(
                sign_req, sig_bytes, doc_dir
            )

    def _burn_signature_image(
        self, sign_req: SignRequest, sig_bytes: bytes, doc_dir: str
    ) -> str:
        """Burn signature onto an image file, output as PDF."""
        from PIL import Image

        doc = sign_req.document
        base_img = Image.open(doc.file_path).convert("RGBA")
        img_w, img_h = base_img.size

        sig_img = Image.open(BytesIO(sig_bytes)).convert("RGBA")

        for field in sign_req.sign_fields or []:
            field_type = field.get("type")
            fx = field.get("x", 0)
            fy = field.get("y", 0)
            fw = field.get("width", 200)
            fh = field.get("height", 60)

            # Convert normalised coords to pixel coords
            px = int(fx * img_w) if fx <= 1 else int(fx)
            py = int(fy * img_h) if fy <= 1 else int(fy)
            pw = int(fw * img_w) if fw <= 1 else int(fw)
            ph = int(fh * img_h) if fh <= 1 else int(fh)

            if field_type in ("signature", "initials"):
                resized = sig_img.resize((pw, ph), Image.LANCZOS)
                base_img.paste(resized, (px, py), resized)
                # Add signed date/time below the signature
                from PIL import ImageDraw, ImageFont
                draw = ImageDraw.Draw(base_img)
                ts_size = max(9, int(ph * 0.2))
                try:
                    ts_font = ImageFont.truetype("arial.ttf", ts_size)
                except OSError:
                    ts_font = ImageFont.load_default()
                signed_ts = (
                    sign_req.signed_at.strftime("%m/%d/%Y %I:%M %p")
                    if sign_req.signed_at
                    else datetime.utcnow().strftime("%m/%d/%Y %I:%M %p")
                )
                draw.text(
                    (px + 2, py + ph + 2),
                    signed_ts,
                    fill=(107, 114, 128, 255),
                    font=ts_font,
                )
            elif field_type == "date":
                from PIL import ImageDraw, ImageFont
                draw = ImageDraw.Draw(base_img)
                font_size = max(12, int(ph * 0.6))
                try:
                    font = ImageFont.truetype("arial.ttf", font_size)
                except OSError:
                    font = ImageFont.load_default()
                draw.text(
                    (px + 4, py + (ph - font_size) // 2),
                    datetime.utcnow().strftime("%m/%d/%Y"),
                    fill=(17, 24, 39, 255),
                    font=font,
                )
            elif field_type == "name":
                from PIL import ImageDraw, ImageFont
                draw = ImageDraw.Draw(base_img)
                font_size = max(12, int(ph * 0.6))
                try:
                    font = ImageFont.truetype("arial.ttf", font_size)
                except OSError:
                    font = ImageFont.load_default()
                draw.text(
                    (px + 4, py + (ph - font_size) // 2),
                    sign_req.recipient_name or "",
                    fill=(17, 24, 39, 255),
                    font=font,
                )

        # Convert to RGB and save as PDF
        output = base_img.convert("RGB")
        signed_path = os.path.join(doc_dir, "signed.pdf")
        output.save(signed_path, "PDF", resolution=150)
        return signed_path

    def _burn_signature_pdf(
        self, sign_req: SignRequest, sig_bytes: bytes, doc_dir: str
    ) -> str:
        """Burn signature onto a PDF file."""
        from pypdf import PdfReader, PdfWriter  # type: ignore
        from reportlab.lib.utils import ImageReader  # type: ignore
        from reportlab.pdfgen import canvas as rl_canvas  # type: ignore

        doc = sign_req.document
        reader = PdfReader(doc.file_path)
        writer = PdfWriter()

        # Group sign fields by page (1-indexed in field, 0-indexed in reader)
        fields_by_page: dict = {}
        for field in sign_req.sign_fields or []:
            pg = field.get("page", 1)
            fields_by_page.setdefault(pg, []).append(field)

        for i, page in enumerate(reader.pages):
            page_num = i + 1
            page_fields = fields_by_page.get(page_num, [])
            if page_fields:
                media_box = page.mediabox
                pw = float(media_box.width)
                ph = float(media_box.height)

                packet = BytesIO()
                c = rl_canvas.Canvas(packet, pagesize=(pw, ph))

                for field in page_fields:
                    field_type = field.get("type")
                    # Fields may use normalised [0,1] or absolute coords
                    fx = field.get("x", 0)
                    fy = field.get("y", 0)
                    fw = field.get("width", 200)
                    fh = field.get("height", 60)

                    x = fx * pw if fx <= 1 else fx
                    y_top = fy * ph if fy <= 1 else fy
                    w = fw * pw if fw <= 1 else fw
                    h = fh * ph if fh <= 1 else fh
                    # PDF y-axis is bottom-up
                    y = ph - y_top - h

                    if field_type in ("signature", "initials"):
                        sig_reader = ImageReader(BytesIO(sig_bytes))
                        c.drawImage(sig_reader, x, y, w, h, mask="auto")
                        # Add signed date/time below the signature
                        ts_size = max(6, min(8, h * 0.18))
                        signed_ts = (
                            sign_req.signed_at.strftime("%m/%d/%Y %I:%M %p")
                            if sign_req.signed_at
                            else datetime.utcnow().strftime("%m/%d/%Y %I:%M %p")
                        )
                        c.setFont("Helvetica", ts_size)
                        c.setFillColorRGB(0.42, 0.45, 0.50)
                        c.drawString(x + 1, y - ts_size - 1, signed_ts)
                        c.setFillColorRGB(0, 0, 0)
                    elif field_type == "date":
                        c.setFont("Helvetica", 11)
                        c.drawString(x + 2, y + h * 0.3, datetime.utcnow().strftime("%m/%d/%Y"))
                    elif field_type == "name":
                        c.setFont("Helvetica", 11)
                        c.drawString(x + 2, y + h * 0.3, sign_req.recipient_name or "")

                c.save()
                packet.seek(0)
                overlay = PdfReader(packet)
                page.merge_page(overlay.pages[0])

            writer.add_page(page)

        signed_path = os.path.join(doc_dir, "signed.pdf")
        with open(signed_path, "wb") as f:
            writer.write(f)

        return signed_path

    # ------------------------------------------------------------------
    # Email template
    # ------------------------------------------------------------------

    def _build_sign_email(self, sign_req: SignRequest, sign_url: str) -> str:
        """Build HTML email for signing invitation."""
        expires_str = (
            sign_req.expires_at.strftime("%B %d, %Y")
            if sign_req.expires_at
            else "N/A"
        )
        message_block = (
            f'<p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 20px;">'
            f"{sign_req.email_message}</p>"
            if sign_req.email_message
            else ""
        )
        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background:#f9fafb;">
<table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px; margin:0 auto; padding:40px 20px;">
<tr><td style="background:#fff; border-radius:12px; padding:40px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
  <h1 style="margin:0 0 20px; color:#111827; font-size:24px;">Signature Requested</h1>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 10px;">
    Hi {sign_req.recipient_name},
  </p>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 20px;">
    {sign_req.sender_name} ({sign_req.sender_email}) has requested your signature on a document.
  </p>
  {message_block}
  <table width="100%" cellspacing="0" cellpadding="0">
    <tr><td style="text-align:center; padding:25px 0;">
      <a href="{sign_url}" style="display:inline-block; background:#111827; color:#fff; text-decoration:none; padding:14px 32px; border-radius:6px; font-size:16px; font-weight:600;">
        Review &amp; Sign Document
      </a>
    </td></tr>
  </table>
  <p style="color:#6b7280; font-size:14px; margin:20px 0 0;">
    This link expires on {expires_str}.
  </p>
  <hr style="border:none; border-top:1px solid #e5e7eb; margin:30px 0 20px;">
  <p style="color:#9ca3af; font-size:12px; text-align:center; margin:0;">
    Sent via ScopeIt &bull; Do not reply to this email
  </p>
</td></tr></table>
</body>
</html>"""

    def _build_reminder_email(self, sign_req: SignRequest, sign_url: str) -> str:
        """Build HTML email for signing reminder."""
        expires_str = (
            sign_req.expires_at.strftime("%B %d, %Y")
            if sign_req.expires_at
            else "N/A"
        )
        doc_name = sign_req.document.name if sign_req.document else "a document"
        return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background:#f9fafb;">
<table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px; margin:0 auto; padding:40px 20px;">
<tr><td style="background:#fff; border-radius:12px; padding:40px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
  <h1 style="margin:0 0 20px; color:#111827; font-size:24px;">Friendly Reminder</h1>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 10px;">
    Hi {sign_req.recipient_name},
  </p>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 20px;">
    {sign_req.sender_name} ({sign_req.sender_email}) is waiting for your signature on <strong>{doc_name}</strong>.
  </p>
  <table width="100%" cellspacing="0" cellpadding="0">
    <tr><td style="text-align:center; padding:25px 0;">
      <a href="{sign_url}" style="display:inline-block; background:#111827; color:#fff; text-decoration:none; padding:14px 32px; border-radius:6px; font-size:16px; font-weight:600;">
        Review &amp; Sign Document
      </a>
    </td></tr>
  </table>
  <p style="color:#6b7280; font-size:14px; margin:20px 0 0;">
    This link expires on {expires_str}.
  </p>
  <hr style="border:none; border-top:1px solid #e5e7eb; margin:30px 0 20px;">
  <p style="color:#9ca3af; font-size:12px; text-align:center; margin:0;">
    Sent via ScopeIt &bull; Do not reply to this email
  </p>
</td></tr></table>
</body>
</html>"""

    def _send_signed_notification(self, sign_req: SignRequest) -> None:
        """Notify the sender that the document has been signed."""
        doc_name = sign_req.document.name if sign_req.document else "Document"
        signed_at_str = (
            sign_req.signed_at.strftime("%B %d, %Y at %I:%M %p")
            if sign_req.signed_at
            else "just now"
        )
        view_url = f"{settings.FRONTEND_URL}/app/tools"

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background:#f9fafb;">
<table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px; margin:0 auto; padding:40px 20px;">
<tr><td style="background:#fff; border-radius:12px; padding:40px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
  <h1 style="margin:0 0 20px; color:#111827; font-size:24px;">Document Signed</h1>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 10px;">
    Hi {sign_req.sender_name},
  </p>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 20px;">
    <strong>{sign_req.recipient_name}</strong> ({sign_req.recipient_email}) has signed
    <strong>{doc_name}</strong>.
  </p>
  <table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
    <tr>
      <td style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px;">
        <p style="margin:0; color:#166534; font-size:14px; font-weight:600;">Signed successfully</p>
        <p style="margin:6px 0 0; color:#166534; font-size:13px;">{signed_at_str}</p>
      </td>
    </tr>
  </table>
  <table width="100%" cellspacing="0" cellpadding="0">
    <tr><td style="text-align:center; padding:10px 0 0;">
      <a href="{view_url}" style="display:inline-block; background:#111827; color:#fff; text-decoration:none; padding:14px 32px; border-radius:6px; font-size:16px; font-weight:600;">
        View in ScopeIt
      </a>
    </td></tr>
  </table>
  <hr style="border:none; border-top:1px solid #e5e7eb; margin:30px 0 20px;">
  <p style="color:#9ca3af; font-size:12px; text-align:center; margin:0;">
    Sent via ScopeIt
  </p>
</td></tr></table>
</body>
</html>"""

        try:
            # Attach signed PDF if available
            attachments = None
            signed_path = sign_req.signed_file_path
            if signed_path and os.path.exists(signed_path):
                with open(signed_path, "rb") as f:
                    pdf_data = f.read()
                base_name = os.path.splitext(doc_name)[0]
                attachments = [{
                    "data": pdf_data,
                    "filename": f"{base_name}_signed.pdf",
                    "mime_type": "application/pdf",
                }]

            email_service.send_email(
                to_email=sign_req.sender_email,
                subject=f"{sign_req.recipient_name} has signed {doc_name}",
                html_content=html,
                reply_to=sign_req.recipient_email,
                attachments=attachments,
            )
        except Exception:
            pass  # Don't fail the signing if notification fails

    def _send_signer_copy(self, sign_req: SignRequest) -> None:
        """Send a copy of the signed PDF to the person who signed it."""
        doc_name = sign_req.document.name if sign_req.document else "Document"
        company_name = (
            sign_req.company.name if sign_req.company else "ScopeIt"
        )
        signed_at_str = (
            sign_req.signed_at.strftime("%B %d, %Y at %I:%M %p")
            if sign_req.signed_at
            else "just now"
        )

        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background:#f9fafb;">
<table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px; margin:0 auto; padding:40px 20px;">
<tr><td style="background:#fff; border-radius:12px; padding:40px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
  <h1 style="margin:0 0 20px; color:#111827; font-size:24px;">Your Signed Document</h1>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 10px;">
    Hi {sign_req.recipient_name},
  </p>
  <p style="color:#374151; font-size:16px; line-height:1.6; margin:0 0 20px;">
    Thank you for signing <strong>{doc_name}</strong>.
    A copy of the signed document is attached for your records.
  </p>
  <table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
    <tr>
      <td style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px;">
        <p style="margin:0; color:#166534; font-size:14px; font-weight:600;">Signed successfully</p>
        <p style="margin:6px 0 0; color:#166534; font-size:13px;">{signed_at_str}</p>
      </td>
    </tr>
  </table>
  <p style="color:#6b7280; font-size:13px; line-height:1.6; margin:0 0 0;">
    This document was requested by {sign_req.sender_name} ({sign_req.sender_email})
    on behalf of {company_name}.
  </p>
  <hr style="border:none; border-top:1px solid #e5e7eb; margin:30px 0 20px;">
  <p style="color:#9ca3af; font-size:12px; text-align:center; margin:0;">
    Sent via ScopeIt
  </p>
</td></tr></table>
</body>
</html>"""

        try:
            attachments = None
            signed_path = sign_req.signed_file_path
            if signed_path and os.path.exists(signed_path):
                with open(signed_path, "rb") as f:
                    pdf_data = f.read()
                base_name = os.path.splitext(doc_name)[0]
                attachments = [{
                    "data": pdf_data,
                    "filename": f"{base_name}_signed.pdf",
                    "mime_type": "application/pdf",
                }]

            email_service.send_email(
                to_email=sign_req.recipient_email,
                subject=f"Your signed copy of {doc_name}",
                html_content=html,
                reply_to=sign_req.sender_email,
                attachments=attachments,
            )
        except Exception:
            pass  # Don't fail the signing if copy email fails
