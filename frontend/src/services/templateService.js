import { apiUrl } from '../config/api.js';
import { db } from '../db/index.js';
import {
  isOnline,
  getLocalListItems,
  queueMutation,
  updatePendingCount,
  notifyWidgetSyncHooks
} from './syncService.js';
import { resolveArticleWithUserLayer } from './userMappingService.js';
import { splitItemTags, findMergeCandidate, buildMergedItemUpdate } from '../utils/itemMerge.js';
import { isItemVisibleActive } from '../utils/itemTransfer.js';

const STORAGE_PREFIX = 'ks_templates_';
const PENDING_PREFIX = 'ks_templates_pending_';

function getActiveUserId() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const rawUser = localStorage.getItem('user') || localStorage.getItem('cachedUser');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return null;
}

function getStorageKey(userId = getActiveUserId()) {
  return `${STORAGE_PREFIX}${userId || 'anon'}`;
}

function getPendingKey(userId = getActiveUserId()) {
  return `${PENDING_PREFIX}${userId || 'anon'}`;
}

function genId(prefix = 'tmpl') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Pure helper: builds TemplateItem drafts from open/unavailable items of a list.
 */
export function buildTemplateItemsFromList(listItems = []) {
  return (listItems || [])
    .filter(it => it && !it.is_deleted && isItemVisibleActive(it) && (it.name || '').trim())
    .map(it => {
      const { variantPills, metaTags } = splitItemTags(it.tags);
      const resolved = resolveArticleWithUserLayer(it.name);
      return {
        id: genId('titem'),
        name: it.name.trim(),
        quantity: Math.max(1, Number(it.quantity) || 1),
        unit: it.unit || resolved.defaultUnit || 'Stk',
        category: it.category || resolved.category || 'Sonstiges',
        icon: it.icon || resolved.icon || null,
        taxonomy_id: it.taxonomy_id || resolved.taxonomyId || null,
        variants: variantPills,
        meta_tags: metaTags
      };
    });
}

/**
 * Pure helper: builds TemplateItem drafts from a grouped check-off activity batch (array of item names).
 */
export function buildTemplateItemsFromActivityBatch(itemNames = [], resolveFn = resolveArticleWithUserLayer) {
  const counts = new Map();
  for (const rawName of (itemNames || [])) {
    const name = String(rawName || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (counts.has(key)) {
      counts.get(key).quantity += 1;
    } else {
      const resolved = resolveFn ? resolveFn(name) : { name, category: 'Sonstiges' };
      counts.set(key, {
        id: genId('titem'),
        name: resolved.name || name,
        quantity: 1,
        unit: resolved.defaultUnit || 'Stk',
        category: resolved.category || 'Sonstiges',
        icon: resolved.icon || null,
        taxonomy_id: resolved.taxonomyId || null,
        variants: [],
        meta_tags: []
      });
    }
  }
  return Array.from(counts.values());
}

/**
 * Converts selected TemplateItems into standard Bulk/Add item payloads.
 */
export function toBulkItemPayloads(selectedTemplateItems = []) {
  return (selectedTemplateItems || []).map(it => {
    const allTags = [
      ...(Array.isArray(it.variants) ? it.variants : []),
      ...(Array.isArray(it.meta_tags) ? it.meta_tags : [])
    ];
    return {
      name: it.name,
      quantity: Math.max(1, Number(it.quantity) || 1),
      unit: it.unit || 'Stk',
      category: it.category || 'Sonstiges',
      tags: JSON.stringify(allTags),
      note: '',
      taxonomy_id: it.taxonomy_id || null
    };
  });
}

export function getLocalTemplates() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalTemplates(list) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(list || []));
  } catch {}
}

function getPendingTemplateOps() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getPendingKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setPendingTemplateOps(ops) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!ops || ops.length === 0) {
      localStorage.removeItem(getPendingKey());
    } else {
      localStorage.setItem(getPendingKey(), JSON.stringify(ops));
    }
  } catch {}
}

export function clearLocalTemplates(userId = null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (userId) {
      localStorage.removeItem(getStorageKey(userId));
      localStorage.removeItem(getPendingKey(userId));
      return;
    }
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(STORAGE_PREFIX) || k.startsWith(PENDING_PREFIX))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

export async function syncTemplates() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token || !isOnline.value) {
    return getLocalTemplates();
  }

  // 1. Flush any offline template ops first
  const pending = getPendingTemplateOps();
  if (pending.length > 0) {
    const remaining = [];
    for (const op of pending) {
      try {
        if (op.type === 'CREATE') {
          const res = await fetch(apiUrl('/api/templates'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(op.payload)
          });
          if (!res.ok) remaining.push(op);
        } else if (op.type === 'UPDATE') {
          const res = await fetch(apiUrl(`/api/templates/${op.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(op.payload)
          });
          if (!res.ok && res.status !== 404) remaining.push(op);
        } else if (op.type === 'DELETE') {
          const res = await fetch(apiUrl(`/api/templates/${op.id}`), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok && res.status !== 404) remaining.push(op);
        }
      } catch {
        remaining.push(op);
      }
    }
    setPendingTemplateOps(remaining);
  }

  // 2. Pull authoritative templates from server
  try {
    const res = await fetch(apiUrl('/api/templates'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const remote = await res.json();
      if (Array.isArray(remote)) {
        setLocalTemplates(remote);
        return remote;
      }
    }
  } catch {}

  return getLocalTemplates();
}

export async function saveTemplate({ id = null, name, items }) {
  const cleanName = (name || '').trim();
  if (!cleanName) {
    throw new Error('Bitte gib einen Namen für die Vorlage ein.');
  }
  const cleanItems = (items || []).filter(it => it && (it.name || '').trim()).map(it => ({
    id: it.id || genId('titem'),
    name: it.name.trim(),
    quantity: Math.max(1, Number(it.quantity) || 1),
    unit: it.unit || 'Stk',
    category: it.category || 'Sonstiges',
    icon: it.icon || null,
    taxonomy_id: it.taxonomy_id || null,
    variants: Array.isArray(it.variants) ? it.variants : [],
    meta_tags: Array.isArray(it.meta_tags) ? it.meta_tags : []
  }));
  if (cleanItems.length === 0) {
    throw new Error('Bitte füge mindestens einen Artikel zur Vorlage hinzu.');
  }

  const nowIso = new Date().toISOString();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const isUpdate = Boolean(id && !String(id).startsWith('local_tmpl_'));
  const localId = id || `local_tmpl_${genId()}`;

  const optimistic = {
    id: localId,
    user_id: getActiveUserId() || '',
    name: cleanName,
    items: cleanItems,
    created_at: nowIso,
    updated_at: nowIso
  };

  const current = getLocalTemplates();
  const existingIdx = current.findIndex(t => t.id === localId);
  if (existingIdx !== -1) {
    current[existingIdx] = { ...current[existingIdx], ...optimistic, created_at: current[existingIdx].created_at || nowIso };
  } else {
    current.unshift(optimistic);
  }
  setLocalTemplates(current);

  const payload = { name: cleanName, items: cleanItems };
  if (isOnline.value && token) {
    try {
      const endpoint = isUpdate ? `/api/templates/${localId}` : '/api/templates';
      const method = isUpdate ? 'PUT' : 'POST';
      const res = await fetch(apiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const saved = await res.json();
        const refreshed = getLocalTemplates().filter(t => t.id !== localId && t.id !== saved.id);
        refreshed.unshift(saved);
        setLocalTemplates(refreshed);
        return saved;
      }
    } catch {}
  }

  // Queue offline op
  const ops = getPendingTemplateOps();
  if (isUpdate) {
    ops.push({ type: 'UPDATE', id: localId, payload });
  } else {
    const filtered = ops.filter(o => o.localId !== localId);
    filtered.push({ type: 'CREATE', localId, payload });
    setPendingTemplateOps(filtered);
    return optimistic;
  }
  setPendingTemplateOps(ops);
  return optimistic;
}

export async function deleteTemplate(templateId) {
  if (!templateId) return;
  const current = getLocalTemplates().filter(t => t.id !== templateId);
  setLocalTemplates(current);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (String(templateId).startsWith('local_tmpl_')) {
    const ops = getPendingTemplateOps().filter(o => o.localId !== templateId);
    setPendingTemplateOps(ops);
    return;
  }

  if (isOnline.value && token) {
    try {
      const res = await fetch(apiUrl(`/api/templates/${templateId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok || res.status === 404) return;
    } catch {}
  }

  const ops = getPendingTemplateOps();
  ops.push({ type: 'DELETE', id: templateId });
  setPendingTemplateOps(ops);
}

/**
 * Applies selected template items onto targetListId with Smart Duplicate Merge,
 * working both online (single bulk API call) and offline (Dexie + syncQueue).
 */
export async function applyTemplateToTargetList({ listId, templateName, selectedItems }) {
  const bulkPayloads = toBulkItemPayloads(selectedItems);
  if (bulkPayloads.length === 0) return { addedCount: 0, mergedCount: 0, totalProcessed: 0 };

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const existingLocal = await getLocalListItems(listId);
  const openLocal = existingLocal.filter(it => !it.is_deleted && isItemVisibleActive(it));

  let addedCount = 0;
  let mergedCount = 0;
  let syncedOnline = false;

  if (isOnline.value && token) {
    try {
      const res = await fetch(apiUrl(`/api/lists/${listId}/items/bulk`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          recipe_title: `Vorlage: ${templateName}`,
          items: bulkPayloads
        })
      });
      if (res.ok) {
        syncedOnline = true;
        const serverItems = await res.json();
        const nowIso = new Date().toISOString();
        if (Array.isArray(serverItems)) {
          await db.transaction('rw', db.items, async () => {
            for (const it of serverItems) {
              await db.items.put({
                id: it.id,
                list_id: listId,
                name: it.name,
                category: it.category || 'Sonstiges',
                quantity: it.quantity || 1,
                unit: it.unit || 'Stk',
                note: it.note || '',
                status: it.status || 'active',
                tags: it.tags || '',
                updated_at: it.updated_at || nowIso,
                is_deleted: false
              });
            }
          });
          // Update cachedLists too
          try {
            const raw = localStorage.getItem('cachedLists');
            if (raw) {
              const lists = JSON.parse(raw);
              const target = lists.find(l => l.id === listId);
              if (target) {
                const updatedItems = await getLocalListItems(listId);
                target.items = updatedItems;
                localStorage.setItem('cachedLists', JSON.stringify(lists));
              }
            }
          } catch {}
        }
        notifyWidgetSyncHooks();
        return { addedCount: bulkPayloads.length, mergedCount: 0, totalProcessed: bulkPayloads.length };
      }
    } catch {
      syncedOnline = false;
    }
  }

  if (!syncedOnline) {
    const workingOpen = openLocal.map(it => ({ ...it }));
    for (const payload of bulkPayloads) {
      const mergeCandidate = findMergeCandidate(workingOpen, payload, resolveArticleWithUserLayer);
      if (mergeCandidate) {
        const mergedPatch = buildMergedItemUpdate(mergeCandidate, payload);
        const idx = workingOpen.findIndex(w => w.id === mergeCandidate.id);
        if (idx !== -1) workingOpen[idx] = { ...workingOpen[idx], ...mergedPatch };
        await queueMutation({
          listId,
          itemId: mergeCandidate.id,
          action: 'UPDATE_ITEM',
          payload: mergedPatch
        });
        mergedCount++;
      } else {
        const newId = genId('itm');
        const newItem = {
          id: newId,
          list_id: listId,
          name: payload.name,
          category: payload.category || 'Sonstiges',
          quantity: payload.quantity || 1,
          unit: payload.unit || 'Stk',
          note: payload.note || '',
          tags: payload.tags || '',
          status: 'active'
        };
        workingOpen.push(newItem);
        await queueMutation({
          listId,
          itemId: newId,
          action: 'ADD_ITEM',
          payload: newItem
        });
        addedCount++;
      }
    }
    await updatePendingCount();
    try {
      const raw = localStorage.getItem('cachedLists');
      if (raw) {
        const lists = JSON.parse(raw);
        const target = lists.find(l => l.id === listId);
        if (target) {
          target.items = await getLocalListItems(listId);
          localStorage.setItem('cachedLists', JSON.stringify(lists));
        }
      }
    } catch {}
    notifyWidgetSyncHooks();
  }

  return { addedCount, mergedCount, totalProcessed: bulkPayloads.length };
}
