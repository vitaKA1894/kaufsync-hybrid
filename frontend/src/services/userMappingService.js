import { ref, computed } from 'vue';
import { apiUrl } from '../config/api.js';
import { isOnline } from './syncService.js';
import { findTaxonomyItem, searchTaxonomy, normalizeSearchText } from '../utils/search.js';
import { inferCategoryFallback } from '../utils/clientRecipeParser.js';

const STORAGE_PREFIX = 'ks_user_mappings_';
const PENDING_PREFIX = 'ks_user_mappings_pending_';

export const userMappings = ref([]);
export const mappingsCount = computed(() => userMappings.value.length);

let loadedForUserId = null;

/**
 * Resolves the active authenticated user_id strictly for per-user isolation.
 */
export function getActiveUserId() {
  if (typeof localStorage === 'undefined') return 'anonymous';
  try {
    const rawUser = localStorage.getItem('user') || localStorage.getItem('cachedUser');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed && parsed.id) return String(parsed.id);
    }
    const token = localStorage.getItem('token');
    if (token && token.includes('.')) {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = typeof atob === 'function'
          ? atob(b64)
          : Buffer.from(b64, 'base64').toString('utf8');
        const payload = JSON.parse(jsonStr);
        if (payload && payload.sub) return String(payload.sub);
      }
    }
  } catch (e) {}
  return 'anonymous';
}

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId || getActiveUserId()}`;
}

function getPendingKey(userId) {
  return `${PENDING_PREFIX}${userId || getActiveUserId()}`;
}

function readLocalMappings(userId) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeLocalMappings(userId, list) {
  const uid = userId || getActiveUserId();
  userMappings.value = [...list];
  loadedForUserId = uid;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(list));
  } catch (e) {
    console.warn('Fehler beim Speichern lokaler Zuordnungen:', e);
  }
}

function readPendingOps(userId) {
  if (typeof localStorage === 'undefined') return { upserts: [], deletes: [], reset: false };
  try {
    const raw = localStorage.getItem(getPendingKey(userId));
    if (!raw) return { upserts: [], deletes: [], reset: false };
    const parsed = JSON.parse(raw);
    return {
      upserts: Array.isArray(parsed.upserts) ? parsed.upserts : [],
      deletes: Array.isArray(parsed.deletes) ? parsed.deletes : [],
      reset: Boolean(parsed.reset)
    };
  } catch (e) {
    return { upserts: [], deletes: [], reset: false };
  }
}

function writePendingOps(userId, ops) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getPendingKey(userId), JSON.stringify(ops));
  } catch (e) {}
}

export function ensureMappingsLoaded(force = false) {
  const uid = getActiveUserId();
  if (force || loadedForUserId !== uid) {
    userMappings.value = readLocalMappings(uid);
    loadedForUserId = uid;
  }
  return userMappings.value;
}

export function getUserMappingsSnapshot() {
  return ensureMappingsLoaded();
}

export function clearLocalUserMappings(userId = null) {
  const uid = userId || getActiveUserId();
  userMappings.value = [];
  loadedForUserId = null;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(uid));
    localStorage.removeItem(getPendingKey(uid));
    // Also clean any leftover user mapping keys on explicit wipe
    if (!userId) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(STORAGE_PREFIX) || k.startsWith(PENDING_PREFIX))) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch (e) {}
}

/**
 * Unified 3-Layer Resolution Order:
 * 1. Personal UserItemMapping (barcode first if provided, then article override)
 * 2. Global read-only taxonomy
 * 3. Deterministic category fallback
 */
export function resolveArticleWithUserLayer(name, barcode = null) {
  const list = ensureMappingsLoaded();
  const cleanName = (name || '').trim();
  const cleanBarcode = barcode ? String(barcode).trim() : '';

  // Layer 1a: Barcode mapping lookup (100% offline capable)
  if (cleanBarcode) {
    const bMatch = list.find(
      m => m.mapping_type === 'barcode' && m.lookup_key === cleanBarcode
    );
    if (bMatch) {
      const linkedTax = bMatch.linked_taxonomy_id
        ? findTaxonomyItem(bMatch.linked_taxonomy_id)
        : findTaxonomyItem(bMatch.preferred_name);
      return {
        source: 'user_mapping',
        name: bMatch.preferred_name,
        category: bMatch.preferred_category || 'Sonstiges',
        icon: bMatch.preferred_icon || linkedTax?.icon || null,
        taxonomyId: bMatch.linked_taxonomy_id || linkedTax?.id || null,
        taxItem: linkedTax || null,
        defaultUnit: linkedTax?.defaultUnit || 'Stk',
        allowedUnits: linkedTax?.allowedUnits || ['Stk'],
        mapping: bMatch
      };
    }
  }

  // Layer 2 candidate check so we know canonical taxonomy_id if one exists
  const taxMatch = cleanName ? findTaxonomyItem(cleanName) : null;
  const lowerName = cleanName.toLowerCase();

  // Layer 1b: Article mapping lookup (by taxonomy_id or normalized lowercase name)
  if (cleanName) {
    let aMatch = null;
    if (taxMatch?.id) {
      aMatch = list.find(m => m.mapping_type === 'article' && m.lookup_key === taxMatch.id);
    }
    if (!aMatch) {
      aMatch = list.find(
        m => m.mapping_type === 'article' && (m.lookup_key || '').toLowerCase() === lowerName
      );
    }
    if (!aMatch && taxMatch?.name) {
      const taxNameLower = taxMatch.name.toLowerCase();
      aMatch = list.find(
        m => m.mapping_type === 'article' && (m.lookup_key || '').toLowerCase() === taxNameLower
      );
    }

    if (aMatch) {
      const linkedTax = aMatch.linked_taxonomy_id
        ? findTaxonomyItem(aMatch.linked_taxonomy_id)
        : taxMatch;
      return {
        source: 'user_mapping',
        name: aMatch.preferred_name || taxMatch?.name || cleanName,
        category: aMatch.preferred_category || taxMatch?.category || 'Sonstiges',
        icon: aMatch.preferred_icon || linkedTax?.icon || null,
        taxonomyId: aMatch.linked_taxonomy_id || linkedTax?.id || null,
        taxItem: linkedTax || null,
        defaultUnit: linkedTax?.defaultUnit || 'Stk',
        allowedUnits: linkedTax?.allowedUnits || ['Stk'],
        mapping: aMatch
      };
    }
  }

  // Layer 2: Global taxonomy default
  if (taxMatch) {
    return {
      source: 'taxonomy',
      name: taxMatch.name,
      category: taxMatch.category || 'Sonstiges',
      icon: taxMatch.icon || null,
      taxonomyId: taxMatch.id || null,
      taxItem: taxMatch,
      defaultUnit: taxMatch.defaultUnit || 'Stk',
      allowedUnits: taxMatch.allowedUnits || ['Stk'],
      mapping: null
    };
  }

  // Layer 3: Fallback category for unknown free-text items
  return {
    source: 'custom',
    name: cleanName,
    category: inferCategoryFallback(cleanName),
    icon: null,
    taxonomyId: null,
    taxItem: null,
    defaultUnit: 'Stk',
    allowedUnits: ['Stk'],
    mapping: null
  };
}

function normalizeMappingLookup(type, lookupKey) {
  const k = String(lookupKey || '').trim();
  return type === 'article' ? k.toLowerCase() : k;
}

async function persistUpsert(payload) {
  const uid = getActiveUserId();
  const list = [...ensureMappingsLoaded()];
  const lKey = normalizeMappingLookup(payload.mapping_type, payload.lookup_key);
  const nowIso = new Date().toISOString();

  const idx = list.findIndex(
    m => m.mapping_type === payload.mapping_type && normalizeMappingLookup(m.mapping_type, m.lookup_key) === lKey
  );

  const localRecord = {
    id: idx !== -1 ? list[idx].id : `umap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: uid,
    mapping_type: payload.mapping_type,
    lookup_key: lKey,
    preferred_name: payload.preferred_name.trim(),
    preferred_category: payload.preferred_category || 'Sonstiges',
    preferred_icon: payload.preferred_icon || null,
    linked_taxonomy_id: payload.linked_taxonomy_id || null,
    created_at: idx !== -1 ? list[idx].created_at : nowIso,
    updated_at: nowIso
  };

  if (idx !== -1) {
    list[idx] = localRecord;
  } else {
    list.unshift(localRecord);
  }
  writeLocalMappings(uid, list);

  if (typeof fetch !== 'undefined' && isOnline.value && typeof localStorage !== 'undefined' && localStorage.getItem('token')) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/users/me/item-mappings'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          mapping_type: localRecord.mapping_type,
          lookup_key: localRecord.lookup_key,
          preferred_name: localRecord.preferred_name,
          preferred_category: localRecord.preferred_category,
          preferred_icon: localRecord.preferred_icon,
          linked_taxonomy_id: localRecord.linked_taxonomy_id
        })
      });
      if (res.ok) {
        const saved = await res.json();
        const latest = [...ensureMappingsLoaded()];
        const sIdx = latest.findIndex(
          m => m.mapping_type === saved.mapping_type && normalizeMappingLookup(m.mapping_type, m.lookup_key) === saved.lookup_key
        );
        if (sIdx !== -1) latest[sIdx] = saved;
        else latest.unshift(saved);
        writeLocalMappings(uid, latest);
        return saved;
      }
    } catch (e) {
      // Queue below on network error
    }
  }

  // Queue offline upsert
  const pending = readPendingOps(uid);
  pending.upserts = pending.upserts.filter(
    u => !(u.mapping_type === localRecord.mapping_type && normalizeMappingLookup(u.mapping_type, u.lookup_key) === lKey)
  );
  pending.upserts.push({
    mapping_type: localRecord.mapping_type,
    lookup_key: localRecord.lookup_key,
    preferred_name: localRecord.preferred_name,
    preferred_category: localRecord.preferred_category,
    preferred_icon: localRecord.preferred_icon,
    linked_taxonomy_id: localRecord.linked_taxonomy_id
  });
  writePendingOps(uid, pending);
  return localRecord;
}

/**
 * Silently learns a per-user article mapping (category/name override or custom article).
 * Automatically removes any redundant override if the user reverted back to the global taxonomy default.
 */
export async function learnArticleMapping({ name, category, icon = null, taxonomyId = null }) {
  const cleanName = (name || '').trim();
  if (!cleanName) return null;

  const taxMatch = taxonomyId ? (findTaxonomyItem(taxonomyId) || findTaxonomyItem(cleanName)) : findTaxonomyItem(cleanName);
  const lookupKey = taxMatch?.id || cleanName.toLowerCase();

  // Revert check: if user restored original taxonomy category & name, delete redundant override
  if (
    taxMatch &&
    category === taxMatch.category &&
    cleanName.toLowerCase() === taxMatch.name.toLowerCase()
  ) {
    const list = ensureMappingsLoaded();
    const existing = list.find(
      m =>
        m.mapping_type === 'article' &&
        (m.lookup_key === taxMatch.id || (m.lookup_key || '').toLowerCase() === cleanName.toLowerCase())
    );
    if (existing) {
      await deleteUserMapping(existing.id);
    }
    return null;
  }

  return persistUpsert({
    mapping_type: 'article',
    lookup_key: lookupKey,
    preferred_name: cleanName,
    preferred_category: category || 'Sonstiges',
    preferred_icon: icon || taxMatch?.icon || null,
    linked_taxonomy_id: taxMatch?.id || null
  });
}

/**
 * Silently learns a per-user barcode mapping for instant 100% offline repeat scans.
 */
export async function learnBarcodeMapping({ barcode, name, category, icon = null, taxonomyId = null }) {
  const cleanCode = String(barcode || '').trim();
  const cleanName = (name || '').trim();
  if (!cleanCode || !cleanName) return null;

  const taxMatch = taxonomyId ? (findTaxonomyItem(taxonomyId) || findTaxonomyItem(cleanName)) : findTaxonomyItem(cleanName);

  return persistUpsert({
    mapping_type: 'barcode',
    lookup_key: cleanCode,
    preferred_name: cleanName,
    preferred_category: category || taxMatch?.category || 'Sonstiges',
    preferred_icon: icon || taxMatch?.icon || null,
    linked_taxonomy_id: taxMatch?.id || null
  });
}

export async function deleteUserMapping(mappingId) {
  if (!mappingId) return;
  const uid = getActiveUserId();
  const list = [...ensureMappingsLoaded()];
  const target = list.find(m => m.id === mappingId);
  const filtered = list.filter(m => m.id !== mappingId);
  writeLocalMappings(uid, filtered);

  const pending = readPendingOps(uid);
  if (target) {
    pending.upserts = pending.upserts.filter(
      u => !(u.mapping_type === target.mapping_type && normalizeMappingLookup(u.mapping_type, u.lookup_key) === normalizeMappingLookup(target.mapping_type, target.lookup_key))
    );
  }

  if (typeof fetch !== 'undefined' && isOnline.value && typeof localStorage !== 'undefined' && localStorage.getItem('token') && !String(mappingId).startsWith('umap-')) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/users/me/item-mappings/${mappingId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        writePendingOps(uid, pending);
        return;
      }
    } catch (e) {}
  }

  if (!String(mappingId).startsWith('umap-')) {
    pending.deletes.push(mappingId);
  }
  writePendingOps(uid, pending);
}

export async function resetAllUserMappings() {
  const uid = getActiveUserId();
  writeLocalMappings(uid, []);

  if (typeof fetch !== 'undefined' && isOnline.value && typeof localStorage !== 'undefined' && localStorage.getItem('token')) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/users/me/item-mappings'), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        writePendingOps(uid, { upserts: [], deletes: [], reset: false });
        return;
      }
    } catch (e) {}
  }

  writePendingOps(uid, { upserts: [], deletes: [], reset: true });
}

/**
 * Synchronizes local offline ops & downloads fresh per-user mappings from server.
 */
export async function syncUserMappings() {
  const uid = getActiveUserId();
  ensureMappingsLoaded();
  if (typeof fetch === 'undefined' || !isOnline.value || typeof localStorage === 'undefined') {
    return userMappings.value;
  }
  const token = localStorage.getItem('token');
  if (!token) return userMappings.value;

  const pending = readPendingOps(uid);

  try {
    if (pending.reset) {
      await fetch(apiUrl('/api/users/me/item-mappings'), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      pending.reset = false;
    }

    for (const delId of pending.deletes) {
      await fetch(apiUrl(`/api/users/me/item-mappings/${delId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
    pending.deletes = [];

    if (pending.upserts.length > 0) {
      const syncRes = await fetch(apiUrl('/api/users/me/item-mappings/sync'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mappings: pending.upserts })
      });
      if (syncRes.ok) {
        const fresh = await syncRes.json();
        pending.upserts = [];
        writePendingOps(uid, pending);
        writeLocalMappings(uid, Array.isArray(fresh) ? fresh : []);
        return userMappings.value;
      }
    }

    writePendingOps(uid, pending);

    const getRes = await fetch(apiUrl('/api/users/me/item-mappings'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (getRes.ok) {
      const serverList = await getRes.json();
      if (Array.isArray(serverList)) {
        writeLocalMappings(uid, serverList);
      }
    }
  } catch (e) {
    console.warn('Fehler beim Synchronisieren der persönlichen Zuordnungen:', e);
  }

  return userMappings.value;
}

/**
 * Searches personal learned mappings + global taxonomy, applying the 3-layer override
 * directly onto every returned tile so learned categories and custom items show immediately.
 */
export function searchWithUserOverrides(query, limit = 12) {
  if (!query || typeof query !== 'string') return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const list = ensureMappingsLoaded();
  const normQ = normalizeSearchText(trimmed);
  const lowerQ = trimmed.toLowerCase();
  if (!/[a-z0-9äöüß]/i.test(lowerQ)) return [];

  // 1. Find matching personal custom items (no taxonomy link or renamed)
  const customMatches = [];
  for (const m of list) {
    if (m.mapping_type !== 'article') continue;
    const pName = (m.preferred_name || '').trim();
    const normName = normalizeSearchText(pName);
    const lKey = (m.lookup_key || '').toLowerCase();
    if (normName.includes(normQ) || pName.toLowerCase().includes(lowerQ) || lKey.includes(lowerQ)) {
      const linkedTax = m.linked_taxonomy_id ? findTaxonomyItem(m.linked_taxonomy_id) : null;
      customMatches.push({
        ...(linkedTax || {}),
        id: linkedTax?.id || m.id,
        name: pName,
        category: m.preferred_category || linkedTax?.category || 'Sonstiges',
        icon: m.preferred_icon || linkedTax?.icon || null,
        defaultUnit: linkedTax?.defaultUnit || 'Stk',
        allowedUnits: linkedTax?.allowedUnits || ['Stk'],
        matchedAlias: null,
        _fromUserMapping: true
      });
    }
  }

  // 2. Standard taxonomy search with personal category/name overrides applied
  const taxResults = searchTaxonomy(trimmed, limit).map(item => {
    const resolved = resolveArticleWithUserLayer(item.name);
    if (resolved.source === 'user_mapping') {
      return {
        ...item,
        name: resolved.name,
        category: resolved.category,
        icon: resolved.icon || item.icon,
        _fromUserMapping: true
      };
    }
    return item;
  });

  // Merge without duplicates (preferring user custom match when exact/prefix)
  const seenKeys = new Set();
  const merged = [];

  for (const cm of customMatches) {
    const k = `${cm.id}|${cm.name.toLowerCase()}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      merged.push(cm);
    }
  }
  for (const tr of taxResults) {
    const k = `${tr.id}|${tr.name.toLowerCase()}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      merged.push(tr);
    }
  }

  return merged.slice(0, limit);
}
