import json
import os
import recipe_service

VALID_CATEGORIES = {
    "Obst & Gemüse",
    "Brot & Backwaren",
    "Fleisch & Fisch",
    "Milchprodukte & Tiefkühlkost",
    "Vorratskammer",
    "Getränke & Genussmittel",
    "Drogerie, Haushalt & Tierbedarf",
    "Sonstiges",
}

VALID_STORAGE = {"ambient", "chilled", "frozen"}
VALID_PANTRY_VALUES = {False, "always", "small_amounts"}
REQUIRED_SCHEMA_V2_KEYS = {
    "id",
    "name",
    "category",
    "subcategory",
    "storage",
    "icon",
    "defaultUnit",
    "allowedUnits",
    "aliases",
    "brands",
    "searchKeywords",
    "variants",
    "packSizes",
    "attributes",
    "recipe",
    "consumption",
}


def _norm(s: str) -> str:
    return (
        (s or "")
        .lower()
        .replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
        .replace("é", "e")
        .replace("è", "e")
    )


def test_taxonomy_integrity_and_sync():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    frontend_tax_path = os.path.join(repo_root, "frontend", "src", "assets", "taxonomy.json")
    backend_tax_path = os.path.join(repo_root, "backend", "assets", "taxonomy.json")
    icons_dir = os.path.join(repo_root, "frontend", "public", "icons")

    with open(frontend_tax_path, "r", encoding="utf-8") as f:
        frontend_raw = f.read()
    with open(backend_tax_path, "r", encoding="utf-8") as f:
        backend_raw = f.read()

    assert frontend_raw == backend_raw, "Frontend and backend taxonomy.json must stay identical"

    taxonomy = json.loads(frontend_raw)
    assert len(taxonomy) >= 560

    ids = [item["id"] for item in taxonomy]
    names = [item["name"].strip() for item in taxonomy]
    assert len(ids) == len(set(ids)), "Duplicate taxonomy IDs found"
    assert len(names) == len({n.lower() for n in names}), "Duplicate taxonomy names found"

    names_lower = {n.lower() for n in names}
    alias_owners = {}
    disk_icons = {
        _norm(fn[:-4])
        for fn in os.listdir(icons_dir)
        if fn.endswith(".svg")
    }
    valid_units = set(recipe_service.KNOWN_UNITS.values())

    for item in taxonomy:
        name = item["name"].strip()
        assert REQUIRED_SCHEMA_V2_KEYS.issubset(item.keys()), f"Missing Schema v2 keys on {name}"
        assert "tags" not in item, f"Legacy tags object still present on {name}"

        assert item["category"] in VALID_CATEGORIES, f"Invalid category for {name}: {item['category']}"
        assert isinstance(item["subcategory"], str) and item["subcategory"].strip(), f"Empty subcategory on {name}"
        assert item["storage"] in VALID_STORAGE, f"Invalid storage on {name}: {item['storage']}"

        icon_name = item.get("icon") or ""
        assert _norm(icon_name) in disk_icons, f"Missing SVG icon file for {name}: {icon_name}"

        default_unit = item["defaultUnit"]
        allowed_units = item["allowedUnits"]
        assert isinstance(allowed_units, list) and len(allowed_units) >= 1, f"Missing allowedUnits on {name}"
        assert default_unit in allowed_units, f"defaultUnit '{default_unit}' not in allowedUnits on {name}"
        for u in allowed_units:
            assert u in valid_units or u.lower().rstrip(".") in recipe_service.KNOWN_UNITS, (
                f"Unknown unit '{u}' on {name}"
            )

        seen_aliases = set()
        for alias in item["aliases"]:
            al = alias.strip().lower()
            assert al, f"Empty alias on {name}"
            assert al != name.lower(), f"Self-alias on {name}: {alias}"
            assert al not in names_lower, f"Alias '{alias}' on {name} matches another item's primary name"
            assert al not in seen_aliases, f"Duplicate alias on {name}: {alias}"
            assert al not in alias_owners, f"Alias collision '{alias}' between {alias_owners[al]} and {name}"
            seen_aliases.add(al)
            alias_owners[al] = name

        for field in ("brands", "searchKeywords", "variants", "packSizes", "attributes"):
            arr = item[field]
            assert isinstance(arr, list), f"{field} must be list on {name}"
            seen_vals = set()
            for val in arr:
                assert isinstance(val, str) and val.strip(), f"Invalid entry in {field} on {name}"
                assert "  " not in val, f"Double spaces in {field} on {name}: '{val}'"
                vl = val.strip().lower()
                assert vl not in seen_vals, f"Duplicate value in {field} on {name}: '{val}'"
                seen_vals.add(vl)

        recipe_meta = item["recipe"]
        assert recipe_meta["pantryStaple"] in VALID_PANTRY_VALUES, f"Invalid pantryStaple on {name}"
        assert isinstance(recipe_meta["matchPriority"], int) and 1 <= recipe_meta["matchPriority"] <= 100

        cons_meta = item["consumption"]
        assert isinstance(cons_meta["typicalCycleDays"], int) and cons_meta["typicalCycleDays"] > 0
        assert isinstance(cons_meta["perishable"], bool)

    # Spot-check misclassified categories & newly added staples
    by_name = {item["name"]: item for item in taxonomy}
    assert by_name["Spülmaschinensalz"]["category"] == "Drogerie, Haushalt & Tierbedarf"
    assert by_name["Tütensuppe"]["category"] == "Vorratskammer"
    assert by_name["Fertigsuppe"]["category"] == "Vorratskammer"
    assert by_name["Kokosmilch"]["category"] == "Vorratskammer"
    assert by_name["Kreuzkümmel"]["recipe"]["pantryStaple"] == "small_amounts"
    assert by_name["Kidneybohnen"]["defaultUnit"] == "Dose"
    assert by_name["Schraubgläser"]["category"] == "Drogerie, Haushalt & Tierbedarf"
    assert by_name["Pizza"]["storage"] == "frozen"
    assert by_name["Milch"]["storage"] == "chilled"
