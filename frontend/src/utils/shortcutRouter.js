const PENDING_SHORTCUT_KEY = 'ks_pending_shortcut';
export const LAST_LIST_ID_KEY = 'ks_last_list_id';

const VALID_ACTIONS = new Set(['add', 'scan', 'recipe', 'open_list']);

/**
 * Normalizes incoming shortcut input from URL query params, custom kaufsync:// URIs,
 * or native Capacitor appShortcutAction objects.
 */
export function parseShortcutIntent(input) {
  if (!input) return null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('kaufsync://')) {
      try {
        const fakeUrl = trimmed.replace('kaufsync://', 'https://kaufsync.local/');
        const parsed = new URL(fakeUrl);
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const actionParam = parsed.searchParams.get('action') || parsed.searchParams.get('shortcut');
        const listParam = parsed.searchParams.get('list_id') || parsed.searchParams.get('listId');

        if (pathParts[0] === 'list') {
          const pathListId = pathParts[1] || listParam || null;
          const act = VALID_ACTIONS.has(actionParam) ? actionParam : 'open_list';
          return { action: act, listId: pathListId };
        }
        if (VALID_ACTIONS.has(actionParam)) {
          return { action: actionParam, listId: listParam || null };
        }
      } catch {
        return null;
      }
      return null;
    }

    try {
      const urlObj = trimmed.startsWith('http')
        ? new URL(trimmed)
        : new URL(trimmed, 'https://kaufsync.local');
      const action = urlObj.searchParams.get('shortcut') || urlObj.searchParams.get('action');
      const listId = urlObj.searchParams.get('list_id') || urlObj.searchParams.get('listId');
      if (VALID_ACTIONS.has(action)) {
        return { action, listId: listId || null };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (typeof input === 'object') {
    const action = input.action || input.shortcut;
    const listId = input.listId || input.list_id || null;
    if (VALID_ACTIONS.has(action)) {
      return { action, listId: listId ? String(listId) : null };
    }
  }
  return null;
}

export function savePendingShortcut(intent) {
  if (!intent || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PENDING_SHORTCUT_KEY, JSON.stringify({
      action: intent.action,
      listId: intent.listId || null,
      createdAt: Date.now()
    }));
  } catch {}
}

export function peekPendingShortcut() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_SHORTCUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && VALID_ACTIONS.has(parsed.action)) {
      return { action: parsed.action, listId: parsed.listId || null };
    }
  } catch {}
  return null;
}

export function consumePendingShortcut() {
  const pending = peekPendingShortcut();
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(PENDING_SHORTCUT_KEY); } catch {}
  }
  return pending;
}

export function getLastOpenedListId() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_LIST_ID_KEY) || null;
  } catch {
    return null;
  }
}

export function setLastOpenedListId(listId) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (listId) localStorage.setItem(LAST_LIST_ID_KEY, String(listId));
    else localStorage.removeItem(LAST_LIST_ID_KEY);
  } catch {}
}

/**
 * Resolves a shortcut intent into a vue-router navigation location.
 */
export function resolveShortcutRoute({ action, listId = null, lists = [], lastListId = null }) {
  const listArray = Array.isArray(lists) ? lists : [];
  const hasList = (id) => Boolean(id && listArray.some(l => l.id === id));

  let targetListId = null;
  if (hasList(listId)) {
    targetListId = listId;
  } else if (hasList(lastListId)) {
    targetListId = lastListId;
  } else if (listArray.length > 0) {
    targetListId = listArray[0].id;
  }

  if (action === 'add' || action === 'scan') {
    if (targetListId) {
      return { path: `/list/${targetListId}`, query: { shortcut: action } };
    }
    return {
      path: '/',
      query: {
        shortcutNotice: action === 'scan'
          ? 'Erstelle zuerst eine Einkaufsliste, um einen Barcode hinzuzufügen.'
          : 'Erstelle zuerst eine Einkaufsliste, um Artikel hinzuzufügen.'
      }
    };
  }

  if (action === 'recipe') {
    if (hasList(listId)) {
      return { path: `/list/${listId}`, query: { shortcut: 'recipe' } };
    }
    return { path: '/', query: { shortcut: 'recipe' } };
  }

  if (action === 'open_list') {
    if (targetListId) {
      return { path: `/list/${targetListId}` };
    }
    return { path: '/' };
  }

  return { path: '/' };
}
