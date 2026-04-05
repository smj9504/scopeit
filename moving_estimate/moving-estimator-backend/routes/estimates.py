"""
Estimates API Routes
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid
from datetime import datetime

from models.database import get_db, Estimate
from models.schemas import (
    QuickEstimateRequest, 
    EstimateResponse, 
    SaveEstimateRequest, 
    SavedEstimate,
    EstimateListResponse,
    EstimateStatus
)
from services.calculator import get_calculator

router = APIRouter()


@router.post("/quick", response_model=EstimateResponse)
async def create_quick_estimate(
    request: QuickEstimateRequest,
    db: Session = Depends(get_db)
):
    """
    Generate a quick estimate based on room configuration
    """
    calculator = get_calculator(db)
    estimate = calculator.calculate_estimate(request)
    return estimate


@router.post("/save", response_model=SavedEstimate)
async def save_estimate(
    request: SaveEstimateRequest,
    db: Session = Depends(get_db)
):
    """
    Save an estimate to the database
    """
    estimate_id = str(uuid.uuid4())[:8]
    
    db_estimate = Estimate(
        id=estimate_id,
        client_name=request.client_name,
        client_phone=request.client_phone,
        client_email=request.client_email,
        property_address=request.property_address,
        notes=request.notes,
        status=request.estimate_data.get("status", "draft"),
        grand_total=request.estimate_data.get("grand_total", 0),
        estimate_data=request.estimate_data,
    )
    
    db.add(db_estimate)
    db.commit()
    db.refresh(db_estimate)
    
    return SavedEstimate(
        id=db_estimate.id,
        created_at=db_estimate.created_at,
        updated_at=db_estimate.updated_at,
        client_name=db_estimate.client_name,
        client_phone=db_estimate.client_phone,
        client_email=db_estimate.client_email,
        property_address=db_estimate.property_address,
        notes=db_estimate.notes,
        status=EstimateStatus(db_estimate.status),
        grand_total=db_estimate.grand_total,
        estimate_data=db_estimate.estimate_data,
    )


@router.get("/", response_model=EstimateListResponse)
async def list_estimates(
    page: int = 1,
    per_page: int = 20,
    status: str = None,
    db: Session = Depends(get_db)
):
    """
    List saved estimates with pagination
    """
    query = db.query(Estimate)
    
    if status:
        query = query.filter(Estimate.status == status)
    
    total = query.count()
    estimates = query.order_by(Estimate.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    
    return EstimateListResponse(
        estimates=[
            SavedEstimate(
                id=e.id,
                created_at=e.created_at,
                updated_at=e.updated_at,
                client_name=e.client_name,
                client_phone=e.client_phone,
                client_email=e.client_email,
                property_address=e.property_address,
                notes=e.notes,
                status=EstimateStatus(e.status),
                grand_total=e.grand_total,
                estimate_data=e.estimate_data,
            )
            for e in estimates
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{estimate_id}", response_model=SavedEstimate)
async def get_estimate(
    estimate_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific estimate by ID
    """
    estimate = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    return SavedEstimate(
        id=estimate.id,
        created_at=estimate.created_at,
        updated_at=estimate.updated_at,
        client_name=estimate.client_name,
        client_phone=estimate.client_phone,
        client_email=estimate.client_email,
        property_address=estimate.property_address,
        notes=estimate.notes,
        status=EstimateStatus(estimate.status),
        grand_total=estimate.grand_total,
        estimate_data=estimate.estimate_data,
    )


@router.patch("/{estimate_id}")
async def update_estimate(
    estimate_id: str,
    request: SaveEstimateRequest,
    db: Session = Depends(get_db)
):
    """Update an existing estimate's data and metadata."""
    estimate = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")

    if request.client_name is not None:
        estimate.client_name = request.client_name
    if request.client_phone is not None:
        estimate.client_phone = request.client_phone
    if request.client_email is not None:
        estimate.client_email = request.client_email
    if request.property_address is not None:
        estimate.property_address = request.property_address
    if request.notes is not None:
        estimate.notes = request.notes
    if request.estimate_data:
        estimate.estimate_data = request.estimate_data
        estimate.grand_total = request.estimate_data.get("grand_total", estimate.grand_total)
        estimate.status = request.estimate_data.get("status", estimate.status)
    estimate.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(estimate)
    return SavedEstimate(
        id=estimate.id,
        created_at=estimate.created_at,
        updated_at=estimate.updated_at,
        client_name=estimate.client_name,
        client_phone=estimate.client_phone,
        client_email=estimate.client_email,
        property_address=estimate.property_address,
        notes=estimate.notes,
        status=EstimateStatus(estimate.status),
        grand_total=estimate.grand_total,
        estimate_data=estimate.estimate_data,
    )


@router.patch("/{estimate_id}/status")
async def update_estimate_status(
    estimate_id: str,
    status: EstimateStatus,
    db: Session = Depends(get_db)
):
    """
    Update estimate status
    """
    estimate = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    estimate.status = status.value
    estimate.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Status updated", "status": status.value}


@router.delete("/{estimate_id}")
async def delete_estimate(
    estimate_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete an estimate
    """
    estimate = db.query(Estimate).filter(Estimate.id == estimate_id).first()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")
    
    db.delete(estimate)
    db.commit()
    
    return {"message": "Estimate deleted"}
