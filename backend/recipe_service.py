import re
import json
import os
import logging
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlparse
import requests

logger = logging.getLogger(__name__)

# Candidate locations for taxonomy.json
TAXONOMY_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), '..', 'frontend', 'src', 'assets', 'taxonomy.json'),
    os.path.join(os.path.dirname(__file__), 'taxonomy.json'),
    os.path.join(os.path.dirname(__file__), 'assets', 'taxonomy.json'),
    '/app/frontend/src/assets/taxonomy.json',
    '/var/www/kaufsync/frontend/src/assets/taxonomy.json',
]

_taxonomy_cache: List[Dict[str, Any]] = []
_taxonomy_mtime: float = 0.0

def get_taxonomy() -> List[Dict[str, Any]]:
    global _taxonomy_cache, _taxonomy_mtime
    for path in TAXONOMY_CANDIDATES:
        if os.path.exists(path):
            try:
                mtime = os.path.getmtime(path)
                if mtime != _taxonomy_mtime or not _taxonomy_cache:
                    with open(path, 'r', encoding='utf-8') as f:
                        _taxonomy_cache = json.load(f)
                    _taxonomy_mtime = mtime
                    logger.info(f"Loaded {len(_taxonomy_cache)} items from taxonomy at {path}")
                return _taxonomy_cache
            except Exception as e:
                logger.error(f"Error loading taxonomy from {path}: {e}")
    return _taxonomy_cache

def build_taxonomy_lookups(taxonomy_data: List[Dict[str, Any]]) -> Tuple[Dict[str, Dict], Dict[str, Dict], Dict[str, Dict]]:
    items_by_name = {}
    alias_to_item = {}
    constellation_to_item = {}

    for item in taxonomy_data:
        name = item.get('name')
        if name:
            items_by_name[name.lower().strip()] = item
        for alias in item.get('aliases', []):
            if alias:
                alias_to_item[alias.lower().strip()] = item
        tags = item.get('tags', {})
        if isinstance(tags, dict):
            for c in tags.get('constellations', []):
                if c:
                    constellation_to_item[c.lower().strip()] = item

    return items_by_name, alias_to_item, constellation_to_item

COMPOUND_SUFFIXES = [
    'gewürz', 'gewürze', 'pulver', 'sauce', 'soße', 'dressing',
    'paste', 'öl', 'essig', 'sirup', 'tee', 'aufstrich', 'salz', 'brot', 'brötchen'
]

def should_reject_compound_prefix(clean: str, candidate: str) -> bool:
    if clean.startswith(candidate) and len(clean) > len(candidate):
        remainder = clean[len(candidate):].lstrip('-')
        for s in COMPOUND_SUFFIXES:
            if remainder == s or remainder.startswith(s):
                return True
    return False

def match_ingredient_to_taxonomy(name: str, taxonomy_data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Matches a parsed ingredient name dynamically against the taxonomy (only real item names).
    """
    if not taxonomy_data or not name:
        return None

    items_by_name, _, _ = build_taxonomy_lookups(taxonomy_data)
    clean = name.lower().strip()
    # Strip common cooking adjectives
    clean = re.sub(r'^(frische[srn]?|feine[srn]?|gehackte[srn]?|getrocknete[srn]?|gemahlene[srn]?|gekochte[srn]?|große[srn]?|kleine[srn]?|mittelgroße[srn]?)\s+', '', clean).strip()

    # 1. Exact match on real item name
    if clean in items_by_name:
        return items_by_name[clean]

    # 2. Plural / Singular variations (German)
    variations = [clean]
    if clean.endswith('n') and len(clean) > 3:
        variations.append(clean[:-1])
    if clean.endswith('en') and len(clean) > 4:
        variations.append(clean[:-2])
    if clean.endswith('e') and len(clean) > 3:
        variations.append(clean[:-1])
    if clean.endswith('s') and len(clean) > 3:
        variations.append(clean[:-1])

    variations.append(clean + 'n')
    variations.append(clean + 'en')
    variations.append(clean + 's')

    for var in variations:
        if var in items_by_name:
            return items_by_name[var]

    # 3. Substring matching: candidate must be in clean (e.g. Weizenmehl -> Mehl)
    # clean must NOT be a substring of candidate (e.g. Sesam must not match Sesamstangen/Sesamknäckebrot)
    best_match = None
    longest_len = 0

    for candidate_name, item in items_by_name.items():
        if len(candidate_name) >= 4:
            if should_reject_compound_prefix(clean, candidate_name):
                continue
            if candidate_name in clean:
                if len(candidate_name) > longest_len:
                    longest_len = len(candidate_name)
                    best_match = item

    return best_match

KNOWN_UNITS = {
    'g': 'g', 'gramm': 'g', 'kg': 'kg', 'kilogramm': 'kg',
    'ml': 'ml', 'milliliter': 'ml', 'cl': 'cl', 'dl': 'dl',
    'l': 'l', 'liter': 'l',
    'tl': 'TL', 'teelöffel': 'TL', 'tsp': 'TL',
    'el': 'EL', 'esslöffel': 'EL', 'tbsp': 'EL',
    'prise': 'Prise', 'prisen': 'Prise', 'pinch': 'Prise',
    'bund': 'Bund', 'bündel': 'Bund', 'bunde': 'Bund',
    'dose': 'Dose', 'dosen': 'Dose', 'can': 'Dose',
    'glas': 'Glas', 'gläser': 'Glas',
    'packung': 'Pck.', 'packungen': 'Pck.', 'pck': 'Pck.', 'pck.': 'Pck.', 'pkg': 'Pck.', 'pkg.': 'Pck.',
    'flasche': 'Fl.', 'flaschen': 'Fl.',
    'zehe': 'Zehe', 'zehen': 'Zehe', 'clove': 'Zehe', 'cloves': 'Zehe',
    'knolle': 'Knolle', 'knollen': 'Knolle',
    'stange': 'Stange', 'stangen': 'Stange',
    'scheibe': 'Scheibe', 'scheiben': 'Scheibe',
    'zweig': 'Zweig', 'zweige': 'Zweig',
    'blatt': 'Blatt', 'blätter': 'Blatt',
    'becher': 'Becher',
    'stk': 'Stk', 'stück': 'Stk', 'st': 'Stk'
}

STAPLES_KEYWORDS = [
    'wasser', 'leitungswasser', 'salz', 'speisesalz', 'meersalz', 'steinsalz',
    'pfeffer', 'schwarzer pfeffer', 'weißer pfeffer', 'bunter pfeffer', 'cayennepfeffer',
    'muskat', 'muskatnuss', 'olivenöl', 'speiseöl', 'sonnenblumenöl', 'rapsöl',
    'pflanzenöl', 'bratöl', 'brühe', 'gemüsebrühe', 'fleischbrühe', 'hühnerbrühe',
    'essig', 'balsamico', 'weißweinessig', 'rotweinessig', 'zucker', 'kristallzucker',
    'gewürz', 'gewürze', 'pizzagewürz', 'kräuter', 'italienische kräuter'
]

def is_staple_or_spice(name: str) -> bool:
    clean = name.lower().strip()
    if clean.endswith('gewürz') or clean.endswith('gewürze'):
        return True
    for staple in STAPLES_KEYWORDS:
        if staple == clean or re.search(r'\b' + re.escape(staple) + r'\b', clean):
            return True
    return False

def parse_ingredient_line(text: str) -> Dict[str, Any]:
    text = text.strip()
    # Normalize fraction characters
    fractions_map = {
        '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4',
        '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8'
    }
    normalized = text
    for f_char, f_rep in fractions_map.items():
        normalized = normalized.replace(f_char, f_rep)

    pattern = r'^([\d\s\.,\/\-]+)\s*([a-zA-ZäöüÄÖÜß°\.]*)\s+(.*)$'
    match = re.match(pattern, normalized)

    quantity = 1.0
    unit = 'Stk'
    name = normalized

    if match:
        raw_qty = match.group(1).strip()
        raw_unit = match.group(2).strip().lower().rstrip('.')
        rem_name = match.group(3).strip()

        parsed_qty = None
        if '-' in raw_qty:
            parts = raw_qty.split('-')
            try:
                parsed_qty = float(parts[-1].strip().replace(',', '.'))
            except Exception:
                pass
        elif '/' in raw_qty:
            parts = raw_qty.split()
            total = 0.0
            valid = True
            for part in parts:
                if '/' in part:
                    fparts = part.split('/')
                    try:
                        total += float(fparts[0]) / float(fparts[1])
                    except Exception:
                        valid = False
                else:
                    try:
                        total += float(part.replace(',', '.'))
                    except Exception:
                        valid = False
            if valid and total > 0:
                parsed_qty = round(total, 2)
        else:
            try:
                parsed_qty = float(raw_qty.replace(',', '.'))
            except Exception:
                pass

        if parsed_qty is not None and parsed_qty > 0:
            quantity = parsed_qty
            if raw_unit in KNOWN_UNITS:
                unit = KNOWN_UNITS[raw_unit]
                name = rem_name
            elif raw_unit == '':
                unit = 'Stk'
                name = rem_name
            else:
                name = f"{match.group(2)} {rem_name}".strip()
                unit = 'Stk'
        else:
            name = text

    # Clean name
    name = re.sub(r'^(ca\.|etwas|frische[srn]?|feine[srn]?|gehackte[srn]?)\s+', '', name, flags=re.IGNORECASE).strip()
    name = re.sub(r'[,;].*$', '', name).strip()
    name = re.sub(r'\(.*?\)', '', name).strip()

    # Format name nicely
    if name:
        name = name[0].upper() + name[1:] if len(name) > 1 else name.upper()

    return {
        "raw": text,
        "quantity": quantity,
        "unit": unit,
        "name": name
    }

def parse_servings(servings_val: Any) -> float:
    if not servings_val:
        return 4.0
    if isinstance(servings_val, (int, float)):
        return float(servings_val)
    if isinstance(servings_val, list) and servings_val:
        return parse_servings(servings_val[0])
    s_str = str(servings_val)
    match = re.search(r'(\d+([\.,]\d+)?)', s_str)
    if match:
        try:
            val = float(match.group(1).replace(',', '.'))
            if val > 0:
                return float(round(val))
        except Exception:
            pass
    return 4.0

def fetch_mealie_recipe(url: str) -> Optional[Dict[str, Any]]:
    """
    Checks if the URL is a Mealie instance and fetches the recipe via Mealie's REST API.
    """
    parsed = urlparse(url)
    path = parsed.path.strip('/')
    
    # Matches patterns like /recipe/<slug> or /recipes/<slug>
    parts = path.split('/')
    if len(parts) >= 2 and parts[0] in ['recipe', 'recipes']:
        slug = parts[1]
        origin = f"{parsed.scheme}://{parsed.netloc}"
        api_url = f"{origin}/api/recipes/{slug}"

        try:
            resp = requests.get(
                api_url,
                headers={"Accept": "application/json", "User-Agent": "KaufSync-RecipeImport/1.0"},
                timeout=8
            )
            if resp.status_code == 200:
                data = resp.json()
                title = data.get("name") or data.get("title") or "Mealie Rezept"
                image = data.get("image")
                if image and not image.startswith("http"):
                    image = f"{origin.rstrip('/')}/{image.lstrip('/')}"
                
                servings = parse_servings(data.get("recipeYield") or data.get("yield") or 4)

                ingredients_raw = []
                for ing in data.get("recipeIngredient", []):
                    if isinstance(ing, dict):
                        food = ing.get("food")
                        food_name = food.get("name") if isinstance(food, dict) else (food or "")
                        unit = ing.get("unit")
                        unit_name = unit.get("name") if isinstance(unit, dict) else (unit or "")
                        quantity = ing.get("quantity")
                        orig = ing.get("originalText")
                        note = ing.get("note") or ""

                        if orig:
                            ingredients_raw.append(orig)
                        elif food_name:
                            q_str = f"{quantity} " if quantity else ""
                            u_str = f"{unit_name} " if unit_name else ""
                            n_str = f" ({note})" if note else ""
                            ingredients_raw.append(f"{q_str}{u_str}{food_name}{n_str}".strip())
                    elif isinstance(ing, str):
                        ingredients_raw.append(ing)

                if ingredients_raw:
                    return {
                        "title": title,
                        "image": image,
                        "servings": servings,
                        "ingredients_raw": ingredients_raw,
                        "source": "mealie"
                    }
        except Exception as e:
            logger.warning(f"Mealie API check failed for {api_url}: {e}")

    return None

def fetch_schema_org_recipe(url: str) -> Optional[Dict[str, Any]]:
    """
    Fetches web page HTML and parses Schema.org Recipe JSON-LD.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return None
        html = resp.text
    except Exception as e:
        logger.error(f"Failed to fetch recipe URL {url}: {e}")
        return None

    # Search for all ld+json script tags
    json_ld_matches = re.findall(r'<script[^>]*type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>', html, re.DOTALL | re.IGNORECASE)

    for block in json_ld_matches:
        block = block.strip()
        try:
            data = json.loads(block)
        except Exception:
            continue

        recipe_obj = None

        def find_recipe(obj):
            if isinstance(obj, dict):
                t = obj.get("@type")
                if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
                    return obj
                if "@graph" in obj and isinstance(obj["@graph"], list):
                    for g in obj["@graph"]:
                        res = find_recipe(g)
                        if res:
                            return res
            elif isinstance(obj, list):
                for item in obj:
                    res = find_recipe(item)
                    if res:
                        return res
            return None

        recipe_obj = find_recipe(data)
        if recipe_obj:
            title = recipe_obj.get("name") or "Rezept"
            
            # Extract image
            img_val = recipe_obj.get("image")
            image = None
            if isinstance(img_val, str):
                image = img_val
            elif isinstance(img_val, list) and img_val:
                image = img_val[0] if isinstance(img_val[0], str) else img_val[0].get("url")
            elif isinstance(img_val, dict):
                image = img_val.get("url")

            servings = parse_servings(recipe_obj.get("recipeYield"))
            ingredients_raw = recipe_obj.get("recipeIngredient") or []
            if isinstance(ingredients_raw, str):
                ingredients_raw = [ingredients_raw]

            if ingredients_raw:
                return {
                    "title": title,
                    "image": image,
                    "servings": servings,
                    "ingredients_raw": ingredients_raw,
                    "source": "json-ld"
                }

    return None

def parse_recipe_url(url: str) -> Dict[str, Any]:
    """
    Main entry point: fetches recipe from Mealie or Web, parses ingredients,
    and matches them against the dynamic KaufSync taxonomy.
    """
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    # 1. Try Mealie first
    recipe_data = fetch_mealie_recipe(url)

    # 2. Try Schema.org / Web scraping
    if not recipe_data:
        recipe_data = fetch_schema_org_recipe(url)

    if not recipe_data:
        raise ValueError("Unter dieser URL konnte kein Rezept mit strukturierten Zutaten gefunden werden. Bitte prüfe den Link.")

    taxonomy_data = get_taxonomy()
    parsed_ingredients = []

    for raw_line in recipe_data["ingredients_raw"]:
        if not raw_line or not str(raw_line).strip():
            continue
        parsed_item = parse_ingredient_line(str(raw_line))

        # Dynamic match against taxonomy
        matched = match_ingredient_to_taxonomy(parsed_item["name"], taxonomy_data)

        if matched:
            item_name = matched.get("name", parsed_item["name"])
            category = matched.get("category", "Sonstiges")
            icon = matched.get("icon")
            is_matched = True
        else:
            item_name = parsed_item["name"]
            lower_name = item_name.lower()
            if any(k in lower_name for k in ['gewürz', 'kräuter', 'samen', 'kerne', 'öl', 'essig', 'soße', 'sauce', 'senf', 'sesam', 'hefe', 'backpulver', 'zucker', 'salz', 'mehl', 'stärke']):
                category = "Vorratskammer"
            elif any(k in lower_name for k in ['fleisch', 'hack', 'wurst', 'hähnchen', 'pute', 'rind', 'fisch', 'lachs', 'garnele']):
                category = "Fleisch & Fisch"
            elif any(k in lower_name for k in ['brot', 'brötchen', 'toast', 'baguette', 'croissant', 'bun']):
                category = "Brot & Backwaren"
            elif any(k in lower_name for k in ['milch', 'käse', 'joghurt', 'sahne', 'quark', 'butter', 'schmand', 'creme']):
                category = "Milchprodukte & Tiefkühlkost"
            elif any(k in lower_name for k in ['salat', 'kohl', 'pilz', 'beere', 'frucht', 'apfel', 'tomate', 'gurke']):
                category = "Obst & Gemüse"
            else:
                category = "Sonstiges"
            icon = None
            is_matched = False

        # Pantry / Staples check: water, salt, pepper etc. are deselected by default
        is_staple = is_staple_or_spice(parsed_item["name"]) or is_staple_or_spice(item_name)
        selected_by_default = not is_staple

        # Structure pack count vs Ausprägung (tag)
        u_clean = (parsed_item["unit"] or "").lower().rstrip('.')
        is_weight_or_vol = u_clean in ['g', 'gramm', 'kg', 'kilogramm', 'ml', 'milliliter', 'cl', 'dl', 'l', 'liter']
        is_spoon_or_pinch = u_clean in ['el', 'esslöffel', 'tl', 'teelöffel', 'prise', 'prisen', 'msp', 'msp.', 'n.b.', 'n. b.']
        is_container = u_clean in ['dose', 'dosen', 'becher', 'glas', 'gläser', 'packung', 'pck', 'pck.', 'bund', 'bündel', 'flasche', 'fl.']

        item_tags = []
        if is_weight_or_vol:
            q_num = parsed_item["quantity"]
            q_str = str(int(q_num)) if isinstance(q_num, (int, float)) and q_num.is_integer() else str(q_num)
            item_tags.append(f"{q_str}{parsed_item['unit']}")
            final_qty = 1.0
            final_unit = "Stk"
        elif is_spoon_or_pinch:
            q_num = parsed_item["quantity"]
            q_str = str(int(q_num)) if isinstance(q_num, (int, float)) and q_num.is_integer() else str(q_num)
            item_tags.append(f"{q_str} {parsed_item['unit']}".strip())
            final_qty = 1.0
            final_unit = "Stk"
        elif is_container:
            final_qty = parsed_item["quantity"]
            final_unit = "Stk"
            if u_clean in ['dose', 'dosen']:
                item_tags.append(f"{int(final_qty)} Dosen" if final_qty > 1 else "Dose")
            elif u_clean in ['becher']:
                item_tags.append("Becher")
            elif u_clean in ['glas', 'gläser']:
                item_tags.append("Glas")
            elif u_clean in ['bund', 'bündel']:
                item_tags.append("Bund")
            else:
                item_tags.append(parsed_item["unit"])
        else:
            final_qty = parsed_item["quantity"]
            final_unit = "Stk"

        parsed_ingredients.append({
            "raw": parsed_item["raw"],
            "name": item_name,
            "original_name": parsed_item["name"],
            "quantity": final_qty,
            "base_quantity": final_qty,
            "unit": final_unit,
            "display_amount": f"{parsed_item['quantity']} {parsed_item['unit']}".strip(),
            "recipe_quantity": parsed_item["quantity"],
            "recipe_unit": parsed_item["unit"],
            "tags": item_tags,
            "category": category,
            "icon": icon,
            "matched": is_matched,
            "is_staple": is_staple,
            "selected": selected_by_default
        })

    return {
        "title": recipe_data.get("title", "Importiertes Rezept"),
        "image": recipe_data.get("image"),
        "servings": recipe_data.get("servings", 4.0),
        "source": recipe_data.get("source", "web"),
        "url": url,
        "ingredients": parsed_ingredients
    }
