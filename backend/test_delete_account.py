import os
import sys
from fastapi.testclient import TestClient

# Ensure backend dir is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app
import models, auth
from database import SessionLocal

client = TestClient(app)

def test_account_deletion_flow():
    db = SessionLocal()
    try:
        # Clean test users if left over
        db.query(models.User).filter(models.User.email.in_(["admin1@test.com", "user_a@test.com", "user_b@test.com"])).delete(synchronize_session=False)
        db.commit()

        # 1. Test Sole Admin Safeguard
        admin_pass = auth.get_password_hash("adminpass123")
        admin = models.User(
            email="admin1@test.com",
            display_name="Admin One",
            password_hash=admin_pass,
            is_admin=True,
            status="active"
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        # Ensure only 1 admin exists for test
        total_admins = db.query(models.User).filter(models.User.is_admin == True).count()
        assert total_admins == 1, f"Expected 1 admin, found {total_admins}"

        admin_token = auth.create_access_token(data={"sub": admin.id})

        # Try to delete sole admin
        del_resp = client.request(
            "DELETE",
            "/api/users/me",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"current_password": "adminpass123"}
        )
        assert del_resp.status_code == 400, f"Expected 400, got {del_resp.status_code}: {del_resp.text}"
        assert "einzige Administrator" in del_resp.json()["detail"]
        print("✓ Sole admin safeguard passed!")

        # 2. Test Wrong Password
        del_resp_wrong = client.request(
            "DELETE",
            "/api/users/me",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"current_password": "wrongpassword"}
        )
        assert del_resp_wrong.status_code == 400
        assert "Passwort ist nicht korrekt" in del_resp_wrong.json()["detail"]
        print("✓ Wrong password rejection passed!")

        # 3. Create normal users A and B
        pass_hash = auth.get_password_hash("secret123")
        user_a = models.User(
            email="user_a@test.com",
            display_name="User Alpha",
            password_hash=pass_hash,
            is_admin=False,
            status="active"
        )
        user_b = models.User(
            email="user_b@test.com",
            display_name="User Beta",
            password_hash=pass_hash,
            is_admin=False,
            status="active"
        )
        db.add_all([user_a, user_b])
        db.commit()
        db.refresh(user_a)
        db.refresh(user_b)

        user_a_id = user_a.id
        user_b_id = user_b.id

        token_a = auth.create_access_token(data={"sub": user_a.id})
        token_b = auth.create_access_token(data={"sub": user_b.id})

        # User A creates a personal list
        personal_list = models.List(
            name="Personal List A",
            icon_name="cart",
            created_by=user_a.id
        )
        db.add(personal_list)
        db.commit()
        db.refresh(personal_list)
        personal_list_id = personal_list.id

        item_p = models.Item(
            list_id=personal_list.id,
            name="Private Item",
            last_modified_by=user_a.id
        )
        db.add(item_p)

        # User A creates a shared list with User B
        shared_list = models.List(
            name="Shared Household List",
            icon_name="cart",
            created_by=user_a.id
        )
        shared_list.members.append(user_b)
        db.add(shared_list)
        db.commit()
        db.refresh(shared_list)
        shared_list_id = shared_list.id

        item_s = models.Item(
            list_id=shared_list.id,
            name="Shared Milk",
            last_modified_by=user_a.id
        )
        log_s = models.ActivityLog(
            list_id=shared_list.id,
            user_id=user_a.id,
            action_type="added",
            item_name="Shared Milk"
        )
        notif_a = models.Notification(
            user_id=user_a.id,
            title="Welcome",
            body="Welcome to KaufSync"
        )
        sub_a = models.PushSubscription(
            user_id=user_a.id,
            endpoint="https://push.example.com/a",
            p256dh="key",
            auth="auth"
        )
        db.add_all([item_s, log_s, notif_a, sub_a])
        db.commit()

        # User A deletes account
        del_a_resp = client.request(
            "DELETE",
            "/api/users/me",
            headers={"Authorization": f"Bearer {token_a}"},
            json={"current_password": "secret123"}
        )
        assert del_a_resp.status_code == 200, f"Deletion failed: {del_a_resp.text}"
        print("✓ User A deletion returned 200 OK")

        # Verify User A is gone
        assert db.query(models.User).filter(models.User.id == user_a_id).first() is None
        print("✓ User A record deleted from database")

        # Verify Personal List is gone
        assert db.query(models.List).filter(models.List.id == personal_list_id).first() is None
        assert db.query(models.Item).filter(models.Item.name == "Private Item").first() is None
        print("✓ Personal list and items removed")

        # Verify Shared List was transferred to User B
        surviving_list = db.query(models.List).filter(models.List.id == shared_list_id).first()
        assert surviving_list is not None
        assert surviving_list.created_by == user_b_id
        print(f"✓ Shared list ownership transferred to User B: {surviving_list.created_by == user_b_id}")

        # Verify User A's push subs, notifs deleted
        assert db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_a_id).count() == 0
        assert db.query(models.Notification).filter(models.Notification.user_id == user_a_id).count() == 0
        print("✓ User A's push subscriptions and notifications purged")

        # Verify Surviving Activity Log is anonymized
        surviving_log = db.query(models.ActivityLog).filter(models.ActivityLog.list_id == shared_list_id).first()
        assert surviving_log is not None
        assert surviving_log.user_id is None
        print("✓ Surviving activity log user_id anonymized to None")

        # Verify User B reading changelog sees "Ehemaliges Mitglied"
        cl_resp = client.get(
            f"/api/lists/{shared_list_id}/changelog",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert cl_resp.status_code == 200
        logs = cl_resp.json()
        assert len(logs) > 0
        assert logs[0]["user_name"] == "Ehemaliges Mitglied"
        print(f"✓ Changelog displays user_name as '{logs[0]['user_name']}'")

    finally:
        # Cleanup test data
        db.query(models.User).filter(models.User.email.in_(["admin1@test.com", "user_a@test.com", "user_b@test.com"])).delete(synchronize_session=False)
        db.query(models.List).filter(models.List.name.in_(["Personal List A", "Shared Household List"])).delete(synchronize_session=False)
        db.commit()
        db.close()

if __name__ == "__main__":
    test_account_deletion_flow()
    print("\nALL ACCOUNT DELETION TESTS PASSED SUCCESSFULLY! 🎉")
