import { isItemVisibleActive, toWidgetStatus } from './itemTransfer.js';
import { findTaxonomyItem } from './search.js';

const CATEGORY_COLORS = {
  'Obst & Gemüse': '#86efac',
  'Brot & Backwaren': '#fef08a',
  'Fleisch & Fisch': '#fca5a5',
  'Milchprodukte & Tiefkühlkost': '#93c5fd',
  'Vorratskammer': '#fdba74',
  'Getränke & Genussmittel': '#a5b4fc',
  'Drogerie, Haushalt & Tierbedarf': '#5eead4',
  'Sonstiges': '#d8b4fe'
};

const DEFAULT_ORDER = [
  'Obst & Gemüse',
  'Brot & Backwaren',
  'Fleisch & Fisch',
  'Milchprodukte & Tiefkühlkost',
  'Vorratskammer',
  'Getränke & Genussmittel',
  'Drogerie, Haushalt & Tierbedarf',
  'Sonstiges'
];

const DRUGSTORE_ORDER = [
  'Drogerie, Haushalt & Tierbedarf',
  'Sonstiges',
  'Getränke & Genussmittel',
  'Vorratskammer',
  'Milchprodukte & Tiefkühlkost',
  'Brot & Backwaren',
  'Obst & Gemüse',
  'Fleisch & Fisch'
];

export function inferStoreKey(listName) {
  const lower = String(listName || '').toLowerCase();
  const known = ['aldi', 'dm', 'edeka', 'kaufland', 'lidl', 'metro', 'müller', 'mueller', 'netto', 'penny', 'rewe', 'rossmann', 'selgros'];
  for (const k of known) {
    if (lower.includes(k)) return k === 'müller' ? 'mueller' : k;
  }
  return 'generic';
}

export function getDefaultCategoryOrderForList(listName, customOrder = null) {
  if (Array.isArray(customOrder) && customOrder.length > 0) return customOrder;
  const key = inferStoreKey(listName);
  if (key === 'dm' || key === 'rossmann') return [...DRUGSTORE_ORDER];
  return [...DEFAULT_ORDER];
}

function mapLegacyCategory(catName) {
  if (catName === 'Milch & Tiefkühl') return 'Milchprodukte & Tiefkühlkost';
  if (catName === 'Getränke') return 'Getränke & Genussmittel';
  if (catName === 'Drogerie & Haushalt') return 'Drogerie, Haushalt & Tierbedarf';
  return catName || 'Sonstiges';
}

function parseItemTags(rawTags) {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) return rawTags;
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(rawTags).split(',').map(s => s.trim()).filter(Boolean);
  }
}

export function sortItemsByAisleOrder(items = [], categoryOrder = DEFAULT_ORDER) {
  const storageOrder = { ambient: 0, chilled: 1, frozen: 2 };
  const active = (items || []).filter(it => it && !it.is_deleted && isItemVisibleActive(it));

  return [...active].sort((a, b) => {
    const catA = mapLegacyCategory(a.category);
    const catB = mapLegacyCategory(b.category);
    let idxA = categoryOrder.indexOf(catA);
    let idxB = categoryOrder.indexOf(catB);
    if (idxA === -1) idxA = 999;
    if (idxB === -1) idxB = 999;
    if (idxA !== idxB) return idxA - idxB;

    const taxA = findTaxonomyItem(a.name);
    const taxB = findTaxonomyItem(b.name);
    const storA = storageOrder[taxA?.storage] ?? 0;
    const storB = storageOrder[taxB?.storage] ?? 0;
    if (storA !== storB) return storA - storB;

    const subA = taxA?.subcategory || '';
    const subB = taxB?.subcategory || '';
    if (subA && subB && subA !== subB) {
      return subA.localeCompare(subB, 'de');
    }

    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.name || '').localeCompare(String(b.name || ''), 'de');
  });
}

/**
 * Builds the shared on-device JSON snapshot consumed by the native Android homescreen widget.
 */
export function buildWidgetSnapshot({
  isAuthenticated = false,
  authToken = '',
  apiBaseUrl = '',
  lists = [],
  itemsByListId = {},
  customCategoryOrders = {},
  selectedListId = null,
  pendingCheckoffItemIds = new Set()
}) {
  if (!isAuthenticated) {
    return {
      is_authenticated: false,
      auth_token: '',
      api_base_url: apiBaseUrl || '',
      selected_list_id: null,
      lists_summary: [],
      items_by_list: {},
      last_updated_at: new Date().toISOString()
    };
  }

  const pendingSet = pendingCheckoffItemIds instanceof Set
    ? pendingCheckoffItemIds
    : new Set(pendingCheckoffItemIds || []);

  const listsSummary = [];
  const serializedItemsByList = {};

  for (const list of (lists || [])) {
    if (!list || !list.id) continue;
    const rawItems = itemsByListId[list.id] || list.items || [];
    const order = getDefaultCategoryOrderForList(list.name, customCategoryOrders[list.id]);
    const sorted = sortItemsByAisleOrder(rawItems, order)
      .filter(it => !pendingSet.has(`${list.id}:${it.id}`) && !pendingSet.has(it.id));

    const widgetItems = sorted.map(it => {
      const cat = mapLegacyCategory(it.category);
      const tags = parseItemTags(it.tags);
      const isUrgent = tags.some(t => String(t).toLowerCase() === 'dringend');
      return {
        id: it.id,
        name: it.name,
        quantity: Number(it.quantity) || 1,
        unit: it.unit || 'Stk',
        category: cat,
        category_color: CATEGORY_COLORS[cat] || '#d8b4fe',
        status: toWidgetStatus(it.status),
        is_urgent: isUrgent
      };
    });

    listsSummary.push({
      id: list.id,
      name: list.name,
      store_key: inferStoreKey(list.name),
      open_count: widgetItems.length
    });
    serializedItemsByList[list.id] = widgetItems;
  }

  const effectiveSelected = listsSummary.some(l => l.id === selectedListId)
    ? selectedListId
    : (listsSummary[0]?.id || null);

  return {
    is_authenticated: true,
    auth_token: authToken || '',
    api_base_url: apiBaseUrl || '',
    selected_list_id: effectiveSelected,
    lists_summary: listsSummary,
    items_by_list: serializedItemsByList,
    last_updated_at: new Date().toISOString()
  };
}

/**
 * Deduplicates and applies pending check-offs triggered from the native widget
 * idempotently against local items. Returns ops to record + mark acknowledged.
 */
export function reconcilePendingWidgetCheckoffs(pendingOps = [], currentItemsByList = {}) {
  const seenKey = new Set();
  const toApply = [];
  const ackedOpIds = [];

  for (const op of (pendingOps || [])) {
    if (!op || !op.op_id) continue;
    ackedOpIds.push(op.op_id);
    if (!op.list_id || !op.item_id) continue;

    const dedupeKey = `${op.list_id}:${op.item_id}`;
    if (seenKey.has(dedupeKey)) continue;
    seenKey.add(dedupeKey);

    const listItems = currentItemsByList[op.list_id] || [];
    const matched = listItems.find(it => it.id === op.item_id);
    if (matched && !matched.is_deleted && matched.status !== 'completed' && matched.status !== 'checked') {
      toApply.push({
        opId: op.op_id,
        listId: op.list_id,
        item: matched,
        checkedAt: op.checked_at || new Date().toISOString()
      });
    }
  }

  return { toApply, ackedOpIds };
}
