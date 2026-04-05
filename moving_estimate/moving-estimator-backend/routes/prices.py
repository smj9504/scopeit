"""
Prices API Routes
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict
from datetime import datetime

from models.database import get_db, Price, RoomPreset
from models.schemas import PriceItem, PriceCreateRequest, PriceUpdateRequest, PriceListResponse

router = APIRouter()


@router.get("/", response_model=PriceListResponse)
async def get_all_prices(db: Session = Depends(get_db)):
    """
    Get all unit prices
    """
    prices = db.query(Price).all()

    # Get latest update time
    latest = max([p.updated_at for p in prices]) if prices else datetime.utcnow()

    return PriceListResponse(
        prices={
            p.code: PriceItem(
                code=p.code,
                name=p.name,
                category=p.category,
                unit=p.unit,
                price=p.price,
            )
            for p in prices
        },
        last_updated=latest,
    )


@router.get("/by-category")
async def get_prices_by_category(db: Session = Depends(get_db)):
    """
    Get prices organized by category
    """
    prices = db.query(Price).all()

    categories = {}
    for p in prices:
        if p.category not in categories:
            categories[p.category] = []
        categories[p.category].append({
            "code": p.code,
            "name": p.name,
            "unit": p.unit,
            "price": p.price,
        })

    return categories


@router.get("/presets/rooms")
async def get_room_presets(db: Session = Depends(get_db)):
    """
    Get all room presets
    """
    presets = db.query(RoomPreset).all()

    # Organize by category
    by_category = {}
    for p in presets:
        if p.category not in by_category:
            by_category[p.category] = []
        by_category[p.category].append({
            "key": p.key,
            "name": p.name,
            "size": p.size,
            "base_items": p.base_items,
            "default_hints": p.default_hints,
            "mattress": p.mattress,
        })

    return by_category


@router.get("/{code}")
async def get_price(code: str, db: Session = Depends(get_db)):
    """
    Get a specific price by code
    """
    price = db.query(Price).filter(Price.code == code).first()

    if not price:
        raise HTTPException(status_code=404, detail="Price not found")

    return PriceItem(
        code=price.code,
        name=price.name,
        category=price.category,
        unit=price.unit,
        price=price.price,
    )


@router.post("/", status_code=201)
async def create_price(
    request: PriceCreateRequest,
    db: Session = Depends(get_db)
):
    """
    Create a new price item
    """
    existing = db.query(Price).filter(Price.code == request.code).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Price with code '{request.code}' already exists")

    price = Price(
        code=request.code,
        name=request.name,
        category=request.category,
        unit=request.unit,
        price=request.price,
    )
    db.add(price)
    db.commit()

    return PriceItem(
        code=price.code,
        name=price.name,
        category=price.category,
        unit=price.unit,
        price=price.price,
    )


@router.put("/bulk")
async def bulk_update_prices(
    prices: Dict[str, float],
    db: Session = Depends(get_db)
):
    """
    Update multiple prices at once
    """
    updated = []

    for code, new_price in prices.items():
        price = db.query(Price).filter(Price.code == code).first()
        if price:
            price.price = new_price
            price.updated_at = datetime.utcnow()
            updated.append(code)

    db.commit()

    return {
        "message": f"Updated {len(updated)} prices",
        "updated_codes": updated,
    }


@router.put("/{code}")
async def update_price(
    code: str,
    request: PriceUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Update a price (name, price, category, unit)
    """
    price = db.query(Price).filter(Price.code == code).first()

    if not price:
        raise HTTPException(status_code=404, detail="Price not found")

    if request.name is not None:
        price.name = request.name
    if request.price is not None:
        price.price = request.price
    if request.category is not None:
        price.category = request.category
    if request.unit is not None:
        price.unit = request.unit
    price.updated_at = datetime.utcnow()
    db.commit()

    return PriceItem(
        code=price.code,
        name=price.name,
        category=price.category,
        unit=price.unit,
        price=price.price,
    )
