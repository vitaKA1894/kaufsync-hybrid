import os
import sys
from fastapi.testclient import TestClient
from datetime import datetime, timezone
import uuid

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from database import SessionLocal
import models
import auth
from main import app

def test_loyalty_cards_and_user_settings():
    client = TestClient(app)
    db = SessionLocal()

    vita = None
    karo = None
    list_id = None

    try:
        # 1. Setup two test users
        suffix = uuid.uuid4().hex[:6]
        email_vita = f"vita_loyalty_{suffix}@test.com"
        email_karo = f"karo_loyalty_{suffix}@test.com"

        vita = models.User(
            email=email_vita,
            password_hash=auth.get_password_hash("password123"),
            display_name="Vita",
            status="active",
            is_admin=False
        )
        karo = models.User(
            email=email_karo,
            password_hash=auth.get_password_hash("password123"),
            display_name="Karo",
            status="active",
            is_admin=False
        )
        db.add_all([vita, karo])
        db.commit()
        db.refresh(vita)
        db.refresh(karo)

        token_vita = auth.create_access_token(data={"sub": vita.id})
        token_karo = auth.create_access_token(data={"sub": karo.id})

        headers_vita = {"Authorization": f"Bearer {token_vita}"}
        headers_karo = {"Authorization": f"Bearer {token_karo}"}

        # 2. Test keep_screen_awake setting defaults to False
        profile_res = client.get("/api/users/me", headers=headers_vita)
        assert profile_res.status_code == 200
        assert profile_res.json()["keep_screen_awake"] is False, "Default keep_screen_awake must be False"
        print("✓ Verified: keep_screen_awake defaults to False.")

        # Update keep_screen_awake to True
        update_res = client.put("/api/users/me", json={
            "display_name": "Vita",
            "keep_screen_awake": True
        }, headers=headers_vita)
        assert update_res.status_code == 200
        assert update_res.json()["keep_screen_awake"] is True, "Setting keep_screen_awake to True must succeed"

        # Check persistence
        profile_res2 = client.get("/api/users/me", headers=headers_vita)
        assert profile_res2.json()["keep_screen_awake"] is True
        print("✓ Verified: keep_screen_awake persists changes via PUT /api/users/me.")

        # 3. Create a shared list (Lidl)
        shared_list = models.List(
            name="Lidl Einkauf",
            created_by=vita.id,
            icon_name="Lidl"
        )
        shared_list.members.append(karo)
        db.add(shared_list)
        db.commit()
        db.refresh(shared_list)
        list_id = shared_list.id

        # 4. Test storing loyalty card for Vita on Lidl list
        put_card_res = client.put(f"/api/lists/{list_id}/loyalty-card", json={
            "code_value": "9901234567890",
            "code_format": "EAN_13"
        }, headers=headers_vita)
        assert put_card_res.status_code == 200, put_card_res.text
        card_data = put_card_res.json()
        assert card_data["code_value"] == "9901234567890"
        assert card_data["code_format"] == "EAN_13"
        assert card_data["list_id"] == list_id
        assert card_data["user_id"] == vita.id
        print("✓ Verified: Storing loyalty card via PUT /api/lists/{list_id}/loyalty-card works.")

        # 5. Test strict 1:1 - Overwriting replaces code for same list
        overwrite_res = client.put(f"/api/lists/{list_id}/loyalty-card", json={
            "code_value": "9909999999999",
            "code_format": "EAN_13"
        }, headers=headers_vita)
        assert overwrite_res.status_code == 200
        assert overwrite_res.json()["id"] == card_data["id"], "Same card entry must be updated, not duplicated"
        assert overwrite_res.json()["code_value"] == "9909999999999"

        # Check total cards for Vita is 1
        all_cards_res = client.get("/api/loyalty-cards", headers=headers_vita)
        assert len(all_cards_res.json()) == 1
        print("✓ Verified: Strict 1:1 per user and list (updates in-place, no duplicates).")

        # 6. Test isolation: Karo has no loyalty card for this list yet
        karo_card_res = client.get(f"/api/lists/{list_id}/loyalty-card", headers=headers_karo)
        assert karo_card_res.status_code == 200
        assert karo_card_res.json() is None, "Karo must not see Vita's personal loyalty card"

        # Karo stores her own different card
        karo_put_res = client.put(f"/api/lists/{list_id}/loyalty-card", json={
            "code_value": "KARO-QR-CARD",
            "code_format": "QR_CODE"
        }, headers=headers_karo)
        assert karo_put_res.status_code == 200
        assert karo_put_res.json()["code_value"] == "KARO-QR-CARD"

        # Vita still has her own card
        vita_card_res = client.get(f"/api/lists/{list_id}/loyalty-card", headers=headers_vita)
        assert vita_card_res.json()["code_value"] == "9909999999999"
        print("✓ Verified: Personal isolation (each member has their own card for a shared list).")

        # 7. Test Delete Loyalty Card
        del_res = client.delete(f"/api/lists/{list_id}/loyalty-card", headers=headers_karo)
        assert del_res.status_code == 200
        karo_card_after_del = client.get(f"/api/lists/{list_id}/loyalty-card", headers=headers_karo)
        assert karo_card_after_del.json() is None
        print("✓ Verified: Deleting loyalty card removes it cleanly.")

        # 8. Test list deletion cleans up associated loyalty cards
        del_list_res = client.delete(f"/api/lists/{list_id}", headers=headers_vita)
        assert del_list_res.status_code == 200
        remaining_cards = db.query(models.ListLoyaltyCard).filter(models.ListLoyaltyCard.list_id == list_id).all()
        assert len(remaining_cards) == 0, "List deletion must remove all loyalty cards for that list"
        print("✓ Verified: Deleting a list cascades to its loyalty cards.")

        print("\n🎉 ALL LOYALTY CARD & USER SETTING TESTS PASSED SUCCESSFULLY!")

    finally:
        if list_id:
            db.query(models.ListLoyaltyCard).filter(models.ListLoyaltyCard.list_id == list_id).delete(synchronize_session=False)
            db.query(models.List).filter(models.List.id == list_id).delete(synchronize_session=False)
        if vita:
            db.query(models.ListLoyaltyCard).filter(models.ListLoyaltyCard.user_id == vita.id).delete(synchronize_session=False)
            db.query(models.User).filter(models.User.id == vita.id).delete(synchronize_session=False)
        if karo:
            db.query(models.ListLoyaltyCard).filter(models.ListLoyaltyCard.user_id == karo.id).delete(synchronize_session=False)
            db.query(models.User).filter(models.User.id == karo.id).delete(synchronize_session=False)
        db.commit()
        db.close()

if __name__ == "__main__":
    test_loyalty_cards_and_user_settings()
