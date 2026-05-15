"""Tests for content-based estimation features (gap fixes).

Covers: aggregate_item_materials, classify_labor_hours, recommend_crew_size,
calculate_estimate_from_content, get_prices_dict, and export DB prices pipeline.
"""

import pytest
from services.calculator import EstimateCalculator
from models.schemas import (
    RoomsEstimateRequest,
    RoomContentInput,
    DetectedContentItem,
)


# ============================================
# Material key normalization
# ============================================

class TestNormalizeMaterialKey:

    def test_alias_moving_blanket(self):
        assert EstimateCalculator._normalize_material_key("moving_blanket") == "blanket"

    def test_alias_stretch_wrap(self):
        assert EstimateCalculator._normalize_material_key("stretch_wrap") == "shrink_wrap"

    def test_alias_wardrobe_box(self):
        assert EstimateCalculator._normalize_material_key("wardrobe_box") == "box_wardrobe"

    def test_direct_key(self):
        assert EstimateCalculator._normalize_material_key("box_medium") == "box_medium"

    def test_unknown_key_returns_none(self):
        assert EstimateCalculator._normalize_material_key("alien_material") is None


# ============================================
# Aggregate item materials
# ============================================

class TestAggregateItemMaterials:

    def test_basic_aggregation(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Bedroom",
                items=[
                    DetectedContentItem(
                        name="Sofa", category="Furniture", quantity=1,
                        required_materials=["moving_blanket", "shrink_wrap"],
                    ),
                    DetectedContentItem(
                        name="Lamp", category="Fragile", quantity=2,
                        required_materials=["box_lamp"],
                    ),
                ],
            )
        ]
        materials = calc.aggregate_item_materials(rooms)
        assert materials["blanket"] == 1
        assert materials["shrink_wrap"] == 1
        assert materials["box_lamp"] == 2

    def test_no_required_materials_uses_category_defaults(self, db):
        """Items without required_materials fall back to category-based defaults."""
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Room",
                items=[
                    DetectedContentItem(name="Chair", category="Furniture", quantity=1),
                ],
            )
        ]
        materials = calc.aggregate_item_materials(rooms)
        # Furniture category default: moving_blanket×2 + stretch_wrap
        assert materials.get("blanket", 0) > 0
        assert materials.get("shrink_wrap", 0) > 0

    def test_unknown_materials_skipped(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Room",
                items=[
                    DetectedContentItem(
                        name="Thing", category="Other", quantity=1,
                        required_materials=["unknown_material_xyz"],
                    ),
                ],
            )
        ]
        materials = calc.aggregate_item_materials(rooms)
        assert materials == {}

    def test_multi_room_accumulation(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Room1",
                items=[DetectedContentItem(
                    name="Bed", category="Furniture", quantity=1,
                    required_materials=["blanket"],
                )],
            ),
            RoomContentInput(
                room_name="Room2",
                items=[DetectedContentItem(
                    name="Dresser", category="Furniture", quantity=2,
                    required_materials=["blanket"],
                )],
            ),
        ]
        materials = calc.aggregate_item_materials(rooms)
        assert materials["blanket"] == 3  # 1 + 2


# ============================================
# Labor tier classification
# ============================================

class TestClassifyLaborHours:

    def test_furniture_splits_standard_and_disassembly(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Room",
                items=[
                    DetectedContentItem(name="Bed", category="Furniture", quantity=1),
                ],
            )
        ]
        hours = calc.classify_labor_hours(rooms)
        assert hours["standard"] > 0 or hours["furniture_disassembly"] > 0
        # Furniture should split 70/30
        total_furniture = hours["standard"] + hours["furniture_disassembly"]
        assert total_furniture > 0

    def test_fragile_items(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Room",
                items=[
                    DetectedContentItem(name="Vase", category="Fragile", quantity=5),
                ],
            )
        ]
        hours = calc.classify_labor_hours(rooms)
        assert hours["fragile"] > 0
        assert hours["standard"] == 0

    def test_specialty_items(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Room",
                items=[
                    DetectedContentItem(name="TV", category="Electronics", quantity=1),
                ],
            )
        ]
        hours = calc.classify_labor_hours(rooms)
        assert hours["specialty"] > 0

    def test_high_value_goes_specialty(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomContentInput(
                room_name="Room",
                items=[
                    DetectedContentItem(
                        name="Painting", category="Artwork", quantity=1,
                        is_high_value=True,
                    ),
                ],
            )
        ]
        hours = calc.classify_labor_hours(rooms)
        assert hours["specialty"] > 0

    def test_empty_rooms_all_zero(self, db):
        calc = EstimateCalculator(db)
        hours = calc.classify_labor_hours([])
        assert all(v == 0 for v in hours.values())


# ============================================
# Crew size recommendation
# ============================================

class TestRecommendCrewSize:

    def test_small_job(self):
        assert EstimateCalculator.recommend_crew_size(1, 30) == 2

    def test_medium_job(self):
        assert EstimateCalculator.recommend_crew_size(3, 100) == 3

    def test_standard_job(self):
        assert EstimateCalculator.recommend_crew_size(5, 250) == 4

    def test_large_job(self):
        assert EstimateCalculator.recommend_crew_size(9, 500) == 5

    def test_very_large_job(self):
        assert EstimateCalculator.recommend_crew_size(12, 800) == 6


# ============================================
# Full content-based estimate
# ============================================

class TestCalculateEstimateFromContent:

    def _make_request(self, rooms_data, **kwargs):
        rooms = []
        for r in rooms_data:
            items = [
                DetectedContentItem(**item) for item in r["items"]
            ]
            rooms.append(RoomContentInput(
                room_name=r["name"],
                items=items,
                density=r.get("density", "normal"),
                floor=r.get("floor", "1st"),
            ))
        return RoomsEstimateRequest(rooms=rooms, **kwargs)

    def test_basic_content_estimate(self, db):
        calc = EstimateCalculator(db)
        req = self._make_request([{
            "name": "Bedroom",
            "items": [
                {"name": "Queen Bed", "category": "Furniture", "quantity": 1,
                 "required_materials": ["blanket", "shrink_wrap"]},
                {"name": "Dresser", "category": "Furniture", "quantity": 1,
                 "required_materials": ["blanket"]},
                {"name": "Nightstand", "category": "Furniture", "quantity": 2},
            ],
        }])
        result = calc.calculate_estimate_from_content(req)
        assert result.total_rooms == 1
        assert result.total_items == 4
        assert result.grand_total > 0
        assert result.subtotal > 0

    def test_content_estimate_with_op(self, db):
        calc = EstimateCalculator(db)
        req = self._make_request(
            [{"name": "Room", "items": [
                {"name": "Sofa", "category": "Furniture", "quantity": 1},
            ]}],
            include_op=True,
            op_rate=10,
        )
        result = calc.calculate_estimate_from_content(req)
        assert result.op_amount > 0
        assert result.grand_total > result.subtotal

    def test_content_estimate_without_op(self, db):
        calc = EstimateCalculator(db)
        req = self._make_request(
            [{"name": "Room", "items": [
                {"name": "Chair", "category": "Furniture", "quantity": 1},
            ]}],
            include_op=False,
            include_contingency=False,
        )
        result = calc.calculate_estimate_from_content(req)
        assert result.op_amount == 0
        assert result.contingency_amount == 0
        assert result.grand_total == result.subtotal

    def test_content_estimate_no_packback(self, db):
        calc = EstimateCalculator(db)
        req_with = self._make_request(
            [{"name": "Room", "items": [
                {"name": "Table", "category": "Furniture", "quantity": 1},
            ]}],
            include_packback=True, include_op=False,
        )
        req_without = self._make_request(
            [{"name": "Room", "items": [
                {"name": "Table", "category": "Furniture", "quantity": 1},
            ]}],
            include_packback=False, include_op=False,
        )
        result_with = calc.calculate_estimate_from_content(req_with)
        result_without = calc.calculate_estimate_from_content(req_without)
        assert result_with.grand_total >= result_without.grand_total

    def test_content_estimate_multiple_rooms(self, db):
        calc = EstimateCalculator(db)
        req = self._make_request([
            {"name": "Bedroom", "items": [
                {"name": "Bed", "category": "Furniture", "quantity": 1},
            ]},
            {"name": "Kitchen", "items": [
                {"name": "Plates", "category": "Kitchenware", "quantity": 20},
                {"name": "Pots", "category": "Kitchenware", "quantity": 10},
            ]},
        ], include_op=False)
        result = calc.calculate_estimate_from_content(req)
        assert result.total_rooms == 2
        assert result.total_items == 31

    def test_content_estimate_with_required_materials(self, db):
        calc = EstimateCalculator(db)
        req = self._make_request([{
            "name": "Living Room",
            "items": [
                {"name": "Sofa", "category": "Furniture", "quantity": 1,
                 "required_materials": ["blanket", "shrink_wrap"]},
                {"name": "TV", "category": "Electronics", "quantity": 1,
                 "required_materials": ["box_tv", "bubble_wrap_24"]},
            ],
        }], include_op=False)
        result = calc.calculate_estimate_from_content(req)
        # Materials section should have cost > 0
        assert "Materials" in result.sections
        assert result.sections["Materials"] > 0

    def test_content_estimate_sections_present(self, db):
        calc = EstimateCalculator(db)
        req = self._make_request([{
            "name": "Room",
            "items": [
                {"name": "Item", "category": "Furniture", "quantity": 5,
                 "required_materials": ["blanket"]},
            ],
        }], storage_months=1, include_op=False)
        result = calc.calculate_estimate_from_content(req)
        assert "Pack-Out Labor" in result.sections
        assert "Materials" in result.sections
        assert "Transport Out" in result.sections
        assert "Storage" in result.sections

    def test_rooms_estimate_api_with_materials(self, client):
        """End-to-end API test with per-item required_materials."""
        resp = client.post("/api/photos/rooms-estimate", json={
            "rooms": [{
                "room_name": "Bedroom",
                "items": [
                    {"name": "Bed", "category": "Furniture", "quantity": 1,
                     "required_materials": ["blanket", "shrink_wrap"]},
                    {"name": "Dresser", "category": "Furniture", "quantity": 1,
                     "required_materials": ["blanket", "furniture_pad"]},
                ],
                "density": "normal",
                "floor": "1st",
            }],
            "crew_size": 4,
            "include_op": True,
            "op_rate": 10,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rooms"] == 1
        assert data["total_items"] == 2
        assert data["grand_total"] > 0
        assert data["sections"]["Materials"] > 0


# ============================================
# get_prices_dict
# ============================================

class TestGetPricesDict:

    def test_returns_dict(self, db):
        calc = EstimateCalculator(db)
        prices = calc.get_prices_dict()
        assert isinstance(prices, dict)
        assert len(prices) > 0

    def test_contains_known_keys(self, db):
        calc = EstimateCalculator(db)
        prices = calc.get_prices_dict()
        # Keys are Xactimate codes like "2825", "2833"
        assert "2825" in prices  # Content Manipulation
        assert "2833" in prices  # Small Room
        # Values should be positive floats
        for v in prices.values():
            assert isinstance(v, (int, float))
            assert v >= 0


# ============================================
# Export endpoints with DB prices
# ============================================

class TestExportWithDbPrices:

    def _get_estimate_data(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [{"preset": "bedroom_standard"}],
            "include_op": False,
        })
        return resp.json()

    def test_direct_pdf_export(self, client):
        data = self._get_estimate_data(client)
        resp = client.post("/api/export/direct/pdf", json={
            "estimate_data": data,
            "client_name": "Test",
        })
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"

    def test_direct_excel_export(self, client):
        data = self._get_estimate_data(client)
        resp = client.post("/api/export/direct/excel", json={
            "estimate_data": data,
            "client_name": "Test",
        })
        assert resp.status_code == 200
        assert "spreadsheetml" in resp.headers["content-type"]

    def test_saved_pdf_export(self, client):
        data = self._get_estimate_data(client)
        save_resp = client.post("/api/estimates/save", json={
            "client_name": "Export Test",
            "estimate_data": data,
        })
        eid = save_resp.json()["id"]
        resp = client.get(f"/api/export/saved/{eid}/pdf")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"

    def test_saved_excel_export(self, client):
        data = self._get_estimate_data(client)
        save_resp = client.post("/api/estimates/save", json={
            "client_name": "Export Test",
            "estimate_data": data,
        })
        eid = save_resp.json()["id"]
        resp = client.get(f"/api/export/saved/{eid}/excel")
        assert resp.status_code == 200
        assert "spreadsheetml" in resp.headers["content-type"]
