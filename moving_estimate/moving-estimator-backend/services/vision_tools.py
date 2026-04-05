"""
Vision Tool Schema Definitions for Claude API

Defines structured tool schemas that force the Claude API to return
well-typed, constrained output instead of free-form JSON. This eliminates
JSON parsing failures and constrains enum fields (category, density,
room_size) to valid values.

The item 'name' field remains free-text but is post-processed by
item_taxonomy.normalize_items_list() to map to canonical packing names.

Usage:
    from services.vision_tools import (
        PASS1_TOOL,
        PASS2_TOOL,
        build_pass1_tool_prompt,
        build_pass2_tool_prompt,
        extract_tool_result,
    )
"""

from typing import Optional


# ============================================
# CONSTANTS
# ============================================

ITEM_CATEGORIES = [
    "Furniture", "Electronics", "Books", "Kitchenware",
    "Clothing", "Fragile", "Artwork", "Collectibles",
    "Appliances", "Tools", "Sports", "Other",
]

DENSITY_VALUES = ["light", "normal", "dense", "heavy"]
ROOM_SIZE_VALUES = ["small", "large", "xlarge"]

MATERIAL_KEYS = [
    "wardrobe_box", "wardrobe_box_small", "wardrobe_box_large",
    "small_box", "medium_box", "large_box",
    "dish_pack_box", "book_box", "tv_box", "mirror_box", "lamp_box",
    "bubble_wrap_12", "bubble_wrap_24", "packing_paper",
    "moving_blanket", "furniture_pad",
    "stretch_wrap", "corner_protector",
    "mattress_bag",
    "chair_cover", "sofa_cover",
]

ESTIMATOR_FLAGS = [
    "HEAVY", "HIGH_VALUE", "FRAGILE", "CHECK_MOISTURE",
    "LIQUID_ITEMS", "DOCUMENTS", "VERIFY_CONTENTS", "DISASSEMBLY",
]


# ============================================
# PASS 1 TOOL: Item Identification (Vision)
# ============================================

PASS1_TOOL = {
    "name": "report_room_contents",
    "description": (
        "Report all packable items visible in the room photo(s). "
        "Each item should be named for PACKING purposes only -- include type, "
        "material, and size when relevant. Omit colors, patterns, brand names, "
        "and character references. "
        "Examples of GOOD names: 'Queen Bed Frame', 'Wooden Bookshelf', "
        "'Table Lamp', 'Quilt Blanket', '4-Drawer Dresser'. "
        "Examples of BAD names: 'Colorful Patchwork Quilt with Winnie the Pooh', "
        "'Dark Brown Vintage Bookshelf', 'Blue Ceramic Vase'."
    ),
    "input_schema": {
        "type": "object",
        "required": ["items", "density", "room_size", "confidence"],
        "properties": {
            "items": {
                "type": "array",
                "description": (
                    "Every MOVABLE, packable item visible. "
                    "INCLUDE: freestanding furniture, electronics, boxes, decor, rugs, baskets, lamps, books, artwork, bedding, clothing, freestanding appliances (fridge, washer/dryer, stove), wall-mounted TVs. "
                    "EXCLUDE anything permanently attached to the building structure — "
                    "recessed/ceiling lights, ceiling fans, pendant fixtures, bathtub, toilet, shower, "
                    "built-in kitchen/bathroom cabinets (screwed to wall), countertops, backsplash, "
                    "built-in shelving, HVAC vents, thermostats, blinds/shutters on tracks, smoke detectors. "
                    "KEY TEST: if removing it requires cutting plumbing, unscrewing from wall/ceiling, "
                    "or structural work → EXCLUDE. If it can be carried out as-is → INCLUDE."
                ),
                "items": {
                    "type": "object",
                    "required": ["name", "category", "quantity", "is_high_value", "is_fragile"],
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": (
                                "Packing-focused name: type + material + size. "
                                "NO colors, patterns, brands, characters. "
                                "GOOD: 'Queen Bed Frame', '4-Drawer Wooden Dresser', 'Quilt Blanket'. "
                                "BAD: 'Colorful Patchwork Quilt', 'Dark Clothing Items on Chair'."
                            ),
                        },
                        "category": {
                            "type": "string",
                            "enum": ITEM_CATEGORIES,
                        },
                        "quantity": {
                            "type": "integer",
                            "minimum": 1,
                            "description": (
                                "Count of items. "
                                "For books: estimated number of individual books (e.g. 80). "
                                "For sectional sofa: number of sections (e.g. 3). "
                                "For identical small items: total count. "
                                "For unique large items: 1."
                            ),
                        },
                        "is_high_value": {
                            "type": "boolean",
                            "description": "True if replacement value > $500",
                        },
                        "estimated_value": {
                            "type": ["string", "null"],
                            "description": "Dollar range string if high-value, else null. E.g. '$800 - $1200'",
                        },
                        "is_fragile": {
                            "type": "boolean",
                            "description": "True if breakable or requires delicate handling",
                        },
                    },
                },
            },
            "density": {
                "type": "string",
                "enum": DENSITY_VALUES,
                "description": (
                    "Rate the PRIMARY living space only. "
                    "EXCLUDE closets, walk-in wardrobes, and attached storage areas — "
                    "their contents are inventoried separately and must NOT inflate density. "
                    "light: sparsely furnished main area (few large pieces, lots of open floor). "
                    "normal: typical furnishing (bed + dresser + nightstands, or equivalent). "
                    "dense: heavily furnished main area (extra furniture, many decor pieces, limited walkway). "
                    "heavy: packed/cluttered main area (hoarding-level, furniture stacked or layered)."
                ),
            },
            "room_size": {
                "type": "string",
                "enum": ROOM_SIZE_VALUES,
                "description": (
                    "small: <80 sqft (bathroom, closet). "
                    "large: 80-250 sqft (bedroom, kitchen). "
                    "xlarge: 250+ sqft (master, basement, garage)."
                ),
            },
            "confidence": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": "Confidence in the overall analysis (0.0-1.0)",
            },
        },
    },
}


# ============================================
# PASS 2 TOOL: Packing Enrichment (Text-only)
# ============================================

PASS2_TOOL = {
    "name": "enrich_packing_details",
    "description": (
        "Add packing details (method, materials, labor, instructions) "
        "to each previously identified item. Return the complete enriched list."
    ),
    "input_schema": {
        "type": "object",
        "required": ["items"],
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "name", "category", "quantity",
                        "is_high_value", "is_fragile",
                        "needs_disassembly", "packing_method",
                        "required_materials", "estimated_labor_hours",
                    ],
                    "properties": {
                        "name": {"type": "string"},
                        "category": {
                            "type": "string",
                            "enum": ITEM_CATEGORIES,
                        },
                        "quantity": {"type": "integer", "minimum": 1},
                        "is_high_value": {"type": "boolean"},
                        "estimated_value": {"type": ["string", "null"]},
                        "is_fragile": {"type": "boolean"},
                        "needs_disassembly": {
                            "type": "boolean",
                            "description": "True only if disassembly is required for transport",
                        },
                        "packing_method": {
                            "type": "string",
                            "description": (
                                "Step-by-step packing instruction. Be specific. "
                                "E.g. 'Empty all drawers; wrap body in moving blanket; "
                                "tape drawers shut with painter's tape; pad corners'"
                            ),
                        },
                        "required_materials": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": MATERIAL_KEYS,
                            },
                            "description": (
                                "Materials needed. REPEAT a key to indicate quantity: "
                                "['sofa_cover','moving_blanket','moving_blanket','stretch_wrap'] "
                                "means 1 sofa cover + 2 blankets + 1 stretch wrap. "
                                "Scale with item size — large furniture needs more blankets."
                            ),
                        },
                        "estimated_labor_hours": {
                            "type": "number",
                            "minimum": 0.05,
                            "maximum": 4.0,
                            "description": (
                                "TOTAL packing time for ONE person for ALL units of this entry combined. "
                                "Per-unit × quantity: "
                                "Small single item: 0.05-0.25h total. "
                                "Chair (qty=1): 0.25-0.5h. "
                                "Large sofa (qty=1): 0.75-1.0h. "
                                "3-section sectional (qty=3): 0.6h × 3 = 1.8h total. "
                                "Book collection (qty=80): 1.5-2.0h total. "
                                "Large wardrobe (qty=1): 1.0-2.0h."
                            ),
                        },
                        "special_instructions": {
                            "type": ["string", "null"],
                            "description": "Field notes. E.g. 'Heavy - 2-man lift', 'Keep cables with item'",
                        },
                        "estimator_flags": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ESTIMATOR_FLAGS,
                            },
                            "description": "Applicable flags for this item",
                        },
                    },
                },
            },
        },
    },
}


# ============================================
# PROMPT BUILDERS
# ============================================

def build_pass1_tool_prompt(
    room_name: str,
    num_images: int,
    existing_items: Optional[list] = None,
) -> str:
    """Build the Pass 1 prompt for use with the report_room_contents tool."""
    multi_note = ""
    if num_images > 1:
        multi_note = (
            f"\nYou see {num_images} photos of the SAME room from different angles. "
            "Count each real-world item ONLY ONCE using spatial reasoning.\n"
        )

    existing_note = ""
    if existing_items:
        items_str = ", ".join(
            f"{item.name} (x{item.quantity})" for item in existing_items
        )
        existing_note = (
            f"\nAlready inventoried (SKIP these): {items_str}\n"
            "Only report items NOT on this list.\n"
        )

    return f"""You are a professional Content Pack-Out Estimator. Analyze the photo(s) and list every packable item.
{multi_note}{existing_note}
NOTE: The user labeled this room "{room_name}" but IGNORE that label when deciding what items exist. Only report what you ACTUALLY SEE in the image.

RULES:
1. Identify every MOVABLE, packable item — furniture, electronics, boxes, decor, rugs, lamps, books, artwork, bedding, clothing, freestanding appliances, etc.
2. DWELLING vs. CONTENT — apply this test for every item you see:
   EXCLUDE if: removing it requires cutting plumbing/electrical, unscrewing from wall/ceiling, or structural work.
   INCLUDE if: it can be picked up and carried out as-is (even if heavy).

   ALWAYS EXCLUDE (permanently attached to structure):
   - Recessed/pot lights, ceiling-mounted light fixtures, ceiling fans
   - Bathtub, shower, toilet — plumbed into floor/wall
   - Built-in kitchen cabinets (upper/lower wall cabinets screwed to wall)
   - Built-in bathroom vanity cabinet (if wall-mounted/plumbed)
   - Countertops, backsplash, tile
   - Built-in shelving or closet organizers attached to walls
   - HVAC vents, thermostats, smoke detectors, electrical panels
   - Window blinds, shutters, or curtain rods mounted to wall/frame

   ALWAYS INCLUDE (freestanding / removable content):
   - Freestanding kitchen island (sits on floor, not bolted to wall)
   - Freestanding wardrobe, armoire, storage cabinet
   - Refrigerator, stove/range, washer, dryer (appliances — move even if connected)
   - Microwave (countertop or over-range — both are content)
   - Wall-mounted TV (content — it's electronics, just needs unmounting)
   - Curtains/drapes (the fabric itself, not the rod)
   - Freestanding baker's rack, shelving unit, or bookshelf

   AMBIGUOUS — USE VISUAL JUDGMENT:
   - Cabinet: if it looks built into the wall (flush, no gap, no legs) → EXCLUDE. If it's freestanding with visible sides/legs → INCLUDE.
   - Shelving: if brackets are screwed into wall with no way to remove shelf as a unit → EXCLUDE. If it's a standalone unit → INCLUDE.

3. ONLY list items you can visually confirm. If an item is partially covered, list what you can SEE (e.g., a quilt covering something bed-shaped = list the quilt AND the bed). Do NOT guess or infer items based on room type or label.
4. NAME items for PACKING: type + material + size. NO colors, patterns, brands, characters, or location info.
   - INCLUDE size/configuration info that AFFECTS PACKING: "3-Section Sectional Sofa", "6-Shelf Tall Bookcase", "4-Drawer Dresser", "King Bed Frame"
   - GOOD: "3-Section L-Shaped Sofa", "Tall 5-Shelf Wooden Bookcase", "Queen Bed Frame", "Large 3-Door Wardrobe"
   - BAD: "Comfortable Sofa", "Nice Bookshelf", "Big Bed"
5. Scan EVERY area: foreground, background, shelves, floor, walls, corners, on top of furniture.
6. Group ONLY identical small items (e.g. "Photo Frame" qty 3). Each distinct item = separate entry.

CRITICAL - REPORT CONTENTS SEPARATELY FROM CONTAINERS:
- If a bookcase/bookshelf has visible books → list the bookcase as "Furniture" AND list "Book Collection" separately as "Books" with an estimated quantity
- If a dresser has visible clothing → list the dresser as "Furniture" AND list "Clothing Items" as "Clothing"
- If shelves have dishes/kitchenware → list as "Kitchenware" separately
- Items ON TOP of furniture (lamps, decor, electronics) → list each separately

DENSITY RATING — PRIMARY SPACE ONLY:
- If any photo shows a closet, walk-in wardrobe, or attached storage area, inventory those items normally BUT do NOT factor them into the density rating.
- Density must reflect how crowded the MAIN living area feels (open floor space, furniture arrangement), not the total item count across all photos.
- A master bedroom with a packed walk-in closet photo is still "normal" density if the bedroom itself is typically furnished.

SOFA/SEATING SIZE RULES (affects material quantity significantly):
- Standard sofa (2-3 cushions, single piece): quantity = 1
- Sectional sofa with 2 pieces: quantity = 2, name = "2-Section Sectional Sofa"
- Sectional sofa with 3+ pieces: quantity = 3 (or more), name = "3-Section Sectional Sofa"
- Each section = separate packing unit requiring its own cover and blankets

Use the report_room_contents tool to submit your findings."""


def build_pass2_tool_prompt(items_json: str) -> str:
    """Build the Pass 2 prompt for use with the enrich_packing_details tool."""
    return f"""You are a professional Content Pack-Out Estimator. Add packing details to these items:

{items_json}

For EACH item, determine:
- needs_disassembly: true only if disassembly is required for transport
- packing_method: step-by-step packing instruction (be specific)
- required_materials: list of material keys needed — REPEAT a key multiple times to indicate quantity needed
- estimated_labor_hours: packing time for ONE person (for this entire item/group)
- special_instructions: field notes if needed (null otherwise)
- estimator_flags: applicable flags

CRITICAL — MATERIAL QUANTITY via REPETITION:
Include each material key once per unit needed. Examples:
- Standard sofa (1 piece): ["sofa_cover", "moving_blanket", "moving_blanket", "stretch_wrap"]
  → 1 sofa cover, 2 blankets, 1 stretch wrap
- 3-section sectional sofa (quantity=3, each section is one item):
  → each section gets: ["sofa_cover", "moving_blanket", "moving_blanket", "stretch_wrap"]
- Large armchair: ["chair_cover", "moving_blanket", "stretch_wrap"]
- Large 5-shelf bookcase (the shelf unit itself, books listed separately):
  ["moving_blanket", "moving_blanket", "stretch_wrap"]  → 2 blankets for a tall unit
- Small 2-shelf bookcase: ["moving_blanket", "stretch_wrap"]
- King/Queen bed frame (disassembly required): ["moving_blanket", "moving_blanket", "moving_blanket", "stretch_wrap"]
- Large 3-door wardrobe: ["moving_blanket", "moving_blanket", "moving_blanket", "stretch_wrap"]
- Dresser (4+ drawers): ["moving_blanket", "moving_blanket", "stretch_wrap"]
- TV 50"+: ["tv_box", "bubble_wrap_12", "bubble_wrap_12"]
- Book collection (100 books): set quantity=100 in item, use ["book_box"] once — calculator divides by 15 books/box automatically
- Glass/dish items: ["dish_pack_box", "packing_paper", "packing_paper"]

SIZE-BASED LABOR GUIDANCE — TOTAL hours for ONE person for ALL units combined:
- Small item (lamp, small decor): 0.05–0.15 hrs
- Medium item (nightstand, chair): 0.25–0.5 hrs
- Standard sofa (qty=1, single piece): 0.75–1.0 hrs total
- 3-section sectional (qty=3): 0.6 hrs/section × 3 = 1.8 hrs total → report 1.8
- Large wardrobe/armoire (qty=1): 1.0–2.0 hrs total (disassembly)
- King/Queen bed frame (qty=1): 0.75–1.5 hrs total (disassembly)
- Large bookcase/5+ shelves (qty=1, unit only): 0.5–1.0 hrs total
- Large appliance/fridge, washer (qty=1): 0.75–1.5 hrs total
- Book collection (qty=80 books): 1.5–2.5 hrs total (boxing + labeling 80 books)
- Fragile set (10-20 pcs glassware, qty=15): 0.5–1.5 hrs total

Keep all original fields (name, category, quantity, is_high_value, estimated_value, is_fragile) unchanged.

Use the enrich_packing_details tool to submit the enriched items."""


# ============================================
# RESULT EXTRACTION
# ============================================

def extract_tool_result(response) -> Optional[dict]:
    """Extract the tool input from a Claude API response.

    When using tool_choice={"type": "tool", "name": "..."}, the response
    contains a tool_use block whose 'input' is the structured data.
    Returns None if no tool_use block is found.
    """
    for block in response.content:
        if block.type == "tool_use":
            return block.input
    return None
