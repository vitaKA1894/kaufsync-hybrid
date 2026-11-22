/**
 * Helper to manage locally remembered custom note pills per shopping list and article.
 * Stored strictly on device in localStorage (never written to global taxonomy).
 */

const STORAGE_PREFIX = 'ks_notes_';

/**
 * Normalizes article key: canonical taxonomy name/id or lowercase trimmed name.
 */
export function getArticleKey(itemOrName) {
  if (!itemOrName) return '';
  const name = typeof itemOrName === 'string' ? itemOrName : (itemOrName.name || '');
  return name.trim().toLowerCase();
}

function getStorageKey(listId) {
  return `${STORAGE_PREFIX}${listId || 'default'}`;
}

function loadMapForList(listId) {
  try {
    const raw = localStorage.getItem(getStorageKey(listId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveMapForList(listId, map) {
  try {
    localStorage.setItem(getStorageKey(listId), JSON.stringify(map));
  } catch (e) {
    console.warn('Failed to save article note history:', e);
  }
}

/**
 * Returns remembered custom note pills for a specific article in a specific list.
 * Ordered by most recently used.
 */
export function getRememberedNotes(listId, itemOrName) {
  const key = getArticleKey(itemOrName);
  if (!key) return [];
  const map = loadMapForList(listId);
  const list = map[key];
  return Array.isArray(list) ? list : [];
}

/**
 * Saves a new or used custom note pill for a specific article in a specific list.
 * Ensures uniqueness (case-insensitive) and moves to the front.
 */
export function saveCustomNote(listId, itemOrName, noteText) {
  const key = getArticleKey(itemOrName);
  const cleanNote = (noteText || '').trim();
  if (!key || !cleanNote) return null;

  // Max length safeguard
  const trimmed = cleanNote.slice(0, 45).trim();
  if (!trimmed) return null;

  const map = loadMapForList(listId);
  const existing = Array.isArray(map[key]) ? map[key] : [];

  // Filter out existing occurrence (case-insensitive)
  const filtered = existing.filter(n => n.toLowerCase() !== trimmed.toLowerCase());
  // Prepend as most recently used
  filtered.unshift(trimmed);

  // Cap at 20 remembered custom pills per article
  map[key] = filtered.slice(0, 20);
  saveMapForList(listId, map);
  return trimmed;
}

/**
 * Permanently removes a custom note pill from a specific article's suggestions in a list.
 */
export function removeCustomNote(listId, itemOrName, noteText) {
  const key = getArticleKey(itemOrName);
  const cleanNote = (noteText || '').trim();
  if (!key || !cleanNote) return;

  const map = loadMapForList(listId);
  if (!Array.isArray(map[key])) return;

  map[key] = map[key].filter(n => n.toLowerCase() !== cleanNote.toLowerCase());
  saveMapForList(listId, map);
}

/**
 * Deletes all note histories for a specific shopping list (e.g. on list deletion).
 */
export function clearListNoteHistory(listId) {
  if (!listId) return;
  try {
    localStorage.removeItem(getStorageKey(listId));
  } catch (e) {}
}

/**
 * Purges all custom note histories across all lists (e.g. on account deletion).
 */
export function clearAllNoteHistories() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch (e) {}
}
