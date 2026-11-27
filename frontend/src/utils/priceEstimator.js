import { findTaxonomyItem } from './search.js';
import { isItemCompleted, isItemUnavailable } from './itemTransfer.js';

const BULK_PACK_REGEX = /(?:^|[\s,(])(?:kasten|kiste|tr[äa]ger|20er|24er|12er|6er\s*tr[äa]ger|vorratspack|megapack|sparpaket|x\s*(?:12|20|24))(?:$|[\s,)])/i;

export function parseGermanPriceInput(raw) {
  const str = String(raw ?? '').replace(/€/g, '').trim();
  if (!str) {
    return { valid: false, value: null, isEmpty: true };
  }
  const normalized = str.replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) {
    return { valid: false, value: null, isEmpty: false };
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0 || num > 9999) {
    return { valid: false, value: null, isEmpty: false };
  }
  return { valid: true, value: Math.round(num * 100) / 100, isEmpty: false };
}

export function formatEurExact(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '– €';
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

export function formatEurPill(amount, hasAnyPriced = true) {
  if (!hasAnyPriced || typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '~ – €';
  }
  if (amount >= 10) {
    return `~${Math.round(amount)} €`;
  }
  return `~${formatEurExact(amount)}`;
}

export function isBulkPackItem(tagsRaw) {
  if (!tagsRaw) return false;
  let text = '';
  if (Array.isArray(tagsRaw)) {
    text = tagsRaw.join(' ');
  } else if (typeof tagsRaw === 'string') {
    try {
      const parsed = JSON.parse(tagsRaw);
      text = Array.isArray(parsed) ? parsed.join(' ') : tagsRaw;
    } catch {
      text = tagsRaw;
    }
  }
  return BULK_PACK_REGEX.test(text);
}

export function cleanBarcodeDigits(barcode) {
  return String(barcode || '').replace(/\D+/g, '');
}

export function resolveArticlePriceKeys(item, findTaxFn = findTaxonomyItem) {
  const name = String(item?.name || '').trim();
  const lowerName = name.toLowerCase();
  const taxMatch = name && findTaxFn ? findTaxFn(name) : null;
  const taxId = item?.taxonomy_id || taxMatch?.id || null;
  return {
    primaryKey: taxId ? String(taxId).toLowerCase() : lowerName,
    lowerName,
    taxMatch
  };
}

export function getPriceSourceLabel(source) {
  switch (source) {
    case 'user': return 'Eigener Preis';
    case 'community': return 'Community';
    case 'reference': return 'Richtpreis';
    default: return 'Ohne Preis';
  }
}

/**
 * Resolves a single item's price strictly through the 4-tier cross-store waterfall:
 * 1. Personal User Price (barcode -> article)
 * 2. Anonymous Crowd Median / Cached Open Community Barcode Price
 * 3. Curated German Taxonomy Reference Price
 * 4. None
 */
export function resolveItemPrice(item, { userPricesMap = new Map(), crowdPricesMap = new Map(), findTaxFn = findTaxonomyItem } = {}) {
  const qty = Math.max(1, Number(item?.quantity) || 1);
  const cleanCode = cleanBarcodeDigits(item?.scanned_barcode);
  const { primaryKey, lowerName, taxMatch } = resolveArticlePriceKeys(item, findTaxFn);

  // Tier 1: Personal User Price (barcode first, then article)
  if (cleanCode.length >= 8 && userPricesMap.has(`barcode:${cleanCode}`)) {
    const uPrice = Number(userPricesMap.get(`barcode:${cleanCode}`));
    if (Number.isFinite(uPrice) && uPrice > 0) {
      return {
        unitPriceEur: uPrice,
        lineTotalEur: Math.round(uPrice * qty * 100) / 100,
        source: 'user',
        sourceLabel: getPriceSourceLabel('user')
      };
    }
  }
  const userArticlePrice = userPricesMap.get(`article:${primaryKey}`) ?? userPricesMap.get(`article:${lowerName}`);
  if (userArticlePrice != null && Number.isFinite(Number(userArticlePrice)) && Number(userArticlePrice) > 0) {
    const uPrice = Number(userArticlePrice);
    return {
      unitPriceEur: uPrice,
      lineTotalEur: Math.round(uPrice * qty * 100) / 100,
      source: 'user',
      sourceLabel: getPriceSourceLabel('user')
    };
  }

  // Tier 2 & 3: Community Crowd Median (>=3 contributors) or cached Open Prices barcode lookup
  if (cleanCode.length >= 8 && crowdPricesMap.has(`barcode:${cleanCode}`)) {
    const agg = crowdPricesMap.get(`barcode:${cleanCode}`);
    const isEligible = agg && (agg.source === 'external_open_prices' || Number(agg.contributor_count || 0) >= 3);
    if (isEligible && Number.isFinite(Number(agg.median_price_eur)) && Number(agg.median_price_eur) > 0) {
      const cPrice = Number(agg.median_price_eur);
      return {
        unitPriceEur: cPrice,
        lineTotalEur: Math.round(cPrice * qty * 100) / 100,
        source: 'community',
        sourceLabel: getPriceSourceLabel('community')
      };
    }
  }

  const crowdAgg = crowdPricesMap.get(`article:${primaryKey}`) ?? crowdPricesMap.get(`article:${lowerName}`);
  if (crowdAgg && Number(crowdAgg.contributor_count || 0) >= 3 && Number.isFinite(Number(crowdAgg.median_price_eur)) && Number(crowdAgg.median_price_eur) > 0) {
    const cPrice = Number(crowdAgg.median_price_eur);
    return {
      unitPriceEur: cPrice,
      lineTotalEur: Math.round(cPrice * qty * 100) / 100,
      source: 'community',
      sourceLabel: getPriceSourceLabel('community')
    };
  }

  // Tier 4: Curated German Taxonomy Reference Price
  const refPrice = taxMatch?.reference_price_eur;
  if (typeof refPrice === 'number' && Number.isFinite(refPrice) && refPrice > 0) {
    return {
      unitPriceEur: refPrice,
      lineTotalEur: Math.round(refPrice * qty * 100) / 100,
      source: 'reference',
      sourceLabel: getPriceSourceLabel('reference')
    };
  }

  return {
    unitPriceEur: null,
    lineTotalEur: null,
    source: 'none',
    sourceLabel: getPriceSourceLabel('none')
  };
}

/**
 * Resolves fallback reference/community estimate (excluding personal user override)
 * so the Item Detail Modal placeholder shows what lower tier would assume when cleared.
 */
export function resolveBaseEstimatePrice(item, { crowdPricesMap = new Map(), findTaxFn = findTaxonomyItem } = {}) {
  return resolveItemPrice(item, {
    userPricesMap: new Map(),
    crowdPricesMap,
    findTaxFn
  });
}

/**
 * Computes expected checkout summary for an open list:
 * Sums open + checked items, excludes unavailable items.
 */
export function computeListCheckoutSummary(items = [], priceContext = {}) {
  let totalEur = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let excludedUnavailableCount = 0;
  const pricedRows = [];
  const unpricedRows = [];

  for (const item of (items || [])) {
    if (!item || item.is_deleted) continue;
    if (isItemUnavailable(item)) {
      excludedUnavailableCount++;
      continue;
    }

    const qty = Math.max(1, Number(item.quantity) || 1);
    const resolved = resolveItemPrice(item, priceContext);
    const row = {
      item,
      id: item.id,
      name: item.name,
      category: item.category || 'Sonstiges',
      quantity: qty,
      isChecked: isItemCompleted(item),
      unitPriceEur: resolved.unitPriceEur,
      lineTotalEur: resolved.lineTotalEur,
      source: resolved.source,
      sourceLabel: resolved.sourceLabel
    };

    if (resolved.unitPriceEur !== null) {
      totalEur += resolved.lineTotalEur;
      pricedCount++;
      pricedRows.push(row);
    } else {
      unpricedCount++;
      unpricedRows.push(row);
    }
  }

  totalEur = Math.round(totalEur * 100) / 100;
  const totalCountableCount = pricedCount + unpricedCount;

  return {
    totalEur,
    pricedCount,
    unpricedCount,
    totalCountableCount,
    excludedUnavailableCount,
    hasCountableItems: totalCountableCount > 0,
    hasAnyPriced: pricedCount > 0,
    pillLabel: formatEurPill(totalEur, pricedCount > 0),
    rows: [...pricedRows, ...unpricedRows]
  };
}
