"""
Export API Routes
Generate PDF and Excel files from estimates
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field
import io

from models.database import get_db, Estimate
from models.schemas import QuickEstimateRequest, EstimateResponse
from services.calculator import get_calculator
from services.export import (
    generate_estimate_pdf,
    generate_estimate_excel,
    generate_inventory_excel,
)

def _get_db_prices(db: Session) -> dict:
    """Load prices from DB via calculator for export functions."""
    try:
        calc = get_calculator(db)
        return calc.get_prices_dict()
    except Exception:
        return {}

router = APIRouter()


class CompanyInfo(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    license: Optional[str] = None


class DirectExportRequest(BaseModel):
    estimate_data: dict
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    property_address: Optional[str] = None
    notes: Optional[str] = None
    company_info: Optional[CompanyInfo] = None
    estimate_number: Optional[str] = None
    tax_rate: Optional[float] = 0
    area_breakdown: Optional[str] = None


@router.post("/direct/pdf")
async def export_direct_pdf(request: DirectExportRequest, db: Session = Depends(get_db)):
    """Generate PDF from raw estimate data"""
    company_info = request.company_info.model_dump() if request.company_info else None

    pdf_bytes = generate_estimate_pdf(
        estimate_data=request.estimate_data,
        client_name=request.client_name,
        client_phone=request.client_phone,
        client_email=request.client_email,
        property_address=request.property_address,
        notes=request.notes,
        company_info=company_info,
        estimate_number=request.estimate_number,
        tax_rate=request.tax_rate or 0,
        area_breakdown=request.area_breakdown,
        prices=_get_db_prices(db),
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=estimate.pdf"}
    )


@router.post("/direct/excel")
async def export_direct_excel(request: DirectExportRequest, db: Session = Depends(get_db)):
    """Generate Excel from raw estimate data"""
    company_info = request.company_info.model_dump() if request.company_info else None

    excel_bytes = generate_estimate_excel(
        estimate_data=request.estimate_data,
        client_name=request.client_name,
        client_phone=request.client_phone,
        client_email=request.client_email,
        property_address=request.property_address,
        notes=request.notes,
        company_info=company_info,
        estimate_number=request.estimate_number,
        tax_rate=request.tax_rate or 0,
        prices=_get_db_prices(db),
    )
    
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=estimate.xlsx"}
    )


@router.get("/saved/{estimate_id}/pdf")
async def export_saved_estimate_pdf(
    estimate_id: str,
    company_name: Optional[str] = Query(None),
    company_address: Optional[str] = Query(None),
    company_phone: Optional[str] = Query(None),
    company_email: Optional[str] = Query(None),
    tax_rate: Optional[float] = Query(0),
    db: Session = Depends(get_db)
):
    """Generate PDF from saved estimate"""
    estimate = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    company_info = None
    if company_name:
        company_info = {
            'name': company_name,
            'address': company_address,
            'phone': company_phone,
            'email': company_email,
        }
    
    pdf_bytes = generate_estimate_pdf(
        estimate_data=estimate.estimate_data,
        client_name=estimate.client_name,
        client_phone=getattr(estimate, 'client_phone', None),
        client_email=getattr(estimate, 'client_email', None),
        property_address=estimate.property_address,
        notes=estimate.notes,
        company_info=company_info,
        tax_rate=tax_rate,
        prices=_get_db_prices(db),
    )
    
    filename = f"estimate_{estimate.id}"
    if estimate.client_name:
        safe_name = "".join(c for c in estimate.client_name if c.isalnum() or c in (' ', '-', '_')).strip()
        filename = f"estimate_{safe_name[:30]}"
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
    )


@router.get("/saved/{estimate_id}/excel")
async def export_saved_estimate_excel(
    estimate_id: str,
    company_name: Optional[str] = Query(None),
    company_address: Optional[str] = Query(None),
    company_phone: Optional[str] = Query(None),
    company_email: Optional[str] = Query(None),
    tax_rate: Optional[float] = Query(0),
    db: Session = Depends(get_db)
):
    """Generate Excel from saved estimate"""
    estimate = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    company_info = None
    if company_name:
        company_info = {
            'name': company_name,
            'address': company_address,
            'phone': company_phone,
            'email': company_email,
        }
    
    excel_bytes = generate_estimate_excel(
        estimate_data=estimate.estimate_data,
        client_name=estimate.client_name,
        client_phone=getattr(estimate, 'client_phone', None),
        client_email=getattr(estimate, 'client_email', None),
        property_address=estimate.property_address,
        notes=estimate.notes,
        company_info=company_info,
        tax_rate=tax_rate,
        prices=_get_db_prices(db),
    )
    
    filename = f"estimate_{estimate.id}"
    if estimate.client_name:
        safe_name = "".join(c for c in estimate.client_name if c.isalnum() or c in (' ', '-', '_')).strip()
        filename = f"estimate_{safe_name[:30]}"
    
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"}
    )


# ============================================
# PACK-OUT INVENTORY EXPORT
# ============================================

class InventoryExportRequest(BaseModel):
    rooms: List[Dict[str, Any]] = Field(
        ...,
        description="List of room analysis results"
    )
    property_address: Optional[str] = None
    claim_number: Optional[str] = None
    prepared_by: Optional[str] = None


@router.post("/inventory/excel")
async def export_inventory_excel(
    request: InventoryExportRequest,
):
    """Generate Pack-Out Inventory Excel from room analysis
    data.  Matches the professional 12-column format with
    room sections, labor hours, flags, and field notes."""
    if not request.rooms:
        raise HTTPException(
            status_code=400, detail="No rooms provided"
        )

    excel_bytes = generate_inventory_excel(
        rooms=request.rooms,
        property_address=request.property_address or "",
        claim_number=request.claim_number or "",
        prepared_by=request.prepared_by or "",
    )

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type=(
            "application/vnd.openxmlformats-"
            "officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition":
                "attachment; filename=packout_inventory.xlsx"
        },
    )
