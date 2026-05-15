"""Tests for the Prices API endpoints."""


class TestPricesAPI:
    """Tests for Prices CRUD endpoints."""

    def test_get_all_prices(self, client):
        resp = client.get("/api/prices/")
        assert resp.status_code == 200
        data = resp.json()
        assert "prices" in data
        assert len(data["prices"]) > 0
        assert "last_updated" in data

    def test_get_prices_by_category(self, client):
        resp = client.get("/api/prices/by-category")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        for category, items in data.items():
            assert isinstance(items, list)
            assert len(items) > 0
            assert "code" in items[0]
            assert "price" in items[0]

    def test_get_price_by_code(self, client):
        resp = client.get("/api/prices/2825")
        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == "2825"
        assert data["price"] > 0

    def test_get_price_not_found(self, client):
        resp = client.get("/api/prices/9999")
        assert resp.status_code == 404

    def test_update_price(self, client):
        resp = client.put(
            "/api/prices/2825", json={"price": 99.99}
        )
        assert resp.status_code == 200
        assert resp.json()["new_price"] == 99.99
        # Verify it persisted
        resp2 = client.get("/api/prices/2825")
        assert resp2.json()["price"] == 99.99

    def test_update_price_not_found(self, client):
        resp = client.put(
            "/api/prices/9999", json={"price": 10.0}
        )
        assert resp.status_code == 404

    def test_get_room_presets(self, client):
        resp = client.get("/api/prices/presets/rooms")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        found_preset = False
        for category, presets in data.items():
            for preset in presets:
                if preset["key"] == "bedroom_standard":
                    found_preset = True
        assert found_preset, "bedroom_standard preset not found"
