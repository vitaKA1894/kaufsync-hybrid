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


def test_out_of_stock_transfer_and_templates():
    db = SessionLocal()
    try:
        user_a, headers_a = _create_user(db, "oos_tmpl_a")
        user_b, headers_b = _create_user(db, "oos_tmpl_b")
        user_a_id = user_a.id
        user_b_id = user_b.id

        # 1. Create Lidl (with Member B) & Netto lists
        lidl_res = client.post("/api/lists", json={"name": "Lidl"}, headers=headers_a)
        netto_res = client.post("/api/lists", json={"name": "Netto"}, headers=headers_a)
        assert lidl_res.status_code == 200 and netto_res.status_code == 200
        lidl_id = lidl_res.json()["id"]
        netto_id = netto_res.json()["id"]

        # Add user_b as member of Lidl to test concurrent edit during transfer
        lidl_obj = db.query(models.List).filter(models.List.id == lidl_id).first()
        lidl_obj.members.append(user_b)
        db.commit()

        # 2. Add items to Lidl & Netto
        milk_lidl = client.post(
            f"/api/lists/{lidl_id}/items",
            json={"name": "Milch", "category": "Milchprodukte & Tiefkühlkost", "quantity": 2, "tags": json.dumps(["Dringend"])},
            headers=headers_a,
        ).json()
        bread_lidl = client.post(
            f"/api/lists/{lidl_id}/items",
            json={"name": "Brot", "category": "Brot & Backwaren", "quantity": 1},
            headers=headers_a,
        ).json()
        apples_lidl = client.post(
            f"/api/lists/{lidl_id}/items",
            json={"name": "Äpfel", "category": "Obst & Gemüse", "quantity": 4},
            headers=headers_a,
        ).json()
        milk_netto = client.post(
            f"/api/lists/{netto_id}/items",
            json={"name": "Milch", "category": "Milchprodukte & Tiefkühlkost", "quantity": 1},
            headers=headers_a,
        ).json()

        # 3. Mark Milch (Lidl) as unavailable -> no PurchaseEvent recorded!
        sync_unavail = client.post(
            f"/api/lists/{lidl_id}/sync",
            json={
                "mutations": [
                    {"id": "m1", "action": "TOGGLE_STATUS", "item_id": milk_lidl["id"], "payload": {"status": "unavailable"}},
                    {"id": "m2", "action": "TOGGLE_STATUS", "item_id": bread_lidl["id"], "payload": {"status": "completed"}},
                ]
            },
            headers=headers_a,
        )
        assert sync_unavail.status_code == 200

        pe_milk = db.query(models.PurchaseEvent).filter(models.PurchaseEvent.source_item_id == milk_lidl["id"]).all()
        assert len(pe_milk) == 0, "Marking unavailable must NOT record a PurchaseEvent"
        pe_bread = db.query(models.PurchaseEvent).filter(models.PurchaseEvent.source_item_id == bread_lidl["id"]).all()
        assert len(pe_bread) == 1

        # 4. CLEAR_COMPLETED on Lidl -> Brot is removed, Milch (unavailable) & Äpfel stay preserved!
        sync_clear = client.post(
            f"/api/lists/{lidl_id}/sync",
            json={"mutations": [{"id": "m3", "action": "CLEAR_COMPLETED", "payload": {}}]},
            headers=headers_a,
        )
        assert sync_clear.status_code == 200
        lidl_items_after_clear = sync_clear.json()["items"]
        lidl_names_after_clear = {i["name"]: i["status"] for i in lidl_items_after_clear}
        assert "Brot" not in lidl_names_after_clear
        assert lidl_names_after_clear.get("Milch") == "unavailable"
        assert lidl_names_after_clear.get("Äpfel") == "active"

        # 5. Concurrent check-off by Member B on Äpfel before Member A transfers both Milch + Äpfel
        client.post(
            f"/api/lists/{lidl_id}/sync",
            json={"mutations": [{"id": "m4", "action": "TOGGLE_STATUS", "item_id": apples_lidl["id"], "payload": {"status": "checked"}}]},
            headers=headers_b,
        )

        # Transfer Milch (unavailable) & Äpfel (now checked by B) -> Milch moves & merges onto Netto Milch (1 + 2 = 3, status active!), Äpfel skipped gracefully
        transfer_res = client.post(
            "/api/items/transfer",
            json={
                "source_list_id": lidl_id,
                "target_list_id": netto_id,
                "item_ids": [milk_lidl["id"], apples_lidl["id"]],
            },
            headers=headers_a,
        )
        assert transfer_res.status_code == 200
        t_data = transfer_res.json()
        assert t_data["moved_count"] == 1
        assert t_data["skipped_count"] == 1
        assert apples_lidl["id"] in t_data["skipped_ids"]

        # Verify Netto Milch is merged qty=3, status='active', keeps 'Dringend'
        lists_a = client.get("/api/lists", headers=headers_a).json()
        netto_items = next(l["items"] for l in lists_a if l["id"] == netto_id)
        lidl_items_final = next(l["items"] for l in lists_a if l["id"] == lidl_id)
        assert len(netto_items) == 1
        assert netto_items[0]["id"] == milk_netto["id"]
        assert netto_items[0]["quantity"] == 3.0
        assert netto_items[0]["status"] == "active"
        assert "Dringend" in (netto_items[0]["tags"] or "")
        assert all(it["id"] != milk_lidl["id"] for it in lidl_items_final)

        # 6. Reusable Shopping Templates CRUD + Isolation + Empty validation + Bulk Apply + GDPR Delete
        bad_tmpl = client.post("/api/templates", json={"name": "Leer", "items": []}, headers=headers_a)
        assert bad_tmpl.status_code == 400

        tmpl_res = client.post(
            "/api/templates",
            json={
                "name": "Grillabend",
                "items": [
                    {
                        "name": "Milch",
                        "quantity": 2,
                        "category": "Milchprodukte & Tiefkühlkost",
                        "variants": [],
                        "meta_tags": ["Angebot"],
                    },
                    {
                        "name": "Bratwurst",
                        "quantity": 6,
                        "category": "Fleisch & Fisch",
                        "variants": ["Grob"],
                        "meta_tags": [],
                    },
                ],
            },
            headers=headers_a,
        )
        assert tmpl_res.status_code == 200
        tmpl_id = tmpl_res.json()["id"]
        assert len(tmpl_res.json()["items"]) == 2

        # User B cannot see or edit User A's template
        assert len(client.get("/api/templates", headers=headers_b).json()) == 0
        assert client.delete(f"/api/templates/{tmpl_id}", headers=headers_b).status_code == 404

        # Update template
        upd_tmpl = client.put(
            f"/api/templates/{tmpl_id}",
            json={
                "name": "Grillabend Deluxe",
                "items": tmpl_res.json()["items"],
            },
            headers=headers_a,
        )
        assert upd_tmpl.status_code == 200
        assert upd_tmpl.json()["name"] == "Grillabend Deluxe"

        # Apply template to Netto via bulk endpoint -> Milch merges (3 + 2 = 5), Bratwurst added
        apply_items = [
            {
                "name": it["name"],
                "quantity": it["quantity"],
                "category": it["category"],
                "unit": it.get("unit") or "Stk",
                "tags": json.dumps((it.get("variants") or []) + (it.get("meta_tags") or [])),
            }
            for it in upd_tmpl.json()["items"]
        ]
        bulk_apply = client.post(
            f"/api/lists/{netto_id}/items/bulk",
            json={"recipe_title": "Vorlage: Grillabend Deluxe", "items": apply_items},
            headers=headers_a,
        )
        assert bulk_apply.status_code == 200
        lists_after_apply = client.get("/api/lists", headers=headers_a).json()
        netto_after = next(l["items"] for l in lists_after_apply if l["id"] == netto_id)
        milch_row = next(i for i in netto_after if i["name"] == "Milch")
        bratwurst_row = next(i for i in netto_after if i["name"] == "Bratwurst")
        assert milch_row["quantity"] == 5.0
        assert bratwurst_row["quantity"] == 6.0

        # GDPR Delete cleans up User A's templates, keeps User B intact
        b_tmpl = client.post(
            "/api/templates",
            json={"name": "User B Basics", "items": [{"name": "Butter", "quantity": 1, "category": "Milchprodukte & Tiefkühlkost"}]},
            headers=headers_b,
        )
        assert b_tmpl.status_code == 200

        del_res = client.request("DELETE", "/api/users/me", json={"current_password": "password123"}, headers=headers_a)
        assert del_res.status_code == 200
        assert db.query(models.ShoppingTemplate).filter(models.ShoppingTemplate.user_id == user_a_id).count() == 0
        assert db.query(models.ShoppingTemplate).filter(models.ShoppingTemplate.user_id == user_b_id).count() == 1
    finally:
        db.close()
