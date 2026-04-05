"""
ScopeIt - Packing & Moving Estimator Tool API
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.domains.user.models import User
from app.domains.tools.dependencies import require_tool_access
from app.domains.tools.modules.packing.service import EstimateCalculator
from app.domains.tools.modules.packing.schemas import (
    QuickEstimateRequest, EstimateResponse,
    RoomPhotoAnalysisRequest, RoomAnalysisResponse,
    RoomsEstimateRequest,
    SubmitCorrectionsRequest, SubmitCorrectionsResponse,
    MasterContentRequest, MasterContentResponse,
    ExportRequest,
    ReportExportRequest,
    BatchRoomAnalysisRequest,
    BatchRoomEvent, BatchCompleteEvent,
    RoomAnalysisStatus,
)
from app.domains.tools.modules.packing.presets import get_all_presets, get_presets_by_category

try:
    from app.domains.tools.modules.packing.export import (
        generate_estimate_pdf, generate_estimate_excel,
        generate_report_pdf, build_company_info,
    )
except ImportError:
    generate_estimate_pdf = None
    generate_estimate_excel = None
    generate_report_pdf = None
    build_company_info = None

router = APIRouter()
_gate = require_tool_access("packing")


@router.post("/quick-estimate", response_model=EstimateResponse)
async def quick_estimate(
    request: QuickEstimateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Generate a quick estimate from room presets and configuration."""
    calculator = EstimateCalculator(db, current_user.company_id)
    return calculator.calculate_estimate(request)


@router.post("/content-estimate", response_model=EstimateResponse)
async def content_estimate(
    request: RoomsEstimateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Generate an estimate from a detailed per-room item inventory."""
    calculator = EstimateCalculator(db, current_user.company_id)
    return calculator.calculate_estimate_from_content(request)


@router.post("/analyze-room", response_model=RoomAnalysisResponse)
async def analyze_room(
    request: RoomPhotoAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Analyze room photos using Claude Vision to produce an itemized content list."""
    from app.domains.tools.modules.packing import vision

    try:
        logger.info("analyze-room: room=%s, images=%d", request.room_name, len(request.images))
        result = await vision.analyze_room_photos(
            room_name=request.room_name,
            images=request.images,
            existing_items=request.existing_items,
        )
        logger.info("analyze-room: success, items=%d", len(result.items))
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("analyze-room failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=f"Room photo analysis is currently unavailable: {exc}",
        ) from exc


@router.post("/analyze-batch")
async def analyze_batch(
    request: BatchRoomAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Stream batch room analysis results as SSE.

    Each room emits one 'room_result' event. A final
    'batch_complete' event is always emitted.
    """
    import asyncio
    from app.domains.tools.modules.packing import vision
    from app.core.config import settings as app_settings

    delay = app_settings.VISION_BATCH_INTER_ROOM_DELAY
    total = len(request.rooms)
    batch_id = request.batch_id

    async def event_stream():
        succeeded = 0
        failed = 0
        failed_rooms: list[str] = []

        for idx, room_req in enumerate(request.rooms):
            result, err_code, err_msg = (
                await vision.analyze_room_with_retry(
                    room_name=room_req.room_name,
                    images=room_req.images,
                    existing_items=room_req.existing_items,
                    max_retries=(
                        app_settings.VISION_RATE_LIMIT_RETRIES
                    ),
                    base_delay=(
                        app_settings.VISION_RATE_LIMIT_BASE_DELAY
                    ),
                )
            )

            if result is not None:
                succeeded += 1
                event = BatchRoomEvent(
                    batch_id=batch_id,
                    room_index=idx,
                    total_rooms=total,
                    status=RoomAnalysisStatus.SUCCESS,
                    room_name=room_req.room_name,
                    result=result,
                )
            else:
                failed += 1
                failed_rooms.append(room_req.room_name)
                event = BatchRoomEvent(
                    batch_id=batch_id,
                    room_index=idx,
                    total_rooms=total,
                    status=RoomAnalysisStatus.ERROR,
                    room_name=room_req.room_name,
                    error_code=err_code,
                    error_message=err_msg,
                )

            payload = event.model_dump_json(
                exclude_none=True,
            )
            yield (
                f"event: room_result\n"
                f"data: {payload}\n\n"
            )

            if idx < total - 1:
                await asyncio.sleep(delay)

        complete = BatchCompleteEvent(
            batch_id=batch_id,
            total_rooms=total,
            succeeded=succeeded,
            failed=failed,
            failed_rooms=failed_rooms,
        )
        yield (
            f"event: batch_complete\n"
            f"data: {complete.model_dump_json()}\n\n"
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/master-content", response_model=MasterContentResponse)
async def master_content(
    request: MasterContentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Aggregate per-room item lists into a single master content inventory."""
    from app.domains.tools.modules.packing import vision

    try:
        return vision.build_master_content_list(request.rooms)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Master content aggregation failed: {exc}",
        ) from exc


@router.post("/corrections", response_model=SubmitCorrectionsResponse)
async def submit_corrections(
    request: SubmitCorrectionsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Store analyst corrections for detected room items.

    Corrections are associated with the session when a session_id is provided.
    Returns the count of corrections saved.
    """
    if request.session_id:
        from app.domains.tools.service import ToolSessionService
        from uuid import UUID

        session_service = ToolSessionService(db)
        try:
            session_id = UUID(request.session_id)
            tool_session = session_service.get_session(session_id, current_user.company_id)

            existing_data: dict = tool_session.data or {}
            corrections_store: list = existing_data.get("corrections", [])
            corrections_store.append({
                "room_name": request.room_name,
                "corrections": [c.model_dump() for c in request.corrections],
            })
            existing_data["corrections"] = corrections_store
            session_service.update_session_data(
                session_id=session_id,
                company_id=current_user.company_id,
                data=existing_data,
            )
        except Exception:
            # Non-fatal: session storage failure should not block the workflow
            pass

    return SubmitCorrectionsResponse(saved=len(request.corrections))


@router.post("/export/pdf")
async def export_pdf(
    request: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Export a saved estimate session as a PDF attachment."""
    if generate_estimate_pdf is None:
        raise HTTPException(
            status_code=503,
            detail="PDF export is unavailable. The 'reportlab' package is not installed.",
        )

    from app.domains.tools.service import ToolSessionService
    from app.domains.company.models import Company
    from uuid import UUID

    session_service = ToolSessionService(db)
    tool_session = session_service.get_session(
        UUID(request.session_id), current_user.company_id
    )

    company = (
        db.query(Company)
        .filter(Company.id == current_user.company_id)
        .first()
    )

    override_dict = request.company_override.model_dump() if request.company_override else None
    company_info = build_company_info(company, override_dict)
    session_data = tool_session.data or {}
    client_info = session_data.get("client_info", {})
    settings = session_data.get("settings", {})

    # Merge result with settings so export has access to storage_months,
    # include_packback, staging_type, crew_size, etc.
    estimate_data = {**settings, **(session_data.get("result") or session_data)}

    pdf_bytes = generate_estimate_pdf(
        estimate_data=estimate_data,
        client_name=client_info.get("name"),
        client_phone=client_info.get("phone"),
        client_email=client_info.get("email"),
        property_address=client_info.get("property_address"),
        company_info=company_info,
        tax_rate=request.tax_rate,
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="estimate-{request.session_id[:8]}.pdf"'
            )
        },
    )


@router.post("/export/excel")
async def export_excel(
    request: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Export a saved estimate session as an Excel attachment."""
    if generate_estimate_excel is None:
        raise HTTPException(
            status_code=503,
            detail="Excel export is unavailable. The required export package is not installed.",
        )

    from app.domains.tools.service import ToolSessionService
    from app.domains.company.models import Company
    from uuid import UUID

    session_service = ToolSessionService(db)
    tool_session = session_service.get_session(
        UUID(request.session_id), current_user.company_id
    )

    company = (
        db.query(Company)
        .filter(Company.id == current_user.company_id)
        .first()
    )

    override_dict = request.company_override.model_dump() if request.company_override else None
    company_info = build_company_info(company, override_dict)
    session_data = tool_session.data or {}
    client_info = session_data.get("client_info", {})
    settings = session_data.get("settings", {})

    # Merge result with settings so export has access to storage_months,
    # include_packback, staging_type, crew_size, etc.
    estimate_data = {**settings, **(session_data.get("result") or session_data)}

    excel_bytes = generate_estimate_excel(
        estimate_data=estimate_data,
        client_name=client_info.get("name"),
        client_phone=client_info.get("phone"),
        client_email=client_info.get("email"),
        property_address=client_info.get("property_address"),
        company_info=company_info,
        tax_rate=request.tax_rate,
    )

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f'attachment; filename="estimate-{request.session_id[:8]}.xlsx"'
            )
        },
    )


@router.post("/export/report")
async def export_report(
    request: ReportExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Export a packing report PDF with selectable sections."""
    if generate_report_pdf is None:
        raise HTTPException(
            status_code=503,
            detail="Report export unavailable. "
                   "Required packages not installed.",
        )

    from app.domains.tools.service import ToolSessionService
    from app.domains.company.models import Company
    from uuid import UUID

    session_service = ToolSessionService(db)
    tool_session = session_service.get_session(
        UUID(request.session_id), current_user.company_id,
    )

    company = (
        db.query(Company)
        .filter(Company.id == current_user.company_id)
        .first()
    )

    override_dict = (
        request.company_override.model_dump()
        if request.company_override else None
    )
    company_info = build_company_info(company, override_dict)
    session_data = tool_session.data or {}
    client_info = session_data.get("client_info", {})

    # Build rooms data from request or fall back to session
    rooms_data = []
    if request.rooms:
        rooms_data = [r.model_dump() for r in request.rooms]
    else:
        # Auto-build from session photo_rooms or room_summaries
        photo_rooms = session_data.get("photo_rooms", [])
        result = session_data.get("result", {})
        room_summaries = result.get("room_summaries", [])

        if photo_rooms:
            for pr in photo_rooms:
                # Convert stored base64 photos to report format
                raw_photos = pr.get("photos", [])
                report_photos = [
                    {
                        "image": p,
                        "caption": "",
                        "is_damage": False,
                    }
                    for p in raw_photos
                    if isinstance(p, str) and len(p) > 100
                ]
                rooms_data.append({
                    "room_name": pr.get("room_name", ""),
                    "items": pr.get("items", []),
                    "photos": report_photos,
                    "field_notes": pr.get(
                        "field_notes", [],
                    ),
                    "labor_hours": None,
                    "labor_notes": "",
                })
        elif room_summaries:
            for rs in room_summaries:
                rooms_data.append({
                    "room_name": rs.get("room_name", ""),
                    "items": [],
                    "photos": [],
                    "field_notes": rs.get(
                        "packing_notes", [],
                    ),
                    "labor_hours": None,
                    "labor_notes": "",
                })

    sections_cfg = (
        request.sections.model_dump()
        if request.sections else {}
    )

    pdf_bytes = generate_report_pdf(
        session_data=session_data,
        rooms_data=rooms_data,
        sections_config=sections_cfg,
        client_name=client_info.get("name"),
        client_phone=client_info.get("phone"),
        client_email=client_info.get("email"),
        property_address=client_info.get("property_address"),
        company_info=company_info,
        tax_rate=request.tax_rate,
        notes=request.notes,
        include_signature_page=request.include_signature_page,
        image_quality=request.image_quality,
        max_image_width=request.max_image_width,
    )

    sid = request.session_id[:8]
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="report-{sid}.pdf"'
            )
        },
    )


@router.get("/presets")
async def get_presets(
    current_user: User = Depends(_gate),
):
    """Return all room presets grouped by category."""
    return get_presets_by_category()


@router.get("/prices")
async def get_prices(
    db: Session = Depends(get_db),
    current_user: User = Depends(_gate),
):
    """Return the company's Moving line items from the line item library."""
    from app.domains.line_item.models import LineItem

    items = (
        db.query(LineItem)
        .filter(
            LineItem.company_id == current_user.company_id,
            LineItem.is_active == True,
            LineItem.tool_id == "packing",
        )
        .order_by(LineItem.cat, LineItem.name)
        .all()
    )

    return [
        {
            "id": str(item.id),
            "code": item.code,
            "name": item.name,
            "unit": item.unit,
            "unit_price": float(item.unit_price),
            "cat": item.cat,
            "is_taxable": item.is_taxable,
        }
        for item in items
    ]
