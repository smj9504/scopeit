"""
Pydantic Schemas for Moving Estimator
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from datetime import datetime
from enum import Enum


# ============================================
# ENUMS
# ============================================

class RoomSize(str, Enum):
    SMALL = "small"
    LARGE = "large"
    XLARGE = "xlarge"


class Density(str, Enum):
    LIGHT = "light"
    NORMAL = "normal"
    DENSE = "dense"
    HEAVY = "heavy"
    EXTREME = "extreme"  # Hoarding / absolute maximum — 2.5x


class Floor(str, Enum):
    BASEMENT = "basement"
    FIRST = "1st"
    SECOND = "2nd"
    THIRD = "3rd"
    FOURTH_PLUS = "4th+"  # 3+ flights — common in eastern US brownstones


class Region(str, Enum):
    MID_ATLANTIC = "mid_atlantic"  # Baseline — Northern Virginia / DC metro
    NORTHEAST    = "northeast"     # +15% — NY/NJ/MA/CT
    WEST         = "west"          # +5%  — CA/WA/OR
    MIDWEST      = "midwest"       # -10% — IL/OH/MI/WI
    SOUTHWEST    = "southwest"     # -15% — TX/AZ/NV
    SOUTHEAST    = "southeast"     # -20% — FL/GA/NC/SC/TN


class ContaminationLevel(str, Enum):
    CLEAN = "clean"            # Dry / no contamination — 1.0×
    GRAY_WATER = "gray_water"  # Category 2 water — 1.4×
    BLACK_WATER = "black_water"  # Category 3 / sewage / fire — 1.8×


class EstimateStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    APPROVED = "approved"
    REJECTED = "rejected"


class StagingType(str, Enum):
    OFF_SITE = "off_site"   # Contents transported to external storage facility
    ON_SITE = "on_site"     # Contents staged in another area of the property


# ============================================
# CONTENT HINTS
# ============================================

class ContentHint(str, Enum):
    CLOTHING_HANGING  = "clothing_hanging"
    CLOTHING_FOLDED   = "clothing_folded"
    BEDDING           = "bedding"
    BOOKS             = "books"
    DOCUMENTS         = "documents"
    ELECTRONICS       = "electronics"
    KITCHENWARE       = "kitchenware"
    FRAGILE           = "fragile"
    ARTWORK           = "artwork"
    COLLECTIBLES      = "collectibles"
    VALUABLES         = "valuables"
    WINE_COLLECTION   = "wine_collection"
    FURNITURE         = "furniture"
    RUGS              = "rugs"
    LAMPS_LIGHTING    = "lamps_lighting"
    APPLIANCES_SMALL  = "appliances_small"
    APPLIANCES_LARGE  = "appliances_large"
    TOYS              = "toys"
    SPORTS            = "sports"
    BICYCLES          = "bicycles"
    TOOLS             = "tools"
    EQUIPMENT_HEAVY   = "equipment_heavy"
    BOXES_STORED      = "boxes_stored"
    HOLIDAY_DECOR     = "holiday_decor"
    INSTRUMENTS       = "instruments"
    BABY_ITEMS        = "baby_items"
    OUTDOOR_FURNITURE = "outdoor_furniture"
    PLANTS            = "plants"
    CHEMICALS         = "chemicals"


# ============================================
# ROOM SCHEMAS
# ============================================

class RoomInput(BaseModel):
    preset: str = Field(..., description="Room preset key (e.g., 'bedroom_standard')")
    floor: Floor = Field(default=Floor.FIRST)
    density: Density = Field(default=Density.NORMAL)
    hints: List[str] = Field(default_factory=list)
    contamination: ContaminationLevel = Field(default=ContaminationLevel.CLEAN)
    hint_volume: Dict[str, int] = Field(default_factory=dict, description="Per-hint volume level index: 0=S, 1=M (default), 2=L, 3=XL")
    hint_qty: Dict[str, int] = Field(default_factory=dict, description="Per-unit hint quantity (e.g. sofa=1, bed_small=2)")


class RoomOutput(BaseModel):
    name: str
    size: RoomSize
    floor: Floor
    density: Density
    hints: List[str]
    item_count: int
    price: float


# ============================================
# ESTIMATE REQUEST/RESPONSE
# ============================================

class CustomSpecialItem(BaseModel):
    name: str
    price: float = Field(ge=0)


class SupplementItem(BaseModel):
    """A conditional supplement that replaces flat contingency."""
    key: str = Field(..., description="Unique identifier (e.g. 'hidden_damage')")
    name: str = Field(..., description="Line item name for the estimate")
    description: str = Field(default="", description="Justification / reference standard")
    amount: float = Field(default=0, ge=0)
    triggered: bool = Field(default=False, description="Whether the condition was met")
    enabled: bool = Field(default=True, description="User can toggle off even if triggered")


class QuickEstimateRequest(BaseModel):
    rooms: List[RoomInput]
    crew_size: int = Field(default=4, ge=2, le=6)
    storage_months: int = Field(default=0, ge=0, le=12)
    staging_type: StagingType = Field(default=StagingType.OFF_SITE)
    include_packback: bool = Field(default=True)
    include_op: bool = Field(default=True)
    op_rate: int = Field(default=20, ge=0, le=30)
    include_contingency: bool = Field(default=False)
    contingency_rate: int = Field(default=0, ge=0, le=20)
    supplement_overrides: Dict[str, bool] = Field(default_factory=dict, description="User overrides for supplement toggles: {key: enabled}")
    region: Region = Field(default=Region.MID_ATLANTIC)
    special_items: List[str] = Field(default_factory=list)  # e.g. ["piano", "pool_table"]
    custom_special_items: List[CustomSpecialItem] = Field(default_factory=list)

    class Config:
        json_schema_extra = {
            "example": {
                "rooms": [
                    {"preset": "bedroom_standard", "floor": "2nd", "density": "normal", "hints": ["clothing_hanging", "furniture"]},
                    {"preset": "kitchen_standard", "floor": "1st", "density": "normal", "hints": ["kitchenware", "fragile"]}
                ],
                "crew_size": 4,
                "storage_months": 1,
                "include_packback": True,
                "include_op": True,
                "op_rate": 20,
                "include_contingency": False,
                "contingency_rate": 5
            }
        }


class MaterialItem(BaseModel):
    code: str
    name: str
    quantity: int
    unit: str
    unit_price: float
    total: float


class SectionBreakdown(BaseModel):
    name: str
    items: List[Dict]
    subtotal: float


class RoomItemSummary(BaseModel):
    """Summarized room content for dynamic description generation."""
    room_name: str
    notable_items: List[str] = Field(default_factory=list)
    categories_present: List[str] = Field(default_factory=list)
    high_value_items: List[str] = Field(default_factory=list)
    packing_notes: List[str] = Field(default_factory=list)
    item_count: int = 0


class EstimateResponse(BaseModel):
    id: Optional[str] = None
    created_at: Optional[datetime] = None

    # Summary
    total_rooms: int
    total_items: int
    total_hours: float
    crew_size: int

    # Breakdown
    sections: Dict[str, float]
    section_details: Optional[Dict[str, Any]] = None  # per-section line-item breakdown
    materials: Dict[str, int]
    material_details: Optional[List[MaterialItem]] = None
    materials_detail: Optional[Dict[str, str]] = None  # mat_key → basis description string
    storage_sf: int = 0
    staging_type: StagingType = StagingType.OFF_SITE
    room_summaries: Optional[List[RoomItemSummary]] = None
    
    # Totals
    subtotal: float
    include_op: bool
    op_rate: int
    op_amount: float
    include_contingency: bool = False
    contingency_rate: int = 0
    contingency_amount: float = 0
    supplements: List[SupplementItem] = Field(default_factory=list)
    supplements_total: float = 0
    grand_total: float
    
    # Status
    status: EstimateStatus = EstimateStatus.DRAFT


# ============================================
# PHOTO ANALYSIS
# ============================================

class PhotoAnalysisRequest(BaseModel):
    images: List[str] = Field(..., description="Base64 encoded images")


class DetectedRoom(BaseModel):
    name: str
    count: int
    size: RoomSize
    confidence: float


class DetectedItem(BaseModel):
    category: str
    count: int
    items: List[str]


class HighValueItem(BaseModel):
    name: str
    location: str
    estimated_value: str


class PhotoAnalysisResponse(BaseModel):
    rooms_detected: List[DetectedRoom]
    items_detected: Dict[str, int]
    item_details: List[DetectedItem]
    total_items: int
    high_value_items: List[HighValueItem]
    suggested_materials: Dict[str, int]
    confidence_score: float


# ============================================
# ROOM-BASED PHOTO ANALYSIS
# ============================================

class ExistingItem(BaseModel):
    name: str
    quantity: int = 1


class RoomPhotoAnalysisRequest(BaseModel):
    room_name: str = Field(..., description="Room name (preset or custom)")
    images: List[str] = Field(..., description="Base64 encoded images")
    existing_items: Optional[List[ExistingItem]] = Field(default=None, description="Previously inventoried items to cross-reference and avoid duplicates")


class DetectedContentItem(BaseModel):
    name: str = Field(..., description="Item name (e.g. 'Sofa', '55-inch TV')")
    category: str = Field(..., description="Category (e.g. 'Furniture', 'Electronics')")
    quantity: int = Field(default=1, ge=1)
    is_high_value: bool = Field(default=False)
    estimated_value: Optional[str] = Field(default=None, description="For high-value items")
    is_fragile: bool = Field(default=False, description="Whether item requires fragile handling")
    needs_disassembly: bool = Field(default=False, description="Whether item requires disassembly for transport")
    packing_method: Optional[str] = Field(default=None, description="How to pack this item (e.g. 'Wrap in bubble wrap, pack in dish-pack box')")
    required_materials: Optional[List[str]] = Field(default=None, description="Materials needed (e.g. ['bubble_wrap_12', 'dish_pack_box'])")
    estimated_labor_hours: Optional[float] = Field(default=None, ge=0, description="Estimated packing labor in hours for this item")
    special_instructions: Optional[str] = Field(default=None, description="Field notes (e.g. '2-man lift', 'check for moisture damage')")
    estimator_flags: Optional[List[str]] = Field(default=None, description="Flags: HEAVY, HIGH_VALUE, FRAGILE, CHECK_MOISTURE, LIQUID_ITEMS, DOCUMENTS, VERIFY_CONTENTS")
    match_confidence: Optional[float] = Field(default=None, description="Taxonomy match confidence score (0.0-1.0)")


class RoomAnalysisResponse(BaseModel):
    room_name: str
    items: List[DetectedContentItem]
    density: str
    room_size: str
    confidence_score: float
    total_labor_hours: float = 0
    fragile_count: int = 0
    high_value_count: int = 0
    field_notes: List[str] = Field(default_factory=list)


class RoomContentInput(BaseModel):
    room_name: str
    preset_id: Optional[str] = None
    items: List[DetectedContentItem]
    density: str = "normal"
    floor: str = "1st"
    contamination: str = "clean"


class RoomsEstimateRequest(BaseModel):
    rooms: List[RoomContentInput]
    crew_size: int = Field(default=4, ge=2, le=6)
    storage_months: int = Field(default=0, ge=0, le=12)
    staging_type: StagingType = Field(default=StagingType.OFF_SITE)
    include_packback: bool = Field(default=True)
    include_op: bool = Field(default=True)
    op_rate: int = Field(default=20, ge=0, le=30)
    include_contingency: bool = Field(default=False)
    contingency_rate: int = Field(default=0, ge=0, le=20)
    supplement_overrides: Dict[str, bool] = Field(default_factory=dict, description="User overrides for supplement toggles: {key: enabled}")
    region: Region = Field(default=Region.MID_ATLANTIC)
    special_items: List[str] = Field(default_factory=list)
    custom_special_items: List[CustomSpecialItem] = Field(default_factory=list)


# ============================================
# PRICE SCHEMAS
# ============================================

class PriceItem(BaseModel):
    code: str
    name: str
    category: str
    unit: str
    price: float


class PriceCreateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., min_length=1, max_length=50)
    unit: str = Field(..., min_length=1, max_length=10)
    price: float = Field(..., gt=0)


class PriceUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    price: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = Field(default=None, min_length=1, max_length=50)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=10)


class PriceListResponse(BaseModel):
    prices: Dict[str, PriceItem]
    last_updated: datetime


# ============================================
# SAVED ESTIMATE
# ============================================

class SaveEstimateRequest(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    property_address: Optional[str] = None
    notes: Optional[str] = None
    estimate_data: Dict


class SavedEstimate(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime
    client_name: Optional[str]
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    property_address: Optional[str]
    notes: Optional[str]
    status: EstimateStatus
    grand_total: float
    estimate_data: Dict


class EstimateListResponse(BaseModel):
    estimates: List[SavedEstimate]
    total: int
    page: int
    per_page: int


# ============================================
# ITEM CORRECTIONS & MASTER CONTENT LIST
# ============================================

class ItemCorrectionInput(BaseModel):
    original_name: str
    corrected_name: Optional[str] = None
    original_category: Optional[str] = None
    corrected_category: Optional[str] = None
    original_qty: Optional[int] = None
    corrected_qty: Optional[int] = None
    action: str = "edit"  # 'edit' | 'delete' | 'add'
    match_confidence: Optional[float] = None


class SubmitCorrectionsRequest(BaseModel):
    session_id: Optional[str] = None
    room_name: str
    corrections: List[ItemCorrectionInput]


class SubmitCorrectionsResponse(BaseModel):
    saved: int


class MasterContentItem(BaseModel):
    name: str
    category: str
    total_quantity: int
    rooms: List[str]
    is_high_value: bool
    is_fragile: bool
    estimator_flags: List[str]
    total_labor_hours: float


class MasterContentRoom(BaseModel):
    room_name: str
    items: List[dict]  # DetectedContentItem dicts


class MasterContentRequest(BaseModel):
    rooms: List[MasterContentRoom]


class MasterContentResponse(BaseModel):
    items: List[MasterContentItem]
    total_items: int
    total_labor_hours: float
    high_value_count: int
    fragile_count: int
    flag_summary: Dict[str, int]
