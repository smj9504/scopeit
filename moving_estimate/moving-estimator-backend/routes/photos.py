"""
Photo Analysis API Routes
Integration with Claude Vision API for content detection
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict
import base64
import io
import os

from models.database import get_db


# ---------------------------------------------------------------------------
# Request models for upload-room-photos (route-specific, not in schemas.py)
# ---------------------------------------------------------------------------

class PhotoUploadItem(BaseModel):
    id: str
    name: str
    data: str  # base64 data URL


class RoomPhotosUpload(BaseModel):
    room_id: str
    room_name: str = ""
    photos: List[PhotoUploadItem]


class UploadRoomPhotosRequest(BaseModel):
    estimate_id: str
    rooms: List[RoomPhotosUpload]


from models.schemas import (
    PhotoAnalysisRequest,
    PhotoAnalysisResponse,
    DetectedRoom,
    DetectedItem,
    HighValueItem,
    RoomSize,
    QuickEstimateRequest,
    RoomInput,
    EstimateResponse,
    RoomPhotoAnalysisRequest,
    DetectedContentItem,
    RoomAnalysisResponse,
    RoomsEstimateRequest,
    ExistingItem,
    SubmitCorrectionsRequest,
    SubmitCorrectionsResponse,
    MasterContentRequest,
    MasterContentResponse,
    MasterContentItem,
)
from services.calculator import get_calculator
from services.item_taxonomy import normalize_items_list
from services.vision_tools import (
    PASS1_TOOL,
    PASS2_TOOL,
    build_pass1_tool_prompt,
    build_pass2_tool_prompt,
    extract_tool_result,
)

router = APIRouter()

# Claude API configuration
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Prompt for legacy /analyze endpoint (not room-based)
ANALYSIS_PROMPT = """Analyze this image of a room and identify:

1. ROOM TYPE: What type of room is this? (bedroom, kitchen, living room, office, bathroom, basement, garage, etc.)

2. ROOM SIZE: Estimate the size category:
   - small: bathroom, closet, small utility room
   - large: standard bedroom, kitchen, living room
   - xlarge: master bedroom, large basement, garage, home office

3. ITEMS: List all visible items with counts. Categorize them:
   - Furniture (sofas, beds, tables, chairs, dressers)
   - Electronics (TVs, computers, monitors, gaming equipment)
   - Books/Media
   - Kitchenware (dishes, appliances)
   - Clothing (visible in closets/dressers)
   - Fragile items (glassware, vases, decorations)
   - Artwork/Mirrors
   - Collectibles

4. HIGH-VALUE ITEMS: Identify any items that appear to be high-value:
   - Musical instruments
   - Electronics over $1000
   - Antiques
   - Art pieces
   - Exercise equipment

5. DENSITY: Rate the room density:
   - light: mostly empty, minimal items
   - normal: average furnishing
   - dense: well-furnished, many items
   - heavy: packed, collector's level

Respond in JSON format:
{
  "room_type": "string",
  "room_size": "small|large|xlarge",
  "density": "light|normal|dense|heavy",
  "items": {
    "category": count,
    ...
  },
  "item_list": ["item1", "item2", ...],
  "high_value": [
    {"name": "item name", "estimated_value": "$X - $Y"}
  ],
  "confidence": 0.0-1.0
}
"""


MAX_IMAGE_BYTES = 1_000_000  # 1MB per image — 1024px JPEG is sufficient for content detection
MAX_IMAGE_DIM   = 1024       # px — halving from 2048 cuts image tokens 4×
MAX_IMAGES_PER_ROOM = 6      # hard cap after deduplication


def select_diverse_images(
    images: list,
    max_images: int = MAX_IMAGES_PER_ROOM,
    threshold: float = 0.95,
) -> list:
    """Return up to max_images photos, skipping near-duplicate shots.

    Strategy: resize each image to a 32×32 grayscale thumbnail and compare
    cosine similarity against already-selected thumbnails.  Two images whose
    similarity exceeds threshold are considered the same angle/area and the
    later one is dropped.

    This filters out accidental double-shots and overlapping angles while
    preserving genuinely different views of the room.
    """
    THRESHOLD = threshold
    THUMB = 32         # thumbnail side length (px)

    try:
        from PIL import Image as _Image
    except ImportError:
        # Pillow not available — fall back to simple slice
        return images[:max_images]

    def _thumb_pixels(img_b64: str):
        """Decode base64 image → flat list of 32×32 grayscale pixel values."""
        try:
            raw = img_b64
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            img_bytes = base64.b64decode(raw)
            img = _Image.open(io.BytesIO(img_bytes))
            thumb = img.resize((THUMB, THUMB), _Image.LANCZOS).convert("L")
            return list(thumb.getdata())
        except Exception:
            return None

    def _cosine(a, b) -> float:
        dot   = sum(x * y for x, y in zip(a, b))
        mag_a = sum(x * x for x in a) ** 0.5
        mag_b = sum(x * x for x in b) ** 0.5
        return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0

    selected, thumbs = [], []
    for img in images:
        if len(selected) >= max_images:
            break
        pixels = _thumb_pixels(img)
        if pixels is None:                        # can't decode → include anyway
            selected.append(img)
            continue
        if any(_cosine(pixels, t) >= THRESHOLD for t in thumbs):
            continue                              # too similar to an existing shot
        selected.append(img)
        thumbs.append(pixels)

    return selected


def compress_image_base64(image_base64: str, max_bytes: int = MAX_IMAGE_BYTES) -> tuple[str, str]:
    """Compress a base64 image so the raw base64 string stays under max_bytes.

    Returns (media_type, base64_data) with the data URL prefix stripped.
    If the image is already small enough, returns it unchanged.
    """
    media_type = "image/jpeg"
    raw_b64 = image_base64

    # Strip data-URL prefix if present
    if raw_b64.startswith("data:"):
        parts = raw_b64.split(",", 1)
        if len(parts) > 1:
            media_type = parts[0].split(":")[1].split(";")[0]
            raw_b64 = parts[1]

    # If already within limits, return as-is
    if len(raw_b64) <= max_bytes:
        return media_type, raw_b64

    # Decode, resize/compress with Pillow
    try:
        from PIL import Image

        img_bytes = base64.b64decode(raw_b64)
        img = Image.open(io.BytesIO(img_bytes))

        # Convert RGBA/palette to RGB for JPEG
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        # Progressively reduce size until under limit
        quality = 85
        max_dim = MAX_IMAGE_DIM

        while True:
            # Resize if larger than max_dim
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            encoded = base64.b64encode(buf.getvalue()).decode("ascii")

            if len(encoded) <= max_bytes or quality <= 30:
                return "image/jpeg", encoded

            # Reduce quality or dimensions further
            if quality > 40:
                quality -= 15
            else:
                quality = 30
                max_dim = int(max_dim * 0.75)
                if max_dim < 512:
                    # Give up shrinking, return whatever we have
                    return "image/jpeg", encoded

    except ImportError:
        print("WARNING: Pillow not installed — cannot compress oversized images")
        return media_type, raw_b64
    except Exception as e:
        print(f"Image compression error: {e}")
        return media_type, raw_b64


async def analyze_with_claude(image_base64: str) -> dict:
    """
    Analyze image using Claude Vision API
    """
    try:
        import anthropic
        
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        
        # Compress image if needed to stay under Claude's 5MB limit
        media_type, image_data = compress_image_base64(image_base64)

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": ANALYSIS_PROMPT,
                        }
                    ],
                }
            ],
        )
        
        # Parse response
        import json
        response_text = message.content[0].text
        
        # Extract JSON from response
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response_text[start:end])
        
        return None
        
    except Exception as e:
        print(f"Claude API error: {e}")
        return None


def aggregate_analysis(results: List[dict]) -> PhotoAnalysisResponse:
    """
    Aggregate multiple image analysis results
    """
    rooms_detected = []
    all_items = {}
    item_details = []
    high_value_items = []
    total_items = 0
    
    # Track unique rooms
    room_counts = {}
    
    for result in results:
        if not result:
            continue
        
        # Aggregate rooms
        room_type = result.get("room_type", "unknown")
        room_size = result.get("room_size", "large")
        
        if room_type not in room_counts:
            room_counts[room_type] = {
                "count": 0,
                "size": room_size,
                "confidence": []
            }
        room_counts[room_type]["count"] += 1
        room_counts[room_type]["confidence"].append(result.get("confidence", 0.7))
        
        # Aggregate items
        items = result.get("items", {})
        for category, count in items.items():
            all_items[category] = all_items.get(category, 0) + count
            total_items += count
        
        # Collect high-value items
        for hv in result.get("high_value", []):
            high_value_items.append(HighValueItem(
                name=hv.get("name", "Unknown"),
                location=room_type,
                estimated_value=hv.get("estimated_value", "Unknown"),
            ))
    
    # Build rooms list
    for room_type, data in room_counts.items():
        avg_confidence = sum(data["confidence"]) / len(data["confidence"]) if data["confidence"] else 0.7
        rooms_detected.append(DetectedRoom(
            name=room_type.replace("_", " ").title(),
            count=data["count"],
            size=RoomSize(data["size"]) if data["size"] in ["small", "large", "xlarge"] else RoomSize.LARGE,
            confidence=avg_confidence,
        ))
    
    # Build item details
    for category, count in all_items.items():
        item_details.append(DetectedItem(
            category=category,
            count=count,
            items=[],  # Would need more detailed tracking
        ))
    
    # Calculate suggested materials based on items
    suggested_materials = calculate_suggested_materials(all_items, total_items)
    
    # Calculate overall confidence
    all_confidences = [r.confidence for r in rooms_detected]
    overall_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.7
    
    return PhotoAnalysisResponse(
        rooms_detected=rooms_detected,
        items_detected=all_items,
        item_details=item_details,
        total_items=total_items,
        high_value_items=high_value_items,
        suggested_materials=suggested_materials,
        confidence_score=overall_confidence,
    )


def calculate_suggested_materials(items: dict, total_items: int) -> dict:
    """
    Calculate suggested materials based on detected items
    """
    materials = {}
    
    # Base calculations
    if "Furniture" in items or "furniture" in items:
        count = items.get("Furniture", items.get("furniture", 0))
        materials["blanket"] = max(count * 2, 10)
        materials["shrink_wrap"] = max(count // 5, 2)
        materials["furniture_pad"] = count
    
    if "Electronics" in items or "electronics" in items:
        count = items.get("Electronics", items.get("electronics", 0))
        materials["box_tv"] = max(count // 3, 1)
        materials["box_medium"] = count
        materials["bubble_12"] = max(count // 5, 1)
    
    if "Books" in items or "books" in items:
        count = items.get("Books", items.get("books", 0))
        materials["box_book"] = max(count // 20, 5)
        materials["box_small"] = max(count // 30, 3)
    
    if "Kitchenware" in items or "kitchenware" in items:
        count = items.get("Kitchenware", items.get("kitchenware", 0))
        materials["box_dish"] = max(count // 15, 3)
        materials["packing_paper"] = max(count // 50, 2)
    
    if "Clothing" in items or "clothing" in items:
        count = items.get("Clothing", items.get("clothing", 0))
        materials["box_wardrobe"] = max(count // 15, 4)
        materials["box_medium"] = materials.get("box_medium", 0) + max(count // 20, 3)
    
    if "Fragile" in items or "fragile" in items:
        count = items.get("Fragile", items.get("fragile", 0))
        materials["box_dish"] = materials.get("box_dish", 0) + max(count // 10, 2)
        materials["bubble_12"] = materials.get("bubble_12", 0) + max(count // 20, 1)
    
    if "Artwork" in items or "artwork" in items:
        count = items.get("Artwork", items.get("artwork", 0))
        materials["box_mirror"] = count
        materials["corner_protector"] = 1
    
    # Always ensure packing paper is present
    materials["packing_paper"] = max(materials.get("packing_paper", 0), 1)

    return materials


@router.post("/analyze", response_model=PhotoAnalysisResponse)
async def analyze_photos(
    request: PhotoAnalysisRequest,
    db: Session = Depends(get_db)
):
    """
    Analyze uploaded photos using Claude Vision API
    """
    if not request.images:
        raise HTTPException(status_code=400, detail="No images provided")
    
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Photo analysis requires a valid API key."
        )

    # Analyze each image
    results = []
    for image in request.images[:20]:  # Limit to 20 images
        result = await analyze_with_claude(image)
        if result:
            results.append(result)

    if not results:
        raise HTTPException(
            status_code=502,
            detail="Photo analysis failed. Please try again or check your API key."
        )
    
    # Aggregate results
    return aggregate_analysis(results)


@router.post("/analyze-and-estimate", response_model=EstimateResponse)
async def analyze_and_estimate(
    request: PhotoAnalysisRequest,
    crew_size: int = 4,
    storage_months: int = 1,
    include_packback: bool = True,
    include_op: bool = True,
    op_rate: int = 10,
    db: Session = Depends(get_db)
):
    """
    Analyze photos and generate estimate in one step
    """
    # First analyze
    analysis = await analyze_photos(request, db)
    
    # Convert to rooms
    rooms = []
    for room in analysis.rooms_detected:
        # Map detected room to preset
        preset_key = map_room_to_preset(room.name, room.size.value)
        for _ in range(room.count):
            rooms.append(RoomInput(
                preset=preset_key,
                floor="1st",
                density="normal",
                hints=[],  # Hints will come from preset defaults
            ))
    
    # Generate estimate
    estimate_request = QuickEstimateRequest(
        rooms=rooms,
        crew_size=crew_size,
        storage_months=storage_months,
        include_packback=include_packback,
        include_op=include_op,
        op_rate=op_rate,
    )
    
    calculator = get_calculator(db)
    return calculator.calculate_estimate(estimate_request)


def map_room_to_preset(room_name: str, size: str) -> str:
    """
    Map detected room name to a preset key
    """
    room_lower = room_name.lower()
    
    mapping = {
        "bedroom": "bedroom_standard",
        "master bedroom": "bedroom_master",
        "kids room": "bedroom_kids",
        "guest room": "bedroom_guest",
        "kitchen": "kitchen_standard",
        "living room": "living_standard",
        "dining room": "dining_standard",
        "office": "office_standard",
        "home office": "office_standard",
        "bathroom": "bathroom",
        "basement": "basement_standard",
        "garage": "garage",
        "closet": "closet_standard",
        "laundry": "laundry",
    }
    
    for key, preset in mapping.items():
        if key in room_lower:
            return preset
    
    # Default based on size
    if size == "xlarge":
        return "basement_standard"
    elif size == "small":
        return "bathroom"
    return "living_standard"


# ============================================
# ROOM-BASED PHOTO ANALYSIS
# ============================================

def build_pass1_prompt(
    room_name: str,
    num_images: int,
    existing_items: List[ExistingItem] | None = None,
) -> str:
    """Pass 1: Vision-focused prompt — identify items only.

    Short prompt keeps the model's attention on the image rather than
    on parsing complex output instructions.
    """

    multi_photo_note = ""
    if num_images > 1:
        multi_photo_note = f"""
You are shown {num_images} photos of the SAME room from different angles.
Count each real-world item ONLY ONCE — use spatial reasoning to de-duplicate.
"""

    existing_items_note = ""
    if existing_items:
        items_str = ", ".join(
            f"{item.name} (×{item.quantity})" for item in existing_items
        )
        existing_items_note = f"""
Already inventoried (SKIP these): {items_str}
Only report items NOT on this list.
"""

    return f"""You are a professional Content Pack-Out Estimator inspecting a room.
Your job is to identify every item that needs to be PACKED AND MOVED.
{multi_photo_note}{existing_items_note}
CRITICAL RULES:
1. Focus on PACKABLE CONTENT — what items exist in this room that a moving crew needs to pack?
2. ONLY list items you can visually confirm in the image. Do NOT guess or infer items that have no visual evidence.
   - If an item is PARTIALLY COVERED but its shape/outline is clearly visible, list it (e.g., bed shape visible under a quilt → list both the quilt and the bed)
   - If you CANNOT see an item at all, do NOT list it — even if it's common for this room type
   - Clothes draped on furniture → list the clothing items separately from the furniture
3. INCLUDE: furniture, electronics, boxes, decor, rugs, baskets, cases, bags, containers, toys, lamps, books, artwork, bedding, clothing, etc.
4. EXCLUDE: built-in fixtures (ceiling fans, built-in lights, built-in cabinets, countertops, blinds, thermostats, plumbing)
5. NAME items for PACKING purposes — include type, material, and size that affect packing.
   OMIT decorative details (colors, patterns, characters, brand names) that don't affect packing.
   - GOOD: "Queen Bed Frame", "4-Drawer Wooden Dresser", "Quilt Blanket", "Table Lamp", "Upholstered Recliner"
   - BAD: "Colorful Patchwork Quilt with Winnie the Pooh Characters", "Dark Brown Antique-Style Bookshelf", "Blue Floral Ceramic Vase"
   - ALSO BAD: "Items on Chair", "Lamp on Nightstand" (no location info in names)
6. Include PACKING-RELEVANT specifics only: material (wood, glass, metal), size (small/large, dimensions), structural details (drawer count, sections). Skip color, pattern, brand, character.
7. Scan EVERY area: foreground, background, shelves, floor, walls, corners, on top of furniture.
8. Group ONLY identical small items (e.g., "Photo Frame" qty 3). Each distinct object = separate entry.

For each item:
- name: packing-focused descriptive name (type + material + size when relevant)
- category: [Furniture, Electronics, Books, Kitchenware, Clothing, Fragile, Artwork, Collectibles, Appliances, Tools, Sports, Other]
- quantity: count of identical items
- is_high_value: true if replacement > $500
- estimated_value: dollar range string if high-value, else null
- is_fragile: true if breakable/delicate

Also assess the overall room:
- density: How full is the room with packable content?
  - "light": mostly empty, under 10 items, lots of open floor/wall space
  - "normal": typical furnishing, 10-25 items, some open space remaining
  - "dense": well-furnished, 25-50 items, most surfaces occupied
  - "heavy": packed/cluttered, 50+ items, collector's level, minimal open space
- room_size: Physical room dimensions (NOT how full it is):
  - "small": bathroom, closet, small utility room, hallway (under ~80 sq ft)
  - "large": standard bedroom, kitchen, living room, dining room (~80-250 sq ft)
  - "xlarge": master bedroom, large basement, garage, great room (250+ sq ft)

Respond with JSON only, no other text:
{{
  "items": [{{"name":"...","category":"...","quantity":1,"is_high_value":false,"estimated_value":null,"is_fragile":false}}],
  "density": "<assess based on criteria above>",
  "room_size": "<assess based on criteria above>",
  "confidence": 0.85
}}
"""


def build_pass2_prompt(items_json: str) -> str:
    """Pass 2: Text-only prompt — add packing details to identified items.

    No image needed. Works from the item list produced by Pass 1.
    """
    return f"""You are a professional Content Pack-Out Estimator. You have already identified the following items in a room:

{items_json}

For EACH item above, add these fields (keep existing fields unchanged):

1. **needs_disassembly**: true only if disassembly is required for transport
2. **packing_method**: Step-by-step packing instruction. Be specific:
   - "Empty all drawers; wrap body in moving blanket; tape drawers shut with painter's tape; pad corners with corner protectors"
   - "Wrap in bubble wrap; pack in medium box with packing paper fill"
3. **required_materials**: Array using these exact keys:
   [wardrobe_box, wardrobe_box_small, wardrobe_box_large, small_box, medium_box, large_box,
    dish_pack_box, book_box, tv_box, mirror_box,
    bubble_wrap_12, bubble_wrap_24, packing_paper, moving_blanket, furniture_pad,
    stretch_wrap, corner_protector, mattress_bag, lamp_box, chair_cover, sofa_cover]
4. **estimated_labor_hours**: Packing time for ONE person:
   - Small item (lamp, small decor): 0.1–0.25 hrs
   - Medium (nightstand, chair): 0.25–0.5 hrs
   - Large furniture (dresser, sofa): 0.5–1.0 hrs
   - Fragile set (10-20 pcs glassware): 0.5–1.5 hrs
   - Large TV (50"+): 0.5–0.75 hrs
   - Disassembly adds 0.25–0.5 hrs
5. **special_instructions**: Field notes or null. E.g. "Heavy — 2-man lift", "Keep cables with item"
6. **estimator_flags**: Array from [HEAVY, HIGH_VALUE, FRAGILE, CHECK_MOISTURE, LIQUID_ITEMS, DOCUMENTS, VERIFY_CONTENTS, DISASSEMBLY] or []

Return the COMPLETE items array with all original + new fields. JSON only:
{{
  "items": [
    {{
      "name": "...", "category": "...", "quantity": 1,
      "is_high_value": false, "estimated_value": null, "is_fragile": false,
      "needs_disassembly": false,
      "packing_method": "...",
      "required_materials": ["moving_blanket", "stretch_wrap"],
      "estimated_labor_hours": 0.5,
      "special_instructions": null,
      "estimator_flags": []
    }}
  ]
}}
"""



def parse_image_base64(image_base64: str) -> tuple[str, str]:
    """Extract media type and clean base64 data from a possibly data-URL-encoded image."""
    media_type = "image/jpeg"
    if image_base64.startswith("data:"):
        parts = image_base64.split(",")
        if len(parts) > 1:
            media_type = parts[0].split(":")[1].split(";")[0]
            image_base64 = parts[1]
    return media_type, image_base64


def resolve_image_to_base64(image: str) -> str:
    """Convert an image to a base64 data URL.

    Handles three input formats:
    - data: URL  → returned as-is
    - /uploads/… path → read file from local storage and encode
    - http(s):// URL  → fetch via requests and encode
    """
    if image.startswith("data:"):
        return image

    # Local /uploads/... path (served by this backend)
    if image.startswith("/uploads/"):
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(backend_dir, "storage", image.lstrip("/"))
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                raw = f.read()
            encoded = base64.b64encode(raw).decode("ascii")
            return f"data:image/jpeg;base64,{encoded}"

    # Full HTTP/HTTPS URL (e.g. http://localhost:8000/uploads/...)
    if image.startswith("http://") or image.startswith("https://"):
        try:
            import urllib.request
            # Extract /uploads/... path from URL and read locally when possible
            from urllib.parse import urlparse
            parsed = urlparse(image)
            if parsed.path.startswith("/uploads/"):
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                file_path = os.path.join(backend_dir, "storage", parsed.path.lstrip("/"))
                if os.path.exists(file_path):
                    with open(file_path, "rb") as f:
                        raw = f.read()
                    encoded = base64.b64encode(raw).decode("ascii")
                    return f"data:image/jpeg;base64,{encoded}"
            # Fallback: fetch via HTTP
            with urllib.request.urlopen(image, timeout=10) as resp:
                raw = resp.read()
            encoded = base64.b64encode(raw).decode("ascii")
            content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0]
            return f"data:{content_type};base64,{encoded}"
        except Exception as e:
            print(f"Failed to fetch image from URL {image}: {e}")

    return image


def _extract_json(text: str) -> dict | None:
    """Extract the first complete JSON object from a string."""
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        import json
        return json.loads(text[start:end])
    return None


def get_recent_corrections_context(db: Session, room_name: str, limit: int = 8) -> str:
    """Get recent user corrections for this room type as few-shot context."""
    try:
        from models.database import ItemCorrection

        rows = (
            db.query(ItemCorrection)
            .filter(ItemCorrection.room_name.ilike(f"%{room_name.split()[0]}%"))
            .order_by(ItemCorrection.created_at.desc())
            .limit(limit)
            .all()
        )
        if not rows:
            return ""

        examples = []
        for r in rows:
            if r.action == "delete":
                examples.append(
                    f'- Do NOT include "{r.original_name}" — users consistently remove this item'
                )
            elif r.corrected_name and r.corrected_name != r.original_name:
                examples.append(
                    f'- Use "{r.corrected_name}" instead of "{r.original_name}"'
                )
            elif r.corrected_category and r.corrected_category != r.original_category:
                examples.append(
                    f'- Category for "{r.original_name}" should be "{r.corrected_category}"'
                )

        if not examples:
            return ""

        return (
            "\n\nRECENT CORRECTIONS FROM THIS ROOM TYPE (apply these):\n"
            + "\n".join(examples)
        )
    except Exception:
        return ""


async def analyze_room_with_claude(
    images: List[str],
    room_name: str,
    existing_items: List[ExistingItem] | None = None,
    corrections_context: str = "",
) -> dict | None:
    """Hybrid 2-pass room analysis: Tool Use + Taxonomy Normalization.

    Pass 1 (vision + tool use):
        Send images with report_room_contents tool schema.
        Claude returns structured output with constrained category
        enums and typed fields. No JSON parsing needed.
        Then normalize item names via the packing taxonomy.

    Pass 2 (text + tool use):
        Send normalized item list with enrich_packing_details tool.
        Claude returns packing method, materials (constrained to
        valid keys), labor estimates, and flags.

    This hybrid approach provides:
    - Structural guarantees from tool schemas (no JSON parse failures)
    - Category enum enforcement (always valid category values)
    - Material key enforcement (always valid material keys)
    - Consistent item names from taxonomy normalization
    - Graceful fallback for novel items not in taxonomy
    """
    try:
        import anthropic
        import json

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        # ── Pass 1: Vision + Tool Use ─────────────────────────────
        per_image_limit = MAX_IMAGE_BYTES // max(len(images), 1)
        per_image_limit = max(per_image_limit, 1_000_000)

        content = []
        for img in images:
            # Resolve URL/path references to base64 before compressing
            img = resolve_image_to_base64(img)
            media_type, img_data = compress_image_base64(
                img, max_bytes=per_image_limit
            )
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": img_data,
                },
            })

        pass1_prompt = build_pass1_tool_prompt(
            room_name, len(images), existing_items
        )
        if corrections_context:
            pass1_prompt = pass1_prompt + corrections_context
        content.append({"type": "text", "text": pass1_prompt})

        pass1_msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            tools=[PASS1_TOOL],
            tool_choice={
                "type": "tool",
                "name": "report_room_contents",
            },
            messages=[{"role": "user", "content": content}],
        )

        # Tool use returns structured data directly -- no JSON
        # parsing needed. extract_tool_result pulls the input
        # dict from the tool_use block.
        pass1_result = extract_tool_result(pass1_msg)
        if not pass1_result or not pass1_result.get("items"):
            print(
                "Pass 1 tool returned no items"
            )
            return pass1_result

        # ── Normalize: Taxonomy matching ──────────────────────────
        # Map AI-generated free-text names to canonical packing
        # names. This is deterministic and adds no API cost.
        normalize_items_list(pass1_result["items"])

        # ── Pass 2: Text-only + Tool Use ──────────────────────────
        # Compact JSON (no indent) saves ~15% input tokens vs indent=2
        items_json = json.dumps(pass1_result["items"])
        pass2_prompt = build_pass2_tool_prompt(items_json)

        pass2_msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,  # was 8192; rooms with 20 items fit well under 3K tokens
            tools=[PASS2_TOOL],
            tool_choice={
                "type": "tool",
                "name": "enrich_packing_details",
            },
            messages=[
                {"role": "user", "content": pass2_prompt}
            ],
        )

        pass2_result = extract_tool_result(pass2_msg)

        # ── Merge: Pass 1 metadata + Pass 2 enriched items ───────
        if pass2_result and pass2_result.get("items"):
            return {
                "items": pass2_result["items"],
                "density": pass1_result.get(
                    "density", "normal"
                ),
                "room_size": pass1_result.get(
                    "room_size", "large"
                ),
                "confidence": pass1_result.get(
                    "confidence", 0.7
                ),
            }

        # Pass 2 failed -- return Pass 1 items (already
        # normalized, just missing packing details)
        print(
            "Pass 2 tool failed -- returning "
            "Pass 1 items without packing details"
        )
        return pass1_result

    except Exception as e:
        print(f"Claude API error (room analysis): {e}")
        return None


def build_room_analysis_response(
    result: dict, room_name: str
) -> RoomAnalysisResponse:
    """Convert raw Claude JSON into a RoomAnalysisResponse."""
    items = []
    total_labor = 0.0
    fragile_count = 0
    high_value_count = 0
    field_notes = []

    for item_data in result.get("items", []):
        labor_hrs = item_data.get("estimated_labor_hours")
        if labor_hrs is not None:
            labor_hrs = float(labor_hrs)
            total_labor += labor_hrs * item_data.get("quantity", 1)

        is_frag = item_data.get("is_fragile", False)
        is_hv = item_data.get("is_high_value", False)
        qty = item_data.get("quantity", 1)
        if is_frag:
            fragile_count += qty
        if is_hv:
            high_value_count += qty

        flags = item_data.get("estimator_flags") or []
        instructions = item_data.get("special_instructions")

        # Collect notable field notes
        if instructions and any(
            kw in (instructions or "").upper()
            for kw in [
                "2-MAN", "MOISTURE", "PHOTOGRAPH",
                "HAZMAT", "VERIFY",
            ]
        ):
            field_notes.append(
                f"{item_data.get('name', 'Unknown')}: "
                f"{instructions}"
            )

        items.append(DetectedContentItem(
            name=item_data.get("name", "Unknown"),
            category=item_data.get("category", "Other"),
            quantity=qty,
            is_high_value=is_hv,
            estimated_value=item_data.get("estimated_value"),
            is_fragile=is_frag,
            needs_disassembly=item_data.get(
                "needs_disassembly", False
            ),
            packing_method=item_data.get("packing_method"),
            required_materials=item_data.get("required_materials"),
            estimated_labor_hours=labor_hrs,
            special_instructions=instructions,
            estimator_flags=flags if flags else None,
        ))

    return RoomAnalysisResponse(
        room_name=room_name,
        items=items,
        density=result.get("density", "normal"),
        room_size=result.get("room_size", "large"),
        confidence_score=result.get("confidence", 0.7),
        total_labor_hours=round(total_labor, 2),
        fragile_count=fragile_count,
        high_value_count=high_value_count,
        field_notes=field_notes[:10],
    )




@router.post("/analyze-room", response_model=RoomAnalysisResponse)
async def analyze_room_photos(
    request: RoomPhotoAnalysisRequest,
    db: Session = Depends(get_db),
):
    """Analyze photos for a specific room and return itemized content list.

    Sends all photos in a single API call so Claude can deduplicate items
    seen from multiple angles. Optionally accepts existing_items to
    cross-reference and only report NEW items.
    """
    if not request.images:
        raise HTTPException(status_code=400, detail="No images provided")

    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Photo analysis requires a valid API key."
        )

    # Build few-shot corrections context from stored user feedback
    corrections_context = get_recent_corrections_context(db, request.room_name)

    # Deduplicate overlapping shots, then cap at configurable limit.
    # Load threshold / max_images from settings DB (fallback to defaults).
    from models.database import Settings as _Settings
    from routes.settings import PHOTO_KEY, PHOTO_DEFAULTS
    _ps_row = db.query(_Settings).filter(_Settings.key == PHOTO_KEY).first()
    _ps = {**PHOTO_DEFAULTS, **(_ps_row.value if _ps_row else {})}
    images = select_diverse_images(
        request.images,
        max_images=int(_ps["max_images"]),
        threshold=float(_ps["dedup_threshold"]),
    )
    result = await analyze_room_with_claude(
        images=images,
        room_name=request.room_name,
        existing_items=request.existing_items,
        corrections_context=corrections_context,
    )

    if not result:
        raise HTTPException(
            status_code=502,
            detail="Photo analysis failed. Please try again or check your API key."
        )

    return build_room_analysis_response(result, request.room_name)


@router.post("/rooms-estimate", response_model=EstimateResponse)
async def estimate_from_rooms(
    request: RoomsEstimateRequest,
    db: Session = Depends(get_db),
):
    """Generate estimate from room content lists (after user review/edit).

    Uses per-item required_materials and labor tier classification
    instead of the preset-based hint system.
    """
    if not request.rooms:
        raise HTTPException(status_code=400, detail="No rooms provided")

    calculator = get_calculator(db)
    return calculator.calculate_estimate_from_content(request)


@router.post("/corrections", response_model=SubmitCorrectionsResponse)
def submit_item_corrections(
    request: SubmitCorrectionsRequest,
    db: Session = Depends(get_db),
):
    """Submit user corrections for analyzed items (feeds few-shot learning)"""
    from models.database import ItemCorrection

    count = 0
    for correction in request.corrections:
        row = ItemCorrection(
            session_id=request.session_id,
            room_name=request.room_name,
            original_name=correction.original_name,
            corrected_name=correction.corrected_name,
            original_category=correction.original_category,
            corrected_category=correction.corrected_category,
            original_qty=correction.original_qty,
            corrected_qty=correction.corrected_qty,
            action=correction.action,
            match_confidence=correction.match_confidence,
        )
        db.add(row)
        count += 1

    db.commit()
    return SubmitCorrectionsResponse(saved=count)


@router.post("/master-content-list", response_model=MasterContentResponse)
def get_master_content_list(request: MasterContentRequest):
    """Aggregate analyzed items across all rooms into a master content list"""
    from collections import defaultdict

    item_map = defaultdict(lambda: {
        "name": "", "category": "", "total_quantity": 0,
        "rooms": [], "is_high_value": False, "is_fragile": False,
        "estimator_flags": set(), "total_labor_hours": 0.0,
    })

    for room in request.rooms:
        for item in room.items:
            name = item.get("name", "Unknown")
            key = name.lower().strip()
            entry = item_map[key]
            entry["name"] = name
            entry["category"] = item.get("category", "")
            entry["total_quantity"] += item.get("quantity", 1)
            if room.room_name not in entry["rooms"]:
                entry["rooms"].append(room.room_name)
            if item.get("is_high_value"):
                entry["is_high_value"] = True
            if item.get("is_fragile"):
                entry["is_fragile"] = True
            for flag in item.get("estimator_flags", []):
                entry["estimator_flags"].add(flag)
            entry["total_labor_hours"] += (
                (item.get("estimated_labor_hours", 0) or 0)
                * item.get("quantity", 1)
            )

    items = []
    flag_summary: dict = defaultdict(int)
    total_labor = 0.0
    hv_count = 0
    frag_count = 0

    for entry in item_map.values():
        flags = list(entry["estimator_flags"])
        for f in flags:
            flag_summary[f] += entry["total_quantity"]
        total_labor += entry["total_labor_hours"]
        if entry["is_high_value"]:
            hv_count += entry["total_quantity"]
        if entry["is_fragile"]:
            frag_count += entry["total_quantity"]
        items.append(MasterContentItem(
            name=entry["name"],
            category=entry["category"],
            total_quantity=entry["total_quantity"],
            rooms=entry["rooms"],
            is_high_value=entry["is_high_value"],
            is_fragile=entry["is_fragile"],
            estimator_flags=flags,
            total_labor_hours=round(entry["total_labor_hours"], 2),
        ))

    items.sort(key=lambda x: (-int(x.is_high_value), -x.total_quantity))

    return MasterContentResponse(
        items=items,
        total_items=sum(i.total_quantity for i in items),
        total_labor_hours=round(total_labor, 2),
        high_value_count=hv_count,
        fragile_count=frag_count,
        flag_summary=dict(flag_summary),
    )


@router.post("/upload-room-photos")
async def upload_room_photos(request: UploadRoomPhotosRequest, db: Session = Depends(get_db)):
    """Save base64-encoded room photos to disk and record them in the DB.

    Files are written to:
        storage/uploads/{estimate_id}/{room_id}/{photo_id}.jpg

    Returns a mapping of room_id → list of saved file descriptors.
    """
    import uuid as _uuid
    from models.database import EstimatePhoto

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    storage_root = os.path.join(backend_dir, "storage", "uploads")

    saved: Dict[str, List[dict]] = {}

    for room in request.rooms:
        room_dir = os.path.join(storage_root, request.estimate_id, room.room_id)
        os.makedirs(room_dir, exist_ok=True)

        room_files: List[dict] = []
        for photo in room.photos:
            # Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
            raw_b64 = photo.data
            if raw_b64.startswith("data:"):
                parts = raw_b64.split(",", 1)
                if len(parts) == 2:
                    raw_b64 = parts[1]

            try:
                image_bytes = base64.b64decode(raw_b64)
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid base64 data for photo '{photo.id}': {exc}",
                )

            file_path = os.path.join(room_dir, f"{photo.id}.jpg")
            with open(file_path, "wb") as f:
                f.write(image_bytes)

            url = f"/uploads/{request.estimate_id}/{room.room_id}/{photo.id}.jpg"
            room_files.append({"id": photo.id, "name": photo.name, "url": url})

            # Upsert DB record
            existing = db.query(EstimatePhoto).filter(
                EstimatePhoto.estimate_id == request.estimate_id,
                EstimatePhoto.photo_id == photo.id,
            ).first()
            if existing:
                existing.file_url = url
                existing.file_name = photo.name
                existing.room_name = room.room_name
            else:
                db.add(EstimatePhoto(
                    id=str(_uuid.uuid4()),
                    estimate_id=request.estimate_id,
                    room_id=room.room_id,
                    room_name=room.room_name,
                    photo_id=photo.id,
                    file_name=photo.name,
                    file_url=url,
                ))

        saved[room.room_id] = room_files

    db.commit()
    return {"rooms": saved}


@router.get("/estimate/{estimate_id}")
async def get_estimate_photos(estimate_id: str, db: Session = Depends(get_db)):
    """Return all photos saved for an estimate, grouped by room_id."""
    from models.database import EstimatePhoto

    photos = db.query(EstimatePhoto).filter(
        EstimatePhoto.estimate_id == estimate_id
    ).order_by(EstimatePhoto.created_at).all()

    by_room: Dict[str, list] = {}
    for p in photos:
        by_room.setdefault(p.room_id, []).append({
            "id": p.photo_id,
            "name": p.file_name,
            "url": p.file_url,
            "room_name": p.room_name,
        })
    return {"estimate_id": estimate_id, "rooms": by_room}


