import { findTaxonomyItem, normalizeSearchText } from './search.js';
import { resolveArticleWithUserLayer, searchWithUserOverrides } from '../services/userMappingService.js';
import { getRememberedNotes } from './articleNoteHistory.js';

const URGENCY_LABELS = {
  dringend: 'Dringend',
  angebot: 'Angebot',
  optional: "Wenn's passt"
};

const STOPWORDS = new Set([
  'und', 'mit', 'für', 'zum', 'zur', 'von', 'vom', 'im', 'in', 'am', 'an',
  'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer', 'etwas',
  'bitte', 'mal', 'noch', 'packung', 'pck', 'stk', 'stück', 'dose', 'glas',
  'flasche', 'becher', 'bund'
]);

const ATTRIBUTE_NORMALIZE = {
  bio: 'Bio',
  vegan: 'Vegan',
  vegane: 'Vegan',
  vegetarisch: 'Vegetarisch',
  laktosefrei: 'Laktosefrei',
  glutenfrei: 'Glutenfrei',
  regional: 'Regional',
  fairtrade: 'Fairtrade',
  vollkorn: 'Vollkorn',
  dinkel: 'Dinkel',
  zuckerfrei: 'Zuckerfrei',
  zero: 'Zero',
  light: 'Light',
  fettarm: 'Fettarm',
  mager: 'Mager',
  natur: 'Natur',
  medium: 'Medium',
  still: 'Still',
  classic: 'Classic',
  frisch: 'Frisch',
  haltbar: 'Haltbar',
  mild: 'Mild',
  scharf: 'Scharf',
  süß: 'Süß',
  ungesüßt: 'Ungesüßt',
  tk: 'TK'
};

function formatPackSize(numStr, rawUnit) {
  const cleanNum = numStr.replace('.', ',');
  const u = rawUnit.toLowerCase();
  if (u === 'l' || u === 'liter') return `${cleanNum} L`;
  return `${cleanNum} ${u}`;
}

function collectKnownPillsForItem(taxItem, listId, itemName) {
  const known = new Map(); // lowercase -> canonical display label
  const addKnown = (val) => {
    if (!val || typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed) return;
    known.set(trimmed.toLowerCase(), trimmed);
    known.set(normalizeSearchText(trimmed), trimmed);
  };

  if (taxItem) {
    (taxItem.variants || []).forEach(addKnown);
    (taxItem.attributes || []).forEach(addKnown);
    (taxItem.packSizes || []).forEach(addKnown);
    (taxItem.brands || []).forEach(addKnown);
    (taxItem.tags?.constellations || []).forEach(addKnown);
  }
  const remembered = getRememberedNotes(listId, itemName);
  remembered.forEach(addKnown);
  return known;
}

/**
 * Parses German natural-language quick input into structured count, package size,
 * variants, custom notes, meta-tags, and 3-layer resolved article identity.
 *
 * @param {string} rawInput
 * @param {string} [listId]
 * @returns {object} ParsedQuickInput
 */
export function parseQuickInput(rawInput, listId = '') {
  const raw = typeof rawInput === 'string' ? rawInput : '';
  const trimmed = raw.trim();

  const emptyResult = {
    raw_input: raw,
    has_modifiers: false,
    count_quantity: 1,
    package_size_pill: null,
    core_query: trimmed,
    resolved_source: 'custom',
    matched_taxonomy_id: null,
    matched_name: trimmed,
    matched_category: 'Sonstiges',
    matched_icon: null,
    default_unit: 'Stk',
    allowed_units: ['Stk'],
    detected_variant_pills: [],
    detected_custom_pills: [],
    detected_meta_tags: []
  };

  if (!trimmed) return emptyResult;

  // Guard: standalone 8-14 digit barcode pasted into search must never become a quantity
  if (/^\d{8,14}$/.test(trimmed)) {
    const resolvedBarcode = resolveArticleWithUserLayer('', trimmed);
    if (resolvedBarcode.source === 'user_mapping') {
      return {
        ...emptyResult,
        has_modifiers: false,
        core_query: resolvedBarcode.name,
        resolved_source: resolvedBarcode.source,
        matched_taxonomy_id: resolvedBarcode.taxonomyId,
        matched_name: resolvedBarcode.name,
        matched_category: resolvedBarcode.category,
        matched_icon: resolvedBarcode.icon,
        default_unit: resolvedBarcode.defaultUnit,
        allowed_units: resolvedBarcode.allowedUnits
      };
    }
    return emptyResult;
  }

  let working = trimmed;
  const detectedMeta = [];
  const pushMeta = (label) => {
    if (!detectedMeta.includes(label)) detectedMeta.push(label);
  };

  // 1. Extract Meta-Tags (case-insensitive; never trigger on fat percentages like 1,5%)
  if (/(?:^|\s)!(?=\s|$)|!\s*$/i.test(working)) {
    pushMeta(URGENCY_LABELS.dringend);
    working = working.replace(/!/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (/\b(dringend|wichtig|eilig)\b/i.test(working)) {
    pushMeta(URGENCY_LABELS.dringend);
    working = working.replace(/\b(dringend|wichtig|eilig)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  if (/\b(angebot|aktion|rabatt)\b/i.test(working)) {
    pushMeta(URGENCY_LABELS.angebot);
    working = working.replace(/\b(angebot|aktion|rabatt)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  if (/\bwenn'?s\s+passt\b|\b(optional|irgendwann)\b/i.test(working)) {
    pushMeta(URGENCY_LABELS.optional);
    working = working.replace(/\bwenn'?s\s+passt\b|\b(optional|irgendwann)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  // 2. Extract Explicit Item Multiplier / Count (e.g. "3x ...", "2 x ...", "3 Stück ...", or trailing "2x")
  let countQuantity = 1;
  let hasExplicitCount = false;

  // Protect standalone compound brand tokens like "8x4" before matching multiplier
  const leadMultMatch = working.match(/^(\d{1,3})\s*(?:x|×|\*)(?=\s|[A-Za-zäöüÄÖÜß]|$)(?!\d)/i);
  const leadUnitCountMatch = !leadMultMatch && working.match(/^(\d{1,3})\s*(?:stk\.?|stück)\b\s+/i);

  if (leadMultMatch) {
    const parsed = parseInt(leadMultMatch[1], 10);
    countQuantity = Math.max(1, parsed);
    hasExplicitCount = true;
    working = working.slice(leadMultMatch[0].length).trim();
  } else if (leadUnitCountMatch) {
    const parsed = parseInt(leadUnitCountMatch[1], 10);
    countQuantity = Math.max(1, parsed);
    hasExplicitCount = true;
    working = working.slice(leadUnitCountMatch[0].length).trim();
  } else {
    // Plain leading integer 1..99 NOT followed by measurement units, %, er, or hyphen (e.g. "2 Bio Bananen")
    // Also guards against "5.0 Original" (dot), "1,5%" (comma/%), "500g" (unit), "6er Pack" (er), "3-lagig" (-)
    const plainLeadMatch = working.match(/^(\d{1,2})\s+(?!(?:g|kg|mg|ml|cl|dl|l)\b|%|er\b|-)/i);
    if (plainLeadMatch) {
      const parsed = parseInt(plainLeadMatch[1], 10);
      if (parsed >= 1) {
        countQuantity = parsed;
        hasExplicitCount = true;
        working = working.slice(plainLeadMatch[0].length).trim();
      }
    }
  }

  if (!hasExplicitCount) {
    const trailMultMatch = working.match(/\s+(\d{1,3})\s*(?:x|×|stk\.?|stück)\b$/i);
    if (trailMultMatch) {
      const parsed = parseInt(trailMultMatch[1], 10);
      countQuantity = Math.max(1, parsed);
      hasExplicitCount = true;
      working = working.slice(0, working.length - trailMultMatch[0].length).trim();
    }
  }

  // 3. Extract Package Size / Weight / Volume (mapped to pill, NEVER stepper count)
  let packageSizePill = null;

  const weightVolRegex = /\b(\d+(?:[.,]\d+)?)\s*(g|kg|mg|ml|cl|dl|l)\b(?![a-zA-ZäöüÄÖÜß%])/i;
  const wvMatch = working.match(weightVolRegex);
  if (wvMatch) {
    packageSizePill = formatPackSize(wvMatch[1], wvMatch[2]);
    working = (working.slice(0, wvMatch.index) + ' ' + working.slice(wvMatch.index + wvMatch[0].length)).replace(/\s+/g, ' ').trim();
  } else {
    const packRegex = /\b(\d{1,2})\s*er(?:\s*(pack))?\b/i;
    const pMatch = working.match(packRegex);
    if (pMatch) {
      packageSizePill = pMatch[2] ? `${pMatch[1]}er Pack` : `${pMatch[1]}er`;
      working = (working.slice(0, pMatch.index) + ' ' + working.slice(pMatch.index + pMatch[0].length)).replace(/\s+/g, ' ').trim();
    }
  }

  // 4. Preserve multi-word "Typ 405" or "Typ 550" flour specs as clean custom note before splitting tokens
  const protectedPhrases = [];
  const typMatch = working.match(/\b(Typ\s+\d{3,4})\b/i);
  if (typMatch) {
    protectedPhrases.push(`Typ ${typMatch[1].split(/\s+/)[1]}`);
    working = (working.slice(0, typMatch.index) + ' ' + working.slice(typMatch.index + typMatch[0].length)).replace(/\s+/g, ' ').trim();
  }

  // Extract fat/concentration percentages like "1,5%", "3,5%", "0,1%" cleanly
  const detectedPercentTokens = [];
  const pctMatches = [...working.matchAll(/\b(\d+(?:[.,]\d+)?%)/g)];
  for (const pm of pctMatches) {
    detectedPercentTokens.push(pm[1].replace('.', ','));
  }
  if (pctMatches.length > 0) {
    working = working.replace(/\b\d+(?:[.,]\d+)?%/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const remainingCore = working.trim();

  // 5. Resolve Core Article (Unified 3-Layer Order)
  let resolved = null;
  let matchedWordsSet = new Set();

  if (remainingCore) {
    // Direct full-phrase match first (e.g. "Bio-Eier", "Kaffeefilter Größe 4", "Spülmaschinensalz")
    const directRes = resolveArticleWithUserLayer(remainingCore);
    if (directRes.source === 'user_mapping' || directRes.source === 'taxonomy') {
      resolved = directRes;
      remainingCore.split(/\s+/).forEach(w => matchedWordsSet.add(w.toLowerCase()));
    } else {
      // Token search: find best core product across tokens while peeling away modifiers/attributes
      const tokens = remainingCore.split(/\s+/).filter(Boolean);
      let bestCandidate = null;
      let bestScore = -1;
      let bestMatchedTokens = [];

      // Try contiguous subphrases from longest to shortest, preferring non-attribute/non-modifier core words
      for (let len = tokens.length; len >= 1; len--) {
        for (let start = 0; start <= tokens.length - len; start++) {
          const slice = tokens.slice(start, start + len);
          const phrase = slice.join(' ');
          if (phrase.length < 2) continue;

          // Skip pure attribute/stopword single tokens
          if (len === 1 && (ATTRIBUTE_NORMALIZE[phrase.toLowerCase()] || STOPWORDS.has(phrase.toLowerCase()))) {
            continue;
          }

          const res = resolveArticleWithUserLayer(phrase);
          if (res.source === 'user_mapping' || res.source === 'taxonomy') {
            let matchStrength = 300; // brand or indirect match
            if (res.source === 'user_mapping') {
              matchStrength = 2000;
            } else if (res.name.toLowerCase() === phrase.toLowerCase() || normalizeSearchText(res.name) === normalizeSearchText(phrase)) {
              matchStrength = 1500;
            } else if (!res.taxItem?.matchedAlias || (res.taxItem.aliases || []).some(a => a.toLowerCase() === phrase.toLowerCase())) {
              matchStrength = 1000;
            }
            const score = matchStrength + len * 50 + phrase.length;
            if (score > bestScore) {
              bestScore = score;
              bestCandidate = res;
              bestMatchedTokens = slice;
            }
          } else if (!bestCandidate && phrase.length >= 3) {
            const hits = searchWithUserOverrides(phrase, 3);
            if (hits.length > 0) {
              const top = hits[0];
              const hitNorm = normalizeSearchText(top.name);
              const phraseNorm = normalizeSearchText(phrase);
              if (hitNorm === phraseNorm || hitNorm.startsWith(phraseNorm) || phraseNorm.startsWith(hitNorm)) {
                const score = 200 + len * 20 + phrase.length;
                if (score > bestScore) {
                  bestScore = score;
                  bestCandidate = resolveArticleWithUserLayer(top.name);
                  bestMatchedTokens = slice;
                }
              }
            }
          }
        }
      }

      if (bestCandidate) {
        resolved = bestCandidate;
        bestMatchedTokens.forEach(w => matchedWordsSet.add(w.toLowerCase()));
      } else {
        resolved = resolveArticleWithUserLayer(remainingCore);
        tokens.forEach(w => matchedWordsSet.add(w.toLowerCase()));
      }
    }
  } else {
    resolved = {
      source: 'custom',
      name: '',
      category: 'Sonstiges',
      icon: null,
      taxonomyId: null,
      taxItem: null,
      defaultUnit: 'Stk',
      allowedUnits: ['Stk']
    };
  }

  // 6. Classify Leftover Tokens into Variant Pills vs Custom Note Pills
  const detectedVariantPills = [];
  const detectedCustomPills = [];
  const pushVariant = (v) => {
    if (v && !detectedVariantPills.some(x => x.toLowerCase() === v.toLowerCase())) {
      detectedVariantPills.push(v);
    }
  };
  const pushCustom = (c) => {
    if (c && !detectedCustomPills.some(x => x.toLowerCase() === c.toLowerCase()) &&
        !detectedVariantPills.some(x => x.toLowerCase() === c.toLowerCase())) {
      detectedCustomPills.push(c);
    }
  };

  if (packageSizePill) {
    pushVariant(packageSizePill);
  }

  const knownMap = collectKnownPillsForItem(resolved.taxItem, listId, resolved.name);
  const rememberedNotesSet = new Set(
    getRememberedNotes(listId, resolved.name).map(n => n.toLowerCase())
  );

  for (const pct of detectedPercentTokens) {
    const matchedKnown = knownMap.get(pct.toLowerCase());
    pushVariant(matchedKnown || pct);
  }

  for (const pp of protectedPhrases) {
    pushCustom(pp);
  }

  if (remainingCore) {
    const leftoverTokens = remainingCore
      .split(/\s+/)
      .filter(t => t && !matchedWordsSet.has(t.toLowerCase()));

    for (const tok of leftoverTokens) {
      const tl = tok.toLowerCase();
      const tn = normalizeSearchText(tok);
      if (STOPWORDS.has(tl)) continue;

      if (knownMap.has(tl) || knownMap.has(tn)) {
        const canonicalLabel = knownMap.get(tl) || knownMap.get(tn);
        if (rememberedNotesSet.has(canonicalLabel.toLowerCase())) {
          pushCustom(canonicalLabel);
        } else {
          pushVariant(canonicalLabel);
        }
      } else if (ATTRIBUTE_NORMALIZE[tl]) {
        pushVariant(ATTRIBUTE_NORMALIZE[tl]);
      } else if (tok.length >= 2) {
        const formatted = tok.charAt(0) === tok.charAt(0).toUpperCase()
          ? tok
          : tok.charAt(0).toUpperCase() + tok.slice(1);
        pushCustom(formatted);
      }
    }
  }

  const hasModifiers = Boolean(
    hasExplicitCount ||
    countQuantity > 1 ||
    packageSizePill ||
    detectedVariantPills.length > 0 ||
    detectedCustomPills.length > 0 ||
    detectedMeta.length > 0
  );

  return {
    raw_input: raw,
    has_modifiers: hasModifiers,
    count_quantity: countQuantity,
    package_size_pill: packageSizePill,
    core_query: remainingCore || resolved.name || trimmed,
    resolved_source: resolved.source,
    matched_taxonomy_id: resolved.taxonomyId,
    matched_name: resolved.name || remainingCore || trimmed,
    matched_category: resolved.category || 'Sonstiges',
    matched_icon: resolved.icon || null,
    default_unit: resolved.defaultUnit || 'Stk',
    allowed_units: resolved.allowedUnits || ['Stk'],
    detected_variant_pills: detectedVariantPills,
    detected_custom_pills: detectedCustomPills,
    detected_meta_tags: detectedMeta
  };
}
