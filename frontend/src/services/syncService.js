import { ref } from 'vue';
import { db } from '../db/index.js';
import { apiUrl } from '../config/api.js';
import { applyTransferOptimistically, isItemCompleted } from '../utils/itemTransfer.js';

// Reactive states for UI
export const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);
export const syncStatus = ref('synced'); // 'synced' | 'syncing' | 'offline' | 'error'
export const pendingCount = ref(0);

const widgetSyncHooks = new Set();
export function registerWidgetSyncHook(fn) {
  if (typeof fn === 'function') {
    widgetSyncHooks.add(fn);
  }
  return () => widgetSyncHooks.delete(fn);
}
export function notifyWidgetSyncHooks() {
  for (const fn of widgetSyncHooks) {
    try { fn(); } catch {}
  }
}

let isSyncing = false;
let syncTimeout = null;

// Update pending queue count
export async function updatePendingCount() {
  try {
    const count = await db.syncQueue.count();
    pendingCount.value = count;
    if (!isOnline.value) {
      syncStatus.value = 'offline';
    } else if (count > 0) {
      if (syncStatus.value !== 'syncing') {
        syncStatus.value = 'pending';
      }
    } else if (syncStatus.value !== 'syncing') {
      syncStatus.value = 'synced';
    }
    return count;
  } catch (err) {
    console.warn('Error reading syncQueue count:', err);
    return 0;
  }
}

// Network event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline.value = true;
    updatePendingCount();
    triggerSync();
  });

  window.addEventListener('offline', () => {
    isOnline.value = false;
    syncStatus.value = 'offline';
  });
}

/**
 * Triggers queue processing with debounce.
 */
export function triggerSync(delay = 100) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    processSyncQueue();
  }, delay);
}

/**
 * Read lists locally (0 ms latency).
 */
export async function getLocalLists() {
  try {
    const lists = await db.lists.toArray();
    for (const list of lists) {
      if (!list.items || list.items.length === 0) {
        const items = await db.items.where('list_id').equals(list.id).toArray();
        list.items = items.filter(it => !it.is_deleted);
      }
    }
    return lists;
  } catch (e) {
    console.error('Error loading local lists:', e);
    return [];
  }
}

/**
 * Cache lists and their items into Dexie.
 */
export async function saveLocalLists(lists) {
  if (!Array.isArray(lists)) return;
  try {
    await db.transaction('rw', db.lists, db.items, async () => {
      for (const list of lists) {
        await db.lists.put({
          id: list.id,
          name: list.name,
          icon_name: list.icon_name,
          created_by: list.created_by,
          creator: list.creator || null,
          share_code: list.share_code,
          readonly_token: list.readonly_token,
          readonly_enabled: list.readonly_enabled,
          updated_at: list.created_at,
          members: list.members || [],
          items: list.items || []
        });

        if (Array.isArray(list.items)) {
          for (const item of list.items) {
            await db.items.put({
              id: item.id,
              list_id: list.id,
              name: item.name,
              category: item.category || 'Sonstiges',
              quantity: item.quantity || 1,
              unit: item.unit || 'Stk',
              note: item.note || '',
              status: item.status || 'active',
              tags: item.tags || '',
              scanned_barcode: item.scanned_barcode || null,
              updated_at: item.updated_at || new Date().toISOString(),
              is_deleted: false
            });
          }
        }
      }
    });
  } catch (e) {
    console.warn('Error saving local lists:', e);
  }
  notifyWidgetSyncHooks();
}

/**
 * Read items for a specific list from Dexie (0 ms latency).
 */
export async function getLocalListItems(listId) {
  try {
    const all = await db.items.where('list_id').equals(listId).toArray();
    return all.filter(it => !it.is_deleted);
  } catch (e) {
    console.error('Error loading local items:', e);
    return [];
  }
}

/**
 * Queue an offline-first mutation and update local DB immediately.
 */
export async function queueMutation({ listId, itemId, action, payload }) {
  const timestamp = new Date().toISOString();
  
  // 1. Optimistic Local Database Update (instant UI!)
  try {
    if (action === 'ADD_ITEM') {
      await db.items.put({
        id: itemId || payload.id || crypto.randomUUID(),
        list_id: listId,
        name: payload.name,
        category: payload.category || 'Sonstiges',
        quantity: payload.quantity || 1,
        unit: payload.unit || 'Stk',
        note: payload.note || '',
        status: payload.status || 'active',
        tags: payload.tags || '',
        scanned_barcode: payload.scanned_barcode || null,
        updated_at: timestamp,
        is_deleted: false
      });
    } else if (action === 'UPDATE_ITEM') {
      if (itemId) {
        await db.items.update(itemId, { ...payload, updated_at: timestamp });
      }
    } else if (action === 'TOGGLE_STATUS') {
      if (itemId) {
        await db.items.update(itemId, { status: payload.status, updated_at: timestamp });
      }
    } else if (action === 'DELETE_ITEM') {
      if (itemId) {
        await db.items.delete(itemId);
      }
    } else if (action === 'CLEAR_COMPLETED') {
      const completed = await db.items.where('list_id').equals(listId).filter(it => isItemCompleted(it)).toArray();
      const ids = completed.map(c => c.id);
      await db.items.bulkDelete(ids);
    }
  } catch (e) {
    console.warn('Optimistic local update failed:', e);
  }

  // 2. Persist in syncQueue
  try {
    await db.syncQueue.add({
      list_id: listId,
      item_id: itemId || payload?.id,
      action,
      payload: payload || {},
      timestamp,
      status: 'pending'
    });
  } catch (e) {
    console.error('Failed to add to syncQueue:', e);
  }

  await updatePendingCount();
  notifyWidgetSyncHooks();

  // 3. Trigger background sync if online
  if (isOnline.value) {
    triggerSync(50);
  }
}

/**
 * Process all pending mutations in syncQueue against the backend.
 */
export async function processSyncQueue() {
  if (isSyncing || !isOnline.value) {
    return;
  }

  const token = localStorage.getItem('token');
  if (!token) return;

  const queueItems = await db.syncQueue.toArray();
  if (queueItems.length === 0) {
    await updatePendingCount();
    return;
  }

  isSyncing = true;
  syncStatus.value = 'syncing';

  // Group mutations by list_id
  const byList = {};
  for (const q of queueItems) {
    if (!byList[q.list_id]) byList[q.list_id] = [];
    byList[q.list_id].push(q);
  }

  try {
    for (const [listId, mutations] of Object.entries(byList)) {
      if (!listId || listId === 'undefined') {
        // Drop invalid list id
        await db.syncQueue.bulkDelete(mutations.map(m => m.id));
        continue;
      }

      const payload = {
        last_synced_at: localStorage.getItem(`last_synced_${listId}`) || null,
        mutations: mutations.map(m => ({
          id: String(m.id),
          action: m.action,
          item_id: m.item_id,
          payload: m.payload,
          client_timestamp: m.timestamp
        }))
      };

      const response = await fetch(apiUrl(`/api/lists/${listId}/sync`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        
        // Remove processed mutations from queue
        await db.syncQueue.bulkDelete(mutations.map(m => m.id));

        // Update server items in local DB
        if (Array.isArray(result.items)) {
          await db.transaction('rw', db.items, async () => {
            // Delete deleted item ids
            if (Array.isArray(result.deleted_item_ids) && result.deleted_item_ids.length > 0) {
              await db.items.bulkDelete(result.deleted_item_ids);
            }
            // Put active items
            for (const item of result.items) {
              await db.items.put({
                id: item.id,
                list_id: listId,
                name: item.name,
                category: item.category || 'Sonstiges',
                quantity: item.quantity || 1,
                unit: item.unit || 'Stk',
                note: item.note || '',
                status: item.status || 'active',
                tags: item.tags || '',
                scanned_barcode: item.scanned_barcode || null,
                updated_at: item.updated_at || result.server_time,
                is_deleted: false
              });
            }
          });
        }

        if (result.server_time) {
          localStorage.setItem(`last_synced_${listId}`, result.server_time);
        }
      } else if (response.status === 401) {
        // Auth error
        isSyncing = false;
        syncStatus.value = 'error';
        return;
      } else {
        console.warn(`Sync failed for list ${listId} with status ${response.status}`);
      }
    }
  } catch (error) {
    console.warn('Sync connection error:', error);
    syncStatus.value = isOnline.value ? 'error' : 'offline';
  } finally {
    isSyncing = false;
    await updatePendingCount();
    notifyWidgetSyncHooks();
  }
}

/**
 * Fetch and sync a single list.
 * 1. Returns local items immediately (0 ms)
 * 2. Background syncs with backend if online
 */
export async function syncList(listId) {
  const localItems = await getLocalListItems(listId);
  
  if (isOnline.value) {
    // Run sync in background
    processSyncQueue().then(() => {
      // Also fetch delta if no mutations were queued
      fetchServerListDelta(listId);
    }).catch(err => console.warn('Background sync error:', err));
  }

  return localItems;
}

/**
 * Pull latest items from server for a list.
 */
async function fetchServerListDelta(listId) {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const lastSync = localStorage.getItem(`last_synced_${listId}`);
    const response = await fetch(apiUrl(`/api/lists/${listId}/sync`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        last_synced_at: lastSync,
        mutations: []
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (Array.isArray(result.items)) {
        await db.transaction('rw', db.items, async () => {
          if (Array.isArray(result.deleted_item_ids) && result.deleted_item_ids.length > 0) {
            await db.items.bulkDelete(result.deleted_item_ids);
          }
          for (const item of result.items) {
            await db.items.put({
              id: item.id,
              list_id: listId,
              name: item.name,
              category: item.category || 'Sonstiges',
              quantity: item.quantity || 1,
              unit: item.unit || 'Stk',
              note: item.note || '',
              status: item.status || 'active',
              tags: item.tags || '',
              scanned_barcode: item.scanned_barcode || null,
              updated_at: item.updated_at || result.server_time,
              is_deleted: false
            });
          }
        });
      }
      if (result.server_time) {
        localStorage.setItem(`last_synced_${listId}`, result.server_time);
      }
      notifyWidgetSyncHooks();
    }
  } catch (e) {
    // Silent fail if network drops
  }
}

function updateCachedListsItems(listId, nextItems) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem('cachedLists');
    if (!raw) return;
    const lists = JSON.parse(raw);
    if (!Array.isArray(lists)) return;
    const idx = lists.findIndex(l => l.id === listId);
    if (idx !== -1) {
      lists[idx].items = nextItems;
      localStorage.setItem('cachedLists', JSON.stringify(lists));
    }
  } catch {}
}

/**
 * Offline-first transfer of 1 or more items between sourceListId and targetListId.
 * Returns { updatedSourceItems, updatedTargetItems, movedRecords, skippedIds }.
 */
export async function transferItemsOfflineFirst({
  sourceListId,
  targetListId,
  sourceItems,
  itemIdsToMove,
  targetStatus = 'active'
}) {
  const currentSource = Array.isArray(sourceItems) ? sourceItems : await getLocalListItems(sourceListId);
  const currentTarget = await getLocalListItems(targetListId);

  const transferResult = applyTransferOptimistically({
    sourceListId,
    targetListId,
    sourceItems: currentSource,
    targetItems: currentTarget,
    itemIdsToMove,
    targetStatus
  });

  if (transferResult.movedRecords.length === 0) {
    return transferResult;
  }

  // Persist optimistic local DB updates for both lists immediately
  try {
    const movedIdsSet = new Set(transferResult.movedRecords.map(r => r.sourceItem.id));
    await db.transaction('rw', db.items, async () => {
      for (const id of movedIdsSet) {
        await db.items.delete(id);
      }
      for (const rec of transferResult.movedRecords) {
        if (rec.createdItemId) {
          const createdItem = transferResult.updatedTargetItems.find(it => it.id === rec.createdItemId);
          if (createdItem) await db.items.put(createdItem);
        } else if (rec.mergedTargetId) {
          const mergedItem = transferResult.updatedTargetItems.find(it => it.id === rec.mergedTargetId);
          if (mergedItem) await db.items.put(mergedItem);
        }
      }
    });
  } catch (e) {
    console.warn('Local Dexie transfer update failed:', e);
  }

  updateCachedListsItems(sourceListId, transferResult.updatedSourceItems);
  updateCachedListsItems(targetListId, transferResult.updatedTargetItems);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  let syncedOnline = false;

  if (isOnline.value && token) {
    try {
      const pendingForLists = await db.syncQueue
        .filter(m => m.list_id === sourceListId || m.list_id === targetListId)
        .count();
      if (pendingForLists === 0) {
        const res = await fetch(apiUrl('/api/items/transfer'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            source_list_id: sourceListId,
            target_list_id: targetListId,
            item_ids: transferResult.movedRecords.map(r => r.sourceItem.id),
            target_status: targetStatus
          })
        });
        if (res.ok) {
          syncedOnline = true;
          const serverData = await res.json();
          // Sync authoritative target items back to Dexie if server merged/created them
          if (Array.isArray(serverData.target_items) && serverData.target_items.length > 0) {
            await fetchServerListDelta(sourceListId);
            await fetchServerListDelta(targetListId);
          }
        }
      }
    } catch {
      syncedOnline = false;
    }
  }

  if (!syncedOnline) {
    // Queue per-list offline mutations so offline mode works 100% consistently
    const nowIso = new Date().toISOString();
    for (const rec of transferResult.movedRecords) {
      await db.syncQueue.add({
        list_id: sourceListId,
        item_id: rec.sourceItem.id,
        action: 'DELETE_ITEM',
        payload: {},
        timestamp: nowIso,
        status: 'pending'
      });
      if (rec.createdItemId) {
        const created = transferResult.updatedTargetItems.find(it => it.id === rec.createdItemId);
        if (created) {
          await db.syncQueue.add({
            list_id: targetListId,
            item_id: created.id,
            action: 'ADD_ITEM',
            payload: {
              id: created.id,
              name: created.name,
              category: created.category,
              quantity: created.quantity,
              unit: created.unit,
              note: created.note,
              tags: created.tags,
              status: created.status
            },
            timestamp: nowIso,
            status: 'pending'
          });
        }
      } else if (rec.mergedTargetId) {
        const merged = transferResult.updatedTargetItems.find(it => it.id === rec.mergedTargetId);
        if (merged) {
          await db.syncQueue.add({
            list_id: targetListId,
            item_id: merged.id,
            action: 'UPDATE_ITEM',
            payload: {
              quantity: merged.quantity,
              tags: merged.tags,
              note: merged.note,
              status: merged.status
            },
            timestamp: nowIso,
            status: 'pending'
          });
        }
      }
    }
    await updatePendingCount();
    if (isOnline.value) triggerSync(50);
  }

  notifyWidgetSyncHooks();
  return transferResult;
}
