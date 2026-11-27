import { ref } from 'vue';
import { apiUrl } from '../config/api.js';
import { isOnline } from './syncService.js';
import { cleanBarcodeDigits, isBulkPackItem, resolveArticlePriceKeys } from '../utils/priceEstimator.js';

const USER_PRICES_PREFIX = 'ks_user_prices_';
const PENDING_PRICES_PREFIX = 'ks_prices_pending_';
const CROWD_PRICES_KEY = 'ks_crowd_prices_cache';
const PREF_KEY = 'ks_show_price_estimate';

// Reactive version counter so Vue components recompute price summaries in 0 ms
export const priceSnapshotVersion = ref(0);

function getActiveUserId() {
  if (typeof localStorage === 'undefined') return 'anon';
  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('cachedUser');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return 'anon';
}

export function isPriceEstimateEnabled() {
  if (typeof localStorage === 'undefined') return true;
  const val = localStorage.getItem(PREF_KEY);
  return val === null ? true : val !== 'false';
}

export function setPriceEstimateEnabled(enabled) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PREF_KEY, String(!!enabled));
  priceSnapshotVersion.value++;
}

function readJsonArray(key) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key, arr) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(arr || []));
  } catch {}
}

export function getLocalUserPrices() {
  return readJsonArray(`${USER_PRICES_PREFIX}${getActiveUserId()}`);
}

function setLocalUserPrices(rows) {
  writeJsonArray(`${USER_PRICES_PREFIX}${getActiveUserId()}`, rows);
}

export function getLocalCrowdPrices() {
  return readJsonArray(CROWD_PRICES_KEY);
}

function setLocalCrowdPrices(rows) {
  writeJsonArray(CROWD_PRICES_KEY, rows);
}

function getPendingPriceOps() {
  return readJsonArray(`${PENDING_PRICES_PREFIX}${getActiveUserId()}`);
}

function setPendingPriceOps(ops) {
  const key = `${PENDING_PRICES_PREFIX}${getActiveUserId()}`;
  if (!ops || ops.length === 0) {
    try { localStorage.removeItem(key); } catch {}
  } else {
    writeJsonArray(key, ops);
  }
}

export function getPriceContext() {
  // Touch reactive version
  priceSnapshotVersion.value;
  const userPricesMap = new Map();
  for (const row of getLocalUserPrices()) {
    if (row?.price_key_type && row?.price_key && row?.unit_price_eur > 0) {
      userPricesMap.set(`${row.price_key_type}:${String(row.price_key).toLowerCase()}`, Number(row.unit_price_eur));
    }
  }
  const crowdPricesMap = new Map();
  for (const row of getLocalCrowdPrices()) {
    if (row?.price_key_type && row?.price_key && row?.median_price_eur > 0) {
      crowdPricesMap.set(`${row.price_key_type}:${String(row.price_key).toLowerCase()}`, row);
    }
  }
  return { userPricesMap, crowdPricesMap };
}

function applySnapshotResponse(data) {
  if (Array.isArray(data?.user_prices)) {
    setLocalUserPrices(data.user_prices);
  }
  if (Array.isArray(data?.crowd_prices)) {
    setLocalCrowdPrices(data.crowd_prices);
  }
  priceSnapshotVersion.value++;
}

export async function syncPriceSnapshot() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token || !isOnline.value) return;

  const pending = getPendingPriceOps();
  if (pending.length > 0) {
    const upserts = [];
    const deletes = [];
    for (const op of pending) {
      if (op.type === 'delete') {
        deletes.push({ price_key_type: op.price_key_type, price_key: op.price_key });
      } else if (op.type === 'upsert') {
        upserts.push({
          price_key_type: op.price_key_type,
          price_key: op.price_key,
          unit_price_eur: op.unit_price_eur,
          is_bulk_variant: !!op.is_bulk_variant
        });
      }
    }
    try {
      const res = await fetch(apiUrl('/api/users/me/prices/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ upserts, deletes })
      });
      if (res.ok) {
        setPendingPriceOps([]);
        applySnapshotResponse(await res.json());
        return;
      }
    } catch {}
  }

  try {
    const res = await fetch(apiUrl('/api/prices/snapshot'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      applySnapshotResponse(await res.json());
    }
  } catch {}
}

function resolvePriceTargetForItem(item) {
  const cleanCode = cleanBarcodeDigits(item?.scanned_barcode);
  if (cleanCode.length >= 8) {
    return { price_key_type: 'barcode', price_key: cleanCode };
  }
  const { primaryKey } = resolveArticlePriceKeys(item);
  return { price_key_type: 'article', price_key: primaryKey };
}

export async function savePersonalPrice({ item, unitPriceEur }) {
  if (!item || !unitPriceEur || unitPriceEur <= 0 || unitPriceEur > 9999) return;
  const rounded = Math.round(Number(unitPriceEur) * 100) / 100;
  const { price_key_type, price_key } = resolvePriceTargetForItem(item);
  if (!price_key) return;
  const is_bulk_variant = isBulkPackItem(item.tags);

  // Optimistic local save
  const current = getLocalUserPrices().filter(
    r => !(r.price_key_type === price_key_type && String(r.price_key).toLowerCase() === price_key)
  );
  current.push({
    id: `local_price_${Date.now()}`,
    price_key_type,
    price_key,
    unit_price_eur: rounded,
    is_bulk_variant,
    updated_at: new Date().toISOString()
  });
  setLocalUserPrices(current);
  priceSnapshotVersion.value++;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (isOnline.value && token) {
    try {
      const res = await fetch(apiUrl('/api/users/me/prices'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ price_key_type, price_key, unit_price_eur: rounded, is_bulk_variant })
      });
      if (res.ok) {
        applySnapshotResponse(await res.json());
        return;
      }
    } catch {}
  }

  const pending = getPendingPriceOps().filter(
    op => !(op.price_key_type === price_key_type && op.price_key === price_key)
  );
  pending.push({ type: 'upsert', price_key_type, price_key, unit_price_eur: rounded, is_bulk_variant });
  setPendingPriceOps(pending);
}

export async function removePersonalPrice({ item }) {
  if (!item) return;
  const { price_key_type, price_key } = resolvePriceTargetForItem(item);
  if (!price_key) return;

  const { lowerName } = resolveArticlePriceKeys(item);
  const keysToClear = new Set([price_key]);
  if (price_key_type === 'article' && lowerName) keysToClear.add(lowerName);

  const next = getLocalUserPrices().filter(
    r => !(r.price_key_type === price_key_type && keysToClear.has(String(r.price_key).toLowerCase()))
  );
  setLocalUserPrices(next);
  priceSnapshotVersion.value++;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (isOnline.value && token) {
    try {
      const url = apiUrl(`/api/users/me/prices?price_key_type=${encodeURIComponent(price_key_type)}&price_key=${encodeURIComponent(price_key)}`);
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        applySnapshotResponse(await res.json());
        return;
      }
    } catch {}
  }

  const pending = getPendingPriceOps().filter(
    op => !(op.price_key_type === price_key_type && keysToClear.has(op.price_key))
  );
  pending.push({ type: 'delete', price_key_type, price_key });
  setPendingPriceOps(pending);
}

/**
 * Non-blocking Tier 3 lookup for scanned barcodes that lack a user or crowd price.
 */
export async function fetchExternalBarcodePriceBackground(barcode) {
  const clean = cleanBarcodeDigits(barcode);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (clean.length < 8 || !token || !isOnline.value) return;

  try {
    const res = await fetch(apiUrl(`/api/prices/barcode/${clean}`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.found && data.aggregate) {
      const crowd = getLocalCrowdPrices().filter(
        c => !(c.price_key_type === 'barcode' && c.price_key === clean)
      );
      crowd.push(data.aggregate);
      setLocalCrowdPrices(crowd);
      priceSnapshotVersion.value++;
    }
  } catch {
    // Fail silently per Spec 2.4 / 3.3
  }
}

export function clearLocalPrices(userId = null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (userId) {
      localStorage.removeItem(`${USER_PRICES_PREFIX}${userId}`);
      localStorage.removeItem(`${PENDING_PRICES_PREFIX}${userId}`);
      return;
    }
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(USER_PRICES_PREFIX) || k.startsWith(PENDING_PRICES_PREFIX))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPriceSnapshot();
  });
}
