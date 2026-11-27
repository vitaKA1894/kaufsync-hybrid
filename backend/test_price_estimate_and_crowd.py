from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from main import app
import models
import auth
import price_service
from database import SessionLocal

client = TestClient(app)


def _create_user(db, prefix: str):
    user = models.User(
        email=f"{prefix}_{datetime.now().timestamp()}@example.com",
        password_hash=auth.get_password_hash("password123"),
        display_name=prefix,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth.create_access_token(data={"sub": user.id})
    return user, {"Authorization": f"Bearer {token}"}


def test_user_prices_crowd_quorum_outliers_bulk_window_and_gdpr_delete():
    db = SessionLocal()
    try:
        u1, h1 = _create_user(db, "price_u1")
        u2, h2 = _create_user(db, "price_u2")
        u3, h3 = _create_user(db, "price_u3")
        u4, h4 = _create_user(db, "price_u4")
        u5, h5 = _create_user(db, "price_u5")

        # Default show_price_estimate is True
        me = client.get("/api/users/me", headers=h1)
        assert me.status_code == 200
        assert me.json()["show_price_estimate"] is True

        # Unique test article key to avoid cross-test interference
        test_key = f"test_quorum_item_{int(datetime.now().timestamp() * 1000)}"

        # 1. Quorum < 3: 2 users set prices -> crowd_prices must NOT expose test_key yet
        client.put("/api/users/me/prices", json={"price_key_type": "article", "price_key": test_key, "unit_price_eur": 1.29}, headers=h1)
        client.put("/api/users/me/prices", json={"price_key_type": "article", "price_key": test_key, "unit_price_eur": 1.49}, headers=h2)
        snap_u5 = client.get("/api/prices/snapshot", headers=h5).json()
        assert all(c["price_key"] != test_key for c in snap_u5["crowd_prices"]), "Quorum < 3 must not expose crowd price"
        # Personal isolation check
        snap_u1 = client.get("/api/prices/snapshot", headers=h1).json()
        assert any(p["price_key"] == test_key and p["unit_price_eur"] == 1.29 for p in snap_u1["user_prices"])
        assert all(p["price_key"] != test_key for p in snap_u5["user_prices"])

        # 2. 3rd distinct user contributes -> quorum reached, crowd median activates (1.29, 1.39, 1.49 -> 1.39)
        client.put("/api/users/me/prices", json={"price_key_type": "article", "price_key": test_key, "unit_price_eur": 1.39}, headers=h3)
        # 4th user submits extreme typo outlier (115.00 EUR) -> excluded/bounded and median remains unskewed
        client.put("/api/users/me/prices", json={"price_key_type": "article", "price_key": test_key, "unit_price_eur": 115.00}, headers=h4)
        # 5th user submits bulk-variant price (is_bulk_variant=True, 18.99) -> isolated from single-unit crowd median
        client.put("/api/users/me/prices", json={"price_key_type": "article", "price_key": test_key, "unit_price_eur": 18.99, "is_bulk_variant": True}, headers=h5)

        snap_after = client.get("/api/prices/snapshot", headers=h5).json()
        crowd_row = next(c for c in snap_after["crowd_prices"] if c["price_key"] == test_key)
        assert crowd_row["contributor_count"] == 4  # u1..u4 (u5 was bulk)
        assert crowd_row["median_price_eur"] == 1.44  # median([1.29, 1.39, 1.49, 115.0]) = (1.39 + 1.49)/2 = 1.44!
        assert crowd_row["source"] == "crowd"

        # Verify taxonomy reference plausibility bound rejects extreme outlier for known staple "milch" (ref 1.15 -> max 4.60)
        assert price_service.is_plausible_crowd_price(1.25, 1.15) is True
        assert price_service.is_plausible_crowd_price(115.0, 1.15) is False
        assert price_service.is_plausible_crowd_price(0.10, 1.15) is False

        # 3. 120-day sliding window: aging out u1 & u2 below 120 days drops valid count < 3 and removes crowd aggregate
        old_dt = datetime.now(timezone.utc) - timedelta(days=125)
        db.query(models.UserItemPrice).filter(
            models.UserItemPrice.price_key == test_key,
            models.UserItemPrice.user_id.in_([u1.id, u2.id])
        ).update({models.UserItemPrice.updated_at: old_dt}, synchronize_session=False)
        db.commit()
        price_service.recompute_crowd_aggregate(db, "article", test_key)
        db.commit()

        snap_aged = client.get("/api/prices/snapshot", headers=h5).json()
        assert all(c["price_key"] != test_key for c in snap_aged["crowd_prices"]), "Expired entries >120d must deactivate crowd aggregate below quorum"

        # 4. Deleting personal override + GDPR account deletion cleanup
        u1_id = u1.id
        del_user = client.request("DELETE", "/api/users/me", json={"current_password": "password123"}, headers=h1)
        assert del_user.status_code == 200
        assert db.query(models.UserItemPrice).filter(models.UserItemPrice.user_id == u1_id).count() == 0

        # 5. Settings opt-out toggle works
        upd = client.put("/api/users/me", json={"display_name": "U2", "show_price_estimate": False}, headers=h2)
        assert upd.status_code == 200
        assert upd.json()["show_price_estimate"] is False
    finally:
        db.close()
