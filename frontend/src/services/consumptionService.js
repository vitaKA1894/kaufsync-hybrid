import { apiUrl } from '../config/api.js';
import { isOnline } from './syncService.js';
import {
  getCanonicalArticle,
  toDateString,
  computeSnoozeDays,
  computeDueSuggestions
} from '../utils/consumptionCycles.js';

const PREF_KEY = 'ks_show_restock_suggestions';

/**
 * Checks whether the user has restock suggestions enabled in settings.
 * Defaults to true.
 */
export function isRestockSuggestionsEnabled() {
  if (typeof localStorage === 'undefined') return true;
  const val = localStorage.getItem(PREF_KEY);
  return val === null ? true : val !== 'false';
}

/**
 * Persists the user's restock suggestions preference in localStorage.
 */
export function setRestockSuggestionsEnabled(enabled) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PREF_KEY, String(!!enabled));
}

/**
 * Gets cached purchase events for a list.
 */
export function getLocalPurchases(listId) {
  if (!listId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`ks_purchases_${listId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Error reading local purchases for list', listId, e);
    return [];
  }
}

/**
 * Saves purchase events for a list to localStorage.
 */
export function saveLocalPurchases(listId, purchases) {
  if (!listId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`ks_purchases_${listId}`, JSON.stringify(purchases || []));
  } catch (e) {
    console.warn('Error saving local purchases for list', listId, e);
  }
}

/**
 * Gets cached suggestion snoozes for a list.
 */
export function getLocalSnoozes(listId) {
  if (!listId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`ks_snoozes_${listId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Saves suggestion snoozes for a list to localStorage.
 */
export function saveLocalSnoozes(listId, snoozes) {
  if (!listId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`ks_snoozes_${listId}`, JSON.stringify(snoozes || []));
  } catch (e) {
    console.warn('Error saving local snoozes for list', listId, e);
  }
}

/**
 * Clears all consumption and snooze data for a specific list.
 * Called when a shopping list is deleted.
 */
export function clearListConsumptionData(listId) {
  if (!listId || typeof localStorage === 'undefined') return;
  localStorage.removeItem(`ks_purchases_${listId}`);
  localStorage.removeItem(`ks_snoozes_${listId}`);
}

/**
 * Records a check-off event as a PurchaseEvent for the list.
 * Idempotent per (listId, articleKey, today).
 * Clears any active snooze for that article.
 */
export function recordPurchase(listId, item) {
  if (!listId || !item || !item.name) return;

  const canon = getCanonicalArticle(item.name, item.category);
  const today = toDateString(new Date());

  const purchases = getLocalPurchases(listId);

  // Check if same article already has a purchase recorded on this date
  const existsToday = purchases.some(
    p => p.article_key === canon.articleKey && p.purchased_date === today
  );

  if (!existsToday) {
    const newEvent = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pe-${Date.now()}-${Math.random()}`,
      list_id: listId,
      article_key: canon.articleKey,
      display_name: canon.displayName || item.name,
      category: canon.category || item.category || 'Sonstiges',
      icon: canon.icon || null,
      purchased_date: today,
      source_item_id: item.id || null,
      created_at: new Date().toISOString()
    };
    purchases.push(newEvent);
    saveLocalPurchases(listId, purchases);
  }

  // Clear any existing snooze for this article on this list
  const snoozes = getLocalSnoozes(listId);
  const filteredSnoozes = snoozes.filter(s => s.article_key !== canon.articleKey);
  if (filteredSnoozes.length !== snoozes.length) {
    saveLocalSnoozes(listId, filteredSnoozes);
  }
}

/**
 * Retracts a purchase event created by a specific item ID today.
 * Called when Smart Undo restores an accidentally checked-off item.
 */
export function retractPurchase(listId, itemId) {
  if (!listId || !itemId) return;
  const today = toDateString(new Date());
  const purchases = getLocalPurchases(listId);

  const updated = purchases.filter(
    p => !(p.source_item_id === itemId && p.purchased_date === today)
  );

  if (updated.length !== purchases.length) {
    saveLocalPurchases(listId, updated);
  }
}

/**
 * Snoozes a suggestion for max(round(median_cycle_days * 0.5), 3 days).
 */
export async function snoozeSuggestion(listId, articleKey, medianCycleDays) {
  if (!listId || !articleKey) return;
  const snoozeDays = computeSnoozeDays(medianCycleDays);
  const snoozedUntil = new Date(Date.now() + snoozeDays * 86400000).toISOString();

  const snoozes = getLocalSnoozes(listId).filter(s => s.article_key !== articleKey);
  snoozes.push({
    list_id: listId,
    article_key: articleKey,
    snoozed_until: snoozedUntil,
    created_at: new Date().toISOString()
  });
  saveLocalSnoozes(listId, snoozes);

  // Sync to backend if online
  if (isOnline.value) {
    try {
      const token = localStorage.getItem('token');
      await fetch(apiUrl(`/api/lists/${listId}/suggestions/snooze`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          article_key: articleKey,
          days: snoozeDays
        })
      });
    } catch (e) {
      console.warn('Failed to sync snooze to server (cached locally):', e);
    }
  }
}

/**
 * Evaluates and returns due suggestions for the active list.
 */
export function getDueSuggestions(listId, activeItems = [], limit = 10) {
  if (!isRestockSuggestionsEnabled() || !listId) {
    return [];
  }

  const purchases = getLocalPurchases(listId);
  const snoozes = getLocalSnoozes(listId);

  return computeDueSuggestions({
    purchaseEvents: purchases,
    snoozes,
    activeItems,
    today: new Date(),
    limit
  });
}

/**
 * Backfills purchase events from changelog cache or server, ensuring
 * existing users with check-off history immediately receive suggestions.
 */
export function backfillFromChangelog(listId) {
  if (!listId || typeof localStorage === 'undefined') return;
  try {
    const cachedChangelog = localStorage.getItem(`cached_changelog_${listId}`);
    if (!cachedChangelog) return;
    const logs = JSON.parse(cachedChangelog);
    if (!Array.isArray(logs)) return;

    const completedLogs = logs.filter(l => l.action_type === 'completed' && l.item_name);
    if (completedLogs.length === 0) return;

    const purchases = getLocalPurchases(listId);
    const existingDatesByArticle = new Set();
    purchases.forEach(p => {
      existingDatesByArticle.add(`${p.article_key}|${p.purchased_date}`);
    });

    let addedAny = false;
    for (const log of completedLogs) {
      const canon = getCanonicalArticle(log.item_name);
      const dateStr = toDateString(log.created_at);
      if (!canon.articleKey || !dateStr) continue;

      const key = `${canon.articleKey}|${dateStr}`;
      if (!existingDatesByArticle.has(key)) {
        purchases.push({
          id: `bf-${log.id || Date.now()}-${Math.random()}`,
          list_id: listId,
          article_key: canon.articleKey,
          display_name: canon.displayName,
          category: canon.category,
          icon: canon.icon,
          purchased_date: dateStr,
          source_item_id: null,
          created_at: log.created_at || new Date().toISOString()
        });
        existingDatesByArticle.add(key);
        addedAny = true;
      }
    }

    if (addedAny) {
      saveLocalPurchases(listId, purchases);
    }
  } catch (e) {
    console.warn('Error backfilling purchases from changelog:', e);
  }
}

/**
 * Synchronizes purchases from backend when online.
 */
export async function syncPurchases(listId) {
  if (!listId || !isOnline.value) {
    backfillFromChangelog(listId);
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/lists/${listId}/purchases`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const serverPurchases = await response.json();
      if (Array.isArray(serverPurchases)) {
        // Merge server purchases with any local-only purchases
        const localPurchases = getLocalPurchases(listId);
        const map = new Map();
        serverPurchases.forEach(p => map.set(`${p.article_key}|${p.purchased_date}`, p));
        localPurchases.forEach(p => {
          const k = `${p.article_key}|${p.purchased_date}`;
          if (!map.has(k)) map.set(k, p);
        });
        saveLocalPurchases(listId, Array.from(map.values()));
      }
    }
  } catch (e) {
    console.warn('Could not sync purchases from server, using local data:', e);
  }

  backfillFromChangelog(listId);
}
