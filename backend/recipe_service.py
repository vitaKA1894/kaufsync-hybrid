import re
import json
import os
import uuid
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
        for variant in item.get('variants', []):
            if variant:
                constellation_to_item[variant.lower().strip()] = item
        tags = item.get('tags', {})
        if isinstance(tags, dict):
            for c in tags.get('constellations', []):
                if c:
                    constellation_to_item[c.lower().strip()] = item

    return items_by_name, alias_to_item, constellation_to_item

# --- STRUCTURED EXCEPTIONS ---
class RecipeImportError(Exception):
    def __init__(self, code: str, user_message: str, status_code: int = 400):
        super().__init__(user_message)
        self.code = code
        self.error_code = code
        self.user_message = user_message
        self.status_code = status_code

# --- UNITS & CONVERSIONS ---
KNOWN_UNITS = {
    'g': 'g', 'gramm': 'g', 'gr': 'g', 'gr.': 'g',
    'kg': 'kg', 'kilo': 'kg', 'kilogramm': 'kg',
    'mg': 'mg',
    'ml': 'ml', 'milliliter': 'ml',
    'cl': 'cl',
    'dl': 'dl',
    'l': 'l', 'liter': 'l', 'lt': 'l', 'ltr': 'l', 'ltr.': 'l',
    'el': 'EL', 'esslöffel': 'EL', 'tbsp': 'EL', 'tablespoon': 'EL', 'tablespoons': 'EL',
    'tl': 'TL', 'teelöffel': 'TL', 'tsp': 'TL', 'teaspoon': 'TL', 'teaspoons': 'TL',
    'msp': 'Msp.', 'msp.': 'Msp.', 'messerspitze': 'Msp.',
    'prise': 'Prise', 'prisen': 'Prise', 'pinch': 'Prise', 'pinches': 'Prise',
    'schuss': 'Schuss',
    'spritzer': 'Spritzer',
    'tropfen': 'Tropfen',
    'tasse': 'Tasse', 'tassen': 'Tasse', 'cup': 'Tasse', 'cups': 'Tasse',
    'becher': 'Becher',
    'stk': 'Stk', 'stk.': 'Stk', 'stück': 'Stk', 'st': 'Stk', 'st.': 'Stk',
    'packung': 'Pck.', 'packungen': 'Pck.', 'pck': 'Pck.', 'pck.': 'Pck.', 'pkg': 'Pck.', 'pkg.': 'Pck.', 'päckchen': 'Pck.', 'pkt': 'Pck.', 'pkt.': 'Pck.',
    'dose': 'Dose', 'dosen': 'Dose', 'can': 'Dose', 'cans': 'Dose',
    'glas': 'Glas', 'gläser': 'Glas',
    'flasche': 'Flasche', 'flaschen': 'Flasche', 'fl': 'Flasche', 'fl.': 'Flasche',
    'bund': 'Bund', 'bunde': 'Bund', 'bündel': 'Bund',
    'zweig': 'Zweig', 'zweige': 'Zweig',
    'zehe': 'Zehe', 'zehen': 'Zehe', 'clove': 'Zehe', 'cloves': 'Zehe',
    'knolle': 'Knolle', 'knollen': 'Knolle',
    'stange': 'Stange', 'stangen': 'Stange',
    'scheibe': 'Scheibe', 'scheiben': 'Scheibe',
    'kopf': 'Kopf', 'köpfe': 'Kopf',
    'handvoll': 'Handvoll',
    'blatt': 'Blatt', 'blätter': 'Blatt',
    'würfel': 'Würfel',
    'tube': 'Tube', 'tuben': 'Tube',
    'netz': 'Netz', 'netze': 'Netz',
    'schale': 'Schale', 'schalen': 'Schale',
    'kasten': 'Kasten', 'kästen': 'Kasten',
    'wurzel': 'Wurzel', 'kugel': 'Kugel', 'rolle': 'Rolle'
}

CONTAINER_CANONICAL = {'Dose', 'Glas', 'Becher', 'Pck.', 'Flasche', 'Schale', 'Tube', 'Netz', 'Bund'}

UNIT_CONVERSIONS = {
    'g': ('weight', 1.0),
    'kg': ('weight', 1000.0),
    'mg': ('weight', 0.001),
    'ml': ('volume', 1.0),
    'cl': ('volume', 10.0),
    'dl': ('volume', 100.0),
    'l': ('volume', 1000.0),
}

UNICODE_FRACTIONS = {
    '½': 0.5, '¼': 0.25, '¾': 0.75,
    '⅓': 1.0 / 3.0, '⅔': 2.0 / 3.0, '⅛': 0.125,
    '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
}

GERMAN_NUMBER_WORDS = {
    'ein': 1.0, 'eine': 1.0, 'einen': 1.0, 'einem': 1.0, 'einer': 1.0, 'eines': 1.0,
    'halbe': 0.5, 'halber': 0.5, 'halbes': 0.5, 'halb': 0.5,
    'zwei': 2.0, 'drei': 3.0, 'vier': 4.0, 'fünf': 5.0, 'sechs': 6.0
}

PREP_MODIFIERS = [
    r'fein\s+gewürfelt', r'gewürfelt', r'fein\s+gehackt', r'grob\s+gehackt', r'gehackt',
    r'fein\s+gerieben', r'gerieben', r'geschält', r'entkernt', r'halbiert', r'geviertelt',
    r'in\s+scheiben', r'in\s+stücken?', r'in\s+streifen', r'in\s+dünne\s+scheiben',
    r'gekocht', r'blanchiert', r'aufgetaut', r'getrocknet', r'frisch', r'zimmerwarm',
    r'weich', r'flüssig(?:e)?', r'kalt', r'warm', r'heiß', r'lauwarm',
    r'nach\s+geschmack', r'nach\s+belieben', r'optional', r'etwas', r'ca\.?', r'circa', r'zirka',
    r'groß(?:e|er|es)?', r'klein(?:e|er|es)?', r'mittelgroß(?:e|er|es)?', r'mittler(?:e|er|es)?',
    r'zum\s+braten', r'zum\s+garnieren', r'zum\s+bestreuen', r'zum\s+servieren', r'zum\s+verfeinern',
    r'aus\s+der\s+mühle'
]

SPEC_CONSTELLATIONS = [
    'edelsüß', 'rosenscharf', 'scharf', 'mild', 'bio', 'laktosefrei', 'glutenfrei',
    'braun', 'brauner', 'braunes', 'weiß', 'weißer', 'weißes', 'ungesüßt', 'gesüßt',
    'tk', 'tiefgekühlt', 'tiefgekühlte', 'extra native', 'nativ extra', 'kaltgepresst',
    'grob', 'fein', 'vollmilch', 'zartbitter', 'gehackt', 'stückig', 'passiert'
]

SECTION_HEADER_REGEX = re.compile(
    r'^(?:für\s+(?:den|die|das|den\s+teig|die\s+soße|die\s+sauce|die\s+füllung|den\s+belag|den\s+boden|den\s+guss|die\s+glasur|die\s+marinade|den\s+rub)|'
    r'zum\s+(?:garnieren|bestreuen|servieren|braten|verfeinern|dekorieren)|'
    r'zutaten\s+für|rub|glasur|marinade|soße|sauce|dressing|teig|boden|füllung|belag|topping|deko|zubehör)\s*:?$',
    re.IGNORECASE
)

def is_section_header(line: str) -> bool:
    line = line.strip()
    if not line:
        return True
    if line.endswith(':') and not re.search(r'\d', line):
        return True
    if SECTION_HEADER_REGEX.match(line):
        return True
    return False

# --- NUMBER & FRACTION PARSING ---
def parse_number_str(raw: str) -> Optional[float]:
    raw = raw.strip().lower()
    if not raw:
        return None

    if raw in GERMAN_NUMBER_WORDS:
        return GERMAN_NUMBER_WORDS[raw]

    if raw in UNICODE_FRACTIONS:
        return UNICODE_FRACTIONS[raw]

    if ' bis ' in raw:
        parts = raw.split(' bis ')
        return parse_number_str(parts[-1])
    if '-' in raw:
        parts = raw.split('-')
        return parse_number_str(parts[-1])

    if ' ' in raw:
        parts = raw.split()
        total = 0.0
        has_num = False
        for p in parts:
            val = parse_number_str(p)
            if val is not None:
                total += val
                has_num = True
        return round(total, 2) if has_num else None

    if '/' in raw:
        fparts = raw.split('/')
        try:
            num = float(fparts[0].replace(',', '.'))
            den = float(fparts[1].replace(',', '.'))
            if den != 0:
                return round(num / den, 2)
        except Exception:
            return None

    try:
        val = float(raw.replace(',', '.'))
        return val
    except Exception:
        return None

def format_german_quantity(qty: Optional[float], unit: Optional[str]) -> str:
    if qty is None:
        return unit if unit and unit != 'Stk' else ''
    if isinstance(qty, (int, float)) and float(qty).is_integer():
        q_str = str(int(qty))
    else:
        rounded = round(qty, 2)
        if rounded.is_integer():
            q_str = str(int(rounded))
        else:
            q_str = f"{rounded:g}".replace('.', ',')

    if not unit or unit == 'Stk':
        return q_str
    return f"{q_str} {unit}".strip()

# --- INGREDIENT LINE PARSER ---
def parse_ingredient_line(line: str) -> Dict[str, Any]:
    raw_original = line.strip()
    text = raw_original

    # Normalize unicode fraction characters with space
    for uchar, val in UNICODE_FRACTIONS.items():
        text = text.replace(uchar, f' {uchar} ')
    text = re.sub(r'\s+', ' ', text).strip()

    # 1. Compound container with weight e.g. "1 Dose (400 g) stückige Tomaten"
    container_match = re.match(
        r'^([\d\s\.,\/\-]+|[a-zA-ZäöüÄÖÜß]+)?\s*([a-zA-ZäöüÄÖÜß\.]+)\s*\(([\d\s\.,\/\-]+)\s*([a-zA-ZäöüÄÖÜß]+)\)\s+(.*)$',
        text, re.IGNORECASE
    )
    if container_match:
        c_qty_str = (container_match.group(1) or '1').strip()
        c_unit_str = container_match.group(2).strip().lower().rstrip('.')
        w_qty_str = container_match.group(3).strip()
        w_unit_str = container_match.group(4).strip()
        rest = container_match.group(5).strip()

        norm_c_unit = KNOWN_UNITS.get(c_unit_str)
        if norm_c_unit and norm_c_unit in CONTAINER_CANONICAL:
            qty = parse_number_str(c_qty_str) or 1.0
            container_weight = f"{w_qty_str} {w_unit_str}".strip()
            return _finish_parsed_item(raw_original, rest, qty, norm_c_unit, container_weight)

    # 2. Compound container with à e.g. "2 Packungen à 250 g Quark"
    a_match = re.match(
        r'^([\d\s\.,\/\-]+|[a-zA-ZäöüÄÖÜß]+)?\s*([a-zA-ZäöüÄÖÜß\.]+)\s+à\s+([\d\s\.,\/\-]+)\s*([a-zA-ZäöüÄÖÜß]+)\s+(.*)$',
        text, re.IGNORECASE
    )
    if a_match:
        c_qty_str = (a_match.group(1) or '1').strip()
        c_unit_str = a_match.group(2).strip().lower().rstrip('.')
        w_qty_str = a_match.group(3).strip()
        w_unit_str = a_match.group(4).strip()
        rest = a_match.group(5).strip()

        norm_c_unit = KNOWN_UNITS.get(c_unit_str)
        if norm_c_unit and norm_c_unit in CONTAINER_CANONICAL:
            qty = parse_number_str(c_qty_str) or 1.0
            container_weight = f"à {w_qty_str} {w_unit_str}".strip()
            return _finish_parsed_item(raw_original, rest, qty, norm_c_unit, container_weight)

    # 3. Number words at start like "eine halbe Zitrone" or "ein halber Apfel"
    word_match = re.match(r'^(eine?(?:n|r|s|m)?)\s+(halbe?(?:r|s|n)?)\s+(.*)$', text, re.IGNORECASE)
    if word_match:
        qty = 0.5
        unit = 'Stk'
        rest = word_match.group(3).strip()
        return _finish_parsed_item(raw_original, rest, qty, unit, None)

    # 4. Standard Quantity + Unit + Name regex
    qty_pattern = re.match(
        r'^([\d\s\.,\/\-]+|ein|eine|einen|einer|halbe|halber|halbes|zwei|drei|vier|fünf|sechs|½|¼|¾|⅓|⅔|⅛)\s*([a-zA-ZäöüÄÖÜß°\.]*)\s*(.*)$',
        text, re.IGNORECASE
    )

    if qty_pattern:
        raw_qty = qty_pattern.group(1).strip()
        raw_unit = qty_pattern.group(2).strip().lower().rstrip('.')
        rem_name = qty_pattern.group(3).strip()

        parsed_qty = parse_number_str(raw_qty)
        if parsed_qty is not None and parsed_qty > 0:
            if raw_unit in KNOWN_UNITS:
                unit = KNOWN_UNITS[raw_unit]
                item_name = rem_name
            elif raw_unit == '':
                unit = 'Stk'
                item_name = rem_name
            else:
                full_rem = f"{raw_unit} {rem_name}".strip()
                unit = 'Stk'
                item_name = full_rem
                parts = full_rem.split(None, 1)
                if parts and parts[0].lower().rstrip('.') in KNOWN_UNITS:
                    unit = KNOWN_UNITS[parts[0].lower().rstrip('.')]
                    item_name = parts[1] if len(parts) > 1 else ''

            return _finish_parsed_item(raw_original, item_name, parsed_qty, unit, None)

    # 5. Quantity-less e.g. "Salz und Pfeffer", "etwas Öl"
    return _finish_parsed_item(raw_original, text, None, 'Stk', None)

def _finish_parsed_item(raw: str, name: str, qty: Optional[float], unit: str, container_weight: Optional[str]) -> Dict[str, Any]:
    notes = []
    if container_weight:
        notes.append(container_weight)

    # Extract parenthetical notes e.g. "(Loin Ribs)"
    p_matches = re.findall(r'\((.*?)\)', name)
    for p in p_matches:
        notes.append(p.strip())
    name = re.sub(r'\(.*?\)', '', name).strip()

    # Extract comma specification/notes e.g. "Paprikapulver, edelsüß"
    if ',' in name:
        parts = name.split(',', 1)
        name = parts[0].strip()
        after_comma = parts[1].strip()
        if after_comma:
            notes.append(after_comma)

    # Clean preparation modifiers from name
    for mod in PREP_MODIFIERS:
        name = re.sub(r'\b' + mod + r'\b', '', name, flags=re.IGNORECASE).strip()

    name = re.sub(r'\s+', ' ', name).strip()

    # Detect recognized specification from notes or name
    spec = None
    full_text_lower = f"{name} {' '.join(notes)}".lower()
    for s in SPEC_CONSTELLATIONS:
        if re.search(r'\b' + re.escape(s) + r'\b', full_text_lower):
            spec = s.capitalize()
            # Strip modifier word from name if present so core name is clean
            name = re.sub(r'\b' + re.escape(s) + r'\b', '', name, flags=re.IGNORECASE).strip()
            name = re.sub(r'\s+', ' ', name).strip()
            break

    # Compound unit words like "Knoblauchzehe" -> "Knoblauch" + unit "Zehe"
    if name.lower().endswith('zehe') and unit == 'Stk':
        name = name[:-4].strip()
        unit = 'Zehe'
    elif name.lower().endswith('zehen') and unit == 'Stk':
        name = name[:-5].strip()
        unit = 'Zehe'

    if name:
        name = name[0].upper() + name[1:]

    return {
        'raw': raw,
        'quantity': qty,
        'unit': unit,
        'name': name,
        'specification': spec,
        'notes': notes
    }

# --- TAXONOMY & CATEGORY MATCHING ---
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

def match_ingredient_to_taxonomy(name: str, taxonomy_data: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], float]:
    """
    Matches a parsed ingredient name against the taxonomy.
    Returns (item, confidence).
    """
    if not taxonomy_data or not name:
        return None, 0.0

    items_by_name, alias_to_item, _ = build_taxonomy_lookups(taxonomy_data)
    clean = name.lower().strip()
    clean = re.sub(r'^(frische[srn]?|feine[srn]?|gehackte[srn]?|getrocknete[srn]?|gemahlene[srn]?|gekochte[srn]?|große[srn]?|kleine[srn]?|mittelgroße[srn]?)\s+', '', clean).strip()

    # 1. Exact match on real item name (Confidence 1.0)
    if clean in items_by_name:
        return items_by_name[clean], 1.0

    # 2. Exact match on aliases (Confidence 0.95)
    if clean in alias_to_item:
        return alias_to_item[clean], 0.95

    # 3. German singular / plural variations (Confidence 0.9)
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
            return items_by_name[var], 0.9
        if var in alias_to_item:
            return alias_to_item[var], 0.88

    # 4. Token-based match (e.g. "Weizenmehl" -> "Mehl", "Hähnchenbrust" -> "Hähnchenbrustfilet")
    best_match = None
    best_score = (-1, -1)
    conf = 0.0

    for candidate_name, item in items_by_name.items():
        if len(candidate_name) >= 4:
            if should_reject_compound_prefix(clean, candidate_name):
                continue
            prio = (item.get('recipe') or {}).get('matchPriority', 80)
            if candidate_name in clean:
                score = (len(candidate_name), prio)
                if score > best_score:
                    best_score = score
                    best_match = item
                    conf = 0.8
            elif clean in candidate_name and len(clean) >= 6:
                score = (len(candidate_name), prio)
                if score > best_score:
                    best_score = score
                    best_match = item
                    conf = 0.75

    return best_match, conf

def infer_category_fallback(name: str) -> str:
    lower = name.lower()

    # Specific overrides before broad substring checks
    if any(k in lower for k in ['spülmaschinensalz', 'regeneriersalz', 'geschirrspülsalz', 'reiniger', 'spülmittel', 'seife', 'shampoo', 'zahnpasta', 'folie', 'alufolie', 'backpapier', 'müllbeutel', 'schraubglas', 'schraubgläser', 'bürste', 'tuch', 'tücher']):
        return 'Drogerie, Haushalt & Tierbedarf'

    if any(k in lower for k in ['kokosmilch', 'tütensuppe', 'fertigsuppe', 'knoblauchpulver', 'zwiebelpulver', 'agavendicksaft', 'ahornsirup', 'zuckerrübensirup', 'gelierzucker', 'vanillezucker']):
        return 'Vorratskammer'

    # Fleisch & Fisch
    if any(k in lower for k in [
        'fleisch', 'hack', 'wurst', 'würst', 'wiener', 'hähnchen', 'huhn', 'pute',
        'rind', 'schwein', 'kalb', 'lamm', 'wild', 'fisch', 'lachs', 'thunfisch',
        'forelle', 'kabeljau', 'dorsch', 'garnele', 'scampi', 'shrimp', 'meeresfrüchte',
        'rippchen', 'spareribs', 'ribs', 'schnitzel', 'steak', 'gulasch', 'braten', 'speck', 'bacon', 'schinken'
    ]):
        return 'Fleisch & Fisch'

    # Brot & Backwaren
    if any(k in lower for k in ['brot', 'brötchen', 'toast', 'baguette', 'croissant', 'bun', 'ciabatta', 'tortilla', 'wrap', 'pita', 'semmel']):
        return 'Brot & Backwaren'

    # Milchprodukte & Tiefkühlkost
    if any(k in lower for k in ['milch', 'käse', 'joghurt', 'sahne', 'quark', 'butter', 'schmand', 'creme', 'crème', 'frischkäse', 'mascarpone', 'mozzarella', 'parmesan', 'feta', 'gouda', 'ricotta', 'tiefkühl', 'tk', 'eis']):
        return 'Milchprodukte & Tiefkühlkost'

    # Obst & Gemüse (including fresh herbs)
    if any(k in lower for k in [
        'salat', 'kohl', 'pilz', 'champignon', 'beere', 'frucht', 'apfel', 'äpfel', 'birne', 'banane',
        'tomate', 'gurke', 'paprika', 'zucchini', 'aubergine', 'karotte', 'möhre', 'kartoffel',
        'zwiebel', 'knoblauch', 'lauch', 'porree', 'spinat', 'brokkoli', 'ingwer', 'kürbis',
        'radieschen', 'spargel', 'zitrone', 'limette', 'orange', 'petersilie', 'basilikum', 'schnittlauch', 'dill', 'koriander', 'minze'
    ]):
        return 'Obst & Gemüse'

    # Getränke & Genussmittel
    if any(k in lower for k in ['wasser', 'saft', 'cola', 'limonade', 'bier', 'wein', 'sekt', 'kaffee', 'espresso', 'tee', 'sirup', 'likör', 'rum', 'gin', 'vodka']):
        return 'Getränke & Genussmittel'

    # Drogerie & Haushalt (remaining container words like Glas/Gläser)
    if any(k in lower for k in ['glas', 'gläser']):
        return 'Drogerie, Haushalt & Tierbedarf'

    # Vorratskammer (Standard cooking staples & pantry)
    if any(k in lower for k in [
        'zucker', 'mehl', 'stärke', 'backpulver', 'hefe', 'vanille', 'kakao',
        'öl', 'olivenöl', 'essig', 'balsamico', 'salz', 'pfeffer', 'gewürz', 'curry',
        'oregano', 'thymian', 'rosmarin', 'brühe', 'bouillon', 'sauce', 'soße', 'senf',
        'ketchup', 'mayo', 'tomatenmark', 'pesto', 'nudeln', 'pasta', 'spaghetti', 'reis',
        'haferflocken', 'müsli', 'honig', 'marmelade', 'konfitüre', 'nuss', 'nüsse', 'mandel', 'chia', 'linse', 'kichererbse'
    ]):
        return 'Vorratskammer'

    return 'Sonstiges'

# --- SMART PANTRY / STAPLE DETECTION ---
STAPLES_KEYWORDS = [
    'wasser', 'leitungswasser', 'salz', 'speisesalz', 'meersalz', 'steinsalz',
    'pfeffer', 'schwarzer pfeffer', 'weißer pfeffer', 'bunter pfeffer', 'cayennepfeffer',
    'muskat', 'muskatnuss'
]

def is_pantry_staple(item_name: str, raw_line: str, qty: Optional[float], unit: Optional[str], matched_tax: Optional[Dict[str, Any]] = None) -> bool:
    clean = item_name.lower().strip()
    raw_clean = raw_line.lower().strip()

    # Recipe internal self-reference
    if any(ref in raw_clean for ref in ['von oben', 'vom rub', 'von der marinade', 'des rubs', 'aus dem rub']):
        return True

    # Large purchase quantities are NOT staples
    if unit in ['g', 'gramm'] and qty is not None and qty >= 100:
        return False
    if unit in ['kg', 'kilogramm'] and qty is not None and qty >= 0.1:
        return False
    if unit in ['ml', 'milliliter'] and qty is not None and qty >= 200:
        return False
    if unit in ['l', 'liter'] and qty is not None and qty >= 0.2:
        return False

    # Fresh herbs are NOT staples
    if any(h in clean for h in ['bund', 'zweig', 'frisch', 'topf']) or unit in ['Bund', 'Zweig']:
        return False

    # Gelierzucker or bulk sugar/oil is NOT a staple
    if 'gelierzucker' in clean:
        return False
    if 'zucker' in clean and qty is not None and qty >= 100:
        return False
    if 'öl' in clean and qty is not None and qty >= 100:
        return False

    # Schema v2 data-driven pantryStaple rule
    tax_pantry = (matched_tax or {}).get('recipe', {}).get('pantryStaple') if isinstance(matched_tax, dict) else None
    if tax_pantry == 'always':
        return True
    if tax_pantry == 'small_amounts':
        if unit in ['EL', 'TL', 'Msp.', 'Spritzer', 'Schuss', 'Prise'] and (qty is None or qty <= 3.0):
            return True
        if qty is None and unit in ['Stk', None]:
            return True

    # Fallback: Standard pantry staples
    for s in STAPLES_KEYWORDS:
        if clean == s or re.search(r'\b' + re.escape(s) + r'\b', clean):
            return True

    # Small cooking amounts of oil or vinegar
    if any(o in clean for o in ['öl', 'olivenöl', 'speiseöl', 'pflanzenöl', 'sonnenblumenöl', 'rapsöl', 'essig', 'balsamico']):
        if unit in ['EL', 'TL', 'Msp.', 'Spritzer', 'Schuss', 'Prise'] and (qty is None or qty <= 3.0):
            return True
        if qty is None and unit in ['Stk', None]:
            return True

    # Dried spices
    if clean.endswith('gewürz') or clean.endswith('gewürze'):
        if qty is None or qty <= 3.0:
            return True

    return False

# --- DUPLICATE MERGING WITHIN A RECIPE ---
def can_merge_units(u1: Optional[str], u2: Optional[str]) -> bool:
    u1_norm = (u1 or '').lower().rstrip('.')
    u2_norm = (u2 or '').lower().rstrip('.')
    if u1_norm == u2_norm:
        return True
    if u1_norm in UNIT_CONVERSIONS and u2_norm in UNIT_CONVERSIONS:
        return UNIT_CONVERSIONS[u1_norm][0] == UNIT_CONVERSIONS[u2_norm][0]
    return False

def merge_quantities_and_units(q1: Optional[float], u1: Optional[str], q2: Optional[float], u2: Optional[str]) -> Tuple[Optional[float], Optional[str]]:
    if q1 is None and q2 is None:
        return None, u1
    if q1 is None:
        return q2, u2
    if q2 is None:
        return q1, u1

    u1_norm = (u1 or '').lower().rstrip('.')
    u2_norm = (u2 or '').lower().rstrip('.')
    if u1_norm == u2_norm:
        return round(q1 + q2, 2), u1

    if u1_norm in UNIT_CONVERSIONS and u2_norm in UNIT_CONVERSIONS:
        dim1, factor1 = UNIT_CONVERSIONS[u1_norm]
        dim2, factor2 = UNIT_CONVERSIONS[u2_norm]
        if dim1 == dim2:
            base_val = (q1 * factor1) + (q2 * factor2)
            if dim1 == 'weight':
                if base_val >= 1000.0:
                    return round(base_val / 1000.0, 2), 'kg'
                else:
                    return round(base_val, 1), 'g'
            elif dim1 == 'volume':
                if base_val >= 1000.0:
                    return round(base_val / 1000.0, 2), 'l'
                else:
                    return round(base_val, 1), 'ml'

    return round(q1 + q2, 2), u1

def merge_duplicate_ingredients(ingredients: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged_list: List[Dict[str, Any]] = []

    for item in ingredients:
        # Check if matching item already exists in merged_list
        match_idx = -1
        for i, existing in enumerate(merged_list):
            same_taxonomy = existing.get('taxonomy_id') and existing.get('taxonomy_id') == item.get('taxonomy_id')
            same_name_cat = existing['name'].lower() == item['name'].lower() and existing['category'] == item['category']
            if same_taxonomy or same_name_cat:
                # Check unit compatibility
                if can_merge_units(existing.get('unit'), item.get('unit')):
                    match_idx = i
                    break

        if match_idx >= 0:
            existing = merged_list[match_idx]
            new_qty, new_unit = merge_quantities_and_units(
                existing.get('quantity'), existing.get('unit'),
                item.get('quantity'), item.get('unit')
            )
            existing['quantity'] = new_qty
            existing['base_quantity'] = new_qty
            existing['unit'] = new_unit
            existing['display_quantity'] = format_german_quantity(new_qty, new_unit)
            existing['display_amount'] = existing['display_quantity']
            existing['was_merged'] = True
            existing['original_lines'].extend(item.get('original_lines', [item.get('raw', '')]))
            existing['raw'] = ' + '.join([f'"{line}"' for line in existing['original_lines']])

            # Specifications
            if not existing.get('specification') and item.get('specification'):
                existing['specification'] = item.get('specification')

            # Re-evaluate staple
            existing['is_pantry_staple'] = is_pantry_staple(
                existing['name'], existing['raw'], existing['quantity'], existing['unit']
            )
            existing['is_staple'] = existing['is_pantry_staple']
            existing['selected'] = not existing['is_pantry_staple']

            # Update tags
            if existing['display_quantity']:
                existing['tags'] = [existing['display_quantity']]
        else:
            merged_list.append(item)

    return merged_list

# --- PARSE SERVINGS HELPER ---
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

# --- STAGE 1: EXTRACTORS ---
def fetch_monsieur_cuisine_recipe(url: str) -> Optional[Dict[str, Any]]:
    """
    Stage 1: Dedicated extractor for Monsieur Cuisine (covers /de/recipe/..., /de/rezepte/..., regional subdomains).
    """
    parsed = urlparse(url)
    if 'monsieur-cuisine.com' not in parsed.netloc.lower():
        return None

    desktop_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    }

    try:
        r = requests.get(url, headers=desktop_headers, timeout=12)
        if r.status_code == 404 or r.status_code == 410:
            raise RecipeImportError('not_found', "Dieser Rezept-Link wurde leider nicht gefunden. Bitte prüfe die Adresse.", 404)
        if r.status_code in [401, 403, 429]:
            raise RecipeImportError('blocked_or_auth', "Diese Seite blockiert den automatischen Abruf. Kopiere die Zutatenliste einfach direkt in den Text-Import.", 403)
        if r.status_code != 200:
            raise RecipeImportError('timeout_or_network', "Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import.", 504)
        html = r.text
    except RecipeImportError:
        raise
    except requests.Timeout:
        raise RecipeImportError('timeout_or_network', "Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import.", 504)
    except requests.RequestException as e:
        logger.warning(f"Monsieur Cuisine initial fetch error: {e}")
        raise RecipeImportError('timeout_or_network', "Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import.", 504)

    # Extract recipeId and language from window.siteConfig
    id_match = re.search(r'["\']recipeId["\']\s*:\s*(\d+)', html)
    if not id_match:
        # Fallback: check if recipeId is in URL
        id_match = re.search(r'\/recipe\/([^\/\?]+)', parsed.path)
        if not id_match:
            return None

    recipe_id = id_match.group(1)

    lang_match = re.search(r'["\']viewerLang["\']\s*:\s*["\']([a-zA-Z\-]+)["\']', html)
    lang = lang_match.group(1) if lang_match else 'de'
    lang_header = f"{lang}-{lang.upper()}" if len(lang) == 2 else lang

    # Call official Monsieur Cuisine tecpal API
    api_url = f"https://mc-api.tecpal.com/api/v2/recipes/{recipe_id}"
    api_headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': lang_header,
        'device-type': 'web',
        'x-bypass-cdn': 'cd844315-77c4-46ba-83fe-7702d13b12b2',
        'X-Request-ID': str(uuid.uuid4()),
        'Origin': 'https://www.monsieur-cuisine.com',
        'Referer': url
    }

    try:
        api_resp = requests.get(api_url, headers=api_headers, timeout=10)
        if api_resp.status_code == 200:
            res_data = api_resp.json()
            recipe = res_data.get('data', {}).get('recipe', {})
            title = recipe.get('name') or "Monsieur Cuisine Rezept"

            # Image
            thumb_obj = recipe.get('thumbnail') or {}
            image = thumb_obj.get('landscape') if isinstance(thumb_obj, dict) else (thumb_obj if isinstance(thumb_obj, str) else None)
            if not image:
                og_image_match = re.search(r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']', html, re.I)
                if og_image_match:
                    image = og_image_match.group(1)

            # Servings & ingredients
            servings = 4.0
            ingredients_raw = []

            serving_sizes = recipe.get('servingSizes') or []
            if serving_sizes and isinstance(serving_sizes, list):
                first_sz = serving_sizes[0]
                servings = parse_servings(first_sz.get('amount') or 4.0)

                for ing in first_sz.get('ingredients', []):
                    amount = ing.get('amount')
                    unit = ing.get('unit')
                    name = ing.get('name') or ""
                    # Combine into clean line
                    parts = []
                    if amount is not None and str(amount).strip():
                        parts.append(str(amount).strip())
                    if unit and str(unit).strip():
                        parts.append(str(unit).strip())
                    if name.strip():
                        parts.append(name.strip())
                    if parts:
                        ingredients_raw.append(" ".join(parts))

            if ingredients_raw:
                return {
                    'title': title,
                    'image': image,
                    'servings': servings,
                    'ingredients_raw': ingredients_raw,
                    'source': 'monsieur-cuisine'
                }
    except Exception as e:
        logger.warning(f"Error querying Monsieur Cuisine API for {url}: {e}")

    return None

def fetch_mealie_recipe(url: str) -> Optional[Dict[str, Any]]:
    parsed = urlparse(url)
    path = parsed.path.strip('/')
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
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 404 or resp.status_code == 410:
            raise RecipeImportError('not_found', "Dieser Rezept-Link wurde leider nicht gefunden. Bitte prüfe die Adresse.", 404)
        if resp.status_code in [401, 403, 429]:
            raise RecipeImportError('blocked_or_auth', "Diese Seite blockiert den automatischen Abruf. Kopiere die Zutatenliste einfach direkt in den Text-Import.", 403)
        if resp.status_code != 200:
            raise RecipeImportError('timeout_or_network', "Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import.", 504)
        html = resp.text
    except RecipeImportError:
        raise
    except requests.Timeout:
        raise RecipeImportError('timeout_or_network', "Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import.", 504)
    except requests.RequestException as e:
        logger.error(f"Failed to fetch recipe URL {url}: {e}")
        raise RecipeImportError('timeout_or_network', "Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import.", 504)

    # Search for all ld+json script tags
    json_ld_matches = re.findall(r'<script[^>]*type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>', html, re.DOTALL | re.IGNORECASE)

    for block in json_ld_matches:
        block = block.strip()
        try:
            data = json.loads(block)
        except Exception:
            continue

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
            img_val = recipe_obj.get("image")
            image = None
            if isinstance(img_val, str):
                image = img_val
            elif isinstance(img_val, list) and img_val:
                image = img_val[0] if isinstance(img_val[0], str) else img_val[0].get("url")
            elif isinstance(img_val, dict):
                image = img_val.get("url")

            servings = parse_servings(recipe_obj.get("recipeYield"))
            ingredients_raw = recipe_obj.get("recipeIngredient") or recipe_obj.get("ingredients") or []
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

    # Microdata fallback (schema.org/Recipe)
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        recipe_el = soup.find(attrs={"itemtype": re.compile(r'schema\.org\/Recipe', re.I)})
        if recipe_el:
            name_el = recipe_el.find(attrs={"itemprop": "name"})
            title = name_el.get_text().strip() if name_el else "Rezept"
            img_el = recipe_el.find(attrs={"itemprop": "image"})
            image = img_el.get("src") or img_el.get("content") if img_el else None
            yield_el = recipe_el.find(attrs={"itemprop": "recipeYield"})
            servings = parse_servings(yield_el.get_text() if yield_el else 4.0)

            ing_els = recipe_el.find_all(attrs={"itemprop": re.compile(r'recipeIngredient|ingredients', re.I)})
            ingredients_raw = [el.get_text().strip() for el in ing_els if el.get_text().strip()]
            if ingredients_raw:
                return {
                    "title": title,
                    "image": image,
                    "servings": servings,
                    "ingredients_raw": ingredients_raw,
                    "source": "microdata"
                }

        # Stage 3: Structural HTML heuristic fallback
        heading = soup.find(re.compile(r'^h[1-4]$'), string=re.compile(r'zutaten|ingredients', re.I))
        if heading:
            container = heading.find_parent(['section', 'div', 'article']) or heading.find_next(['ul', 'ol', 'table'])
            if container:
                items = container.find_all('li')
                if not items and container.name == 'table':
                    items = container.find_all('tr')
                ingredients_raw = [li.get_text().strip() for li in items if li.get_text().strip()]
                if ingredients_raw:
                    h1 = soup.find('h1')
                    title = h1.get_text().strip() if h1 else "Importiertes Rezept"
                    og_image = soup.find('meta', property='og:image')
                    image = og_image['content'] if og_image and 'content' in og_image.attrs else None
                    return {
                        "title": title,
                        "image": image,
                        "servings": 4.0,
                        "ingredients_raw": ingredients_raw,
                        "source": "html-heuristic"
                    }
    except Exception as e:
        logger.warning(f"Error in HTML fallback parser: {e}")

    return None

# --- PROCESS INGREDIENT LIST PIPELINE ---
def _find_user_article_mapping(
    raw_name: str,
    matched_tax: Optional[Dict[str, Any]],
    user_mappings: Optional[List[Dict[str, Any]]]
) -> Optional[Dict[str, Any]]:
    if not user_mappings:
        return None
    tax_id = matched_tax.get('id') if matched_tax else None
    tax_name_lower = (matched_tax.get('name') or '').strip().lower() if matched_tax else ''
    raw_lower = (raw_name or '').strip().lower()

    article_maps = [m for m in user_mappings if m.get('mapping_type') == 'article']
    if tax_id:
        for m in article_maps:
            if m.get('lookup_key') == tax_id:
                return m
    for candidate in (raw_lower, tax_name_lower):
        if not candidate:
            continue
        for m in article_maps:
            if (m.get('lookup_key') or '').strip().lower() == candidate:
                return m
    return None


def process_ingredient_lines(
    raw_lines: List[str],
    user_mappings: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    taxonomy_data = get_taxonomy()
    parsed_ingredients = []

    for raw_line in raw_lines:
        line_str = str(raw_line).strip()
        if not line_str or is_section_header(line_str):
            continue

        item_data = parse_ingredient_line(line_str)
        matched_tax, confidence = match_ingredient_to_taxonomy(item_data['name'], taxonomy_data)

        if matched_tax:
            if 'gelierzucker' in item_data['name'].lower():
                item_name = item_data['name']
            else:
                item_name = matched_tax.get('name', item_data['name'])
            category = matched_tax.get('category', 'Sonstiges')
            icon = matched_tax.get('icon')
            taxonomy_id = matched_tax.get('id')
            is_matched = True
        else:
            item_name = item_data['name']
            category = infer_category_fallback(item_name)
            icon = None
            taxonomy_id = None
            is_matched = False

        # Layer 1 override: Personal UserItemMapping (if present for this user)
        user_override = _find_user_article_mapping(item_data['name'], matched_tax, user_mappings)
        if not user_override and item_name != item_data['name']:
            user_override = _find_user_article_mapping(item_name, matched_tax, user_mappings)
        if user_override:
            if user_override.get('preferred_name'):
                item_name = user_override['preferred_name']
            if user_override.get('preferred_category'):
                category = user_override['preferred_category']
            if user_override.get('preferred_icon'):
                icon = user_override['preferred_icon']
            if user_override.get('linked_taxonomy_id') and not taxonomy_id:
                taxonomy_id = user_override['linked_taxonomy_id']
            is_matched = True

        qty = item_data['quantity']
        unit = item_data['unit']
        spec = item_data['specification']
        if not spec and item_data.get('notes'):
            candidate_note = item_data['notes'][0].strip()
            # If candidate note is not just container weight, use it as spec
            if not re.match(r'^(?:à\s*)?\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|cl|dl)$', candidate_note, re.I):
                spec = candidate_note

        # Determine pantry staple status
        staple_flag = is_pantry_staple(item_name, item_data['raw'], qty, unit, matched_tax=matched_tax)
        selected_by_default = not staple_flag

        display_qty = format_german_quantity(qty, unit)

        item_tags = []
        if display_qty:
            item_tags.append(display_qty)
        if item_data.get('notes'):
            for n in item_data['notes']:
                if n not in item_tags and n != spec:
                    item_tags.append(n)

        parsed_ingredients.append({
            'id': str(uuid.uuid4()),
            'name': item_name,
            'quantity': qty,
            'base_quantity': qty,
            'unit': unit,
            'display_quantity': display_qty,
            'display_amount': display_qty,
            'specification': spec,
            'category': category,
            'icon': icon,
            'taxonomy_id': taxonomy_id,
            'match_confidence': confidence,
            'is_pantry_staple': staple_flag,
            'is_staple': staple_flag,
            'selected': selected_by_default,
            'original_lines': [item_data['raw']],
            'was_merged': False,
            'raw': item_data['raw'],
            'original_name': item_data['name'],
            'recipe_quantity': qty,
            'recipe_unit': unit,
            'tags': item_tags,
            'matched': is_matched
        })

    # Deduplicate & merge ingredients within the recipe
    merged_ingredients = merge_duplicate_ingredients(parsed_ingredients)
    return merged_ingredients

# --- MAIN ENTRY POINTS ---
def parse_recipe_url(url: str, user_mappings: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    # Stage 1: Domain-specific extractors (Monsieur Cuisine, Mealie)
    recipe_data = fetch_monsieur_cuisine_recipe(url)
    if not recipe_data:
        recipe_data = fetch_mealie_recipe(url)

    # Stage 2 & 3: Schema.org, Microdata, HTML fallback
    if not recipe_data:
        recipe_data = fetch_schema_org_recipe(url)

    if not recipe_data:
        raise RecipeImportError(
            'no_recipe_found',
            "Auf dieser Seite wurden keine Zutaten erkannt. Du kannst sie einfach über den Text-Import einfügen.",
            422
        )

    ingredients = process_ingredient_lines(recipe_data.get("ingredients_raw", []), user_mappings=user_mappings)
    if not ingredients:
        raise RecipeImportError(
            'no_recipe_found',
            "Auf dieser Seite wurden keine Zutaten erkannt. Du kannst sie einfach über den Text-Import einfügen.",
            422
        )

    return {
        "title": recipe_data.get("title", "Importiertes Rezept"),
        "image": recipe_data.get("image"),
        "servings": recipe_data.get("servings", 4.0),
        "source": recipe_data.get("source", "web"),
        "url": url,
        "ingredients": ingredients
    }

def parse_recipe_text(text: str, title: Optional[str] = None, user_mappings: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    lines = [line.strip() for line in (text or '').splitlines() if line.strip()]
    if not lines:
        raise RecipeImportError('no_recipe_found', "Bitte gib mindestens eine Zutat ein.", 400)

    ingredients = process_ingredient_lines(lines, user_mappings=user_mappings)
    if not ingredients:
        raise RecipeImportError('no_recipe_found', "Es konnten keine gültigen Zutatenzeilen erkannt werden.", 400)

    clean_title = (title or "").strip() or "Importiertes Rezept"

    return {
        "title": clean_title,
        "image": None,
        "servings": 4.0,
        "source": "text",
        "url": "",
        "ingredients": ingredients
    }
