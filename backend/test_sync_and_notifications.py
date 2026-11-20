import os
import sys
from datetime import datetime, timezone
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app
import models, auth
from database import SessionLocal

client = TestClient(app)

def test_sync_activity_logging_and_shopping_notifications():
    db = SessionLocal()
    try:
        # 1. Setup clean test users
        db.query(models.User).filter(models.User.email.in_(["vita@sync-test.com", "karo@sync-test.com"])).delete(synchronize_session=False)
        db.commit()

        vita = models.User(
            email="vita@sync-test.com",
            display_name="Vita",
            password_hash=auth.get_password_hash("pass123"),
            status="active"
        )
        karo = models.User(
            email="karo@sync-test.com",
            display_name="Karo",
            password_hash=auth.get_password_hash("pass123"),
            status="active"
        )
        db.add_all([vita, karo])
        db.commit()
        db.refresh(vita)
        db.refresh(karo)

        token_vita = auth.create_access_token(data={"sub": vita.id})
        token_karo = auth.create_access_token(data={"sub": karo.id})

        # 2. Vita creates a list and adds Karo as a member
        shared_list = models.List(
            name="Familien-Einkauf",
            created_by=vita.id,
            members=[karo]
        )
        db.add(shared_list)
        db.commit()
        db.refresh(shared_list)
        list_id = shared_list.id

        print(f"Created shared list {list_id} with owner Vita and member Karo.")

        # 3. Karo starts shopping: POST /api/lists/{list_id}/start-shopping
        shop_resp = client.post(
            f"/api/lists/{list_id}/start-shopping",
            headers={"Authorization": f"Bearer {token_karo}"}
        )
        assert shop_resp.status_code == 200, f"Shopping start failed: {shop_resp.text}"
        print("✓ Karo started shopping successfully.")

        # Check: Did shopping start leak into ActivityLog? (IT MUST NOT!)
        shop_logs = db.query(models.ActivityLog).filter(models.ActivityLog.list_id == list_id).all()
        assert len(shop_logs) == 0, f"Expected 0 activity logs for shopping start, but found: {len(shop_logs)}"
        print("✓ Verified: Shopping start does NOT generate activity_logs (no pollution of item history).")

        # Check: Did Vita receive a notification in db?
        notifs_vita = db.query(models.Notification).filter(models.Notification.user_id == vita.id).all()
        assert len(notifs_vita) == 1, f"Expected 1 notification for Vita, got {len(notifs_vita)}"
        assert "🛒 Ich gehe einkaufen!" in notifs_vita[0].title
        assert "Karo" in notifs_vita[0].body
        print("✓ Verified: Member Vita received shopping notification.")

        # Check: GET /api/notifications?unread_only=true
        notif_resp = client.get(
            "/api/notifications?unread_only=true",
            headers={"Authorization": f"Bearer {token_vita}"}
        )
        assert notif_resp.status_code == 200
        unread_data = notif_resp.json()
        assert len(unread_data) == 1
        assert unread_data[0]["title"] == "🛒 Ich gehe einkaufen!"
        print("✓ Verified: GET /api/notifications?unread_only=true returns unread notification.")

        # 4. Karo mutates items via POST /api/lists/{list_id}/sync
        # 4a. Add Item "Bio Hafermilch"
        item_id = models.generate_uuid()
        sync_payload = {
            "last_synced_at": None,
            "mutations": [
                {
                    "id": "mut-1",
                    "action": "ADD_ITEM",
                    "item_id": item_id,
                    "payload": {
                        "id": item_id,
                        "name": "Bio Hafermilch",
                        "category": "Milchprodukte & Eier",
                        "quantity": 2,
                        "unit": "Pck",
                        "status": "active"
                    },
                    "client_timestamp": datetime.now(timezone.utc).isoformat()
                }
            ]
        }
        sync_resp = client.post(
            f"/api/lists/{list_id}/sync",
            headers={"Authorization": f"Bearer {token_karo}"},
            json=sync_payload
        )
        assert sync_resp.status_code == 200, f"Sync add failed: {sync_resp.text}"

        # 4b. Toggle status to completed
        sync_payload_toggle = {
            "last_synced_at": None,
            "mutations": [
                {
                    "id": "mut-2",
                    "action": "TOGGLE_STATUS",
                    "item_id": item_id,
                    "payload": {
                        "status": "completed"
                    },
                    "client_timestamp": datetime.now(timezone.utc).isoformat()
                }
            ]
        }
        sync_resp2 = client.post(
            f"/api/lists/{list_id}/sync",
            headers={"Authorization": f"Bearer {token_karo}"},
            json=sync_payload_toggle
        )
        assert sync_resp2.status_code == 200, f"Sync toggle failed: {sync_resp2.text}"

        # 4c. Delete item
        sync_payload_delete = {
            "last_synced_at": None,
            "mutations": [
                {
                    "id": "mut-3",
                    "action": "DELETE_ITEM",
                    "item_id": item_id,
                    "payload": {},
                    "client_timestamp": datetime.now(timezone.utc).isoformat()
                }
            ]
        }
        sync_resp3 = client.post(
            f"/api/lists/{list_id}/sync",
            headers={"Authorization": f"Bearer {token_karo}"},
            json=sync_payload_delete
        )
        assert sync_resp3.status_code == 200, f"Sync delete failed: {sync_resp3.text}"

        # 5. Check Activity Logs via GET /api/lists/{list_id}/changelog
        cl_resp = client.get(
            f"/api/lists/{list_id}/changelog",
            headers={"Authorization": f"Bearer {token_vita}"}
        )
        assert cl_resp.status_code == 200, f"Changelog fetch failed: {cl_resp.text}"
        logs = cl_resp.json()
        print(f"Retrieved {len(logs)} activity logs from changelog endpoint: {logs}")
        assert len(logs) == 3, f"Expected 3 activity logs, got {len(logs)}"

        # Verify action types and user_name
        actions = [l["action_type"] for l in logs]
        assert "deleted" in actions, "Missing 'deleted' in logs"
        assert "completed" in actions, "Missing 'completed' in logs"
        assert "added" in actions, "Missing 'added' in logs"

        for l in logs:
            assert l["user_name"] == "Karo", f"Expected user_name 'Karo', got '{l['user_name']}'"
            assert l["item_name"] == "Bio Hafermilch"

        print("✓ Verified: Activity logging captures added, completed, and deleted items with correct author name.")

        # 6. Test Finish Shopping
        finish_resp = client.post(
            f"/api/lists/{list_id}/finish-shopping",
            headers={"Authorization": f"Bearer {token_karo}"}
        )
        assert finish_resp.status_code == 200, f"Finish shopping failed: {finish_resp.text}"
        assert finish_resp.json() == {"status": "ok"}
        
        # Check that finish shopping did NOT create activity_logs either
        logs_after_finish = client.get(
            f"/api/lists/{list_id}/changelog",
            headers={"Authorization": f"Bearer {token_vita}"}
        ).json()
        assert len(logs_after_finish) == len(logs), "finish-shopping should not pollute changelog"
        print("✓ Verified: Shopping finish does NOT generate activity_logs.")

        # 7. Test Mark All Notifications Read
        mark_resp = client.post(
            "/api/notifications/mark-all-read",
            headers={"Authorization": f"Bearer {token_vita}"}
        )
        assert mark_resp.status_code == 200

        unread_check = client.get(
            "/api/notifications?unread_only=true",
            headers={"Authorization": f"Bearer {token_vita}"}
        )
        assert unread_check.status_code == 200
        assert len(unread_check.json()) == 0
        print("✓ Verified: POST /api/notifications/mark-all-read clears unread notifications.")

        print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")

    finally:
        # Cleanup
        db.query(models.Item).filter(models.Item.list_id == list_id).delete(synchronize_session=False)
        db.query(models.ActivityLog).filter(models.ActivityLog.list_id == list_id).delete(synchronize_session=False)
        db.query(models.Notification).filter(models.Notification.user_id.in_([vita.id, karo.id])).delete(synchronize_session=False)
        db.query(models.List).filter(models.List.id == list_id).delete(synchronize_session=False)
        db.query(models.User).filter(models.User.email.in_(["vita@sync-test.com", "karo@sync-test.com"])).delete(synchronize_session=False)
        db.commit()
        db.close()

if __name__ == "__main__":
    test_sync_activity_logging_and_shopping_notifications()
