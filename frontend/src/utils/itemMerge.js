import { findTaxonomyItem } from './search.js';

const URGENCY_SET = new Set(['dringend', 'angebot', "wenn's passt"]);

/**
 * Splits an item's tags field into non-urgency variant/note pills and urgency meta-tags.
 */
export function splitItemTags(tagsRaw) {
  const variantPills = [];
  const metaTags = [];
  if (!tagsRaw) return { variantPills, metaTags };

  let arr = [];
  if (Array.isArray(tagsRaw)) {
    arr = tagsRaw;
  } else if (typeof tagsRaw === 'string') {
    try {
      const parsed = JSON.parse(tagsRaw);
      arr = Array.isArray(parsed) ? parsed : [tagsRaw];
    } catch (e) {
      arr = tagsRaw.split(',');
    }
  }

  for (const raw of arr) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const tl = t.toLowerCase();
    if (URGENCY_SET.has(tl)) {
      if (!metaTags.some(m => m.toLowerCase() === tl)) metaTags.push(t);
    } else {
      if (!variantPills.some(v => v.toLowerCase() === tl)) variantPills.push(t);
    }
  }
  return { variantPills, metaTags };
}

function getCanonicalIdForItem(item, resolveFn = null) {
  if (item.taxonomy_id) return item.taxonomy_id;
  if (resolveFn) {
    const res = resolveFn(item.name);
    if (res && res.taxonomyId) return res.taxonomyId;
  }
  const tax = findTaxonomyItem(item.name);
  return tax?.id || null;
}

function sameVariantSet(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a.map(x => x.toLowerCase()));
  const setB = new Set(b.map(x => x.toLowerCase()));
  if (setA.size !== setB.size) return false;
  for (const val of setA) {
    if (!setB.has(val)) return false;
  }
  return true;
}

/**
 * Evaluates open list items to determine whether an incoming item should merge
 * into an existing tile or be created separately (for explicitly distinct variants).
 *
 * Rules (Spec 2.3 & 3.2):
 * 1. Match candidates sharing taxonomy_id OR identical normalized lowercase name.
 * 2. Exact pill set equality -> MERGE.
 * 3. Either candidate or incoming has 0 variant/note pills (with a clear target) -> MERGE.
 * 4. Both have non-empty differing variant/note pills -> CREATE SEPARATE (returns null).
 */
export function findMergeCandidate(openItems = [], incomingItem, resolveFn = null) {
  if (!incomingItem || !incomingItem.name) return null;
  const inNameLower = incomingItem.name.trim().toLowerCase();
  const inTaxId = getCanonicalIdForItem(incomingItem, resolveFn);
  const { variantPills: inPills } = splitItemTags(incomingItem.tags);

  const candidates = (openItems || []).filter(ex => {
    if (!ex || ex.status === 'completed' || ex.is_deleted) return false;
    const exNameLower = (ex.name || '').trim().toLowerCase();
    const exTaxId = getCanonicalIdForItem(ex, resolveFn);
    if (inTaxId && exTaxId && inTaxId === exTaxId) return true;
    return exNameLower === inNameLower;
  });

  if (candidates.length === 0) return null;

  // Pass 1: exact variant/note pill set equality
  for (const cand of candidates) {
    const { variantPills: candPills } = splitItemTags(cand.tags);
    if (sameVariantSet(candPills, inPills)) {
      return cand;
    }
  }

  // Pass 2: if incoming has no pills and an open plain item exists, prefer that one
  if (inPills.length === 0) {
    const plainCandidate = candidates.find(c => splitItemTags(c.tags).variantPills.length === 0);
    if (plainCandidate) return plainCandidate;
  }

  // Pass 3: single unambiguous candidate where at least one side has no variant pills
  if (candidates.length === 1) {
    const { variantPills: candPills } = splitItemTags(candidates[0].tags);
    if (candPills.length === 0 || inPills.length === 0) {
      return candidates[0];
    }
  }

  // Both existing and incoming have differing explicit variant pills -> keep separate
  return null;
}

/**
 * Merges incoming item into an existing open item payload and returns the updated fields
 * plus a user-friendly German toast confirmation string.
 */
export function buildMergedItemUpdate(existing, incoming) {
  const exQty = Number(existing.quantity) || 1;
  const inQty = Number(incoming.quantity) || 1;
  const newQuantity = Math.round((exQty + inQty) * 100) / 100;

  const { variantPills: exVars, metaTags: exMeta } = splitItemTags(existing.tags);
  const { variantPills: inVars, metaTags: inMeta } = splitItemTags(incoming.tags);

  const mergedVariants = [...exVars];
  for (const v of inVars) {
    if (!mergedVariants.some(x => x.toLowerCase() === v.toLowerCase())) {
      mergedVariants.push(v);
    }
  }

  const mergedMeta = [...exMeta];
  for (const m of inMeta) {
    if (!mergedMeta.some(x => x.toLowerCase() === m.toLowerCase())) {
      mergedMeta.push(m);
    }
  }

  const allTags = [...mergedVariants, ...mergedMeta];
  const tagsJson = JSON.stringify(allTags);

  const qtyText = Number.isInteger(newQuantity) ? String(newQuantity) : String(newQuantity).replace('.', ',');
  const addedPills = [
    ...inVars.filter(v => !exVars.some(e => e.toLowerCase() === v.toLowerCase())),
    ...inMeta.filter(m => !exMeta.some(e => e.toLowerCase() === m.toLowerCase()))
  ];

  const toastMessage = addedPills.length > 0
    ? `„${existing.name}“ aktualisiert (jetzt ${qtyText}× · ${addedPills.join(' · ')})`
    : `„${existing.name}“ auf ${qtyText} erhöht`;

  return {
    id: existing.id,
    name: existing.name,
    category: existing.category || incoming.category || 'Sonstiges',
    quantity: newQuantity,
    unit: existing.unit || incoming.unit || 'Stk',
    tags: tagsJson,
    note: existing.note || incoming.note || '',
    toastMessage
  };
}
