"""Tests for the estimation calculator service."""

import pytest
from services.calculator import EstimateCalculator, DENSITY_MULTIPLIERS, FLOOR_MULTIPLIERS
from models.schemas import (
    RoomInput, QuickEstimateRequest, Density, Floor, ContentHint,
)


class TestEstimateCalculator:
    """Tests for EstimateCalculator core logic."""

    def test_load_prices(self, db):
        calc = EstimateCalculator(db)
        assert len(calc.prices) > 0
        assert "2825" in calc.prices  # Content Manipulation
        assert "2833" in calc.prices  # Small Room

    def test_load_presets(self, db):
        calc = EstimateCalculator(db)
        assert len(calc.presets) > 0
        assert "bedroom_standard" in calc.presets
        assert "kitchen_standard" in calc.presets

    def test_get_price_existing(self, db):
        calc = EstimateCalculator(db)
        price = calc.get_price("2825")
        assert price == 57.31

    def test_get_price_missing_returns_zero(self, db):
        calc = EstimateCalculator(db)
        assert calc.get_price("9999") == 0

    def test_calculate_room_base_valid_preset(self, db):
        calc = EstimateCalculator(db)
        room = RoomInput(preset="bedroom_standard", floor=Floor.FIRST, density=Density.NORMAL)
        price, items = calc.calculate_room_base(room)
        assert price > 0
        assert items > 0

    def test_calculate_room_base_invalid_preset(self, db):
        calc = EstimateCalculator(db)
        room = RoomInput(preset="nonexistent_room", floor=Floor.FIRST, density=Density.NORMAL)
        price, items = calc.calculate_room_base(room)
        assert price == 0
        assert items == 0

    def test_density_multiplier_affects_price(self, db):
        calc = EstimateCalculator(db)
        room_light = RoomInput(preset="bedroom_standard", density=Density.LIGHT)
        room_heavy = RoomInput(preset="bedroom_standard", density=Density.HEAVY)

        price_light, items_light = calc.calculate_room_base(room_light)
        price_heavy, items_heavy = calc.calculate_room_base(room_heavy)

        assert price_heavy > price_light
        assert items_heavy > items_light

    def test_floor_multiplier_affects_price(self, db):
        calc = EstimateCalculator(db)
        room_1st = RoomInput(preset="bedroom_standard", floor=Floor.FIRST)
        room_3rd = RoomInput(preset="bedroom_standard", floor=Floor.THIRD)

        price_1st, _ = calc.calculate_room_base(room_1st)
        price_3rd, _ = calc.calculate_room_base(room_3rd)

        assert price_3rd > price_1st

    def test_calculate_materials_with_hints(self, db):
        calc = EstimateCalculator(db)
        rooms = [
            RoomInput(
                preset="bedroom_standard",
                hints=[ContentHint.CLOTHING_HANGING, ContentHint.FURNITURE],
            )
        ]
        materials = calc.calculate_materials(rooms)
        assert "box_wardrobe" in materials
        assert "blanket" in materials
        assert materials["box_wardrobe"] > 0
        assert materials["blanket"] > 0

    def test_calculate_materials_empty_rooms(self, db):
        calc = EstimateCalculator(db)
        materials = calc.calculate_materials([])
        assert materials == {}

    def test_calculate_materials_includes_mattress(self, db):
        calc = EstimateCalculator(db)
        rooms = [RoomInput(preset="bedroom_standard")]
        materials = calc.calculate_materials(rooms)
        # bedroom_standard has mattress=queen
        assert "mattress_queen" in materials

    def test_calculate_material_cost(self, db):
        calc = EstimateCalculator(db)
        materials = {"box_medium": 5, "blanket": 3}
        cost = calc.calculate_material_cost(materials)
        expected = (calc.get_price("3025") * 5) + (calc.get_price("2915") * 3)
        assert cost == pytest.approx(expected)

    def test_calculate_material_cost_unknown_key(self, db):
        calc = EstimateCalculator(db)
        cost = calc.calculate_material_cost({"nonexistent_material": 10})
        assert cost == 0


class TestFullEstimate:
    """Tests for end-to-end estimate calculation."""

    def test_basic_estimate(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            crew_size=4,
            storage_months=1,
            include_packback=True,
            include_op=True,
            op_rate=10,
        )
        result = calc.calculate_estimate(request)

        assert result.total_rooms == 1
        assert result.total_items > 0
        assert result.total_hours > 0
        assert result.subtotal > 0
        assert result.op_amount > 0
        assert result.grand_total > result.subtotal
        assert result.grand_total == pytest.approx(
            result.subtotal + result.op_amount + result.contingency_amount + result.supplements_total
        )

    def test_estimate_without_op(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_op=False,
            include_contingency=False,
        )
        result = calc.calculate_estimate(request)
        assert result.op_amount == 0
        assert result.contingency_amount == 0
        assert result.grand_total == pytest.approx(result.subtotal + result.supplements_total)

    def test_estimate_without_packback(self, db):
        calc = EstimateCalculator(db)
        req_with = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_packback=True,
            include_op=False,
        )
        req_without = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_packback=False,
            include_op=False,
        )
        result_with = calc.calculate_estimate(req_with)
        result_without = calc.calculate_estimate(req_without)

        assert result_with.grand_total > result_without.grand_total
        assert "Pack-Back Labor" in result_with.sections
        assert "Pack-Back Labor" not in result_without.sections

    def test_estimate_no_storage(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            storage_months=0,
            include_op=False,
        )
        result = calc.calculate_estimate(request)
        assert result.sections["Storage"] == 0

    def test_estimate_multiple_rooms(self, db):
        calc = EstimateCalculator(db)
        req_one = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_op=False,
        )
        req_two = QuickEstimateRequest(
            rooms=[
                RoomInput(preset="bedroom_standard"),
                RoomInput(preset="kitchen_standard"),
            ],
            include_op=False,
        )
        result_one = calc.calculate_estimate(req_one)
        result_two = calc.calculate_estimate(req_two)

        assert result_two.total_rooms == 2
        assert result_two.grand_total > result_one.grand_total

    def test_crew_size_affects_cost(self, db):
        calc = EstimateCalculator(db)
        req_small = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            crew_size=2,
            include_op=False,
        )
        req_large = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            crew_size=6,
            include_op=False,
        )
        result_small = calc.calculate_estimate(req_small)
        result_large = calc.calculate_estimate(req_large)

        assert result_large.grand_total > result_small.grand_total

    def test_all_room_presets_produce_valid_estimate(self, db):
        """Every seeded preset should produce a non-zero estimate."""
        calc = EstimateCalculator(db)
        for key in calc.presets:
            request = QuickEstimateRequest(
                rooms=[RoomInput(preset=key)],
                include_op=False,
                include_contingency=False,
                include_packback=False,
                storage_months=0,
            )
            result = calc.calculate_estimate(request)
            assert result.grand_total > 0, f"Preset '{key}' produced zero estimate"


class TestContingency:
    """Tests for contingency calculation."""

    def test_contingency_default_rate(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_op=False,
            include_contingency=True,
            contingency_rate=5,
        )
        result = calc.calculate_estimate(request)
        expected = round(result.subtotal * 0.05, 2)
        assert result.contingency_amount == expected
        assert result.grand_total == pytest.approx(result.subtotal + expected)

    def test_contingency_disabled(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_op=False,
            include_contingency=False,
        )
        result = calc.calculate_estimate(request)
        assert result.contingency_amount == 0
        assert result.include_contingency is False

    def test_contingency_custom_rate(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_op=False,
            include_contingency=True,
            contingency_rate=10,
        )
        result = calc.calculate_estimate(request)
        expected = round(result.subtotal * 0.10, 2)
        assert result.contingency_amount == expected

    def test_op_and_contingency_together(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_op=True,
            op_rate=10,
            include_contingency=True,
            contingency_rate=5,
        )
        result = calc.calculate_estimate(request)
        expected_op = round(result.subtotal * 0.10, 2)
        expected_cont = round(result.subtotal * 0.05, 2)
        assert result.op_amount == expected_op
        assert result.contingency_amount == expected_cont
        assert result.grand_total == pytest.approx(
            result.subtotal + expected_op + expected_cont + result.supplements_total
        )

    def test_contingency_response_fields(self, db):
        calc = EstimateCalculator(db)
        request = QuickEstimateRequest(
            rooms=[RoomInput(preset="bedroom_standard")],
            include_contingency=True,
            contingency_rate=5,
        )
        result = calc.calculate_estimate(request)
        assert result.include_contingency is True
        assert result.contingency_rate == 5
        assert result.contingency_amount > 0
