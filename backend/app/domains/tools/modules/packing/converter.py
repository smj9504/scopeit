"""
ScopeIt - Packing Estimate Converter

Converts packing/moving estimation results into estimate line items.
"""
from app.domains.tools.converter import ToolEstimateConverter, register_converter


class PackingEstimateConverter(ToolEstimateConverter):
    """Converts packing estimation results into estimate sections/items."""

    def to_estimate_payload(self, session_data: dict, **kwargs) -> dict:
        """
        Convert packing estimation data to estimate payload.

        Expected session_data shape (when fully implemented):
        {
            "rooms": [{"name": "Master Bedroom", "boxes": 10, "labor_hours": 2}],
            "total_boxes": 30,
            "total_labor_hours": 8,
            ...
        }
        """
        sections = []
        items = []

        rooms = session_data.get("rooms", [])
        for idx, room in enumerate(rooms):
            items.append({
                "name": f"Pack - {room.get('name', f'Room {idx + 1}')}",
                "description": f"Boxes: {room.get('boxes', 0)}",
                "unit": "EA",
                "quantity": room.get("boxes", 1),
                "unit_price": 0,
                "is_taxable": True,
                "order_index": idx,
            })

        if items:
            sections.append({
                "name": "Packing & Moving",
                "order_index": 0,
                "items": items,
            })

        return {
            "title": kwargs.get("title") or "Packing & Moving Estimate",
            "customer_id": kwargs.get("customer_id"),
            "customer_name": kwargs.get("customer_name"),
            "sections": sections,
        }


# Register this converter
register_converter("packing", PackingEstimateConverter())
