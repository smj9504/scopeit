from __future__ import annotations

"""
ScopeIt - PDF Editor Service

Handles PDF document CRUD, page operations (merge, reorder, delete, rotate),
annotation persistence, flattening, multi-image-to-PDF conversion, and the
company document library.

Database: SQLAlchemy 2.0 SYNC (Session, not AsyncSession).
"""

import os
import uuid
import shutil
from datetime import datetime
from io import BytesIO
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.domains.tools.modules.pdf_editor.models import CompanyDocument, PdfDocument

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_UPLOAD_TYPES = {"application/pdf"}

ALLOWED_CONVERT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/tiff",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


# ===========================================================================
# PdfEditorService
# ===========================================================================

class PdfEditorService:
    """
    Core service for user-owned PDF documents.

    Covers:
    - Upload / convert-to-PDF / multi-image-to-PDF
    - CRUD (list, get, rename, soft-delete, duplicate)
    - Page operations  (merge, reorder, delete, rotate)
    - Annotation save / flatten-to-PDF
    - Import from ScopeIt estimate / invoice (via pdf_generator)
    - Import from company document library
    """

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _upload_dir(self, company_id: UUID) -> str:
        path = os.path.join(settings.STORAGE_BASE_DIR, str(company_id), "pdf-editor")
        os.makedirs(path, exist_ok=True)
        return path

    def _document_dir(self, company_id: UUID, document_id: UUID) -> str:
        path = os.path.join(self._upload_dir(company_id), str(document_id))
        os.makedirs(path, exist_ok=True)
        return path

    def _generate_thumbnail(self, file_path: str, output_path: str) -> Optional[str]:
        """Render first page of a PDF as a 300-px-wide PNG thumbnail.

        Returns output_path on success, None on any failure (missing
        system library, corrupt PDF, etc.).  Never raises.
        """
        try:
            from pdf2image import convert_from_path  # type: ignore

            images = convert_from_path(
                file_path, first_page=1, last_page=1, size=(300, None)
            )
            if images:
                images[0].save(output_path, "PNG")
                return output_path
        except Exception:
            pass
        return None

    def _page_count(self, file_path: str) -> int:
        """Return the number of pages in a PDF, defaulting to 1 on error."""
        try:
            from pypdf import PdfReader  # type: ignore

            return len(PdfReader(file_path).pages)
        except Exception:
            return 1

    # ------------------------------------------------------------------
    # File-format converters (called internally)
    # ------------------------------------------------------------------

    def _image_to_pdf(self, image_path: str, output_path: str, rotation: int = 0) -> None:
        """Convert a single image file to a single-page PDF letter-sized."""
        from PIL import Image, ImageOps  # type: ignore
        from reportlab.lib.pagesizes import letter  # type: ignore
        from reportlab.pdfgen import canvas as rl_canvas  # type: ignore

        img = Image.open(image_path)
        # Apply EXIF orientation (phone photos are often rotated)
        img = ImageOps.exif_transpose(img)
        # Apply user-specified rotation
        if rotation:
            img = img.rotate(-rotation, expand=True)  # PIL rotates CCW, user expects CW
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        temp_jpg = image_path + ".tmp.jpg"
        img.save(temp_jpg, "JPEG", quality=95)
        img_w, img_h = img.size
        img.close()

        page_w, page_h = letter
        scale = min(page_w / img_w, page_h / img_h, 1.0)
        draw_w, draw_h = img_w * scale, img_h * scale
        x = (page_w - draw_w) / 2
        y = (page_h - draw_h) / 2

        c = rl_canvas.Canvas(output_path, pagesize=letter)
        c.drawImage(temp_jpg, x, y, draw_w, draw_h)
        c.save()

        try:
            os.remove(temp_jpg)
        except OSError:
            pass

    def _docx_to_pdf(self, docx_path: str, output_path: str) -> None:
        """Convert a DOCX file to PDF via text extraction + ReportLab."""
        try:
            from docx import Document as DocxDocument  # type: ignore
            from reportlab.lib.pagesizes import letter  # type: ignore
            from reportlab.lib.styles import getSampleStyleSheet  # type: ignore
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer  # type: ignore

            doc = DocxDocument(docx_path)
            styles = getSampleStyleSheet()
            story = []
            for para in doc.paragraphs:
                if para.text.strip():
                    story.append(Paragraph(para.text, styles["Normal"]))
                    story.append(Spacer(1, 6))

            if not story:
                story.append(Paragraph("(Empty document)", styles["Normal"]))

            pdf_doc = SimpleDocTemplate(output_path, pagesize=letter)
            pdf_doc.build(story)
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Failed to convert DOCX: {exc}"
            )

    def _convert_to_pdf(
        self, source_path: str, output_path: str, mime_type: str, rotation: int = 0
    ) -> None:
        """Dispatch to the appropriate converter based on MIME type."""
        if mime_type.startswith("image/"):
            self._image_to_pdf(source_path, output_path, rotation=rotation)
        elif "wordprocessingml" in mime_type:
            self._docx_to_pdf(source_path, output_path)
        else:
            raise HTTPException(
                status_code=400, detail=f"Cannot convert {mime_type} to PDF"
            )

    # ------------------------------------------------------------------
    # Document CRUD
    # ------------------------------------------------------------------

    def upload_document(
        self,
        company_id: UUID,
        user_id: UUID,
        file: UploadFile,
        name: Optional[str] = None,
        rotation: int = 0,
    ) -> PdfDocument:
        """Accept an uploaded file, convert to PDF if needed, persist record."""
        if file.content_type not in ALLOWED_CONVERT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}",
            )

        content = file.file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400, detail="File too large. Maximum size is 50 MB."
            )

        doc_id = uuid.uuid4()
        doc_dir = self._document_dir(company_id, doc_id)
        is_pdf = file.content_type == "application/pdf"

        if is_pdf:
            file_path = os.path.join(doc_dir, "document.pdf")
            with open(file_path, "wb") as fh:
                fh.write(content)
        else:
            ext = (
                file.filename.rsplit(".", 1)[-1]
                if file.filename and "." in file.filename
                else "bin"
            )
            original_path = os.path.join(doc_dir, f"original.{ext}")
            with open(original_path, "wb") as fh:
                fh.write(content)
            file_path = os.path.join(doc_dir, "document.pdf")
            self._convert_to_pdf(original_path, file_path, file.content_type, rotation=rotation)

        page_count = self._page_count(file_path)
        pdf_size = os.path.getsize(file_path)

        thumb_path = os.path.join(doc_dir, "thumbnail.png")
        self._generate_thumbnail(file_path, thumb_path)

        doc = PdfDocument(
            id=doc_id,
            company_id=company_id,
            created_by=user_id,
            name=name or file.filename or "Untitled",
            file_path=file_path,
            file_size=pdf_size,
            page_count=page_count,
            mime_type="application/pdf",
            source_type="convert" if not is_pdf else "upload",
            annotations=[],
            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def get_document(
        self, company_id: UUID, document_id: UUID
    ) -> Optional[PdfDocument]:
        return (
            self.db.query(PdfDocument)
            .filter(
                PdfDocument.id == document_id,
                PdfDocument.company_id == company_id,
                PdfDocument.is_active == True,
            )
            .first()
        )

    def get_document_or_404(self, company_id: UUID, document_id: UUID) -> PdfDocument:
        doc = self.get_document(company_id, document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return doc

    def list_documents(
        self,
        company_id: UUID,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
    ) -> tuple[list[PdfDocument], int]:
        query = self.db.query(PdfDocument).filter(
            PdfDocument.company_id == company_id,
            PdfDocument.is_active == True,
        )
        if search:
            query = query.filter(PdfDocument.name.ilike(f"%{search}%"))

        total = query.count()
        items = (
            query.order_by(PdfDocument.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        return items, total

    def rename_document(
        self, company_id: UUID, document_id: UUID, new_name: str
    ) -> PdfDocument:
        doc = self.get_document_or_404(company_id, document_id)
        doc.name = new_name
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def delete_document(self, company_id: UUID, document_id: UUID) -> bool:
        doc = self.get_document(company_id, document_id)
        if not doc:
            return False
        doc.is_active = False
        self.db.commit()
        return True

    def duplicate_document(
        self,
        company_id: UUID,
        document_id: UUID,
        user_id: UUID,
        new_name: Optional[str] = None,
    ) -> PdfDocument:
        original = self.get_document_or_404(company_id, document_id)

        new_id = uuid.uuid4()
        new_dir = self._document_dir(company_id, new_id)

        new_file = os.path.join(new_dir, "document.pdf")
        shutil.copy2(original.file_path, new_file)

        new_thumb: Optional[str] = None
        if original.thumbnail_path and os.path.exists(original.thumbnail_path):
            new_thumb = os.path.join(new_dir, "thumbnail.png")
            shutil.copy2(original.thumbnail_path, new_thumb)

        doc = PdfDocument(
            id=new_id,
            company_id=company_id,
            created_by=user_id,
            name=new_name or f"{original.name} (Copy)",
            file_path=new_file,
            file_size=original.file_size,
            page_count=original.page_count,
            mime_type=original.mime_type,
            source_type="upload",
            annotations=list(original.annotations) if original.annotations else [],
            thumbnail_path=new_thumb,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    # ------------------------------------------------------------------
    # Page operations
    # ------------------------------------------------------------------

    def merge_documents(
        self,
        company_id: UUID,
        user_id: UUID,
        document_ids: list[str],
        name: Optional[str] = None,
    ) -> PdfDocument:
        """Merge two or more documents (in given order) into a new document."""
        from pypdf import PdfReader, PdfWriter  # type: ignore

        if len(document_ids) < 2:
            raise HTTPException(
                status_code=400, detail="At least 2 documents are required for merge"
            )

        writer = PdfWriter()
        doc_names: list[str] = []

        for did in document_ids:
            doc = self.get_document(company_id, UUID(did))
            if not doc:
                raise HTTPException(
                    status_code=404, detail=f"Document {did} not found"
                )
            reader = PdfReader(doc.file_path)
            for page in reader.pages:
                writer.add_page(page)
            doc_names.append(doc.name)

        new_id = uuid.uuid4()
        new_dir = self._document_dir(company_id, new_id)
        file_path = os.path.join(new_dir, "document.pdf")

        with open(file_path, "wb") as fh:
            writer.write(fh)

        page_count = len(writer.pages)
        file_size = os.path.getsize(file_path)

        thumb_path = os.path.join(new_dir, "thumbnail.png")
        self._generate_thumbnail(file_path, thumb_path)

        label = name or f"Merged - {', '.join(doc_names[:3])}"
        doc = PdfDocument(
            id=new_id,
            company_id=company_id,
            created_by=user_id,
            name=label,
            file_path=file_path,
            file_size=file_size,
            page_count=page_count,
            mime_type="application/pdf",
            source_type="merge",
            annotations=[],
            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def reorder_pages(
        self, company_id: UUID, document_id: UUID, page_order: list[int]
    ) -> PdfDocument:
        """Reorder pages using 0-indexed page_order list."""
        from pypdf import PdfReader, PdfWriter  # type: ignore

        doc = self.get_document_or_404(company_id, document_id)
        reader = PdfReader(doc.file_path)

        if sorted(page_order) != list(range(len(reader.pages))):
            raise HTTPException(
                status_code=400,
                detail="page_order must be a permutation of 0-indexed page indices",
            )

        writer = PdfWriter()
        for idx in page_order:
            writer.add_page(reader.pages[idx])

        with open(doc.file_path, "wb") as fh:
            writer.write(fh)

        if doc.thumbnail_path:
            self._generate_thumbnail(doc.file_path, doc.thumbnail_path)

        doc.file_size = os.path.getsize(doc.file_path)
        doc.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def delete_pages(
        self, company_id: UUID, document_id: UUID, page_numbers: list[int]
    ) -> PdfDocument:
        """Remove pages by 1-indexed page number list."""
        from pypdf import PdfReader, PdfWriter  # type: ignore

        doc = self.get_document_or_404(company_id, document_id)
        reader = PdfReader(doc.file_path)
        total = len(reader.pages)

        to_delete = {p - 1 for p in page_numbers}
        remaining = [i for i in range(total) if i not in to_delete]

        if not remaining:
            raise HTTPException(
                status_code=400, detail="Cannot delete all pages from a document"
            )

        writer = PdfWriter()
        for idx in remaining:
            writer.add_page(reader.pages[idx])

        with open(doc.file_path, "wb") as fh:
            writer.write(fh)

        doc.page_count = len(remaining)
        doc.file_size = os.path.getsize(doc.file_path)
        if doc.thumbnail_path:
            self._generate_thumbnail(doc.file_path, doc.thumbnail_path)

        doc.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def rotate_pages(
        self, company_id: UUID, document_id: UUID, rotations: dict[str, int]
    ) -> PdfDocument:
        """Rotate selected pages.

        rotations: {"1": 90, "3": 180}  (1-indexed page number → clockwise degrees)
        Accepted degree values: 90, 180, 270.
        """
        from pypdf import PdfReader, PdfWriter  # type: ignore

        doc = self.get_document_or_404(company_id, document_id)
        reader = PdfReader(doc.file_path)
        writer = PdfWriter()

        for i, page in enumerate(reader.pages):
            key = str(i + 1)
            if key in rotations:
                degrees = rotations[key]
                if degrees not in (90, 180, 270):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid rotation {degrees} for page {key}. Use 90, 180, or 270.",
                    )
                page.rotate(degrees)
            writer.add_page(page)

        with open(doc.file_path, "wb") as fh:
            writer.write(fh)

        if doc.thumbnail_path:
            self._generate_thumbnail(doc.file_path, doc.thumbnail_path)

        doc.file_size = os.path.getsize(doc.file_path)
        doc.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(doc)
        return doc

    # ------------------------------------------------------------------
    # Annotations
    # ------------------------------------------------------------------

    def save_annotations(
        self, company_id: UUID, document_id: UUID, annotations: list
    ) -> PdfDocument:
        """Persist annotation list as JSON on the document record."""
        doc = self.get_document_or_404(company_id, document_id)
        doc.annotations = annotations
        flag_modified(doc, "annotations")
        doc.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def flatten_annotations(self, company_id: UUID, document_id: UUID) -> str:
        """Burn text annotations into the PDF pages.

        Returns the path to a new 'flattened.pdf' inside the document
        directory.  If the document has no annotations the original
        file_path is returned unchanged.
        """
        from pypdf import PdfReader, PdfWriter  # type: ignore
        from reportlab.pdfgen import canvas as rl_canvas  # type: ignore

        doc = self.get_document_or_404(company_id, document_id)

        if not doc.annotations:
            return doc.file_path

        reader = PdfReader(doc.file_path)
        writer = PdfWriter()

        by_page: dict[int, list] = {}
        for ann in doc.annotations:
            pg = ann.get("page", 0)
            by_page.setdefault(pg, []).append(ann)

        for i, page in enumerate(reader.pages):
            page_anns = by_page.get(i, [])
            if page_anns:
                media_box = page.mediabox
                pw = float(media_box.width)
                ph = float(media_box.height)

                packet = BytesIO()
                c = rl_canvas.Canvas(packet, pagesize=(pw, ph))

                for ann in page_anns:
                    ann_type = ann.get("type")
                    if ann_type == "text":
                        style = ann.get("style") or {}
                        font_size = style.get("font_size") or 12
                        color = style.get("color") or "#000000"

                        # Parse hex color → RGB floats
                        color = color.lstrip("#")
                        if len(color) == 6:
                            r = int(color[0:2], 16) / 255
                            g = int(color[2:4], 16) / 255
                            b = int(color[4:6], 16) / 255
                        else:
                            r = g = b = 0.0

                        c.setFillColorRGB(r, g, b)
                        c.setFont("Helvetica", font_size)

                        x = ann.get("x", 0)
                        # PDF coordinate origin is bottom-left; annotation Y is top-down
                        y = ph - ann.get("y", 0) - font_size
                        c.drawString(x, y, ann.get("content") or "")

                c.save()
                packet.seek(0)

                overlay_reader = PdfReader(packet)
                page.merge_page(overlay_reader.pages[0])

            writer.add_page(page)

        doc_dir = os.path.dirname(doc.file_path)
        flat_path = os.path.join(doc_dir, "flattened.pdf")
        with open(flat_path, "wb") as fh:
            writer.write(fh)

        return flat_path

    # ------------------------------------------------------------------
    # Multi-image → PDF
    # ------------------------------------------------------------------

    def images_to_pdf(
        self,
        company_id: UUID,
        user_id: UUID,
        files: list[UploadFile],
        name: Optional[str] = None,
    ) -> PdfDocument:
        """Convert a list of uploaded images into a single multi-page PDF
        (one image per page, letter size, centred).
        """
        from PIL import Image, ImageOps  # type: ignore
        from reportlab.lib.pagesizes import letter  # type: ignore
        from reportlab.pdfgen import canvas as rl_canvas  # type: ignore

        doc_id = uuid.uuid4()
        doc_dir = self._document_dir(company_id, doc_id)
        file_path = os.path.join(doc_dir, "document.pdf")

        page_w, page_h = letter
        c = rl_canvas.Canvas(file_path, pagesize=letter)
        page_count = 0

        for upload_file in files:
            content = upload_file.file.read()
            if not content:
                continue

            img = Image.open(BytesIO(content))
            # Apply EXIF orientation (phone photos are often rotated)
            img = ImageOps.exif_transpose(img)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            temp_path = os.path.join(doc_dir, f"_tmp_{page_count}.jpg")
            img.save(temp_path, "JPEG", quality=95)

            img_w, img_h = img.size
            img.close()

            scale = min(page_w / img_w, page_h / img_h, 1.0)
            draw_w, draw_h = img_w * scale, img_h * scale
            x = (page_w - draw_w) / 2
            y = (page_h - draw_h) / 2

            if page_count > 0:
                c.showPage()
            c.drawImage(temp_path, x, y, draw_w, draw_h)
            page_count += 1

            try:
                os.remove(temp_path)
            except OSError:
                pass

        if page_count == 0:
            raise HTTPException(status_code=400, detail="No valid images provided")

        c.save()

        file_size = os.path.getsize(file_path)
        thumb_path = os.path.join(doc_dir, "thumbnail.png")
        self._generate_thumbnail(file_path, thumb_path)

        doc = PdfDocument(
            id=doc_id,
            company_id=company_id,
            created_by=user_id,
            name=name or "Photos PDF",
            file_path=file_path,
            file_size=file_size,
            page_count=page_count,
            mime_type="application/pdf",
            source_type="convert",
            annotations=[],
            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    # ------------------------------------------------------------------
    # Import helpers (estimate / invoice / company-doc)
    # ------------------------------------------------------------------

    def import_estimate_as_document(
        self,
        company_id: UUID,
        user_id: UUID,
        estimate_id: str,
        template: str = "classic",
    ) -> PdfDocument:
        """Generate an estimate PDF and import it as a PdfDocument."""
        from app.core.pdf_generator import generate_estimate_pdf  # type: ignore
        from app.domains.estimate.models import Estimate  # type: ignore
        from app.domains.estimate.api import _prepare_estimate_pdf_data  # type: ignore
        from app.domains.company.models import Company  # type: ignore

        estimate = (
            self.db.query(Estimate)
            .filter(
                Estimate.id == estimate_id,
                Estimate.company_id == company_id,
            )
            .first()
        )
        if not estimate:
            raise HTTPException(status_code=404, detail="Estimate not found")

        company = self.db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        pdf_data = _prepare_estimate_pdf_data(estimate, company, self.db)
        pdf_bytes: bytes = generate_estimate_pdf(pdf_data, template)

        doc_id = uuid.uuid4()
        doc_dir = self._document_dir(company_id, doc_id)
        file_path = os.path.join(doc_dir, "document.pdf")

        with open(file_path, "wb") as fh:
            fh.write(pdf_bytes)

        page_count = self._page_count(file_path)
        file_size = os.path.getsize(file_path)
        thumb_path = os.path.join(doc_dir, "thumbnail.png")
        self._generate_thumbnail(file_path, thumb_path)

        est_number = getattr(estimate, "estimate_number", None) or estimate_id
        doc = PdfDocument(
            id=doc_id,
            company_id=company_id,
            created_by=user_id,
            name=f"Estimate {est_number}",
            file_path=file_path,
            file_size=file_size,
            page_count=page_count,
            mime_type="application/pdf",
            source_type="estimate",
            source_id=UUID(estimate_id),
            annotations=[],
            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def import_invoice_as_document(
        self,
        company_id: UUID,
        user_id: UUID,
        invoice_id: str,
        template: str = "classic",
    ) -> PdfDocument:
        """Generate an invoice PDF and import it as a PdfDocument."""
        from app.core.pdf_generator import generate_invoice_pdf  # type: ignore
        from app.domains.invoice.models import Invoice  # type: ignore
        from app.domains.invoice.api import _prepare_invoice_pdf_data  # type: ignore
        from app.domains.company.models import Company  # type: ignore

        invoice = (
            self.db.query(Invoice)
            .filter(
                Invoice.id == invoice_id,
                Invoice.company_id == company_id,
            )
            .first()
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

        company = self.db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        pdf_data = _prepare_invoice_pdf_data(invoice, company, self.db)
        pdf_bytes: bytes = generate_invoice_pdf(pdf_data, template)

        doc_id = uuid.uuid4()
        doc_dir = self._document_dir(company_id, doc_id)
        file_path = os.path.join(doc_dir, "document.pdf")

        with open(file_path, "wb") as fh:
            fh.write(pdf_bytes)

        page_count = self._page_count(file_path)
        file_size = os.path.getsize(file_path)
        thumb_path = os.path.join(doc_dir, "thumbnail.png")
        self._generate_thumbnail(file_path, thumb_path)

        inv_number = getattr(invoice, "invoice_number", None) or invoice_id
        doc = PdfDocument(
            id=doc_id,
            company_id=company_id,
            created_by=user_id,
            name=f"Invoice {inv_number}",
            file_path=file_path,
            file_size=file_size,
            page_count=page_count,
            mime_type="application/pdf",
            source_type="invoice",
            source_id=UUID(invoice_id),
            annotations=[],
            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def import_company_document(
        self,
        company_id: UUID,
        user_id: UUID,
        company_document_id: str,
    ) -> PdfDocument:
        """Copy a company library document into the user's working documents."""
        company_doc = (
            self.db.query(CompanyDocument)
            .filter(
                CompanyDocument.id == company_document_id,
                CompanyDocument.company_id == company_id,
                CompanyDocument.is_active == True,
            )
            .first()
        )
        if not company_doc:
            raise HTTPException(
                status_code=404, detail="Company document not found"
            )

        new_id = uuid.uuid4()
        new_dir = self._document_dir(company_id, new_id)
        new_file = os.path.join(new_dir, "document.pdf")
        shutil.copy2(company_doc.file_path, new_file)

        new_thumb: Optional[str] = None
        if company_doc.thumbnail_path and os.path.exists(company_doc.thumbnail_path):
            new_thumb = os.path.join(new_dir, "thumbnail.png")
            shutil.copy2(company_doc.thumbnail_path, new_thumb)

        doc = PdfDocument(
            id=new_id,
            company_id=company_id,
            created_by=user_id,
            name=company_doc.name,
            file_path=new_file,
            file_size=company_doc.file_size,
            page_count=company_doc.page_count,
            mime_type=company_doc.mime_type,
            source_type="company_doc",
            source_id=UUID(company_document_id),
            annotations=[],
            thumbnail_path=new_thumb,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)

        # Bump use count on source
        company_doc.use_count = (company_doc.use_count or 0) + 1
        company_doc.last_used_at = datetime.utcnow()
        self.db.commit()

        return doc


# ===========================================================================
# CompanyDocumentService
# ===========================================================================

class CompanyDocumentService:
    """
    Service for the company-wide document library.

    Documents here are shared templates / reference files that any
    member of a company can import into their own working documents
    via PdfEditorService.import_company_document().
    """

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _upload_dir(self, company_id: UUID) -> str:
        path = os.path.join(
            settings.STORAGE_BASE_DIR, str(company_id), "company-documents"
        )
        os.makedirs(path, exist_ok=True)
        return path

    def _document_dir(self, company_id: UUID, document_id: UUID) -> str:
        path = os.path.join(self._upload_dir(company_id), str(document_id))
        os.makedirs(path, exist_ok=True)
        return path

    def _generate_thumbnail(self, file_path: str, output_path: str) -> Optional[str]:
        try:
            from pdf2image import convert_from_path  # type: ignore

            images = convert_from_path(
                file_path, first_page=1, last_page=1, size=(300, None)
            )
            if images:
                images[0].save(output_path, "PNG")
                return output_path
        except Exception:
            pass
        return None

    def _page_count(self, file_path: str) -> int:
        try:
            from pypdf import PdfReader  # type: ignore

            return len(PdfReader(file_path).pages)
        except Exception:
            return 1

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def upload(
        self,
        company_id: UUID,
        user_id: UUID,
        file: UploadFile,
        name: str,
        description: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> CompanyDocument:
        """Upload a PDF to the company document library."""
        if file.content_type not in ALLOWED_UPLOAD_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Only PDF files are accepted. Got: {file.content_type}",
            )

        content = file.file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400, detail="File too large. Maximum size is 50 MB."
            )

        doc_id = uuid.uuid4()
        doc_dir = self._document_dir(company_id, doc_id)
        file_path = os.path.join(doc_dir, "document.pdf")

        with open(file_path, "wb") as fh:
            fh.write(content)

        page_count = self._page_count(file_path)
        file_size = os.path.getsize(file_path)

        thumb_path = os.path.join(doc_dir, "thumbnail.png")
        self._generate_thumbnail(file_path, thumb_path)

        doc = CompanyDocument(
            id=doc_id,
            company_id=company_id,
            uploaded_by=user_id,
            name=name,
            description=description,
            file_path=file_path,
            file_size=file_size,
            mime_type="application/pdf",
            page_count=page_count,
            category=category,
            tags=tags or [],
            use_count=0,
            thumbnail_path=thumb_path if os.path.exists(thumb_path) else None,
        )
        self.db.add(doc)
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def get(
        self, company_id: UUID, doc_id: UUID
    ) -> Optional[CompanyDocument]:
        return (
            self.db.query(CompanyDocument)
            .filter(
                CompanyDocument.id == doc_id,
                CompanyDocument.company_id == company_id,
                CompanyDocument.is_active == True,
            )
            .first()
        )

    def get_or_404(self, company_id: UUID, doc_id: UUID) -> CompanyDocument:
        doc = self.get(company_id, doc_id)
        if not doc:
            raise HTTPException(
                status_code=404, detail="Company document not found"
            )
        return doc

    def list(
        self,
        company_id: UUID,
        skip: int = 0,
        limit: int = 20,
        search: Optional[str] = None,
        category: Optional[str] = None,
    ) -> tuple[list[CompanyDocument], int]:
        query = self.db.query(CompanyDocument).filter(
            CompanyDocument.company_id == company_id,
            CompanyDocument.is_active == True,
        )
        if search:
            query = query.filter(CompanyDocument.name.ilike(f"%{search}%"))
        if category:
            query = query.filter(CompanyDocument.category == category)

        total = query.count()
        items = (
            query.order_by(CompanyDocument.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        return items, total

    def update(
        self,
        company_id: UUID,
        doc_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> CompanyDocument:
        doc = self.get_or_404(company_id, doc_id)
        if name is not None:
            doc.name = name
        if description is not None:
            doc.description = description
        if category is not None:
            doc.category = category
        if tags is not None:
            doc.tags = tags
            flag_modified(doc, "tags")
        doc.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(doc)
        return doc

    def delete(self, company_id: UUID, doc_id: UUID) -> bool:
        """Soft-delete a company document."""
        doc = self.get(company_id, doc_id)
        if not doc:
            return False
        doc.is_active = False
        doc.updated_at = datetime.utcnow()
        self.db.commit()
        return True

    def increment_use_count(self, company_id: UUID, doc_id: UUID) -> None:
        """Increment use_count and update last_used_at. Silent if not found."""
        doc = self.get(company_id, doc_id)
        if doc:
            doc.use_count = (doc.use_count or 0) + 1
            doc.last_used_at = datetime.utcnow()
            self.db.commit()
