"""Tests for the Estimates API endpoints."""


class TestQuickEstimate:
    """Tests for POST /api/estimates/quick."""

    def test_quick_estimate_basic(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [{"preset": "bedroom_standard"}],
            "crew_size": 4,
            "storage_months": 0,
            "include_packback": False,
            "include_op": False,
            "op_rate": 10,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rooms"] == 1
        assert data["total_items"] > 0
        assert data["grand_total"] > 0

    def test_quick_estimate_with_op(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [{"preset": "bedroom_standard"}],
            "include_op": True,
            "op_rate": 10,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["op_amount"] > 0
        assert data["grand_total"] > data["subtotal"]

    def test_quick_estimate_with_contingency(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [{"preset": "bedroom_standard"}],
            "include_op": False,
            "include_contingency": True,
            "contingency_rate": 5,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["contingency_amount"] > 0
        assert data["include_contingency"] is True
        assert data["contingency_rate"] == 5
        assert data["grand_total"] > data["subtotal"]

    def test_quick_estimate_contingency_disabled(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [{"preset": "bedroom_standard"}],
            "include_op": False,
            "include_contingency": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["contingency_amount"] == 0
        assert data["grand_total"] == data["subtotal"]

    def test_quick_estimate_multiple_rooms(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [
                {"preset": "bedroom_standard"},
                {"preset": "kitchen_standard"},
            ],
            "include_op": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rooms"] == 2

    def test_quick_estimate_invalid_preset(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [{"preset": "nonexistent_room"}],
            "include_op": False,
        })
        # Should still return 200 with zero values for unknown preset
        assert resp.status_code == 200

    def test_quick_estimate_empty_rooms(self, client):
        resp = client.post("/api/estimates/quick", json={
            "rooms": [],
            "include_op": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rooms"] == 0


class TestSaveAndRetrieve:
    """Tests for save, list, get, update, delete endpoints."""

    def _quick_estimate(self, client):
        """Helper to generate an estimate response for saving."""
        resp = client.post("/api/estimates/quick", json={
            "rooms": [{"preset": "bedroom_standard"}],
            "include_op": False,
        })
        return resp.json()

    def test_save_estimate(self, client):
        estimate_data = self._quick_estimate(client)
        resp = client.post("/api/estimates/save", json={
            "client_name": "Test Client",
            "property_address": "123 Main St",
            "notes": "Test note",
            "estimate_data": estimate_data,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["client_name"] == "Test Client"
        assert data["id"] is not None
        assert data["grand_total"] == estimate_data["grand_total"]

    def test_list_estimates(self, client):
        # Save one first
        estimate_data = self._quick_estimate(client)
        client.post("/api/estimates/save", json={
            "client_name": "Client A",
            "estimate_data": estimate_data,
        })
        resp = client.get("/api/estimates/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["estimates"]) >= 1

    def test_get_estimate_by_id(self, client):
        estimate_data = self._quick_estimate(client)
        save_resp = client.post("/api/estimates/save", json={
            "client_name": "Client B",
            "estimate_data": estimate_data,
        })
        eid = save_resp.json()["id"]
        resp = client.get(f"/api/estimates/{eid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == eid

    def test_get_estimate_not_found(self, client):
        resp = client.get("/api/estimates/nonexistent")
        assert resp.status_code == 404

    def test_update_estimate_status(self, client):
        estimate_data = self._quick_estimate(client)
        save_resp = client.post("/api/estimates/save", json={
            "client_name": "Client C",
            "estimate_data": estimate_data,
        })
        eid = save_resp.json()["id"]
        resp = client.patch(f"/api/estimates/{eid}/status?status=sent")
        assert resp.status_code == 200
        assert resp.json()["status"] == "sent"

    def test_update_status_not_found(self, client):
        resp = client.patch("/api/estimates/nonexistent/status?status=sent")
        assert resp.status_code == 404

    def test_delete_estimate(self, client):
        estimate_data = self._quick_estimate(client)
        save_resp = client.post("/api/estimates/save", json={
            "client_name": "Client D",
            "estimate_data": estimate_data,
        })
        eid = save_resp.json()["id"]
        resp = client.delete(f"/api/estimates/{eid}")
        assert resp.status_code == 200
        # Verify it's gone
        resp2 = client.get(f"/api/estimates/{eid}")
        assert resp2.status_code == 404

    def test_delete_not_found(self, client):
        resp = client.delete("/api/estimates/nonexistent")
        assert resp.status_code == 404
