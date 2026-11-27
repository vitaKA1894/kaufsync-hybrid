import pytest
from unittest.mock import patch, MagicMock
import requests
import recipe_service

def test_monsieur_cuisine_live_or_mocked():
    """Test fetching Monsieur Cuisine erdbeer-marmelade-2 reference URL."""
    try:
        res = recipe_service.parse_recipe_url("https://www.monsieur-cuisine.com/de/recipe/erdbeer-marmelade-2")
        assert "Erdbeer" in res["title"]
        assert res["servings"] >= 1
        assert len(res["ingredients"]) >= 3
        # Check ingredients contains Erdbeeren and Gelierzucker
        names = [i["name"].lower() for i in res["ingredients"]]
        assert any("erdbeer" in n for n in names)
        assert any("zucker" in n or "gelier" in n for n in names)
    except recipe_service.RecipeImportError as e:
        # If external network blocks bot or IP in test environment, verify error is structured
        assert e.code in ['blocked_or_auth', 'timeout_or_network', 'not_found', 'no_recipe_found']
        assert "Failed to fetch" not in e.user_message

def test_section_header_filtering():
    """Verify that section headers are never added as ingredients."""
    headers = [
        "Für den Rub:",
        "Für die Soße:",
        "Für den Teig",
        "Zum Garnieren:",
        "Rub:",
        "Glasur:",
        "Zutaten für die Marinade:"
    ]
    for h in headers:
        assert recipe_service.is_section_header(h) is True

    valid_lines = [
        "1 Zwiebel",
        "500 g Mehl",
        "Salz und Pfeffer",
        "3 EL Paprikapulver"
    ]
    for v in valid_lines:
        assert recipe_service.is_section_header(v) is False

def test_german_ingredient_parsing_accuracy():
    """Verify decomposition of lines into quantity, unit, core item, specification."""
    # 1. Unicode fraction
    res = recipe_service.parse_ingredient_line("½ TL Salz")
    assert res["quantity"] == 0.5
    assert res["unit"] == "TL"
    assert "Salz" in res["name"]

    # 2. German decimal comma
    res = recipe_service.parse_ingredient_line("1,5 kg Kartoffeln")
    assert res["quantity"] == 1.5
    assert res["unit"] == "kg"
    assert "Kartoffeln" in res["name"]

    # 3. Missing space between number and unit
    res = recipe_service.parse_ingredient_line("500g Hackfleisch")
    assert res["quantity"] == 500.0
    assert res["unit"] == "g"
    assert "Hackfleisch" in res["name"]

    res_oil = recipe_service.parse_ingredient_line("2EL Olivenöl")
    assert res_oil["quantity"] == 2.0
    assert res_oil["unit"] == "EL"
    assert "Olivenöl" in res_oil["name"]

    # 4. Container with weight in parentheses
    res = recipe_service.parse_ingredient_line("1 Dose (400 g) stückige Tomaten")
    assert res["quantity"] == 1.0
    assert res["unit"] == "Dose"
    assert "400 g" in res["notes"]
    assert "Tomaten" in res["name"]

    # 5. Container with à
    res = recipe_service.parse_ingredient_line("2 Packungen à 250 g Quark")
    assert res["quantity"] == 2.0
    assert res["unit"] == "Pck."
    assert "250 g" in res["notes"][0]
    assert "Quark" in res["name"]

    # 6. Preparation notes & specification
    res = recipe_service.parse_ingredient_line("2 Zwiebeln, fein gewürfelt")
    assert res["quantity"] == 2.0
    assert "Zwiebel" in res["name"]
    assert "fein gewürfelt" in res["notes"]

    res_pap = recipe_service.parse_ingredient_line("3 EL Paprikapulver, edelsüß")
    assert res_pap["quantity"] == 3.0
    assert res_pap["unit"] == "EL"
    assert "Paprikapulver" in res_pap["name"]
    assert res_pap["specification"] == "Edelsüß"

    # 7. German number words
    res_cit = recipe_service.parse_ingredient_line("eine halbe Zitrone")
    assert res_cit["quantity"] == 0.5
    assert "Zitrone" in res_cit["name"]

    res_pet = recipe_service.parse_ingredient_line("ein Bund Petersilie")
    assert res_pet["quantity"] == 1.0
    assert res_pet["unit"] == "Bund"

    # 8. Numeric range
    res_knobl = recipe_service.parse_ingredient_line("2-3 Zehen Knoblauch")
    assert res_knobl["quantity"] == 3.0
    assert res_knobl["unit"] == "Zehe"
    assert "Knoblauch" in res_knobl["name"]

    # 9. Compound unit word
    res_zehe = recipe_service.parse_ingredient_line("1 Knoblauchzehe")
    assert res_zehe["quantity"] == 1.0
    assert res_zehe["unit"] == "Zehe"
    assert res_zehe["name"] == "Knoblauch"

    # 10. Quantity-less
    res_sp = recipe_service.parse_ingredient_line("Salz und Pfeffer")
    assert res_sp["quantity"] is None

def test_taxonomy_and_category_matching():
    """Verify taxonomy matching and category fallback rules."""
    lines = [
        "6 kg Rippchen (Loin Ribs)",
        "500 g Gelierzucker",
        "3 EL Paprikapulver, edelsüß",
        "2 Zwiebeln, halbiert",
        "1 Bund frisches Basilikum",
        "250 ml Schlagsahne"
    ]
    items = recipe_service.process_ingredient_lines(lines)

    by_name = {it["name"].lower(): it for it in items}

    # Rippchen -> Fleisch & Fisch
    rippchen = next(it for it in items if "rippchen" in it["name"].lower())
    assert rippchen["category"] == "Fleisch & Fisch"
    assert rippchen["specification"] == "Loin Ribs"

    # Gelierzucker -> Vorratskammer, NOT staple
    sugar = next(it for it in items if "gelierzucker" in it["name"].lower())
    assert sugar["category"] == "Vorratskammer"
    assert sugar["is_pantry_staple"] is False
    assert sugar["selected"] is True

    # Paprikapulver -> Vorratskammer, spec Edelsüß
    pap = next(it for it in items if "paprikapulver" in it["name"].lower())
    assert pap["category"] == "Vorratskammer"
    assert pap["specification"] == "Edelsüß"

    # Zwiebel -> Obst & Gemüse
    zwiebel = next(it for it in items if "zwiebel" in it["name"].lower())
    assert zwiebel["category"] == "Obst & Gemüse"

    # Basilikum (frisch) -> Obst & Gemüse, NOT staple
    basilikum = next(it for it in items if "basilikum" in it["name"].lower())
    assert basilikum["category"] == "Obst & Gemüse"
    assert basilikum["is_pantry_staple"] is False

    # Schlagsahne -> Milchprodukte & Tiefkühlkost
    sahne = next(it for it in items if "sahne" in it["name"].lower())
    assert sahne["category"] == "Milchprodukte & Tiefkühlkost"

def test_duplicate_merging_within_recipe():
    """Verify that multiple occurrences of the same item are merged."""
    lines = [
        "3 EL Paprikapulver, edelsüß",
        "1 EL Paprikapulver",
        "500 g Mehl",
        "0,5 kg Mehl",
        "1 Zwiebel",
        "1 EL Zwiebel"
    ]
    items = recipe_service.process_ingredient_lines(lines)

    # Paprikapulver: 3 EL + 1 EL = 4 EL
    pap = next(it for it in items if "paprikapulver" in it["name"].lower())
    assert pap["quantity"] == 4.0
    assert pap["unit"] == "EL"
    assert pap["display_quantity"] == "4 EL"
    assert pap["was_merged"] is True
    assert len(pap["original_lines"]) == 2
    assert pap["specification"] == "Edelsüß"

    # Mehl: 500 g + 0.5 kg = 1 kg
    mehl = next(it for it in items if "mehl" in it["name"].lower())
    assert mehl["quantity"] == 1.0
    assert mehl["unit"] == "kg"
    assert mehl["display_quantity"] == "1 kg"
    assert mehl["was_merged"] is True
    assert len(mehl["original_lines"]) == 2

    # Incompatible units: 1 Stk Zwiebel and 1 EL Zwiebel must NOT merge into a single quantity
    zwiebeln = [it for it in items if "zwiebel" in it["name"].lower()]
    assert len(zwiebeln) == 2
    units = {z["unit"] for z in zwiebeln}
    assert "Stk" in units and "EL" in units

def test_clean_german_number_formatting():
    """Verify numbers have no .0 artifacts and use German comma."""
    assert recipe_service.format_german_quantity(5.0, "EL") == "5 EL"
    assert recipe_service.format_german_quantity(1.5, "kg") == "1,5 kg"
    assert recipe_service.format_german_quantity(0.25, "l") == "0,25 l"
    assert recipe_service.format_german_quantity(500.0, "g") == "500 g"
    assert recipe_service.format_german_quantity(1.0, "Dose") == "1 Dose"
    assert recipe_service.format_german_quantity(None, "Prise") == "Prise"

def test_text_import():
    """Verify plain text parsing functionality."""
    raw_text = """
    Für den Teig:
    500 g Mehl
    1 Pck. Backpulver
    150 g Zucker
    2 Eier
    1 Prise Salz
    """
    res = recipe_service.parse_recipe_text(raw_text, title="Kuchen")
    assert res["title"] == "Kuchen"
    assert res["source"] == "text"
    assert len(res["ingredients"]) == 5

    names = [i["name"].lower() for i in res["ingredients"]]
    assert "mehl" in names
    assert "backpulver" in names
    assert "eier" in names

    salz = next(i for i in res["ingredients"] if "salz" in i["name"].lower())
    assert salz["is_pantry_staple"] is True
    assert salz["selected"] is False

def test_structured_error_handling_no_failed_to_fetch():
    """Verify technical errors translate to friendly German messages without 'Failed to fetch'."""
    with patch("requests.get") as mock_get:
        # Mock 404
        mock_get.return_value.status_code = 404
        with pytest.raises(recipe_service.RecipeImportError) as exc_info:
            recipe_service.parse_recipe_url("https://example.com/not-found")
        assert exc_info.value.code == "not_found"
        assert "nicht gefunden" in exc_info.value.user_message
        assert "Failed to fetch" not in exc_info.value.user_message

    with patch("requests.get") as mock_get:
        # Mock 403 / Bot block
        mock_get.return_value.status_code = 403
        with pytest.raises(recipe_service.RecipeImportError) as exc_info:
            recipe_service.parse_recipe_url("https://example.com/blocked")
        assert exc_info.value.code == "blocked_or_auth"
        assert "blockiert" in exc_info.value.user_message
        assert "Failed to fetch" not in exc_info.value.user_message

    with patch("requests.get") as mock_get:
        # Mock network timeout
        mock_get.side_effect = requests.Timeout("Connection timed out")
        with pytest.raises(recipe_service.RecipeImportError) as exc_info:
            recipe_service.parse_recipe_url("https://example.com/timeout")
        assert exc_info.value.code == "timeout_or_network"
        assert "unterbrochen" in exc_info.value.user_message
        assert "Failed to fetch" not in exc_info.value.user_message


def test_schema_v2_staples_and_new_items():
    """Verify Schema v2 recipe.pantryStaple and newly added staples in recipe import."""
    lines = [
        "1 TL Kreuzkümmel",
        "1 Dose Kidneybohnen",
        "6 Schraubgläser",
        "200 g Cheddar",
    ]
    items = recipe_service.process_ingredient_lines(lines)
    by_name = {it["name"]: it for it in items}

    assert by_name["Kreuzkümmel"]["category"] == "Vorratskammer"
    assert by_name["Kreuzkümmel"]["is_pantry_staple"] is True
    assert by_name["Kreuzkümmel"]["selected"] is False

    assert by_name["Kidneybohnen"]["category"] == "Vorratskammer"
    assert by_name["Kidneybohnen"]["is_pantry_staple"] is False

    assert by_name["Schraubgläser"]["category"] == "Drogerie, Haushalt & Tierbedarf"
    assert by_name["Cheddar"]["category"] == "Milchprodukte & Tiefkühlkost"
