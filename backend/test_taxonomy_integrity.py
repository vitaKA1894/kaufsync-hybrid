import json
import os
import re
from collections import Counter

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
    assert len(taxonomy) > 0

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

    for item in taxonomy:
        name = item["name"].strip()
        assert item["category"] in VALID_CATEGORIES, f"Invalid category for {name}: {item['category']}"

        icon_name = item.get("icon") or ""
        assert _norm(icon_name) in disk_icons, f"Missing SVG icon file for {name}: {icon_name}"

        seen_aliases = set()
        for alias in item.get("aliases", []):
            al = alias.strip().lower()
            assert al, f"Empty alias on {name}"
            assert al != name.lower(), f"Self-alias on {name}: {alias}"
            assert al not in names_lower, f"Alias '{alias}' on {name} matches another item's primary name"
            assert al not in seen_aliases, f"Duplicate alias on {name}: {alias}"
            assert al not in alias_owners, f"Alias collision '{alias}' between {alias_owners[al]} and {name}"
            seen_aliases.add(al)
            alias_owners[al] = name

        constellations = item.get("tags", {}).get("constellations", [])
        seen_consts = set()
        for c in constellations:
            assert "  " not in c, f"Double spaces in constellation on {name}: '{c}'"
            cl = c.strip().lower()
            assert cl not in seen_consts, f"Duplicate constellation on {name}: '{c}'"
            seen_consts.add(cl)

    # Spot-check previously misclassified categories
    by_name = {item["name"]: item for item in taxonomy}
    assert by_name["Spülmaschinensalz"]["category"] == "Drogerie, Haushalt & Tierbedarf"
    assert by_name["Tütensuppe"]["category"] == "Vorratskammer"
    assert by_name["Fertigsuppe"]["category"] == "Vorratskammer"
    assert by_name["Kokosmilch"]["category"] == "Vorratskammer"
    assert by_name["Knoblauchpulver"]["category"] == "Vorratskammer"
    assert by_name["Zwiebelpulver"]["category"] == "Vorratskammer"
    assert by_name["Agavendicksaft"]["category"] == "Vorratskammer"
    assert by_name["Ahornsirup"]["category"] == "Vorratskammer"
    assert by_name["Zuckerrübensirup"]["category"] == "Vorratskammer"
