import json
from datetime import datetime
from fastapi.testclient import TestClient
from main import app
import models
import auth
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


def test_user_mappings_isolation_recipes_merge_and_gdpr_delete():
    db = SessionLocal()
    try:
        user_a, headers_a = _create_user(db, "map_user_a")
        user_b, headers_b = _create_user(db, "map_user_b")
        user_a_id = user_a.id
        user_b_id = user_b.id

        # 1. User A learns category override for "Rippchen" -> "Vorratskammer"
        upsert_res = client.put(
            "/api/users/me/item-mappings",
            json={
                "mapping_type": "article",
                "lookup_key": "rippchen",
                "preferred_name": "Rippchen",
                "preferred_category": "Vorratskammer",
                "preferred_icon": "Fleisch",
            },
            headers=headers_a,
        )
        assert upsert_res.status_code == 200
        mapping_id = upsert_res.json()["id"]

        # 2. User A recipe parse uses User A's override; User B gets global fallback/taxonomy
        rec_a = client.post(
            "/api/recipes/parse-text",
            json={"text": "1 kg Rippchen", "title": "BBQ"},
            headers=headers_a,
        )
        rec_b = client.post(
            "/api/recipes/parse-text",
            json={"text": "1 kg Rippchen", "title": "BBQ"},
            headers=headers_b,
        )
        assert rec_a.status_code == 200 and rec_b.status_code == 200
        assert rec_a.json()["ingredients"][0]["category"] == "Vorratskammer"
        assert rec_b.json()["ingredients"][0]["category"] == "Fleisch & Fisch"

        # 3. Strict per-user isolation on GET & DELETE
        list_a = client.get("/api/users/me/item-mappings", headers=headers_a).json()
        list_b = client.get("/api/users/me/item-mappings", headers=headers_b).json()
        assert len(list_a) == 1
        assert len(list_b) == 0

        cross_del = client.delete(f"/api/users/me/item-mappings/{mapping_id}", headers=headers_b)
        assert cross_del.status_code == 404

        # 4. Barcode mapping sync for User A
        sync_res = client.post(
            "/api/users/me/item-mappings/sync",
            json={
                "mappings": [
                    {
                        "mapping_type": "barcode",
                        "lookup_key": "4001234567890",
                        "preferred_name": "Hausmarke Haferdrink",
                        "preferred_category": "Milchprodukte & Tiefkühlkost",
                    }
                ]
            },
            headers=headers_a,
        )
        assert sync_res.status_code == 200
        assert len(sync_res.json()) == 2

        # 5. Smart Duplicate Merging on POST /api/lists/{list_id}/items/bulk
        list_res = client.post("/api/lists", json={"name": "Merge Test Liste"}, headers=headers_a)
        assert list_res.status_code == 200
        list_id = list_res.json()["id"]

        # Create initial plain Milch (qty 1) and explicit Milch · Haferdrink (qty 1)
        client.post(
            f"/api/lists/{list_id}/items",
            json={"name": "Milch", "category": "Milchprodukte & Tiefkühlkost", "quantity": 1},
            headers=headers_a,
        )

        # Bulk import compatible plain Milch (qty 2, Bio) -> should merge onto existing Milch -> qty 3
        bulk_res = client.post(
            f"/api/lists/{list_id}/items/bulk",
            json={
                "recipe_title": "Pfannkuchen",
                "items": [
                    {
                        "name": "Milch",
                        "category": "Milchprodukte & Tiefkühlkost",
                        "quantity": 2,
                        "tags": json.dumps(["Bio"]),
                    }
                ],
            },
            headers=headers_a,
        )
        def _get_list_items():
            lists = client.get("/api/lists", headers=headers_a).json()
            return next(l["items"] for l in lists if l["id"] == list_id)

        assert bulk_res.status_code == 200
        items_after_1 = _get_list_items()
        assert len(items_after_1) == 1
        assert items_after_1[0]["quantity"] == 3.0
        assert "Bio" in items_after_1[0]["tags"]

        # Bulk import explicitly distinct variant (Haferdrink) -> stays separate (2 open items)
        bulk_res2 = client.post(
            f"/api/lists/{list_id}/items/bulk",
            json={
                "recipe_title": "Kaffee",
                "items": [
                    {
                        "name": "Milch",
                        "category": "Milchprodukte & Tiefkühlkost",
                        "quantity": 1,
                        "tags": json.dumps(["Haferdrink"]),
                    }
                ],
            },
            headers=headers_a,
        )
        assert bulk_res2.status_code == 200
        items_after_2 = _get_list_items()
        assert len(items_after_2) == 2

        # 6. User B stores a mapping before User A deletes their account
        client.put(
            "/api/users/me/item-mappings",
            json={
                "mapping_type": "article",
                "lookup_key": "kaffeefilter",
                "preferred_name": "Kaffeefilter Größe 4",
                "preferred_category": "Drogerie, Haushalt & Tierbedarf",
            },
            headers=headers_b,
        )

        # 7. GDPR Account Deletion removes ALL UserItemMapping rows for User A, keeps User B untouched
        del_res = client.request(
            "DELETE",
            "/api/users/me",
            json={"current_password": "password123"},
            headers=headers_a,
        )
        assert del_res.status_code == 200
        remaining_a = db.query(models.UserItemMapping).filter(models.UserItemMapping.user_id == user_a_id).all()
        remaining_b = db.query(models.UserItemMapping).filter(models.UserItemMapping.user_id == user_b_id).all()
        assert len(remaining_a) == 0, "GDPR delete must remove all UserItemMappings of deleted user"
        assert len(remaining_b) == 1, "Other users' mappings must stay isolated and untouched"
    finally:
        db.close()
