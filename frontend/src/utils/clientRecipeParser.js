import { Capacitor, CapacitorHttp } from '@capacitor/core';
import taxonomy from '../assets/taxonomy.json' with { type: 'json' };

// --- UNITS & CONVERSIONS ---
export const KNOWN_UNITS = {
  g: 'g', gramm: 'g', gr: 'g', 'gr.': 'g',
  kg: 'kg', kilo: 'kg', kilogramm: 'kg',
  mg: 'mg',
  ml: 'ml', milliliter: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l', liter: 'l', lt: 'l', ltr: 'l', 'ltr.': 'l',
  el: 'EL', esslöffel: 'EL', tbsp: 'EL', tablespoon: 'EL', tablespoons: 'EL',
  tl: 'TL', teelöffel: 'TL', tsp: 'TL', teaspoon: 'TL', teaspoons: 'TL',
  msp: 'Msp.', 'msp.': 'Msp.', messerspitze: 'Msp.',
  prise: 'Prise', prisen: 'Prise', pinch: 'Prise', pinches: 'Prise',
  schuss: 'Schuss',
  spritzer: 'Spritzer',
  tropfen: 'Tropfen',
  tasse: 'Tasse', tassen: 'Tasse', cup: 'Tasse', cups: 'Tasse',
  becher: 'Becher',
  stk: 'Stk', 'stk.': 'Stk', stück: 'Stk', st: 'Stk', 'st.': 'Stk',
  packung: 'Pck.', packungen: 'Pck.', pck: 'Pck.', 'pck.': 'Pck.', pkg: 'Pck.', 'pkg.': 'Pck.', päckchen: 'Pck.', pkt: 'Pck.', 'pkt.': 'Pck.',
  dose: 'Dose', dosen: 'Dose', can: 'Dose', cans: 'Dose',
  glas: 'Glas', gläser: 'Glas',
  flasche: 'Flasche', flaschen: 'Flasche', fl: 'Flasche', 'fl.': 'Flasche',
  bund: 'Bund', bunde: 'Bund', bündel: 'Bund',
  zweig: 'Zweig', zweige: 'Zweig',
  zehe: 'Zehe', zehen: 'Zehe', clove: 'Zehe', cloves: 'Zehe',
  knolle: 'Knolle', knollen: 'Knolle',
  stange: 'Stange', stangen: 'Stange',
  scheibe: 'Scheibe', scheiben: 'Scheibe',
  kopf: 'Kopf', köpfe: 'Kopf',
  handvoll: 'Handvoll',
  blatt: 'Blatt', blätter: 'Blatt',
  würfel: 'Würfel',
  tube: 'Tube', tuben: 'Tube',
  netz: 'Netz', netze: 'Netz',
  schale: 'Schale', schalen: 'Schale',
  kasten: 'Kasten', kästen: 'Kasten',
  wurzel: 'Wurzel', kugel: 'Kugel', rolle: 'Rolle'
};

const CONTAINER_CANONICAL = new Set(['Dose', 'Glas', 'Becher', 'Pck.', 'Flasche', 'Schale', 'Tube', 'Netz', 'Bund']);

const UNIT_CONVERSIONS = {
  g: ['weight', 1.0],
  kg: ['weight', 1000.0],
  mg: ['weight', 0.001],
  ml: ['volume', 1.0],
  cl: ['volume', 10.0],
  dl: ['volume', 100.0],
  l: ['volume', 1000.0]
};

const UNICODE_FRACTIONS = {
  '½': 0.5, '¼': 0.25, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125,
  '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

const GERMAN_NUMBER_WORDS = {
  ein: 1.0, eine: 1.0, einen: 1.0, einem: 1.0, einer: 1.0, eines: 1.0,
  halbe: 0.5, halber: 0.5, halbes: 0.5, halb: 0.5,
  zwei: 2.0, drei: 3.0, vier: 4.0, fünf: 5.0, sechs: 6.0
};

const PREP_MODIFIERS = [
  /\bfein\s+gewürfelt\b/gi, /\bgewürfelt\b/gi, /\bfein\s+gehackt\b/gi, /\bgrob\s+gehackt\b/gi, /\bgehackt\b/gi,
  /\bfein\s+gerieben\b/gi, /\bgerieben\b/gi, /\bgeschält\b/gi, /\bentkernt\b/gi, /\bhalbiert\b/gi, /\bgeviertelt\b/gi,
  /\bin\s+scheiben\b/gi, /\bin\s+stücken?\b/gi, /\bin\s+streifen\b/gi, /\bin\s+dünne\s+scheiben\b/gi,
  /\bgekocht\b/gi, /\bblanchiert\b/gi, /\baufgetaut\b/gi, /\bgetrocknet\b/gi, /\bfrisch\b/gi, /\bzimmerwarm\b/gi,
  /\bweich\b/gi, /\bflüssig(?:e)?\b/gi, /\bkalt\b/gi, /\bwarm\b/gi, /\bheiß\b/gi, /\blauwarm\b/gi,
  /\bnach\s+geschmack\b/gi, /\bnach\s+belieben\b/gi, /\boptional\b/gi, /\betwas\b/gi, /\bca\.?\b/gi, /\bcirca\b/gi, /\bzirka\b/gi,
  /\bgroß(?:e|er|es)?\b/gi, /\bklein(?:e|er|es)?\b/gi, /\bmittelgroß(?:e|er|es)?\b/gi, /\bmittler(?:e|er|es)?\b/gi,
  /\bzum\s+braten\b/gi, /\bzum\s+garnieren\b/gi, /\bzum\s+bestreuen\b/gi, /\bzum\s+servieren\b/gi, /\bzum\s+verfeinern\b/gi,
  /\baus\s+der\s+mühle\b/gi
];

const SPEC_CONSTELLATIONS = [
  'edelsüß', 'rosenscharf', 'scharf', 'mild', 'bio', 'laktosefrei', 'glutenfrei',
  'braun', 'brauner', 'braunes', 'weiß', 'weißer', 'weißes', 'ungesüßt', 'gesüßt',
  'tk', 'tiefgekühlt', 'tiefgekühlte', 'extra native', 'nativ extra', 'kaltgepresst',
  'grob', 'fein', 'vollmilch', 'zartbitter', 'gehackt', 'stückig', 'passiert'
];

const SECTION_HEADER_REGEX = /^(?:für\s+(?:den|die|das|den\s+teig|die\s+soße|die\s+sauce|die\s+füllung|den\s+belag|den\s+boden|den\s+guss|die\s+glasur|die\s+marinade|den\s+rub)|zum\s+(?:garnieren|bestreuen|servieren|braten|verfeinern|dekorieren)|zutaten\s+für|rub|glasur|marinade|soße|sauce|dressing|teig|boden|füllung|belag|topping|deko|zubehör)\s*:?$/i;

export function isSectionHeader(line) {
  const clean = (line || '').trim();
  if (!clean) return true;
  if (clean.endsWith(':') && !/\d/.test(clean)) return true;
  if (SECTION_HEADER_REGEX.test(clean)) return true;
  return false;
}

// --- NUMBER PARSING ---
export function parseNumberStr(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  if (GERMAN_NUMBER_WORDS[s] !== undefined) {
    return GERMAN_NUMBER_WORDS[s];
  }

  if (UNICODE_FRACTIONS[s] !== undefined) {
    return UNICODE_FRACTIONS[s];
  }

  if (s.includes(' bis ')) {
    const parts = s.split(' bis ');
    return parseNumberStr(parts[parts.length - 1]);
  }

  if (s.includes('-')) {
    const parts = s.split('-');
    return parseNumberStr(parts[parts.length - 1]);
  }

  if (s.includes(' ')) {
    const parts = s.split(/\s+/);
    let total = 0;
    let hasNum = false;
    for (const p of parts) {
      const val = parseNumberStr(p);
      if (val !== null && !isNaN(val)) {
        total += val;
        hasNum = true;
      }
    }
    return hasNum ? Math.round(total * 100) / 100 : null;
  }

  if (s.includes('/')) {
    const [num, den] = s.split('/');
    const n = parseFloat(num.replace(',', '.'));
    const d = parseFloat(den.replace(',', '.'));
    if (!isNaN(n) && !isNaN(d) && d !== 0) {
      return Math.round((n / d) * 100) / 100;
    }
  }

  const parsed = parseFloat(s.replace(',', '.'));
  return isNaN(parsed) ? null : parsed;
}

export function formatGermanQuantity(qty, unit) {
  if (qty === null || qty === undefined) {
    return unit && unit !== 'Stk' ? unit : '';
  }

  let qStr = '';
  if (Number.isInteger(qty)) {
    qStr = qty.toString();
  } else {
    const rounded = Math.round(qty * 100) / 100;
    if (Number.isInteger(rounded)) {
      qStr = rounded.toString();
    } else {
      qStr = rounded.toString().replace('.', ',');
    }
  }

  if (!unit || unit === 'Stk') {
    return qStr;
  }
  return `${qStr} ${unit}`.trim();
}

// --- PARSE INGREDIENT LINE ---
export function parseIngredientLine(text) {
  const rawOriginal = (text || '').trim();
  let normalized = rawOriginal;

  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    normalized = normalized.replaceAll(char, ` ${char} `);
  }
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // 1. Compound container with weight e.g. "1 Dose (400 g) stückige Tomaten"
  const containerMatch = normalized.match(
    /^([\d\s\.,\/\-]+|[a-zA-ZäöüÄÖÜß]+)?\s*([a-zA-ZäöüÄÖÜß\.]+)\s*\(([\d\s\.,\/\-]+)\s*([a-zA-ZäöüÄÖÜß]+)\)\s+(.*)$/i
  );
  if (containerMatch) {
    const cQtyStr = (containerMatch[1] || '1').trim();
    const cUnitStr = containerMatch[2].trim().toLowerCase().replace(/\.$/, '');
    const wQtyStr = containerMatch[3].trim();
    const wUnitStr = containerMatch[4].trim();
    const rest = containerMatch[5].trim();

    const normCUnit = KNOWN_UNITS[cUnitStr];
    if (normCUnit && CONTAINER_CANONICAL.has(normCUnit)) {
      const qty = parseNumberStr(cQtyStr) || 1.0;
      const containerWeight = `${wQtyStr} ${wUnitStr}`.trim();
      return finishParsedItem(rawOriginal, rest, qty, normCUnit, containerWeight);
    }
  }

  // 2. Compound container with à e.g. "2 Packungen à 250 g Quark"
  const aMatch = normalized.match(
    /^([\d\s\.,\/\-]+|[a-zA-ZäöüÄÖÜß]+)?\s*([a-zA-ZäöüÄÖÜß\.]+)\s+à\s+([\d\s\.,\/\-]+)\s*([a-zA-ZäöüÄÖÜß]+)\s+(.*)$/i
  );
  if (aMatch) {
    const cQtyStr = (aMatch[1] || '1').trim();
    const cUnitStr = aMatch[2].trim().toLowerCase().replace(/\.$/, '');
    const wQtyStr = aMatch[3].trim();
    const wUnitStr = aMatch[4].trim();
    const rest = aMatch[5].trim();

    const normCUnit = KNOWN_UNITS[cUnitStr];
    if (normCUnit && CONTAINER_CANONICAL.has(normCUnit)) {
      const qty = parseNumberStr(cQtyStr) || 1.0;
      const containerWeight = `à ${wQtyStr} ${wUnitStr}`.trim();
      return finishParsedItem(rawOriginal, rest, qty, normCUnit, containerWeight);
    }
  }

  // 3. Number words at start like "eine halbe Zitrone"
  const wordMatch = normalized.match(/^(eine?(?:n|r|s|m)?)\s+(halbe?(?:r|s|n)?)\s+(.*)$/i);
  if (wordMatch) {
    return finishParsedItem(rawOriginal, wordMatch[3].trim(), 0.5, 'Stk', null);
  }

  // 4. Standard Quantity + Unit + Name regex
  const qtyPattern = normalized.match(
    /^([\d\s\.,\/\-]+|ein|eine|einen|einer|halbe|halber|halbes|zwei|drei|vier|fünf|sechs|½|¼|¾|⅓|⅔|⅛)\s*([a-zA-ZäöüÄÖÜß°\.]*)\s*(.*)$/i
  );

  if (qtyPattern) {
    const rawQty = qtyPattern[1].trim();
    const rawUnit = qtyPattern[2].trim().toLowerCase().replace(/\.$/, '');
    const remName = qtyPattern[3].trim();

    const parsedQty = parseNumberStr(rawQty);
    if (parsedQty !== null && parsedQty > 0) {
      if (KNOWN_UNITS[rawUnit]) {
        return finishParsedItem(rawOriginal, remName, parsedQty, KNOWN_UNITS[rawUnit], null);
      } else if (rawUnit === '') {
        return finishParsedItem(rawOriginal, remName, parsedQty, 'Stk', null);
      } else {
        const fullRem = `${rawUnit} ${remName}`.trim();
        const parts = fullRem.split(/\s+/);
        const firstClean = parts[0]?.toLowerCase().replace(/\.$/, '');
        if (KNOWN_UNITS[firstClean]) {
          const unit = KNOWN_UNITS[firstClean];
          const name = parts.slice(1).join(' ');
          return finishParsedItem(rawOriginal, name, parsedQty, unit, null);
        }
        return finishParsedItem(rawOriginal, fullRem, parsedQty, 'Stk', null);
      }
    }
  }

  // 5. Quantity-less e.g. "Salz und Pfeffer", "etwas Öl"
  return finishParsedItem(rawOriginal, normalized, null, 'Stk', null);
}

function finishParsedItem(raw, nameInput, qty, unit, containerWeight) {
  let name = nameInput || '';
  const notes = [];
  if (containerWeight) notes.push(containerWeight);

  // Parentheses notes
  const pMatches = name.match(/\((.*?)\)/g);
  if (pMatches) {
    for (const p of pMatches) {
      notes.push(p.replace(/^\(|\)$/g, '').trim());
    }
    name = name.replace(/\(.*?\)/g, '').trim();
  }

  // Comma specification
  if (name.includes(',')) {
    const parts = name.split(',');
    name = parts[0].trim();
    const afterComma = parts.slice(1).join(',').trim();
    if (afterComma) notes.push(afterComma);
  }

  // Strip preparation modifiers
  for (const mod of PREP_MODIFIERS) {
    name = name.replace(mod, '').trim();
  }
  name = name.replace(/\s+/g, ' ').trim();

  // Detect specification
  let spec = null;
  const fullTextLower = `${name} ${notes.join(' ')}`.toLowerCase();
  for (const s of SPEC_CONSTELLATIONS) {
    const re = new RegExp(`(^|[^a-zA-Z0-9äöüÄÖÜß])${s}([^a-zA-Z0-9äöüÄÖÜß]|$)`, 'i');
    if (re.test(fullTextLower)) {
      spec = s.charAt(0).toUpperCase() + s.slice(1);
      name = name.replace(re, '$1$2').replace(/\s+/g, ' ').trim();
      break;
    }
  }
  if (!spec && notes.length > 0) {
    const candidateNote = notes[0].trim();
    if (!/^(?:à\s*)?\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|cl|dl)$/i.test(candidateNote)) {
      spec = candidateNote;
    }
  }

  // Compound unit words like "Knoblauchzehe" -> "Knoblauch" + unit "Zehe"
  if (name.toLowerCase().endsWith('zehe') && unit === 'Stk') {
    name = name.slice(0, -4).trim();
    unit = 'Zehe';
  } else if (name.toLowerCase().endsWith('zehen') && unit === 'Stk') {
    name = name.slice(0, -5).trim();
    unit = 'Zehe';
  }

  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return {
    raw,
    quantity: qty,
    unit,
    name,
    specification: spec,
    notes
  };
}

// --- TAXONOMY LOOKUPS ---
const itemsByName = new Map();
const aliasToItem = new Map();

taxonomy.forEach(item => {
  if (item.name) {
    itemsByName.set(item.name.toLowerCase().trim(), item);
  }
  if (Array.isArray(item.aliases)) {
    item.aliases.forEach(alias => {
      if (alias) {
        aliasToItem.set(alias.toLowerCase().trim(), item);
      }
    });
  }
});

const COMPOUND_SUFFIXES = [
  'gewürz', 'gewürze', 'pulver', 'sauce', 'soße', 'dressing',
  'paste', 'öl', 'essig', 'sirup', 'tee', 'aufstrich', 'salz', 'brot', 'brötchen'
];

function shouldRejectCompoundPrefix(clean, candidate) {
  if (clean.startsWith(candidate) && clean.length > candidate.length) {
    const remainder = clean.slice(candidate.length).replace(/^-/, '');
    for (const s of COMPOUND_SUFFIXES) {
      if (remainder === s || remainder.startsWith(s)) {
        return true;
      }
    }
  }
  return false;
}

export function matchIngredientToTaxonomy(name) {
  if (!name) return { item: null, confidence: 0 };
  let clean = name.toLowerCase().trim();
  clean = clean.replace(/^(frische[srn]?|feine[srn]?|gehackte[srn]?|getrocknete[srn]?|gemahlene[srn]?|gekochte[srn]?|große[srn]?|kleine[srn]?|mittelgroße[srn]?)\s+/i, '').trim();

  // 1. Exact match on real item name
  if (itemsByName.has(clean)) {
    return { item: itemsByName.get(clean), confidence: 1.0 };
  }

  // 2. Exact match on aliases
  if (aliasToItem.has(clean)) {
    return { item: aliasToItem.get(clean), confidence: 0.95 };
  }

  // 3. German singular / plural variations
  const variations = [clean];
  if (clean.endsWith('n') && clean.length > 3) variations.push(clean.slice(0, -1));
  if (clean.endsWith('en') && clean.length > 4) variations.push(clean.slice(0, -2));
  if (clean.endsWith('e') && clean.length > 3) variations.push(clean.slice(0, -1));
  if (clean.endsWith('s') && clean.length > 3) variations.push(clean.slice(0, -1));

  variations.push(clean + 'n');
  variations.push(clean + 'en');
  variations.push(clean + 's');

  for (const v of variations) {
    if (itemsByName.has(v)) {
      return { item: itemsByName.get(v), confidence: 0.9 };
    }
    if (aliasToItem.has(v)) {
      return { item: aliasToItem.get(v), confidence: 0.88 };
    }
  }

  // 4. Token-based / Substring match
  let bestMatch = null;
  let bestLen = -1;
  let bestPrio = -1;
  let conf = 0.0;

  for (const [candidate, item] of itemsByName.entries()) {
    if (candidate.length >= 4) {
      if (shouldRejectCompoundPrefix(clean, candidate)) continue;
      const prio = item.recipe?.matchPriority ?? 80;

      if (clean.includes(candidate)) {
        if (candidate.length > bestLen || (candidate.length === bestLen && prio > bestPrio)) {
          bestLen = candidate.length;
          bestPrio = prio;
          bestMatch = item;
          conf = 0.8;
        }
      } else if (candidate.includes(clean) && clean.length >= 6) {
        if (candidate.length > bestLen || (candidate.length === bestLen && prio > bestPrio)) {
          bestLen = candidate.length;
          bestPrio = prio;
          bestMatch = item;
          conf = 0.75;
        }
      }
    }
  }

  return { item: bestMatch, confidence: conf };
}

export function inferCategoryFallback(name) {
  const lower = (name || '').toLowerCase();

  // Specific overrides before broad substring checks
  if (['spülmaschinensalz', 'regeneriersalz', 'geschirrspülsalz', 'reiniger', 'spülmittel', 'seife', 'shampoo', 'zahnpasta', 'folie', 'alufolie', 'backpapier', 'müllbeutel', 'schraubglas', 'schraubgläser', 'bürste', 'tuch', 'tücher'].some(k => lower.includes(k))) {
    return 'Drogerie, Haushalt & Tierbedarf';
  }

  if (['kokosmilch', 'tütensuppe', 'fertigsuppe', 'knoblauchpulver', 'zwiebelpulver', 'agavendicksaft', 'ahornsirup', 'zuckerrübensirup', 'gelierzucker', 'vanillezucker'].some(k => lower.includes(k))) {
    return 'Vorratskammer';
  }

  // Fleisch & Fisch
  if (['fleisch', 'hack', 'wurst', 'würst', 'wiener', 'hähnchen', 'huhn', 'pute', 'rind', 'schwein', 'kalb', 'lamm', 'wild', 'fisch', 'lachs', 'thunfisch', 'forelle', 'kabeljau', 'dorsch', 'garnele', 'scampi', 'shrimp', 'meeresfrüchte', 'rippchen', 'spareribs', 'ribs', 'schnitzel', 'steak', 'gulasch', 'braten', 'speck', 'bacon', 'schinken'].some(k => lower.includes(k))) {
    return 'Fleisch & Fisch';
  }

  // Brot & Backwaren
  if (['brot', 'brötchen', 'toast', 'baguette', 'croissant', 'bun', 'ciabatta', 'tortilla', 'wrap', 'pita', 'semmel'].some(k => lower.includes(k))) {
    return 'Brot & Backwaren';
  }

  // Milchprodukte & Tiefkühlkost
  if (['milch', 'käse', 'joghurt', 'sahne', 'quark', 'butter', 'schmand', 'creme', 'crème', 'frischkäse', 'mascarpone', 'mozzarella', 'parmesan', 'feta', 'gouda', 'ricotta', 'tiefkühl', 'tk', 'eis'].some(k => lower.includes(k))) {
    return 'Milchprodukte & Tiefkühlkost';
  }

  // Obst & Gemüse
  if (['salat', 'kohl', 'pilz', 'champignon', 'beere', 'frucht', 'apfel', 'äpfel', 'birne', 'banane', 'tomate', 'gurke', 'paprika', 'zucchini', 'aubergine', 'karotte', 'möhre', 'kartoffel', 'zwiebel', 'knoblauch', 'lauch', 'porree', 'spinat', 'brokkoli', 'ingwer', 'kürbis', 'radieschen', 'spargel', 'zitrone', 'limette', 'orange', 'petersilie', 'basilikum', 'schnittlauch', 'dill', 'koriander', 'minze'].some(k => lower.includes(k))) {
    return 'Obst & Gemüse';
  }

  // Getränke & Genussmittel
  if (['wasser', 'saft', 'cola', 'limonade', 'bier', 'wein', 'sekt', 'kaffee', 'espresso', 'tee', 'sirup', 'likör', 'rum', 'gin', 'vodka'].some(k => lower.includes(k))) {
    return 'Getränke & Genussmittel';
  }

  // Drogerie & Haushalt (remaining container words like Glas/Gläser)
  if (['glas', 'gläser'].some(k => lower.includes(k))) {
    return 'Drogerie, Haushalt & Tierbedarf';
  }

  // Vorratskammer
  if (['zucker', 'mehl', 'stärke', 'backpulver', 'hefe', 'vanille', 'kakao', 'öl', 'olivenöl', 'essig', 'balsamico', 'salz', 'pfeffer', 'gewürz', 'curry', 'oregano', 'thymian', 'rosmarin', 'brühe', 'bouillon', 'sauce', 'soße', 'senf', 'ketchup', 'mayo', 'tomatenmark', 'pesto', 'nudeln', 'pasta', 'spaghetti', 'reis', 'haferflocken', 'müsli', 'honig', 'marmelade', 'konfitüre', 'nuss', 'nüsse', 'mandel', 'chia', 'linse', 'kichererbse'].some(k => lower.includes(k))) {
    return 'Vorratskammer';
  }

  return 'Sonstiges';
}

const STAPLES_KEYWORDS = [
  'wasser', 'leitungswasser', 'salz', 'speisesalz', 'meersalz', 'steinsalz',
  'pfeffer', 'schwarzer pfeffer', 'weißer pfeffer', 'bunter pfeffer', 'cayennepfeffer',
  'muskat', 'muskatnuss'
];

export function isPantryStaple(name, rawLine, qty, unit, matchedTax = null) {
  const clean = (name || '').toLowerCase().trim();
  const rawClean = (rawLine || '').toLowerCase().trim();

  // Recipe internal self-reference
  if (['von oben', 'vom rub', 'von der marinade', 'des rubs', 'aus dem rub'].some(ref => rawClean.includes(ref))) {
    return true;
  }

  // Large purchase quantities are NOT staples
  if (['g', 'gramm'].includes(unit) && qty !== null && qty >= 100) return false;
  if (['kg', 'kilogramm'].includes(unit) && qty !== null && qty >= 0.1) return false;
  if (['ml', 'milliliter'].includes(unit) && qty !== null && qty >= 200) return false;
  if (['l', 'liter'].includes(unit) && qty !== null && qty >= 0.2) return false;

  // Fresh herbs are NOT staples
  if (['bund', 'zweig', 'frisch', 'topf'].some(h => clean.includes(h)) || ['Bund', 'Zweig'].includes(unit)) {
    return false;
  }

  // Gelierzucker or bulk sugar/oil is NOT a staple
  if (clean.includes('gelierzucker')) return false;
  if (clean.includes('zucker') && qty !== null && qty >= 100) return false;
  if (clean.includes('öl') && qty !== null && qty >= 100) return false;

  // Schema v2 data-driven pantryStaple rule
  const taxPantry = matchedTax?.recipe?.pantryStaple;
  if (taxPantry === 'always') return true;
  if (taxPantry === 'small_amounts') {
    if (['EL', 'TL', 'Msp.', 'Spritzer', 'Schuss', 'Prise'].includes(unit) && (qty === null || qty <= 3.0)) {
      return true;
    }
    if (qty === null && ['Stk', null, undefined].includes(unit)) return true;
  }

  // Standard pantry staples
  for (const s of STAPLES_KEYWORDS) {
    if (clean === s || new RegExp(`\\b${s}\\b`, 'i').test(clean)) return true;
  }

  // Small cooking amounts of oil or vinegar
  if (['öl', 'olivenöl', 'speiseöl', 'pflanzenöl', 'sonnenblumenöl', 'rapsöl', 'essig', 'balsamico'].some(o => clean.includes(o))) {
    if (['EL', 'TL', 'Msp.', 'Spritzer', 'Schuss', 'Prise'].includes(unit) && (qty === null || qty <= 3.0)) {
      return true;
    }
    if (qty === null && ['Stk', null, undefined].includes(unit)) return true;
  }

  // Dried spices
  if (clean.endsWith('gewürz') || clean.endsWith('gewürze')) {
    if (qty === null || qty <= 3.0) return true;
  }

  return false;
}

// --- DUPLICATE MERGING ---
export function canMergeUnits(u1, u2) {
  const u1Norm = (u1 || '').toLowerCase().replace(/\.$/, '');
  const u2Norm = (u2 || '').toLowerCase().replace(/\.$/, '');
  if (u1Norm === u2Norm) return true;
  if (UNIT_CONVERSIONS[u1Norm] && UNIT_CONVERSIONS[u2Norm]) {
    return UNIT_CONVERSIONS[u1Norm][0] === UNIT_CONVERSIONS[u2Norm][0];
  }
  return false;
}

export function mergeQuantitiesAndUnits(q1, u1, q2, u2) {
  if (q1 === null && q2 === null) return [null, u1];
  if (q1 === null) return [q2, u2];
  if (q2 === null) return [q1, u1];

  const u1Norm = (u1 || '').toLowerCase().replace(/\.$/, '');
  const u2Norm = (u2 || '').toLowerCase().replace(/\.$/, '');

  if (u1Norm === u2Norm) {
    return [Math.round((q1 + q2) * 100) / 100, u1];
  }

  if (UNIT_CONVERSIONS[u1Norm] && UNIT_CONVERSIONS[u2Norm]) {
    const [dim1, factor1] = UNIT_CONVERSIONS[u1Norm];
    const [dim2, factor2] = UNIT_CONVERSIONS[u2Norm];
    if (dim1 === dim2) {
      const baseVal = (q1 * factor1) + (q2 * factor2);
      if (dim1 === 'weight') {
        if (baseVal >= 1000.0) {
          return [Math.round((baseVal / 1000.0) * 100) / 100, 'kg'];
        }
        return [Math.round(baseVal * 10) / 10, 'g'];
      } else if (dim1 === 'volume') {
        if (baseVal >= 1000.0) {
          return [Math.round((baseVal / 1000.0) * 100) / 100, 'l'];
        }
        return [Math.round(baseVal * 10) / 10, 'ml'];
      }
    }
  }

  return [Math.round((q1 + q2) * 100) / 100, u1];
}

export function mergeDuplicateIngredients(ingredients) {
  const mergedList = [];

  for (const item of ingredients) {
    let matchIdx = -1;
    for (let i = 0; i < mergedList.length; i++) {
      const existing = mergedList[i];
      const sameTax = existing.taxonomy_id && existing.taxonomy_id === item.taxonomy_id;
      const sameNameCat = existing.name.toLowerCase() === item.name.toLowerCase() && existing.category === item.category;
      if (sameTax || sameNameCat) {
        if (canMergeUnits(existing.unit, item.unit)) {
          matchIdx = i;
          break;
        }
      }
    }

    if (matchIdx >= 0) {
      const existing = mergedList[matchIdx];
      const [newQty, newUnit] = mergeQuantitiesAndUnits(
        existing.quantity, existing.unit,
        item.quantity, item.unit
      );
      existing.quantity = newQty;
      existing.base_quantity = newQty;
      existing.unit = newUnit;
      existing.display_quantity = formatGermanQuantity(newQty, newUnit);
      existing.display_amount = existing.display_quantity;
      existing.was_merged = true;
      existing.original_lines = [...existing.original_lines, ...(item.original_lines || [item.raw])];
      existing.raw = existing.original_lines.map(l => `"${l}"`).join(' + ');

      if (!existing.specification && item.specification) {
        existing.specification = item.specification;
      }

      existing.is_pantry_staple = isPantryStaple(existing.name, existing.raw, existing.quantity, existing.unit);
      existing.is_staple = existing.is_pantry_staple;
      existing.selected = !existing.is_pantry_staple;

      if (existing.display_quantity) {
        existing.tags = [existing.display_quantity];
      }
    } else {
      mergedList.push({ ...item });
    }
  }

  return mergedList;
}

// --- FULL INGREDIENT LIST PROCESSING ---
function findClientUserOverride(rawName, matchedTax, userMappings) {
  if (!Array.isArray(userMappings) || userMappings.length === 0) return null;
  const articleMaps = userMappings.filter(m => m && m.mapping_type === 'article');
  if (matchedTax?.id) {
    const byTaxId = articleMaps.find(m => m.lookup_key === matchedTax.id);
    if (byTaxId) return byTaxId;
  }
  const candidates = [rawName, matchedTax?.name].filter(Boolean).map(s => s.trim().toLowerCase());
  for (const c of candidates) {
    const hit = articleMaps.find(m => (m.lookup_key || '').trim().toLowerCase() === c);
    if (hit) return hit;
  }
  return null;
}

export function processIngredientLines(rawLines, userMappings = []) {
  const parsedIngredients = [];

  for (const rawLine of rawLines) {
    const lineStr = (rawLine || '').trim();
    if (!lineStr || isSectionHeader(lineStr)) continue;

    const itemData = parseIngredientLine(lineStr);
    const { item: matchedTax, confidence } = matchIngredientToTaxonomy(itemData.name);

    let itemName = itemData.name;
    let category = 'Sonstiges';
    let icon = null;
    let taxonomyId = null;
    let isMatched = false;

    if (matchedTax) {
      if (itemData.name.toLowerCase().includes('gelierzucker')) {
        itemName = itemData.name;
      } else {
        itemName = matchedTax.name || itemData.name;
      }
      category = matchedTax.category || 'Sonstiges';
      icon = matchedTax.icon || null;
      taxonomyId = matchedTax.id || null;
      isMatched = true;
    } else {
      category = inferCategoryFallback(itemName);
    }

    // Layer 1 override: Personal UserItemMapping
    const userOverride = findClientUserOverride(itemData.name, matchedTax, userMappings)
      || (itemName !== itemData.name ? findClientUserOverride(itemName, matchedTax, userMappings) : null);
    if (userOverride) {
      if (userOverride.preferred_name) itemName = userOverride.preferred_name;
      if (userOverride.preferred_category) category = userOverride.preferred_category;
      if (userOverride.preferred_icon) icon = userOverride.preferred_icon;
      if (userOverride.linked_taxonomy_id && !taxonomyId) taxonomyId = userOverride.linked_taxonomy_id;
      isMatched = true;
    }

    const qty = itemData.quantity;
    const unit = itemData.unit;
    let spec = itemData.specification;
    if (!spec && itemData.notes && itemData.notes.length > 0) {
      const candidateNote = itemData.notes[0].trim();
      if (!/^(?:à\s*)?\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|cl|dl)$/i.test(candidateNote)) {
        spec = candidateNote;
      }
    }

    const stapleFlag = isPantryStaple(itemName, itemData.raw, qty, unit, matchedTax);
    const displayQty = formatGermanQuantity(qty, unit);

    const itemTags = [];
    if (displayQty) itemTags.push(displayQty);
    if (itemData.notes) {
      for (const n of itemData.notes) {
        if (!itemTags.includes(n) && n !== spec) itemTags.push(n);
      }
    }

    parsedIngredients.push({
      id: `ing-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: itemName,
      quantity: qty,
      base_quantity: qty,
      unit,
      display_quantity: displayQty,
      display_amount: displayQty,
      specification: spec,
      category,
      icon,
      taxonomy_id: taxonomyId,
      match_confidence: confidence,
      is_pantry_staple: stapleFlag,
      is_staple: stapleFlag,
      selected: !stapleFlag,
      original_lines: [itemData.raw],
      was_merged: false,
      raw: itemData.raw,
      original_name: itemData.name,
      recipe_quantity: qty,
      recipe_unit: unit,
      tags: itemTags,
      matched: isMatched
    });
  }

  return mergeDuplicateIngredients(parsedIngredients);
}

// --- TEXT IMPORT HELPER ---
export function parseTextRecipe(text, title, userMappings = []) {
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new Error('Bitte gib mindestens eine Zutat ein.');
  }

  const ingredients = processIngredientLines(lines, userMappings);
  if (ingredients.length === 0) {
    throw new Error('Auf dieser Seite wurden keine Zutaten erkannt. Du kannst sie einfach über den Text-Import einfügen.');
  }

  const cleanTitle = (title || '').trim() || 'Importiertes Rezept';

  return {
    title: cleanTitle,
    image: null,
    servings: 4.0,
    source: 'text',
    url: '',
    ingredients
  };
}

// --- CLIENT-SIDE URL FETCHER & PARSER ---
export async function parseRecipeClientSide(url, userMappings = []) {
  let targetUrl = (url || '').trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  let rawContent;
  try {
    if (Capacitor.isNativePlatform()) {
      const resp = await CapacitorHttp.get({
        url: targetUrl,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 KaufSync/1.0'
        }
      });
      rawContent = resp.data;
    } else {
      const resp = await fetch(targetUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8'
        }
      });
      if (resp.status === 404 || resp.status === 410) {
        const err = new Error('Dieser Rezept-Link wurde leider nicht gefunden. Bitte prüfe die Adresse.');
        err.code = 'not_found';
        throw err;
      }
      if (resp.status === 401 || resp.status === 403 || resp.status === 429) {
        const err = new Error('Diese Seite blockiert den automatischen Abruf. Kopiere die Zutatenliste einfach direkt in den Text-Import.');
        err.code = 'blocked_or_auth';
        throw err;
      }
      if (!resp.ok) {
        const err = new Error('Die Rezeptseite antwortet gerade nicht oder die Verbindung wurde unterbrochen. Bitte versuche es erneut oder nutze den Text-Import.');
        err.code = 'timeout_or_network';
        throw err;
      }
      rawContent = await resp.text();
    }
  } catch (err) {
    if (err.code) throw err;
    // Intercept raw TypeError: Failed to fetch / CORS errors
    const friendlyErr = new Error('Diese Seite lässt sich gerade nicht automatisch abrufen. Kopiere die Zutatenliste einfach direkt in den Text-Import.');
    friendlyErr.code = 'blocked_or_auth';
    throw friendlyErr;
  }

  const html = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

  // Search for ld+json scripts
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let recipeObj = null;

  function findRecipe(obj) {
    if (!obj) return null;
    if (typeof obj === 'object') {
      if (obj['@type'] === 'Recipe' || (Array.isArray(obj['@type']) && obj['@type'].includes('Recipe'))) {
        return obj;
      }
      if (Array.isArray(obj['@graph'])) {
        for (const item of obj['@graph']) {
          const res = findRecipe(item);
          if (res) return res;
        }
      }
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const res = findRecipe(item);
          if (res) return res;
        }
      }
    }
    return null;
  }

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1].trim());
      const found = findRecipe(json);
      if (found) {
        recipeObj = found;
        break;
      }
    } catch (e) {}
  }

  if (!recipeObj) {
    const err = new Error('Auf dieser Seite wurden keine Zutaten erkannt. Du kannst sie einfach über den Text-Import einfügen.');
    err.code = 'no_recipe_found';
    throw err;
  }

  const title = recipeObj.name || 'Importiertes Rezept';
  let image = null;
  if (typeof recipeObj.image === 'string') image = recipeObj.image;
  else if (Array.isArray(recipeObj.image) && recipeObj.image.length > 0) {
    image = typeof recipeObj.image[0] === 'string' ? recipeObj.image[0] : recipeObj.image[0]?.url;
  } else if (recipeObj.image?.url) {
    image = recipeObj.image.url;
  }

  let servings = 4.0;
  if (recipeObj.recipeYield) {
    let rawYield = recipeObj.recipeYield;
    if (Array.isArray(rawYield) && rawYield.length > 0) rawYield = rawYield[0];
    const sStr = String(rawYield);
    const numMatch = sStr.match(/(\d+([.,]\d+)?)/);
    if (numMatch) {
      const parsed = parseFloat(numMatch[1].replace(',', '.'));
      if (!isNaN(parsed) && parsed > 0) servings = Math.round(parsed);
    }
  }

  const rawIngredients = Array.isArray(recipeObj.recipeIngredient)
    ? recipeObj.recipeIngredient
    : (recipeObj.recipeIngredient ? [recipeObj.recipeIngredient] : []);

  const ingredients = processIngredientLines(rawIngredients, userMappings);
  if (ingredients.length === 0) {
    const err = new Error('Auf dieser Seite wurden keine Zutaten erkannt. Du kannst sie einfach über den Text-Import einfügen.');
    err.code = 'no_recipe_found';
    throw err;
  }

  return {
    title,
    image,
    servings,
    source: 'web',
    url: targetUrl,
    ingredients
  };
}
