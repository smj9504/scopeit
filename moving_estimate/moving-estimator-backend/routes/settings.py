"""
Settings API Routes
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from models.database import get_db, Settings

router = APIRouter()


class CompanyInfo(BaseModel):
    name: Optional[str] = ''
    address: Optional[str] = ''
    phone: Optional[str] = ''
    email: Optional[str] = ''


COMPANY_KEY = "company_info"
PHOTO_KEY   = "photo_settings"

PHOTO_DEFAULTS = {"dedup_threshold": 0.95, "max_images": 6}


@router.get("/company")
async def get_company_info(db: Session = Depends(get_db)):
    row = db.query(Settings).filter(Settings.key == COMPANY_KEY).first()
    if not row:
        return {"name": "", "address": "", "phone": "", "email": ""}
    return row.value


@router.put("/company")
async def save_company_info(data: CompanyInfo, db: Session = Depends(get_db)):
    row = db.query(Settings).filter(Settings.key == COMPANY_KEY).first()
    if row:
        row.value = data.model_dump()
        row.updated_at = datetime.utcnow()
    else:
        row = Settings(key=COMPANY_KEY, value=data.model_dump())
        db.add(row)
    db.commit()
    return row.value


class PhotoSettings(BaseModel):
    dedup_threshold: float = 0.95  # 0.80–1.00
    max_images: int = 6            # 2–10


@router.get("/photo")
async def get_photo_settings(db: Session = Depends(get_db)):
    row = db.query(Settings).filter(Settings.key == PHOTO_KEY).first()
    if not row:
        return PHOTO_DEFAULTS
    return {**PHOTO_DEFAULTS, **row.value}


@router.put("/photo")
async def save_photo_settings(data: PhotoSettings, db: Session = Depends(get_db)):
    row = db.query(Settings).filter(Settings.key == PHOTO_KEY).first()
    if row:
        row.value = data.model_dump()
        row.updated_at = datetime.utcnow()
    else:
        row = Settings(key=PHOTO_KEY, value=data.model_dump())
        db.add(row)
    db.commit()
    return row.value
