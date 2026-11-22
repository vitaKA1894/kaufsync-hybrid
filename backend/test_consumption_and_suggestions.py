import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta, timezone
from main import app
import models
import auth
from database import SessionLocal

client = TestClient(app)

def test_consumption_cycles_and_suggestions():
    db = SessionLocal()
    try:
        # 1. Create test user
        user = models.User(
            email=f"cycle_user_{datetime.now().timestamp()}@example.com",
            password_hash=auth.get_password_hash("password123"),
            display_name="Cycle User",
            status="active"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = auth.create_access_token(data={"sub": user.id})
        headers = {"Authorization": f"Bearer {token}"}

        # Verify default user setting show_restock_suggestions is True
        me_res = client.get("/api/users/me", headers=headers)
        assert me_res.status_code == 200
        assert me_res.json()["show_restock_suggestions"] is True

        # 2. Create shopping list
        list_res = client.post("/api/lists", json={"name": "Supermarkt Liste"}, headers=headers)
        assert list_res.status_code == 200
        list_id = list_res.json()["id"]

        # 3. Simulate purchase history for Hafermilch (every 5 days: 15 days ago, 10 days ago, 5 days ago)
        now = datetime.now(timezone.utc)
        dates = [
            (now - timedelta(days=15)).strftime("%Y-%m-%d"),
            (now - timedelta(days=10)).strftime("%Y-%m-%d"),
            (now - timedelta(days=5)).strftime("%Y-%m-%d"),
        ]

        for d in dates:
            pe = models.PurchaseEvent(
                list_id=list_id,
                article_key="hafermilch",
                display_name="Hafermilch",
                category="Milchprodukte & Tiefkühlkost",
                purchased_date=d
            )
            db.add(pe)
        db.commit()

        # 4. Fetch suggestions: Hafermilch has 5-day cycle, last bought 5 days ago (100% of cycle) -> Due!
        sug_res = client.get(f"/api/lists/{list_id}/suggestions", headers=headers)
        assert sug_res.status_code == 200
        sug_data = sug_res.json()
        assert len(sug_data) == 1
        assert sug_data[0]["article_key"] == "hafermilch"
        assert sug_data[0]["median_cycle_days"] == 5
        assert sug_data[0]["cadence_text"] == "Alle ~5 Tage"

        # 5. Snooze Hafermilch for 3 days
        snooze_res = client.post(
            f"/api/lists/{list_id}/suggestions/snooze",
            json={"article_key": "hafermilch", "days": 3},
            headers=headers
        )
        assert snooze_res.status_code == 200

        # Verify Hafermilch is now hidden due to snooze
        sug_res2 = client.get(f"/api/lists/{list_id}/suggestions", headers=headers)
        assert sug_res2.status_code == 200
        assert len(sug_res2.json()) == 0

        # 6. Checking off Hafermilch clears the snooze
        # Add active item Hafermilch
        item_res = client.post(f"/api/lists/{list_id}/items", json={"name": "Hafermilch"}, headers=headers)
        assert item_res.status_code == 200
        item_id = item_res.json()["id"]

        # Check it off via TOGGLE_STATUS
        sync_res = client.post(f"/api/lists/{list_id}/sync", json={
            "mutations": [
                {
                    "id": "1",
                    "action": "TOGGLE_STATUS",
                    "item_id": item_id,
                    "payload": {"status": "completed"}
                }
            ]
        }, headers=headers)
        assert sync_res.status_code == 200

        # Snooze record should be cleared
        snooze_in_db = db.query(models.SuggestionSnooze).filter(
            models.SuggestionSnooze.list_id == list_id,
            models.SuggestionSnooze.article_key == "hafermilch"
        ).first()
        assert snooze_in_db is None, "Check-off must clear snooze"

        # 7. Undo retraction test:
        # Uncheck it (reactivate / undo)
        undo_res = client.post(f"/api/lists/{list_id}/sync", json={
            "mutations": [
                {
                    "id": "2",
                    "action": "TOGGLE_STATUS",
                    "item_id": item_id,
                    "payload": {"status": "active"}
                }
            ]
        }, headers=headers)
        assert undo_res.status_code == 200

        today_str = now.strftime("%Y-%m-%d")
        today_pe = db.query(models.PurchaseEvent).filter(
            models.PurchaseEvent.list_id == list_id,
            models.PurchaseEvent.source_item_id == item_id,
            models.PurchaseEvent.purchased_date == today_str
        ).first()
        assert today_pe is None, "Undo must retract today's purchase event"

        # 8. Test user setting toggle
        toggle_res = client.put("/api/users/me", json={"display_name": "Cycle User", "show_restock_suggestions": False}, headers=headers)
        assert toggle_res.status_code == 200
        assert toggle_res.json()["show_restock_suggestions"] is False

        sug_res3 = client.get(f"/api/lists/{list_id}/suggestions", headers=headers)
        assert sug_res3.status_code == 200
        assert len(sug_res3.json()) == 0, "Suggestions must be empty when setting is disabled"
    finally:
        db.close()
