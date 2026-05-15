"""Tests for photo analysis helpers and endpoints."""

from models.schemas import ExistingItem, DetectedContentItem
from routes.photos import (
    build_room_analysis_prompt,
    parse_image_base64,
    build_room_analysis_response,
    calculate_suggested_materials,
    map_room_to_preset,
    get_mock_room_analysis,
    derive_hints_from_items,
)


# ============================================
# build_room_analysis_prompt tests
# ============================================

class TestBuildRoomAnalysisPrompt:

    def test_basic_prompt(self):
        prompt = build_room_analysis_prompt("Master Bedroom", 1)
        assert "Master Bedroom" in prompt
        assert "Content Pack-Out" in prompt

    def test_multi_photo_dedup_instructions(self):
        prompt = build_room_analysis_prompt("Kitchen", 3)
        assert "3 photos" in prompt
        assert "DUPLICATE PREVENTION" in prompt
        assert "Count each real-world item ONLY ONCE" in prompt

    def test_single_photo_no_dedup(self):
        prompt = build_room_analysis_prompt("Kitchen", 1)
        assert "DUPLICATE PREVENTION" not in prompt

    def test_existing_items_cross_reference(self):
        existing = [
            ExistingItem(name="Queen Bed", quantity=1),
            ExistingItem(name="Dresser", quantity=2),
        ]
        prompt = build_room_analysis_prompt("Bedroom", 1, existing)
        assert "Queen Bed" in prompt
        assert "Dresser" in prompt
        assert "EXISTING CONTENT LIST" in prompt
        assert "Do NOT duplicate" in prompt

    def test_no_existing_items(self):
        prompt = build_room_analysis_prompt("Bedroom", 1, None)
        assert "EXISTING CONTENT LIST" not in prompt

    def test_prompt_includes_packing_fields(self):
        prompt = build_room_analysis_prompt("Living Room", 1)
        assert "packing_method" in prompt
        assert "required_materials" in prompt


# ============================================
# parse_image_base64 tests
# ============================================

class TestParseImageBase64:

    def test_plain_base64(self):
        media_type, data = parse_image_base64("abc123base64data")
        assert media_type == "image/jpeg"
        assert data == "abc123base64data"

    def test_data_url_jpeg(self):
        media_type, data = parse_image_base64("data:image/jpeg;base64,abc123")
        assert media_type == "image/jpeg"
        assert data == "abc123"

    def test_data_url_png(self):
        media_type, data = parse_image_base64("data:image/png;base64,xyz789")
        assert media_type == "image/png"
        assert data == "xyz789"

    def test_data_url_webp(self):
        media_type, data = parse_image_base64("data:image/webp;base64,webpdata")
        assert media_type == "image/webp"
        assert data == "webpdata"


# ============================================
# build_room_analysis_response tests
# ============================================

class TestBuildRoomAnalysisResponse:

    def test_basic_conversion(self):
        raw = {
            "items": [
                {
                    "name": "Queen Bed",
                    "category": "Furniture",
                    "quantity": 1,
                    "is_high_value": False,
                    "packing_method": "Wrap in blankets",
                    "required_materials": ["moving_blanket"],
                }
            ],
            "density": "normal",
            "room_size": "large",
            "confidence": 0.9,
        }
        resp = build_room_analysis_response(raw, "Bedroom")
        assert resp.room_name == "Bedroom"
        assert len(resp.items) == 1
        assert resp.items[0].name == "Queen Bed"
        assert resp.items[0].packing_method == "Wrap in blankets"
        assert resp.items[0].required_materials == ["moving_blanket"]
        assert resp.density == "normal"
        assert resp.confidence_score == 0.9

    def test_missing_optional_fields(self):
        raw = {
            "items": [
                {"name": "Chair", "category": "Furniture", "quantity": 2}
            ],
            "density": "light",
            "room_size": "small",
        }
        resp = build_room_analysis_response(raw, "Office")
        assert resp.items[0].packing_method is None
        assert resp.items[0].required_materials is None
        assert resp.confidence_score == 0.7  # default

    def test_empty_items(self):
        raw = {"items": [], "density": "light", "room_size": "small"}
        resp = build_room_analysis_response(raw, "Empty Room")
        assert len(resp.items) == 0


# ============================================
# map_room_to_preset tests
# ============================================

class TestMapRoomToPreset:

    def test_bedroom(self):
        assert map_room_to_preset("Bedroom", "large") == "bedroom_standard"

    def test_master_bedroom(self):
        # "bedroom" matches first in the mapping dict iteration
        assert map_room_to_preset("Master Bedroom", "xlarge") == "bedroom_standard"

    def test_kitchen(self):
        assert map_room_to_preset("Kitchen", "large") == "kitchen_standard"

    def test_living_room(self):
        assert map_room_to_preset("Living Room", "large") == "living_standard"

    def test_garage(self):
        assert map_room_to_preset("Garage", "xlarge") == "garage"

    def test_unknown_xlarge(self):
        assert map_room_to_preset("Mystery Room", "xlarge") == "basement_standard"

    def test_closet_area(self):
        # "closet" matches in the mapping
        assert map_room_to_preset("Tiny Closet Area", "small") == "closet_standard"

    def test_unknown_small(self):
        assert map_room_to_preset("Pantry", "small") == "bathroom"

    def test_unknown_large(self):
        assert map_room_to_preset("Unknown Space", "large") == "living_standard"


# ============================================
# calculate_suggested_materials tests
# ============================================

class TestCalculateSuggestedMaterials:

    def test_furniture_items(self):
        materials = calculate_suggested_materials({"Furniture": 5}, 5)
        assert "blanket" in materials
        assert "furniture_pad" in materials
        assert materials["furniture_pad"] == 5

    def test_electronics_items(self):
        materials = calculate_suggested_materials({"Electronics": 6}, 6)
        assert "box_medium" in materials
        assert "box_tv" in materials

    def test_empty_items(self):
        materials = calculate_suggested_materials({}, 0)
        assert materials == {}

    def test_mixed_items(self):
        items = {"Furniture": 3, "Electronics": 2, "Books": 40, "Kitchenware": 20}
        total = 65
        materials = calculate_suggested_materials(items, total)
        assert "blanket" in materials
        assert "box_book" in materials
        assert "box_dish" in materials


# ============================================
# derive_hints_from_items tests
# ============================================

class TestDeriveHintsFromItems:

    def test_basic_mapping(self):
        items = [
            DetectedContentItem(name="Sofa", category="Furniture", quantity=1),
            DetectedContentItem(name="TV", category="Electronics", quantity=1),
        ]
        hints = derive_hints_from_items(items)
        assert "furniture" in hints
        assert "electronics" in hints

    def test_no_duplicates(self):
        items = [
            DetectedContentItem(name="Chair", category="Furniture", quantity=1),
            DetectedContentItem(name="Table", category="Furniture", quantity=1),
        ]
        hints = derive_hints_from_items(items)
        assert hints.count("furniture") == 1

    def test_empty_items(self):
        assert derive_hints_from_items([]) == []


# ============================================
# get_mock_room_analysis tests
# ============================================

class TestMockRoomAnalysis:

    def test_bedroom_mock(self):
        resp = get_mock_room_analysis("Master Bedroom")
        assert resp.room_name == "Master Bedroom"
        assert len(resp.items) > 0
        # Should have packing info
        for item in resp.items:
            assert item.packing_method is not None
            assert item.required_materials is not None

    def test_kitchen_mock(self):
        resp = get_mock_room_analysis("Kitchen")
        assert any("Dish" in item.name or "Kitchen" in item.name or "Dining" in item.name for item in resp.items)

    def test_living_room_mock(self):
        resp = get_mock_room_analysis("Living Room")
        assert any("Sofa" in item.name for item in resp.items)

    def test_unknown_room_defaults_to_living(self):
        resp = get_mock_room_analysis("Sunroom")
        # Should fall back to living room items
        assert len(resp.items) > 0


# ============================================
# API endpoint tests (mock mode, no API key)
# ============================================

class TestPhotoAnalysisEndpoints:

    def test_analyze_room_returns_mock(self, client):
        resp = client.post("/api/photos/analyze-room", json={
            "room_name": "Bedroom",
            "images": ["fakebase64data"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["room_name"] == "Bedroom"
        assert len(data["items"]) > 0

    def test_analyze_room_with_existing_items(self, client):
        resp = client.post("/api/photos/analyze-room", json={
            "room_name": "Kitchen",
            "images": ["fakebase64data"],
            "existing_items": [{"name": "Dining Table", "quantity": 1}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["room_name"] == "Kitchen"

    def test_analyze_room_no_images(self, client):
        resp = client.post("/api/photos/analyze-room", json={
            "room_name": "Bedroom",
            "images": [],
        })
        assert resp.status_code == 400

    def test_analyze_photos_returns_mock(self, client):
        resp = client.post("/api/photos/analyze", json={
            "images": ["fakebase64data"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "rooms_detected" in data
        assert data["total_items"] > 0

    def test_analyze_photos_no_images(self, client):
        resp = client.post("/api/photos/analyze", json={
            "images": [],
        })
        assert resp.status_code == 400

    def test_rooms_estimate_endpoint(self, client):
        resp = client.post("/api/photos/rooms-estimate", json={
            "rooms": [
                {
                    "room_name": "Bedroom",
                    "items": [
                        {"name": "Bed", "category": "Furniture", "quantity": 1},
                        {"name": "Dresser", "category": "Furniture", "quantity": 1},
                    ],
                    "density": "normal",
                    "floor": "1st",
                }
            ],
            "crew_size": 4,
            "include_op": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rooms"] == 1
        assert data["grand_total"] > 0

    def test_rooms_estimate_empty_rooms(self, client):
        resp = client.post("/api/photos/rooms-estimate", json={
            "rooms": [],
        })
        assert resp.status_code == 400
