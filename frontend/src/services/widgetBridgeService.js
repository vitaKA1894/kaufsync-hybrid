import { Capacitor, registerPlugin } from '@capacitor/core';
import { getApiBaseUrl } from '../config/api.js';
import { db } from '../db/index.js';
import { getLocalLists, queueMutation, registerWidgetSyncHook, processSyncQueue, isOnline } from './syncService.js';
import { recordPurchase } from './consumptionService.js';
import { buildWidgetSnapshot, reconcilePendingWidgetCheckoffs } from '../utils/widgetSnapshot.js';
import { getLastOpenedListId } from '../utils/shortcutRouter.js';

const KaufSyncBridge = registerPlugin('KaufSyncBridge');

let syncTimer = null;

function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Reconciles any check-offs performed directly on the Android homescreen widget
 * into Dexie, PurchaseEvents, and the standard syncQueue.
 */
export async function reconcileNativeWidgetCheckoffs() {
  if (!isNativeAndroid()) return 0;

  try {
    const res = await KaufSyncBridge.drainPendingCheckoffs();
    const ops = res?.opsJson ? JSON.parse(res.opsJson) : (res?.ops || []);
    if (!Array.isArray(ops) || ops.length === 0) return 0;

    const lists = await getLocalLists();
    const itemsByList = {};
    for (const l of lists) {
      const dbItems = await db.items.where('list_id').equals(l.id).toArray();
      itemsByList[l.id] = dbItems.length > 0 ? dbItems : (l.items || []);
    }

    const { toApply, ackedOpIds } = reconcilePendingWidgetCheckoffs(ops, itemsByList);
    for (const entry of toApply) {
      await queueMutation({
        listId: entry.listId,
        itemId: entry.item.id,
        action: 'TOGGLE_STATUS',
        payload: { status: 'completed' }
      });
      recordPurchase(entry.listId, entry.item);
    }

    if (ackedOpIds.length > 0) {
      await KaufSyncBridge.ackPendingCheckoffs({ opIdsJson: JSON.stringify(ackedOpIds) });
    }
    if (toApply.length > 0 && isOnline.value) {
      processSyncQueue();
    }
    return toApply.length;
  } catch {
    return 0;
  }
}

/**
 * Builds and persists the current on-device snapshot for the Android homescreen widget.
 * Safe no-op on Web / iOS PWA.
 */
export async function syncSnapshotToNativeWidget() {
  if (!isNativeAndroid()) return;

  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const isLoggedIn = Boolean(token && token !== 'undefined');
    if (!isLoggedIn) {
      await clearNativeWidgetOnLogout();
      return;
    }

    let lists = await getLocalLists();
    if ((!lists || lists.length === 0) && typeof localStorage !== 'undefined') {
      try {
        const cached = JSON.parse(localStorage.getItem('cachedLists') || '[]');
        if (Array.isArray(cached)) lists = cached;
      } catch {}
    }

    const itemsByListId = {};
    const customCategoryOrders = {};
    for (const list of (lists || [])) {
      const dbItems = await db.items.where('list_id').equals(list.id).toArray();
      itemsByListId[list.id] = dbItems.length > 0 ? dbItems : (list.items || []);
      try {
        const rawOrder = localStorage.getItem(`ks_sort_${list.id}`);
        if (rawOrder) {
          customCategoryOrders[list.id] = JSON.parse(rawOrder);
        }
      } catch {}
    }

    // Check any un-acked native checkoffs so we never re-surface just-tapped items
    const pendingIds = new Set();
    try {
      const drainRes = await KaufSyncBridge.drainPendingCheckoffs();
      const ops = drainRes?.opsJson ? JSON.parse(drainRes.opsJson) : [];
      for (const op of ops) {
        if (op?.item_id) pendingIds.add(`${op.list_id}:${op.item_id}`);
      }
    } catch {}

    const snapshot = buildWidgetSnapshot({
      isAuthenticated: true,
      authToken: token,
      apiBaseUrl: getApiBaseUrl(),
      lists,
      itemsByListId,
      customCategoryOrders,
      selectedListId: getLastOpenedListId(),
      pendingCheckoffItemIds: pendingIds
    });

    await KaufSyncBridge.updateWidgetSnapshot({ snapshotJson: JSON.stringify(snapshot) });
  } catch (e) {
    console.warn('Widget snapshot sync skipped:', e);
  }
}

export function scheduleWidgetSnapshotSync(delay = 150) {
  if (!isNativeAndroid()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncSnapshotToNativeWidget();
  }, delay);
}

export async function clearNativeWidgetOnLogout() {
  if (!isNativeAndroid()) return;
  try {
    await KaufSyncBridge.clearWidgetData();
  } catch {}
}

export async function consumeNativePendingShortcut() {
  if (!isNativeAndroid()) return null;
  try {
    const res = await KaufSyncBridge.consumePendingShortcut();
    if (res?.shortcutJson) {
      return JSON.parse(res.shortcutJson);
    }
  } catch {}
  return null;
}

// Automatically trigger widget snapshot sync whenever Dexie/syncService updates lists or items
registerWidgetSyncHook(() => {
  scheduleWidgetSnapshotSync(150);
});
