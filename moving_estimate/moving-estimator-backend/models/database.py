"""
Database Models and Setup
Using SQLite with SQLAlchemy
"""

import os
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, Text, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./moving_estimator.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ============================================
# DATABASE MODELS
# ============================================

class Estimate(Base):
    __tablename__ = "estimates"
    
    id = Column(String, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    client_name = Column(String, nullable=True)
    client_phone = Column(String, nullable=True)
    client_email = Column(String, nullable=True)
    property_address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    
    status = Column(String, default="draft")
    grand_total = Column(Float)
    
    # Store full estimate data as JSON
    estimate_data = Column(JSON)


class Price(Base):
    __tablename__ = "prices"
    
    code = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Settings(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RoomPreset(Base):
    __tablename__ = "room_presets"

    key = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    size = Column(String, nullable=False)
    base_items = Column(Integer, nullable=False)
    default_hints = Column(JSON)
    mattress = Column(String, nullable=True)


class EstimatePhoto(Base):
    __tablename__ = "estimate_photos"

    id = Column(String, primary_key=True)
    estimate_id = Column(String, nullable=False, index=True)
    room_id = Column(String, nullable=False)
    room_name = Column(String, nullable=True)
    photo_id = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)   # e.g. /uploads/{est_id}/{room_id}/{photo_id}.jpg
    created_at = Column(DateTime, default=datetime.utcnow)


class ItemCorrection(Base):
    __tablename__ = "item_corrections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=True, index=True)
    room_name = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    corrected_name = Column(String, nullable=True)
    original_category = Column(String, nullable=True)
    corrected_category = Column(String, nullable=True)
    original_qty = Column(Integer, nullable=True)
    corrected_qty = Column(Integer, nullable=True)
    action = Column(String, nullable=False, default="edit")  # 'edit' | 'delete' | 'add'
    match_confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================
# DATABASE FUNCTIONS
# ============================================

def create_tables():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Seed default prices if empty, otherwise add any missing defaults
        if db.query(Price).count() == 0:
            seed_default_prices(db)
        else:
            seed_missing_prices(db)
        if db.query(RoomPreset).count() == 0:
            seed_room_presets(db)
        else:
            seed_missing_presets(db)  # Add new presets to existing DB
        # Reset storage rate to $2.18/SF if out of valid range (1.0 – 10.0 $/SF/mo)
        storage_price = db.query(Price).filter(
            Price.code == "2840"
        ).first()
        if storage_price and not (1.0 <= storage_price.price <= 10.0):
            storage_price.price = 2.18
            db.commit()
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================
# SEED DATA
# ============================================

def seed_default_prices(db):
    """Seed database with default Xactimate prices"""
    default_prices = [
        # Labor (VAAR8X_MAR26)
        {"code": "2825", "name": "Content Manipulation", "category": "labor", "unit": "HR", "price": 57.31},
        {"code": "2911", "name": "Supervisor/Admin", "category": "labor", "unit": "HR", "price": 87.14},

        # Room rates (composite — not in Xactimate CPS list, keep as reference)
        {"code": "2833", "name": "Small Room Pack/Reset", "category": "room", "unit": "EA", "price": 74.52},
        {"code": "2834", "name": "Large Room Pack/Reset", "category": "room", "unit": "EA", "price": 148.80},
        {"code": "2835", "name": "Extra Large Room Pack/Reset", "category": "room", "unit": "EA", "price": 297.60},

        # Boxes (VAAR8X_MAR26)
        {"code": "3026", "name": "Small Box (1.5cf)", "category": "box", "unit": "EA", "price": 2.95},
        {"code": "3025", "name": "Medium Box (3.0cf)", "category": "box", "unit": "EA", "price": 3.91},
        {"code": "3027", "name": "Large Box (4.5cf)", "category": "box", "unit": "EA", "price": 5.28},
        {"code": "3028", "name": "XL Box (6.0cf)", "category": "box", "unit": "EA", "price": 7.48},
        {"code": "3029", "name": "Book Box", "category": "box", "unit": "EA", "price": 2.84},
        {"code": "3030", "name": "Dish Pack", "category": "box", "unit": "EA", "price": 9.98},
        {"code": "3039", "name": "Wardrobe Box", "category": "box", "unit": "EA", "price": 18.48},
        {"code": "3039S", "name": "Wardrobe Box - Small", "category": "box", "unit": "EA", "price": 16.01},
        {"code": "3039L", "name": "Wardrobe Box - Large", "category": "box", "unit": "EA", "price": 27.89},
        {"code": "3033", "name": "Mirror/Picture Box", "category": "box", "unit": "EA", "price": 10.29},
        {"code": "3899", "name": "TV Box", "category": "box", "unit": "EA", "price": 28.53},
        {"code": "3031", "name": "Lamp Box Set", "category": "box", "unit": "EA", "price": 8.91},

        # Mattress (VAAR8X_MAR26)
        {"code": "3876", "name": "Mattress Bag - Twin", "category": "mattress", "unit": "EA", "price": 6.12},
        {"code": "3905", "name": "Mattress Bag - Full", "category": "mattress", "unit": "EA", "price": 8.36},
        {"code": "3877", "name": "Mattress Bag - Queen", "category": "mattress", "unit": "EA", "price": 9.07},
        {"code": "3878", "name": "Mattress Bag - King", "category": "mattress", "unit": "EA", "price": 10.08},

        # Protective (VAAR8X_MAR26)
        {"code": "2915", "name": "Moving Blanket", "category": "protective", "unit": "EA", "price": 9.07},
        {"code": "2916", "name": "Furniture Pad", "category": "protective", "unit": "EA", "price": 18.26},
        {"code": "2917", "name": "Chair Cover", "category": "protective", "unit": "EA", "price": 5.31},
        {"code": "2918", "name": "Couch/Sofa Cover", "category": "protective", "unit": "EA", "price": 8.57},
        {"code": "3023", "name": "Bubble Wrap 12\"", "category": "protective", "unit": "RL", "price": 11.00},
        {"code": "3018", "name": "Bubble Wrap 24\"", "category": "protective", "unit": "RL", "price": 22.00},
        {"code": "3089", "name": "Packing Paper Bundle", "category": "protective", "unit": "BN", "price": 87.45},
        {"code": "2936", "name": "Shrink Wrap 20\"", "category": "protective", "unit": "RL", "price": 29.83},
        {"code": "3022", "name": "Corner Protectors (100)", "category": "protective", "unit": "BX", "price": 35.17},

        # Transport & Storage (VAAR8X_MAR26)
        {"code": "2932", "name": "Moving Van 14'-15'", "category": "transport", "unit": "EA", "price": 172.36},
        {"code": "2933", "name": "Moving Van 16'-20'", "category": "transport", "unit": "EA", "price": 179.25},
        {"code": "2934", "name": "Moving Van 26'", "category": "transport", "unit": "EA", "price": 197.36},
        {"code": "2935", "name": "Cargo Van", "category": "transport", "unit": "EA", "price": 156.69},
        {"code": "2840", "name": "Climate-Controlled Storage", "category": "storage", "unit": "SF", "price": 2.18},
        {"code": "2844", "name": "Padlock", "category": "storage", "unit": "EA", "price": 16.05},
    ]
    
    for p in default_prices:
        db.add(Price(**p))
    db.commit()


def seed_missing_prices(db):
    """Add any missing default prices to existing DB (preserves user-modified prices)."""
    default_prices = [
        {"code": "2825", "name": "Content Manipulation", "category": "labor", "unit": "HR", "price": 57.31},
        {"code": "2911", "name": "Supervisor/Admin", "category": "labor", "unit": "HR", "price": 87.14},
        {"code": "2833", "name": "Small Room Pack/Reset", "category": "room", "unit": "EA", "price": 74.52},
        {"code": "2834", "name": "Large Room Pack/Reset", "category": "room", "unit": "EA", "price": 148.80},
        {"code": "2835", "name": "Extra Large Room Pack/Reset", "category": "room", "unit": "EA", "price": 297.60},
        {"code": "3026", "name": "Small Box (1.5cf)", "category": "box", "unit": "EA", "price": 2.95},
        {"code": "3025", "name": "Medium Box (3.0cf)", "category": "box", "unit": "EA", "price": 3.91},
        {"code": "3027", "name": "Large Box (4.5cf)", "category": "box", "unit": "EA", "price": 5.28},
        {"code": "3028", "name": "XL Box (6.0cf)", "category": "box", "unit": "EA", "price": 7.48},
        {"code": "3029", "name": "Book Box", "category": "box", "unit": "EA", "price": 2.84},
        {"code": "3030", "name": "Dish Pack", "category": "box", "unit": "EA", "price": 9.98},
        {"code": "3039", "name": "Wardrobe Box", "category": "box", "unit": "EA", "price": 18.48},
        {"code": "3039S", "name": "Wardrobe Box - Small", "category": "box", "unit": "EA", "price": 16.01},
        {"code": "3039L", "name": "Wardrobe Box - Large", "category": "box", "unit": "EA", "price": 27.89},
        {"code": "3033", "name": "Mirror/Picture Box", "category": "box", "unit": "EA", "price": 10.29},
        {"code": "3899", "name": "TV Box", "category": "box", "unit": "EA", "price": 28.53},
        {"code": "3031", "name": "Lamp Box Set", "category": "box", "unit": "EA", "price": 8.91},
        {"code": "3876", "name": "Mattress Bag - Twin", "category": "mattress", "unit": "EA", "price": 6.12},
        {"code": "3905", "name": "Mattress Bag - Full", "category": "mattress", "unit": "EA", "price": 8.36},
        {"code": "3877", "name": "Mattress Bag - Queen", "category": "mattress", "unit": "EA", "price": 9.07},
        {"code": "3878", "name": "Mattress Bag - King", "category": "mattress", "unit": "EA", "price": 10.08},
        {"code": "2915", "name": "Moving Blanket", "category": "protective", "unit": "EA", "price": 9.07},
        {"code": "2916", "name": "Furniture Pad", "category": "protective", "unit": "EA", "price": 18.26},
        {"code": "2917", "name": "Chair Cover", "category": "protective", "unit": "EA", "price": 5.31},
        {"code": "2918", "name": "Couch/Sofa Cover", "category": "protective", "unit": "EA", "price": 8.57},
        {"code": "3023", "name": "Bubble Wrap 12\"", "category": "protective", "unit": "RL", "price": 11.00},
        {"code": "3018", "name": "Bubble Wrap 24\"", "category": "protective", "unit": "RL", "price": 22.00},
        {"code": "3089", "name": "Packing Paper Bundle", "category": "protective", "unit": "BN", "price": 87.45},
        {"code": "2936", "name": "Shrink Wrap 20\"", "category": "protective", "unit": "RL", "price": 29.83},
        {"code": "3022", "name": "Corner Protectors (100)", "category": "protective", "unit": "BX", "price": 35.17},
        {"code": "2932", "name": "Moving Van 14'-15'", "category": "transport", "unit": "EA", "price": 172.36},
        {"code": "2933", "name": "Moving Van 16'-20'", "category": "transport", "unit": "EA", "price": 179.25},
        {"code": "2934", "name": "Moving Van 26'", "category": "transport", "unit": "EA", "price": 197.36},
        {"code": "2935", "name": "Cargo Van", "category": "transport", "unit": "EA", "price": 156.69},
        {"code": "2840", "name": "Climate-Controlled Storage", "category": "storage", "unit": "SF", "price": 2.18},
        {"code": "2844", "name": "Padlock", "category": "storage", "unit": "EA", "price": 16.05},
    ]
    added = 0
    for p in default_prices:
        if not db.query(Price).filter(Price.code == p["code"]).first():
            db.add(Price(**p))
            added += 1
    if added:
        db.commit()


def seed_room_presets(db):
    """Seed database with room presets"""
    presets = [
        # Bedrooms
        {"key": "bedroom_standard", "name": "Bedroom - Standard", "category": "Bedroom", "size": "large", "base_items": 100, "default_hints": ["clothing_hanging", "clothing_folded", "furniture"], "mattress": "queen"},
        {"key": "bedroom_kids", "name": "Bedroom - Kids", "category": "Bedroom", "size": "large", "base_items": 120, "default_hints": ["clothing_folded", "toys", "books", "furniture"], "mattress": "twin"},
        {"key": "bedroom_guest", "name": "Bedroom - Guest", "category": "Bedroom", "size": "large", "base_items": 60, "default_hints": ["clothing_hanging", "furniture"], "mattress": "full"},
        {"key": "bedroom_master", "name": "Master Bedroom", "category": "Bedroom", "size": "xlarge", "base_items": 150, "default_hints": ["clothing_hanging", "clothing_folded", "electronics", "furniture", "artwork"], "mattress": "king"},
        
        # Kitchen
        {"key": "kitchen_standard", "name": "Kitchen - Standard", "category": "Kitchen", "size": "large", "base_items": 90, "default_hints": ["kitchenware", "appliances_small", "fragile"], "mattress": None},
        {"key": "kitchen_chef", "name": "Kitchen - Chef's", "category": "Kitchen", "size": "xlarge", "base_items": 150, "default_hints": ["kitchenware", "appliances_small", "appliances_large", "fragile"], "mattress": None},
        {"key": "kitchen_china", "name": "Kitchen - Fine China", "category": "Kitchen", "size": "large", "base_items": 120, "default_hints": ["kitchenware", "fragile", "collectibles"], "mattress": None},
        
        # Living
        {"key": "living_standard", "name": "Living Room - Standard", "category": "Living", "size": "large", "base_items": 80, "default_hints": ["electronics", "furniture", "artwork"], "mattress": None},
        {"key": "living_entertainment", "name": "Living Room - Entertainment", "category": "Living", "size": "xlarge", "base_items": 100, "default_hints": ["electronics", "furniture", "artwork", "collectibles"], "mattress": None},
        {"key": "dining_standard", "name": "Dining Room", "category": "Living", "size": "large", "base_items": 60, "default_hints": ["fragile", "furniture", "artwork"], "mattress": None},
        
        # Office
        {"key": "office_standard", "name": "Office - Standard", "category": "Office", "size": "large", "base_items": 100, "default_hints": ["electronics", "books", "furniture"], "mattress": None},
        {"key": "office_library", "name": "Office - Library/Study", "category": "Office", "size": "xlarge", "base_items": 180, "default_hints": ["books", "collectibles", "furniture", "artwork"], "mattress": None},
        {"key": "office_tech", "name": "Office - Tech Heavy", "category": "Office", "size": "xlarge", "base_items": 120, "default_hints": ["electronics", "furniture"], "mattress": None},
        
        # Storage
        {"key": "basement_standard", "name": "Basement - Standard", "category": "Storage", "size": "xlarge", "base_items": 175, "default_hints": ["furniture", "boxes_stored", "tools"], "mattress": None},
        {"key": "basement_finished", "name": "Basement - Finished", "category": "Storage", "size": "xlarge", "base_items": 200, "default_hints": ["electronics", "furniture", "boxes_stored", "collectibles"], "mattress": None},
        {"key": "garage", "name": "Garage", "category": "Storage", "size": "xlarge", "base_items": 150, "default_hints": ["tools", "sports", "boxes_stored"], "mattress": None},
        {"key": "attic", "name": "Attic", "category": "Storage", "size": "large", "base_items": 100, "default_hints": ["boxes_stored", "fragile", "collectibles"], "mattress": None},
        
        # Small
        {"key": "bathroom", "name": "Bathroom", "category": "Small", "size": "small", "base_items": 35, "default_hints": ["fragile"], "mattress": None},
        {"key": "closet_walk", "name": "Walk-in Closet", "category": "Small", "size": "small", "base_items": 80, "default_hints": ["clothing_hanging", "clothing_folded"], "mattress": None},
        {"key": "closet_standard", "name": "Closet - Standard", "category": "Small", "size": "small", "base_items": 40, "default_hints": ["clothing_hanging"], "mattress": None},
        {"key": "laundry", "name": "Laundry Room", "category": "Small", "size": "small", "base_items": 30, "default_hints": ["appliances_large"], "mattress": None},
        {"key": "entryway", "name": "Entryway/Foyer", "category": "Small", "size": "small", "base_items": 25, "default_hints": ["furniture", "artwork"], "mattress": None},
        
        # Specialty
        {"key": "gym", "name": "Home Gym", "category": "Specialty", "size": "xlarge", "base_items": 50, "default_hints": ["equipment_heavy", "electronics"], "mattress": None},
        {"key": "music_room", "name": "Music Room", "category": "Specialty", "size": "large", "base_items": 60, "default_hints": ["instruments", "electronics", "furniture"], "mattress": None},

        # Outdoor
        {"key": "outdoor_patio", "name": "Patio / Deck", "category": "Outdoor", "size": "large", "base_items": 40, "default_hints": ["furniture", "equipment_heavy"], "mattress": None},
        {"key": "outdoor_shed", "name": "Shed", "category": "Outdoor", "size": "large", "base_items": 60, "default_hints": ["tools", "equipment_heavy", "boxes_stored"], "mattress": None},
        {"key": "outdoor_garage_detached", "name": "Detached Garage", "category": "Outdoor", "size": "xlarge", "base_items": 120, "default_hints": ["tools", "sports", "equipment_heavy", "boxes_stored"], "mattress": None},
    ]

    for p in presets:
        db.add(RoomPreset(**p))
    db.commit()


def seed_missing_presets(db):
    """Add any new presets that don't yet exist in the database (safe to run on existing DB)."""
    new_presets = [
        {"key": "outdoor_patio", "name": "Patio / Deck", "category": "Outdoor", "size": "large", "base_items": 40, "default_hints": ["furniture", "equipment_heavy"], "mattress": None},
        {"key": "outdoor_shed", "name": "Shed", "category": "Outdoor", "size": "large", "base_items": 60, "default_hints": ["tools", "equipment_heavy", "boxes_stored"], "mattress": None},
        {"key": "outdoor_garage_detached", "name": "Detached Garage", "category": "Outdoor", "size": "xlarge", "base_items": 120, "default_hints": ["tools", "sports", "equipment_heavy", "boxes_stored"], "mattress": None},
    ]
    added = 0
    for p in new_presets:
        if not db.query(RoomPreset).filter(RoomPreset.key == p["key"]).first():
            db.add(RoomPreset(**p))
            added += 1
    if added:
        db.commit()
