import { Capacitor, CapacitorHttp } from '@capacitor/core';
import taxonomy from '../assets/taxonomy.json' with { type: 'json' };

const KNOWN_UNITS = {
  g: 'g', gramm: 'g', kg: 'kg', kilogramm: 'kg',
  ml: 'ml', milliliter: 'ml', cl: 'cl', dl: 'dl',
  l: 'l', liter: 'l',
  tl: 'TL', teelöffel: 'TL', tsp: 'TL',
  el: 'EL', esslöffel: 'EL', tbsp: 'EL',
  prise: 'Prise', prisen: 'Prise', pinch: 'Prise',
  bund: 'Bund', bündel: 'Bund', bunde: 'Bund',
  dose: 'Dose', dosen: 'Dose', can: 'Dose',
  glas: 'Glas', gläser: 'Glas',
  packung: 'Pck.', packungen: 'Pck.', pck: 'Pck.', 'pck.': 'Pck.', pkg: 'Pck.', 'pkg.': 'Pck.',
  flasche: 'Fl.', flaschen: 'Fl.',
  zehe: 'Zehe', zehen: 'Zehe', clove: 'Zehe', cloves: 'Zehe',
  knolle: 'Knolle', knollen: 'Knolle',
  stange: 'Stange', stangen: 'Stange',
  scheibe: 'Scheibe', scheiben: 'Scheibe',
  zweig: 'Zweig', zweige: 'Zweig',
  blatt: 'Blatt', blätter: 'Blatt',
  becher: 'Becher',
  stk: 'Stk', stück: 'Stk', st: 'Stk'
};

const STAPLES_KEYWORDS = [
  'wasser', 'leitungswasser', 'salz', 'speisesalz', 'meersalz', 'steinsalz',
  'pfeffer', 'schwarzer pfeffer', 'weißer pfeffer', 'bunter pfeffer', 'cayennepfeffer',
  'muskat', 'muskatnuss', 'olivenöl', 'speiseöl', 'sonnenblumenöl', 'rapsöl',
  'pflanzenöl', 'bratöl', 'brühe', 'gemüsebrühe', 'fleischbrühe', 'hühnerbrühe',
  'essig', 'balsamico', 'weißweinessig', 'rotweinessig', 'zucker', 'kristallzucker',
  'gewürz', 'gewürze', 'pizzagewürz', 'kräuter', 'italienische kräuter'
];

export function isStapleOrSpice(name) {
  if (!name) return false;
  const clean = name.toLowerCase().trim();
  if (clean.endsWith('gewürz') || clean.endsWith('gewürze') || clean.endsWith('kräuter')) {
    return true;
  }
  for (const staple of STAPLES_KEYWORDS) {
    if (clean === staple || new RegExp(`\\b${staple}\\b`, 'i').test(clean)) {
      return true;
    }
  }
  return false;
}

export function parseIngredientLine(text) {
  let normalized = (text || '').trim();
  const fractionsMap = {
    '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4',
    '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8'
  };
  for (const [char, rep] of Object.entries(fractionsMap)) {
    normalized = normalized.replaceAll(char, rep);
  }

  const pattern = /^([\d\s\.,\/\-]+)\s*([a-zA-ZäöüÄÖÜß°\.]*)\s+(.*)$/;
  const match = normalized.match(pattern);

  let quantity = 1.0;
  let unit = 'Stk';
  let name = normalized;

  if (match) {
    const rawQty = match[1].trim();
    const rawUnit = match[2].trim().toLowerCase().replace(/\.$/, '');
    const remName = match[3].trim();

    let parsedQty = null;
    if (rawQty.includes('-')) {
      const parts = rawQty.split('-');
      const last = parseFloat(parts[parts.length - 1].trim().replace(',', '.'));
      if (!isNaN(last)) parsedQty = last;
    } else if (rawQty.includes('/')) {
      const parts = rawQty.split(/\s+/);
      let total = 0;
      let valid = true;
      for (const p of parts) {
        if (p.includes('/')) {
          const [n, d] = p.split('/');
          const val = parseFloat(n) / parseFloat(d);
          if (!isNaN(val)) total += val;
          else valid = false;
        } else {
          const val = parseFloat(p.replace(',', '.'));
          if (!isNaN(val)) total += val;
          else valid = false;
        }
      }
      if (valid && total > 0) parsedQty = Math.round(total * 100) / 100;
    } else {
      const val = parseFloat(rawQty.replace(',', '.'));
      if (!isNaN(val)) parsedQty = val;
    }

    if (parsedQty !== null && parsedQty > 0) {
      quantity = parsedQty;
      if (KNOWN_UNITS[rawUnit]) {
        unit = KNOWN_UNITS[rawUnit];
        name = remName;
      } else if (rawUnit === '') {
        unit = 'Stk';
        name = remName;
      } else {
        name = `${match[2]} ${remName}`.trim();
        unit = 'Stk';
      }
    } else {
      name = text;
    }
  }

  // Clean name
  name = name.replace(/^(ca\.|etwas|frische[srn]?|feine[srn]?|gehackte[srn]?)\s+/i, '').trim();
  name = name.replace(/[,;].*$/, '').trim();
  name = name.replace(/\(.*?\)/g, '').trim();

  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return { raw: text, quantity, unit, name };
}

// Build dynamic taxonomy lookup structures (ONLY matching on real item names)
const itemsByName = new Map();

taxonomy.forEach(item => {
  if (item.name) itemsByName.set(item.name.toLowerCase().trim(), item);
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
  if (!name) return null;
  let clean = name.toLowerCase().trim();
  clean = clean.replace(/^(frische[srn]?|feine[srn]?|gehackte[srn]?|getrocknete[srn]?|gemahlene[srn]?|gekochte[srn]?|große[srn]?|kleine[srn]?|mittelgroße[srn]?)\s+/i, '').trim();

  // 1. Exact match on real item name
  if (itemsByName.has(clean)) return itemsByName.get(clean);

  // 2. Plural / Singular variations of the real item name
  const variations = [clean];
  if (clean.endsWith('n') && clean.length > 3) variations.push(clean.slice(0, -1));
  if (clean.endsWith('en') && clean.length > 4) variations.push(clean.slice(0, -2));
  if (clean.endsWith('e') && clean.length > 3) variations.push(clean.slice(0, -1));
  if (clean.endsWith('s') && clean.length > 3) variations.push(clean.slice(0, -1));

  // Also check if taxonomy has pluralized form (e.g. clean: "Zwiebel" -> taxonomy: "Zwiebeln")
  variations.push(clean + 'n');
  variations.push(clean + 'en');
  variations.push(clean + 's');

  for (const v of variations) {
    if (itemsByName.has(v)) return itemsByName.get(v);
  }

  // 3. Substring matching: candidate must be part of clean (e.g. "Weizenmehl" -> "Mehl", "frische Vollmilch" -> "Vollmilch" / "Milch")
  // IMPORTANT: clean must NOT be a substring of candidate (e.g. "Sesam" must NEVER match "Sesamknäckebrot" or "Sesamstangen"!)
  let bestMatch = null;
  let longestLen = 0;

  for (const [candidate, item] of itemsByName.entries()) {
    if (candidate.length >= 4) {
      if (shouldRejectCompoundPrefix(clean, candidate)) {
        continue;
      }
      // Candidate must be contained in the parsed name (with whole word or suffix match)
      if (clean.includes(candidate)) {
        if (candidate.length > longestLen) {
          longestLen = candidate.length;
          bestMatch = item;
        }
      }
    }
  }

  return bestMatch;
}

export async function fetchHtmlOrData(url) {
  if (Capacitor.isNativePlatform()) {
    try {
      const resp = await CapacitorHttp.get({
        url,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 KaufSync/1.0'
        }
      });
      return resp.data;
    } catch (err) {
      console.warn('CapacitorHttp failed, trying standard fetch:', err);
    }
  }

  const resp = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8'
    }
  });
  return await resp.text();
}

export async function parseRecipeClientSide(url) {
  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  const rawContent = await fetchHtmlOrData(targetUrl);
  let html = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

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
    throw new Error('Kein Rezept mit strukturierten Zutaten gefunden.');
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
    if (Array.isArray(rawYield) && rawYield.length > 0) {
      rawYield = rawYield[0];
    }
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

  const ingredients = [];

  for (const rawLine of rawIngredients) {
    if (!rawLine || !String(rawLine).trim()) continue;
    const parsed = parseIngredientLine(String(rawLine));
    const matched = matchIngredientToTaxonomy(parsed.name);

    let itemName = parsed.name;
    let category = 'Sonstiges';
    let icon = null;
    let isMatched = false;

    if (matched) {
      itemName = matched.name || parsed.name;
      category = matched.category || 'Sonstiges';
      icon = matched.icon || null;
      isMatched = true;
    } else {
      // Intelligente Kategorie-Zuordnung für neue / nicht in Taxonomie gefundene Artikel
      const lower = parsed.name.toLowerCase();
      if (lower.includes('gewürz') || lower.includes('kräuter') || lower.includes('samen') || lower.includes('kerne') || lower.includes('öl') || lower.includes('essig') || lower.includes('soße') || lower.includes('sauce') || lower.includes('senf') || lower.includes('sesam') || lower.includes('hefe') || lower.includes('backpulver') || lower.includes('zucker') || lower.includes('salz') || lower.includes('mehl') || lower.includes('stärke')) {
        category = 'Vorratskammer';
      } else if (lower.includes('fleisch') || lower.includes('hack') || lower.includes('wurst') || lower.includes('hähnchen') || lower.includes('pute') || lower.includes('rind') || lower.includes('fisch') || lower.includes('lachs') || lower.includes('garnele')) {
        category = 'Fleisch & Fisch';
      } else if (lower.includes('brot') || lower.includes('brötchen') || lower.includes('toast') || lower.includes('baguette') || lower.includes('croissant') || lower.includes('bun')) {
        category = 'Brot & Backwaren';
      } else if (lower.includes('milch') || lower.includes('käse') || lower.includes('joghurt') || lower.includes('sahne') || lower.includes('quark') || lower.includes('butter') || lower.includes('schmand') || lower.includes('creme')) {
        category = 'Milchprodukte & Tiefkühlkost';
      } else if (lower.includes('salat') || lower.includes('kohl') || lower.includes('pilz') || lower.includes('beere') || lower.includes('frucht') || lower.includes('apfel') || lower.includes('tomate') || lower.includes('gurke')) {
        category = 'Obst & Gemüse';
      }
    }

    const isStaple = isStapleOrSpice(parsed.name) || isStapleOrSpice(itemName);

    // Structure pack count vs Ausprägung (tag)
    const uClean = (parsed.unit || '').toLowerCase().replace(/\.$/, '');
    const isWeightOrVol = ['g', 'gramm', 'kg', 'kilogramm', 'ml', 'milliliter', 'cl', 'dl', 'l', 'liter'].includes(uClean);
    const isSpoonOrPinch = ['el', 'esslöffel', 'tl', 'teelöffel', 'prise', 'prisen', 'msp', 'msp.', 'n.b.', 'n. b.'].includes(uClean);
    const isContainer = ['dose', 'dosen', 'becher', 'glas', 'gläser', 'packung', 'pck', 'pck.', 'bund', 'bündel', 'flasche', 'fl.'].includes(uClean);

    let finalQty = 1.0;
    let finalUnit = 'Stk';
    const itemTags = [];

    if (isWeightOrVol) {
      const qNum = parsed.quantity;
      const qStr = Number.isInteger(qNum) ? qNum.toString() : qNum.toString();
      itemTags.push(`${qStr}${parsed.unit}`);
      finalQty = 1.0;
      finalUnit = 'Stk';
    } else if (isSpoonOrPinch) {
      const qNum = parsed.quantity;
      const qStr = Number.isInteger(qNum) ? qNum.toString() : qNum.toString();
      itemTags.push(`${qStr} ${parsed.unit}`.trim());
      finalQty = 1.0;
      finalUnit = 'Stk';
    } else if (isContainer) {
      finalQty = parsed.quantity;
      finalUnit = 'Stk';
      if (['dose', 'dosen'].includes(uClean)) {
        itemTags.push(finalQty > 1 ? `${Math.round(finalQty)} Dosen` : 'Dose');
      } else if (['becher'].includes(uClean)) {
        itemTags.push('Becher');
      } else if (['glas', 'gläser'].includes(uClean)) {
        itemTags.push('Glas');
      } else if (['bund', 'bündel'].includes(uClean)) {
        itemTags.push('Bund');
      } else {
        itemTags.push(parsed.unit);
      }
    } else {
      finalQty = parsed.quantity;
      finalUnit = 'Stk';
    }

    ingredients.push({
      raw: parsed.raw,
      name: itemName,
      original_name: parsed.name,
      quantity: finalQty,
      base_quantity: finalQty,
      unit: finalUnit,
      display_amount: `${parsed.quantity} ${parsed.unit}`.trim(),
      recipe_quantity: parsed.quantity,
      recipe_unit: parsed.unit,
      tags: itemTags,
      category,
      icon,
      matched: isMatched,
      is_staple: isStaple,
      selected: true
    });
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
