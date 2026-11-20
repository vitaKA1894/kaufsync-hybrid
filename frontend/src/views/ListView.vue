<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiUrl, wsUrl } from '../config/api';
import CategoryIcon from '../components/CategoryIcon.vue';
import AddItemModal from '../components/AddItemModal.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import RecipeImportModal from '../components/RecipeImportModal.vue';
import Sortable from 'sortablejs';
import QrcodeVue from 'qrcode.vue';
import { useBottomSheetDrag } from '../utils/useBottomSheetDrag';
import SyncStatusBadge from '../components/SyncStatusBadge.vue';
import { App as CapApp } from '@capacitor/app';
import {
  isWakeLockSupported,
  requestScreenWakeLock,
  releaseScreenWakeLock,
  isScreenWakeLockActive
} from '../utils/wakeLockService';
import {
  isOnline,
  syncStatus,
  pendingCount,
  getLocalListItems,
  saveLocalLists,
  queueMutation,
  processSyncQueue,
  triggerSync
} from '../services/syncService';
import { db } from '../db/index';

const route = useRoute();
const router = useRouter();
const listId = route.params.id;

// Synchrone Vor-Initialisierung aus localStorage für 0-ms Render ohne Layout-Shift
const initCachedList = () => {
  try {
    const cachedData = localStorage.getItem('cachedLists');
    if (cachedData) {
      const lists = JSON.parse(cachedData);
      const found = lists.find(l => l.id === listId);
      if (found) return found;
    }
  } catch (e) {}
  return null;
};

const cachedListInitial = initCachedList();
const currentList = ref(cachedListInitial);
const items = ref(cachedListInitial?.items ? [...cachedListInitial.items] : []);
const isInitialLoad = ref(true);

// Synchronisiere Items laufend in cachedLists, damit das Dashboard beim Zurückgehen sofort die exakte Anzahl hat
watch(items, (newItems) => {
  if (!newItems) return;
  try {
    const cachedData = localStorage.getItem('cachedLists');
    if (cachedData) {
      const lists = JSON.parse(cachedData);
      const target = lists.find(l => l.id === listId);
      if (target) {
        target.items = newItems;
        localStorage.setItem('cachedLists', JSON.stringify(lists));
      }
    }
  } catch (e) {}
}, { deep: true });

const newItemName = ref('');
const isAddModalOpen = ref(false);
const startScanner = ref(false);
const isRecipeModalOpen = ref(false);
const recipeInitialUrl = ref('');
const itemToEdit = ref(null);
const errorMessage = ref('');
const showConfirmModal = ref(false);
const confirmMessage = ref('');
const confirmAction = ref(null);
const successMessage = ref('');
const infoToastMessage = ref('');
const isKeepAwakeSupported = ref(isWakeLockSupported());
const keepAwakeEnabled = ref(false); // User intent
const keepAwakeActive = ref(false);  // Actual system lock
const isShoppingSessionActive = ref(false);

const activeMetaFilter = ref('all'); // 'all', 'urgent', 'offer', 'optional'
const filterNotice = ref(null);
let filterNoticeTimer = null;

const showShareSheet = ref(false);
const showSortSheet = ref(false);
const showChangelogSheet = ref(false);
const showSettingsSheet = ref(false);

// Bottom Sheet Drag Handlers
const settingsDrag = useBottomSheetDrag(() => { showSettingsSheet.value = false; });
const shareDrag = useBottomSheetDrag(() => { showShareSheet.value = false; });
const changelogDrag = useBottomSheetDrag(() => { showChangelogSheet.value = false; });
const sortDrag = useBottomSheetDrag(() => { showSortSheet.value = false; });
const sortListRef = ref(null);
let sortableInstance = null;

const searchQuery = ref('');
const searchResults = ref([]);
const isSearching = ref(false);

const changelog = ref([]);
const changelogFilter = ref('all'); // 'all', 'added', 'completed'

let ws = null;
let wsReconnectTimer = null;
let isViewUnmounted = false;

const isCompactView = ref(localStorage.getItem('ks_compact_view') === 'true');
const toggleCompactView = () => {
  isCompactView.value = !isCompactView.value;
  localStorage.setItem('ks_compact_view', isCompactView.value);
};

const formatCategoryName = (name) => {
  if (!name) return '';
  return name;
};

// --- LONG PRESS GESTURE ---
let pressTimer = null;
let longPressTriggered = false;

const startPress = (item, event) => {
  if (event.type === 'mousedown' && event.button !== 0) return; // Only left click
  longPressTriggered = false;
  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    itemToEdit.value = item;
    startScanner.value = false;
    isAddModalOpen.value = true;
  }, 500); // 500ms for long press
};

const openAddModal = () => {
    startScanner.value = false;
    isAddModalOpen.value = true;
};

const openScannerModal = () => {
    startScanner.value = true;
    isAddModalOpen.value = true;
};

const openRecipeModal = (url = '') => {
    recipeInitialUrl.value = url;
    isRecipeModalOpen.value = true;
};

const handleRecipeImported = ({ count, title }) => {
    successMessage.value = `${count} Zutaten aus '${title}' hinzugefügt!`;
    setTimeout(() => { successMessage.value = ''; }, 3500);
    loadItems();
};

const cancelPress = () => {
  if (pressTimer !== null) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
};

// --- KATEGORIE DEFINITIONEN ---
const predefinedCategories = [
  { name: 'Obst & Gemüse', color: '#86efac', bg: '#86efac' }, // Tailwind bg-green-300
  { name: 'Brot & Backwaren', color: '#fef08a', bg: '#fef08a' }, // Tailwind bg-yellow-200
  { name: 'Fleisch & Fisch', color: '#fca5a5', bg: '#fca5a5' }, // Tailwind bg-rose-300
  { name: 'Milchprodukte & Tiefkühlkost', color: '#93c5fd', bg: '#93c5fd' }, // Tailwind bg-blue-300
  { name: 'Vorratskammer', color: '#fdba74', bg: '#fdba74' }, // Tailwind bg-orange-300
  { name: 'Getränke & Genussmittel', color: '#a5b4fc', bg: '#a5b4fc' }, // Tailwind bg-indigo-300
  { name: 'Drogerie, Haushalt & Tierbedarf', color: '#5eead4', bg: '#5eead4' }, // Tailwind bg-teal-300
  { name: 'Sonstiges', color: '#d8b4fe', bg: '#d8b4fe' } // Tailwind bg-fuchsia-300
];

const getTagStyle = (tag) => {
  const t = tag.toLowerCase();
  if (t === 'bio') return { bg: '#E8F5E9', color: '#2E7D32' };
  if (t === 'vegan') return { bg: '#F1F8E9', color: '#33691E' };
  if (t === 'angebot' || t === 'dringend') return { bg: '#FFEBEE', color: '#C62828' };
  if (t === 'regional') return { bg: '#FFF3E0', color: '#EF6C00' };
  if (t === "wenn's passt") return { bg: '#E3F2FD', color: '#1565C0' };
  return { bg: 'var(--ks-surface-4)', color: 'var(--ks-text-muted)' };
};

const formatQuantity = (item) => {
  if (!item.quantity) return '';
  const q = item.quantity;
  return (q % 1 === 0) ? q.toString() : q.toString();
};

const parseTags = (tagsStr) => {
  if (!tagsStr) return [];
  try {
    const res = typeof tagsStr === 'string' ? JSON.parse(tagsStr) : tagsStr;
    if (Array.isArray(res)) return res;
    if (typeof tagsStr === 'string') return tagsStr.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  } catch (e) {
    if (typeof tagsStr === 'string') return tagsStr.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }
};

const getRegularTags = (tagsStr) => {
  const tags = parseTags(tagsStr);
  return tags.filter(t => !['dringend', 'angebot', "wenn's passt"].includes(t.toLowerCase()));
};

const getUrgencyTags = (tagsStr) => {
  const tags = parseTags(tagsStr);
  return tags.filter(t => ['dringend', 'angebot', "wenn's passt"].includes(t.toLowerCase()));
};

const formatTags = (tagsStr) => {
  const regular = getRegularTags(tagsStr);
  if (regular.length === 0) return '';
  return regular.join(', ');
};

// --- META-TAG FILTER LOGIK ---
const getFilterLabel = (key) => {
  switch (key) {
    case 'urgent': return 'Dringend';
    case 'offer': return 'Angebot';
    case 'optional': return "Wenn's passt";
    default: return 'Alle';
  }
};

const itemUrgencyTags = (item) => {
  return getUrgencyTags(item.tags).map(t => t.toLowerCase());
};

const itemHasMetaTag = (item, filterKey) => {
  if (filterKey === 'all') return true;
  const uTags = itemUrgencyTags(item);
  if (filterKey === 'urgent') return uTags.includes('dringend');
  if (filterKey === 'offer') return uTags.includes('angebot');
  if (filterKey === 'optional') return uTags.includes("wenn's passt");
  return true;
};

const openActiveItems = computed(() => {
  return items.value.filter(i => i.status === 'active');
});

const totalOpenCount = computed(() => openActiveItems.value.length);

const metaTagCounts = computed(() => {
  const counts = { urgent: 0, offer: 0, optional: 0 };
  for (const item of openActiveItems.value) {
    const uTags = itemUrgencyTags(item);
    if (uTags.includes('dringend')) counts.urgent++;
    if (uTags.includes('angebot')) counts.offer++;
    if (uTags.includes("wenn's passt")) counts.optional++;
  }
  return counts;
});

const hasAnyMetaTags = computed(() => {
  return metaTagCounts.value.urgent > 0 || metaTagCounts.value.offer > 0 || metaTagCounts.value.optional > 0;
});

const filteredActiveItems = computed(() => {
  const active = openActiveItems.value;
  if (activeMetaFilter.value === 'all') {
    return active;
  }
  return active.filter(item => itemHasMetaTag(item, activeMetaFilter.value));
});

const setMetaFilter = (key) => {
  activeMetaFilter.value = key;
};

const toggleMetaFilter = (key) => {
  if (activeMetaFilter.value === key) {
    activeMetaFilter.value = 'all';
  } else {
    activeMetaFilter.value = key;
  }
};

const clearMetaFilter = () => {
  activeMetaFilter.value = 'all';
  filterNotice.value = null;
  if (filterNoticeTimer) {
    clearTimeout(filterNoticeTimer);
    filterNoticeTimer = null;
  }
};

// Automatischer Reset, wenn die gefilterten Artikel erledigt werden (Count -> 0)
watch(metaTagCounts, (newCounts) => {
  if (activeMetaFilter.value !== 'all') {
    const count = newCounts[activeMetaFilter.value] || 0;
    if (count === 0) {
      const label = getFilterLabel(activeMetaFilter.value);
      activeMetaFilter.value = 'all';
      successMessage.value = `Alle als „${label}“ markierten Artikel erledigt – alle Artikel werden angezeigt`;
      setTimeout(() => {
        if (successMessage.value && successMessage.value.includes('erledigt')) {
          successMessage.value = '';
        }
      }, 3800);
    }
  }
}, { deep: true });

// --- MARKT SPEZIFISCHE DEFAULTS (JSON-Konfiguration) ---
const chainsConfig = {
  aldi: { marketType: "discounter", defaultOrder: ["Obst & Gemüse", "Brot & Backwaren", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  lidl: { marketType: "discounter", defaultOrder: ["Obst & Gemüse", "Brot & Backwaren", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  netto: { marketType: "discounter", defaultOrder: ["Obst & Gemüse", "Brot & Backwaren", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  penny: { marketType: "discounter", defaultOrder: ["Obst & Gemüse", "Brot & Backwaren", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  rewe: { marketType: "supermarket", defaultOrder: ["Obst & Gemüse", "Brot & Backwaren", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  edeka: { marketType: "supermarket", defaultOrder: ["Obst & Gemüse", "Brot & Backwaren", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  kaufland: { marketType: "supermarket", defaultOrder: ["Obst & Gemüse", "Brot & Backwaren", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  dm: { 
    marketType: "drugstore", 
    defaultOrder: ["Drogerie, Haushalt & Tierbedarf", "Sonstiges", "Getränke & Genussmittel", "Milchprodukte & Tiefkühlkost", "Brot & Backwaren", "Obst & Gemüse", "Fleisch & Fisch"],
    categoryMeta: { "Obst & Gemüse": { deprioritized: true }, "Fleisch & Fisch": { deprioritized: true }, "Brot & Backwaren": { deprioritized: true }, "Milchprodukte & Tiefkühlkost": { deprioritized: true } }
  },
  rossmann: { 
    marketType: "drugstore", 
    defaultOrder: ["Drogerie, Haushalt & Tierbedarf", "Sonstiges", "Getränke & Genussmittel", "Milchprodukte & Tiefkühlkost", "Brot & Backwaren", "Obst & Gemüse", "Fleisch & Fisch"],
    categoryMeta: { "Obst & Gemüse": { deprioritized: true }, "Fleisch & Fisch": { deprioritized: true }, "Brot & Backwaren": { deprioritized: true }, "Milchprodukte & Tiefkühlkost": { deprioritized: true } }
  },
  metro: { marketType: "wholesale", defaultOrder: ["Obst & Gemüse", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Brot & Backwaren", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] },
  selgros: { marketType: "wholesale", defaultOrder: ["Obst & Gemüse", "Fleisch & Fisch", "Milchprodukte & Tiefkühlkost", "Brot & Backwaren", "Vorratskammer", "Getränke & Genussmittel", "Drogerie, Haushalt & Tierbedarf", "Sonstiges"] }
};

const selectedCategory = ref(predefinedCategories[7]); // Default: Sonstiges
const categoryOrder = ref([]); 
const isCustomOrder = ref(false); // Flag, um zu wissen ob der User überschrieben hat

// Ermittelt anhand des Listennamens die zugehörige Kette (z.B. "dm Einkauf" -> "dm")
const currentChainKey = computed(() => {
  if (!currentList.value) return null;
  const name = currentList.value.name.toLowerCase();
  return Object.keys(chainsConfig).find(key => name.includes(key)) || null;
});

// Lädt Sortierung: Prio 1 = User Override (LocalStorage), Prio 2 = Markt-Default, Prio 3 = Fallback
const loadCategoryOrder = () => {
  const saved = localStorage.getItem(`ks_sort_${listId}`);
  if (saved) {
    try {
      categoryOrder.value = JSON.parse(saved);
      isCustomOrder.value = true;
      return;
    } catch (e) {}
  }

  isCustomOrder.value = false;
  const chainKey = currentChainKey.value;
  if (chainKey && chainsConfig[chainKey]) {
    categoryOrder.value = [...chainsConfig[chainKey].defaultOrder];
  } else {
    categoryOrder.value = predefinedCategories.map(c => c.name);
  }
};

// Synchrone Initialisierung direkt beim Laden der Komponente
loadCategoryOrder();

const saveCategoryOrder = () => {
  localStorage.setItem(`ks_sort_${listId}`, JSON.stringify(categoryOrder.value));
  isCustomOrder.value = true;
};

const resetCategoryOrder = () => {
  localStorage.removeItem(`ks_sort_${listId}`);
  loadCategoryOrder();
  showSortSheet.value = false;
  successMessage.value = "Sortierung auf Markt-Standard zurückgesetzt.";
  setTimeout(() => successMessage.value = '', 3000);
};

watch(showSortSheet, async (newVal) => {
  if (newVal) {
    await nextTick();
    if (sortListRef.value && !sortableInstance) {
      sortableInstance = new Sortable(sortListRef.value, {
        handle: '.sort-item',
        animation: 150,
        onEnd: (evt) => {
          const itemEl = evt.item;
          const oldIndex = evt.oldIndex;
          const newIndex = evt.newIndex;

          const temp = categoryOrder.value[oldIndex];
          categoryOrder.value.splice(oldIndex, 1);
          categoryOrder.value.splice(newIndex, 0, temp);
          saveCategoryOrder();
        }
      });
    }
  } else {
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
  }
});


const updateOnlineStatus = () => {
  isOnline.value = navigator.onLine;
  if (isOnline.value) {
    processOfflineQueue();
    if (!ws || ws.readyState !== WebSocket.OPEN) setupWebSocket();
  }
};

const loadItems = async () => {
  // 1. Instant local-first render from Dexie (0 ms)
  try {
    const local = await getLocalListItems(listId);
    if (local && local.length > 0) {
      items.value = local;
    }
    const cachedData = localStorage.getItem('cachedLists');
    if (cachedData) {
      const lists = JSON.parse(cachedData);
      currentList.value = lists.find(l => l.id === listId) || currentList.value;
    }
  } catch (e) {
    console.warn('Local read error:', e);
  }

  // 2. Fetch fresh lists & items from API if online
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl('/api/lists'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('isLoggedIn');
      router.push('/login');
      return;
    }
    if (!response.ok) throw new Error('Fehler beim Laden');
    const lists = await response.json();

    localStorage.setItem('cachedLists', JSON.stringify(lists));
    await saveLocalLists(lists);

    currentList.value = lists.find(l => l.id === listId);
    if (currentList.value) items.value = currentList.value.items;
    
    // Also process any pending sync queue items
    processSyncQueue();
  } catch (error) {
    if (!items.value || items.value.length === 0) {
      errorMessage.value = "Offline: Konnte Liste nicht laden.";
    }
  } finally {
    // Wenn Liste geladen ist (egal ob API oder Cache), initialisiere die Sortierung
    loadCategoryOrder();
  }
};

const scheduleWebSocketReconnect = () => {
  if (isViewUnmounted || !isOnline.value || wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    setupWebSocket();
  }, 3500);
};

const setupWebSocket = () => {
  if (isViewUnmounted || !isOnline.value) return;
  const token = localStorage.getItem('token');
  if (!token) return;
  const tokenQuery = `?token=${encodeURIComponent(token)}`;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(wsUrl(`/ws/${listId}${tokenQuery}`));
    ws.onerror = (error) => console.warn("WebSocket Fehler", error);
    ws.onclose = () => {
      ws = null;
      scheduleWebSocketReconnect();
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === 'ITEM_UPDATED') {
        const incomingItem = data.payload.item;
        const index = items.value.findIndex(i => i.id === incomingItem.id);
        if (index !== -1) {
          // Re-assign the entire object to trigger reactivity reliably
          items.value[index] = { ...items.value[index], ...incomingItem };

          // Kategorie Fallback, falls via WS nicht gesendet
          if (incomingItem.category) items.value[index].category = incomingItem.category;
        } else {
          // If the item starts with "temp-", it's an optimistic addition
          const tempIndex = items.value.findIndex(i => i.id.startsWith('temp-') && i.name === incomingItem.name);
          if (tempIndex !== -1) {
              items.value[tempIndex] = incomingItem;
          } else {
              items.value.push(incomingItem);
          }
        }
      } else if (data.event === 'ITEM_DELETED') {
        items.value = items.value.filter(i => i.id !== data.payload.item_id);
      } else if (data.event === 'CHANGELOG_UPDATED') {
        if (showChangelogSheet.value) {
          loadChangelog();
        }
      } else if (data.event === 'MEMBER_JOINED' || data.event === 'LIST_UPDATED') {
        loadItems();
        if (showShareSheet.value) loadJoinRequests();
      } else if (data.event === 'JOIN_REQUEST_RECEIVED') {
        if (showShareSheet.value) loadJoinRequests();
      } else if (data.event === 'SHOPPING_STARTED') {
        const p = data.payload;
        if (p && p.user_id !== currentUser.value?.id) {
          successMessage.value = `🛒 ${p.user_name || 'Ein Mitglied'} geht jetzt für diese Liste einkaufen!`;
          setTimeout(() => { successMessage.value = ''; }, 4500);
        }
      } else if (data.event === 'SHOPPING_FINISHED') {
        const p = data.payload;
        if (p && p.user_id !== currentUser.value?.id) {
          infoToastMessage.value = `✅ ${p.user_name || 'Ein Mitglied'} hat den Einkauf beendet.`;
          setTimeout(() => { infoToastMessage.value = ''; }, 4500);
        }
      }
    };
  } catch (err) {
    console.warn("Konnte WebSocket nicht aufbauen:", err);
    scheduleWebSocketReconnect();
  }
};

const handleUpdateItem = async (updatedPayload) => {
  const index = items.value.findIndex(i => i.id === updatedPayload.id);
  if (index !== -1) {
    items.value[index] = { ...items.value[index], ...updatedPayload };
  }
  await queueMutation({
    listId,
    itemId: updatedPayload.id,
    action: 'UPDATE_ITEM',
    payload: updatedPayload
  });
};

const handleAddItem = async (itemPayload) => {
  errorMessage.value = '';
  const newId = itemPayload.id || crypto.randomUUID();
  const newItem = {
    id: newId,
    list_id: listId,
    name: itemPayload.name,
    quantity: itemPayload.quantity || 1,
    unit: itemPayload.unit || 'Stk',
    category: itemPayload.category || 'Sonstiges',
    tags: itemPayload.tags || '',
    note: itemPayload.note || '',
    status: 'active'
  };
  
  items.value.push(newItem);

  // Hinweismeldung, falls Artikel durch einen aktiven Filter ausgeblendet wird
  if (activeMetaFilter.value !== 'all' && !itemHasMetaTag(newItem, activeMetaFilter.value)) {
    if (filterNoticeTimer) clearTimeout(filterNoticeTimer);
    filterNotice.value = {
      text: 'Artikel hinzugefügt – durch aktiven Filter ausgeblendet',
      action: 'Alle anzeigen'
    };
    filterNoticeTimer = setTimeout(() => {
      filterNotice.value = null;
    }, 5500);
  }

  await queueMutation({
    listId,
    itemId: newId,
    action: 'ADD_ITEM',
    payload: newItem
  });
};

const updateItemQuantity = (item, delta) => {
  const newQty = Math.max(1, (item.quantity || 1) + delta);
  if (newQty !== item.quantity) {
    item.quantity = newQty;
    handleUpdateItem({ id: item.id, quantity: newQty });
  }
};

const toggleItemStatus = async (item) => {
  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }
  const newStatus = item.status === 'active' ? 'completed' : 'active';

  // Prevent duplicate reactivation
  if (newStatus === 'active') {
    const existingActiveItem = items.value.find(
      i => i.name.toLowerCase() === item.name.toLowerCase() && i.status === 'active'
    );
    if (existingActiveItem) {
      // Highlight existing item
      const existingEl = document.getElementById(`item-${existingActiveItem.id}`);
      if (existingEl) {
        existingEl.classList.add('flash-highlight');
        setTimeout(() => existingEl.classList.remove('flash-highlight'), 1000);
      }
      return;
    }
  }

  // Optimistisches sofortiges Update für 0ms Verzögerung in der UI
  item.status = newStatus;
  const itemIdx = items.value.findIndex(i => i.id === item.id);
  if (itemIdx !== -1) {
    items.value[itemIdx] = { ...items.value[itemIdx], status: newStatus };
  }

  // Queue mutation & background sync
  await queueMutation({
    listId,
    itemId: item.id,
    action: 'TOGGLE_STATUS',
    payload: { status: newStatus }
  });
};

const executeConfirmAction = async () => {
  if (confirmAction.value) {
    await confirmAction.value();
  }
  showConfirmModal.value = false;
  confirmAction.value = null;
};

const clearCompleted = async () => {
  const completedIds = completedItems.value.map(item => item.id);
  if (completedIds.length === 0) return;

  confirmMessage.value = `Möchtest du wirklich alle ${completedIds.length} erledigten Artikel löschen?`;
  confirmAction.value = async () => {
    items.value = items.value.filter(i => i.status !== 'completed');
    await queueMutation({
      listId,
      action: 'CLEAR_COMPLETED',
      payload: {}
    });
  };
  showConfirmModal.value = true;
};

const confirmDeleteItem = (item) => {
  confirmMessage.value = `Möchtest du '${item.name}' wirklich löschen?`;
  confirmAction.value = async () => {
    await deleteItem(item.id);
  };
  showConfirmModal.value = true;
};

const deleteItem = async (itemId) => {
  // Optimistic delete
  items.value = items.value.filter(i => i.id !== itemId);
  
  await queueMutation({
    listId,
    itemId,
    action: 'DELETE_ITEM',
    payload: {}
  });
};

const loadChangelog = async () => {
  const cached = localStorage.getItem(`cached_changelog_${listId}`);
  if (cached && changelog.value.length === 0) {
    try {
      const parsed = JSON.parse(cached);
      changelog.value = Array.isArray(parsed) ? parsed.filter(l => l.action_type !== 'started' && l.action_type !== 'shopping') : [];
    } catch (e) {}
  }

  if (!isOnline.value) {
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/lists/${listId}/changelog`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      const sanitized = Array.isArray(data) ? data.filter(l => l.action_type !== 'started' && l.action_type !== 'shopping') : [];
      changelog.value = sanitized;
      localStorage.setItem(`cached_changelog_${listId}`, JSON.stringify(sanitized));
    }
  } catch (error) {
    console.error("Fehler beim Laden des Changelogs", error);
  }
};

// --- KEEP SCREEN AWAKE (IN-STORE FOCUS) ---
const enableKeepAwake = async (silent = false) => {
  if (!isKeepAwakeSupported.value) {
    if (!silent) {
      infoToastMessage.value = 'Bildschirm wachhalten wird von diesem Gerät oder Browser nicht unterstützt.';
      setTimeout(() => { infoToastMessage.value = ''; }, 3500);
    }
    return false;
  }

  keepAwakeEnabled.value = true;
  const res = await requestScreenWakeLock({
    onRelease: () => {
      keepAwakeActive.value = false;
    }
  });

  if (res.success) {
    keepAwakeActive.value = true;
    if (!silent) {
      infoToastMessage.value = 'Bildschirm bleibt während des Einkaufs aktiv';
      setTimeout(() => {
        if (infoToastMessage.value && infoToastMessage.value.includes('aktiv')) {
          infoToastMessage.value = '';
        }
      }, 3000);
    }
    return true;
  } else {
    keepAwakeActive.value = false;
    keepAwakeEnabled.value = false;
    if (!silent) {
      infoToastMessage.value = res.reason === 'denied'
        ? 'Bildschirm wachhalten wurde verweigert (z. B. Energiesparmodus aktiv).'
        : 'Bildschirm wachhalten konnte nicht aktiviert werden.';
      setTimeout(() => { infoToastMessage.value = ''; }, 3500);
    }
    return false;
  }
};

const disableKeepAwake = async (silent = false) => {
  keepAwakeEnabled.value = false;
  await releaseScreenWakeLock();
  keepAwakeActive.value = false;
  if (!silent) {
    infoToastMessage.value = 'Automatische Bildschirmsperre wieder aktiv';
    setTimeout(() => {
      if (infoToastMessage.value && infoToastMessage.value.includes('Sperre')) {
        infoToastMessage.value = '';
      }
    }, 3000);
  }
};

const toggleKeepAwake = async () => {
  if (keepAwakeActive.value) {
    await disableKeepAwake();
  } else {
    await enableKeepAwake();
  }
};

const handleWakeLockVisibility = async () => {
  if (document.visibilityState === 'visible' && keepAwakeEnabled.value && !isScreenWakeLockActive()) {
    const res = await requestScreenWakeLock({
      onRelease: () => {
        keepAwakeActive.value = false;
      }
    });
    if (res.success) {
      keepAwakeActive.value = true;
    }
  }
};

const notifyShoppingStarted = async () => {
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Live-Benachrichtigungen an Gruppenmitglieder können derzeit nicht gesendet werden.';
    setTimeout(() => errorMessage.value = '', 4000);
    return;
  }
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/lists/${listId}/start-shopping`), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      isShoppingSessionActive.value = true;
      successMessage.value = 'Gruppenmitglieder benachrichtigt: Du gehst einkaufen! 🛒';
      setTimeout(() => successMessage.value = '', 3500);
      showSettingsSheet.value = false;

      // Automatically enable keep awake along with shopping action
      if (isKeepAwakeSupported.value && !keepAwakeActive.value) {
        await enableKeepAwake(true);
      }
    } else {
      const err = await response.json().catch(() => ({}));
      errorMessage.value = err.detail || 'Fehler beim Senden der Benachrichtigung.';
      setTimeout(() => errorMessage.value = '', 4000);
    }
  } catch (e) {
    errorMessage.value = 'Verbindungsfehler beim Senden der Benachrichtigung.';
    setTimeout(() => errorMessage.value = '', 4000);
  }
};

const finishShopping = async () => {
  try {
    const token = localStorage.getItem('token');
    if (isOnline.value && token) {
      await fetch(apiUrl(`/api/lists/${listId}/finish-shopping`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
  } catch (e) {}

  isShoppingSessionActive.value = false;
  // Automatically disable keep awake
  if (keepAwakeActive.value) {
    await disableKeepAwake(true);
  }
  showSettingsSheet.value = false;
  successMessage.value = 'Einkauf abgeschlossen! ✅ Bildschirm-Wachhaltefunktion beendet.';
  setTimeout(() => {
    if (successMessage.value && successMessage.value.includes('Einkauf abgeschlossen')) {
      successMessage.value = '';
    }
  }, 3500);
};

const openChangelog = () => {
  showChangelogSheet.value = true;
  loadChangelog();
};

const filteredChangelog = computed(() => {
  let logs = changelog.value || [];
  // Einkaufsstart-Ereignisse und Nicht-Artikel-Aktivitäten aus der Historie filtern
  logs = logs.filter(log => log.action_type !== 'started' && log.action_type !== 'shopping');

  if (changelogFilter.value === 'added') logs = logs.filter(log => log.action_type === 'added');
  if (changelogFilter.value === 'completed') logs = logs.filter(log => log.action_type === 'completed');

  const grouped = [];

  logs.forEach(log => {
      let dateStr = log.created_at;
      if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
          dateStr += 'Z';
      }
      const d = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dayKey = '';
      if (!isNaN(d.getTime())) {
          if (d.toDateString() === today.toDateString()) {
              dayKey = `Heute, ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
          } else if (d.toDateString() === yesterday.toDateString()) {
              dayKey = `Gestern, ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
          } else {
              dayKey = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
          }
      } else {
          dayKey = 'Kürzlich';
      }

      let dayGroup = grouped.find(g => g.day === dayKey);
      if (!dayGroup) {
          dayGroup = { day: dayKey, actions: [] };
          grouped.push(dayGroup);
      }

      const userName = log.user_name || 'Unbekannt';
      const actionType = log.action_type;
      const timeStr = isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

      // Konsekutive Aktionen desselben Nutzers mit demselben Aktionstyp zusammenfassen
      const lastAction = dayGroup.actions[dayGroup.actions.length - 1];
      let actionGroup = null;
      if (lastAction && lastAction.userName === userName && lastAction.actionType === actionType) {
          actionGroup = lastAction;
      } else {
          actionGroup = { userName, actionType, time: timeStr, items: [] };
          dayGroup.actions.push(actionGroup);
      }

      actionGroup.items.push(log.item_name);
  });

  return grouped;
});

const getUserAvatarStyle = (name) => {
  const gradients = [
    { bg: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)', shadow: 'rgba(56, 189, 248, 0.4)' },
    { bg: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', shadow: 'rgba(168, 85, 247, 0.4)' },
    { bg: 'linear-gradient(135deg, #059669 0%, #34d399 100%)', shadow: 'rgba(52, 211, 153, 0.4)' },
    { bg: 'linear-gradient(135deg, #ea580c 0%, #fb923c 100%)', shadow: 'rgba(251, 146, 60, 0.4)' },
    { bg: 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)', shadow: 'rgba(244, 63, 94, 0.4)' },
    { bg: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)', shadow: 'rgba(45, 212, 191, 0.4)' }
  ];
  let hash = 0;
  const str = name || 'U';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  const g = gradients[index];
  return {
    background: g.bg,
    boxShadow: `0 0 10px ${g.shadow}`,
    border: '1.5px solid rgba(255, 255, 255, 0.25)'
  };
};

const getActionBadgeInfo = (actionType, count) => {
  switch (actionType) {
    case 'added':
      return {
        label: `${count} hinzugefügt`,
        cssClass: 'ks-badge-added'
      };
    case 'completed':
      return {
        label: `${count} abgehakt`,
        cssClass: 'ks-badge-completed'
      };
    case 'reactivated':
      return {
        label: `${count} wiederhergestellt`,
        cssClass: 'ks-badge-reactivated'
      };
    case 'deleted':
      return {
        label: `${count} entfernt`,
        cssClass: 'ks-badge-deleted'
      };
    default:
      return {
        label: `${count} bearbeitet`,
        cssClass: 'ks-badge-default'
      };
  }
};

const getInitial = (name) => {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
};

const currentUser = ref(null);
const joinRequests = ref([]);
const isLoadingRequests = ref(false);

const isListOwner = computed(() => {
  if (!currentList.value || !currentUser.value) return false;
  return currentList.value.created_by === currentUser.value.id || currentUser.value.is_admin;
});

const loadCurrentUser = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(apiUrl('/api/users/me'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      currentUser.value = await res.json();
    }
  } catch (err) {
    console.error('Fehler beim Laden des Benutzers', err);
  }
};

const loadJoinRequests = async () => {
  if (!currentList.value) return;
  isLoadingRequests.value = true;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(apiUrl(`/api/lists/${listId}/join-requests`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      joinRequests.value = await res.json();
    }
  } catch (err) {
    console.error('Fehler beim Laden der Beitrittsanfragen', err);
  } finally {
    isLoadingRequests.value = false;
  }
};

const approveJoinRequest = async (requestId) => {
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Beitrittsanfragen können derzeit nicht bearbeitet werden.';
    setTimeout(() => errorMessage.value = '', 3500);
    return;
  }
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(apiUrl(`/api/lists/${listId}/join-requests/${requestId}/approve`), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      successMessage.value = "Benutzer freigeschaltet!";
      joinRequests.value = joinRequests.value.filter(r => r.id !== requestId);
      loadItems();
      setTimeout(() => successMessage.value = '', 3000);
    } else {
      const err = await res.json().catch(() => ({}));
      errorMessage.value = err.detail || "Fehler beim Freischalten.";
      setTimeout(() => errorMessage.value = '', 4000);
    }
  } catch (err) {
    errorMessage.value = "Fehler beim Freischalten.";
    setTimeout(() => errorMessage.value = '', 4000);
  }
};

const rejectJoinRequest = async (requestId) => {
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Beitrittsanfragen können derzeit nicht bearbeitet werden.';
    setTimeout(() => errorMessage.value = '', 3500);
    return;
  }
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(apiUrl(`/api/lists/${listId}/join-requests/${requestId}/reject`), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      successMessage.value = "Anfrage abgelehnt.";
      joinRequests.value = joinRequests.value.filter(r => r.id !== requestId);
      setTimeout(() => successMessage.value = '', 2000);
    } else {
      const err = await res.json().catch(() => ({}));
      errorMessage.value = err.detail || "Fehler beim Ablehnen der Anfrage.";
      setTimeout(() => errorMessage.value = '', 4000);
    }
  } catch (err) {
    errorMessage.value = "Fehler beim Ablehnen.";
    setTimeout(() => errorMessage.value = '', 4000);
  }
};

const getShareBaseUrl = () => {
  let base = window.location.origin;
  if (!base || base.includes('localhost') || base.includes('capacitor://') || base.includes('ionic://')) {
    return 'https://einkaufsliste.kotrini.de';
  }
  return base;
};

const shareOrCopyLink = async () => {
  if (!currentList.value) return;
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Das Teilen von Listen erfordert eine Internetverbindung.';
    setTimeout(() => errorMessage.value = '', 3500);
    return;
  }
  const joinLink = `${getShareBaseUrl()}/join?code=${currentList.value.share_code}`;
  if (navigator.share) {
    try {
      await navigator.share({
        title: `KaufSync - ${currentList.value.name}`,
        text: `Tritt meiner Einkaufsliste '${currentList.value.name}' auf KaufSync bei!`,
        url: joinLink
      });
      return;
    } catch (e) {
      // User cancelled or clipboard fallback
    }
  }
  try {
    await navigator.clipboard.writeText(joinLink);
    successMessage.value = "Einladungs-Link kopiert!";
    setTimeout(() => successMessage.value = '', 2000);
  } catch (err) {
    console.error('Kopieren fehlgeschlagen', err);
  }
};

const isTogglingReadonly = ref(false);

const toggleReadonlyLink = async (event) => {
  if (!currentList.value || isTogglingReadonly.value) return;
  if (!isOnline.value) {
    if (event && event.target) {
      event.target.checked = !!currentList.value.readonly_enabled;
    }
    errorMessage.value = 'Du bist offline. Änderungen am Nur-Lesen Link erfordern eine Internetverbindung.';
    setTimeout(() => errorMessage.value = '', 3500);
    return;
  }
  isTogglingReadonly.value = true;
  const previousState = !!currentList.value.readonly_enabled;
  try {
    const token = localStorage.getItem('token');
    const newStatus = !previousState;
    const res = await fetch(apiUrl(`/api/lists/${currentList.value.id}/readonly-link`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ enabled: newStatus })
    });
    if (!res.ok) throw new Error('Fehler beim Aktualisieren des Nur-Lesen Links');
    const data = await res.json();
    currentList.value.readonly_token = data.readonly_token;
    currentList.value.readonly_enabled = data.readonly_enabled;

    // Cache aktualisieren
    const cachedData = localStorage.getItem('cachedLists');
    if (cachedData) {
      try {
        const lists = JSON.parse(cachedData);
        const idx = lists.findIndex(l => l.id === currentList.value.id);
        if (idx !== -1) {
          lists[idx].readonly_token = data.readonly_token;
          lists[idx].readonly_enabled = data.readonly_enabled;
          localStorage.setItem('cachedLists', JSON.stringify(lists));
        }
      } catch (e) {}
    }

    if (data.readonly_enabled) {
      successMessage.value = "Nur-Lesen Link aktiviert!";
    } else {
      successMessage.value = "Nur-Lesen Link deaktiviert!";
    }
    setTimeout(() => successMessage.value = '', 2500);
  } catch (err) {
    if (event && event.target) {
      event.target.checked = previousState;
    }
    errorMessage.value = "Fehler beim Umschalten des Nur-Lesen Links.";
    setTimeout(() => errorMessage.value = '', 3000);
  } finally {
    isTogglingReadonly.value = false;
  }
};

const shareOrCopyReadonlyLink = async () => {
  if (!currentList.value || !currentList.value.readonly_token) return;
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Das Teilen des Links erfordert eine Internetverbindung.';
    setTimeout(() => errorMessage.value = '', 3500);
    return;
  }
  const publicLink = `${getShareBaseUrl()}/s/${currentList.value.readonly_token}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `Einkaufsliste: ${currentList.value.name}`,
        text: `Hier ist die Einkaufsliste '${currentList.value.name}' (Nur-Lesen):`,
        url: publicLink
      });
      return;
    } catch (e) {
      // User cancelled
    }
  }
  try {
    await navigator.clipboard.writeText(publicLink);
    successMessage.value = "Nur-Lesen Link kopiert!";
    setTimeout(() => successMessage.value = '', 2000);
  } catch (err) {
    console.error('Kopieren fehlgeschlagen', err);
  }
};

watch(showShareSheet, (newVal) => {
  if (newVal) {
    loadJoinRequests();
  }
});

const getInitials = (name) => {
  return name.substring(0, 2).toUpperCase();
};

const getCategoryDef = (catName) => {
  return predefinedCategories.find(c => c.name === catName) || predefinedCategories[7];
};

// Sortiert die Auswahl-Chips für die Eingabezeile nach demselben Laufweg wie die Liste
const sortedCategoryChips = computed(() => {
  return [...predefinedCategories].sort((a, b) => {
    let indexA = categoryOrder.value.indexOf(a.name);
    let indexB = categoryOrder.value.indexOf(b.name);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });
});

const mapLegacyCategory = (catName) => {
  if (catName === 'Milch & Tiefkühl') return 'Milchprodukte & Tiefkühlkost';
  if (catName === 'Getränke') return 'Getränke & Genussmittel';
  if (catName === 'Drogerie & Haushalt') return 'Drogerie, Haushalt & Tierbedarf';
  return catName;
};

// Berechnete Eigenschaften für Gruppierung der Listenansicht
const groupedActiveItems = computed(() => {
  const activeItems = filteredActiveItems.value;
  const groups = {};
  
  activeItems.forEach(item => {
    let catName = item.category || 'Sonstiges';
    catName = mapLegacyCategory(catName);

    if (!groups[catName]) {
      groups[catName] = { 
        name: catName, 
        def: getCategoryDef(catName), 
        items: [] 
      };
    }
    groups[catName].items.push(item);
  });

  // Sortiere die Gruppen basierend auf dem aktiven Markt-Default oder User-Override
  const sortedGroups = Object.values(groups).sort((a, b) => {
    let indexA = categoryOrder.value.indexOf(a.name);
    let indexB = categoryOrder.value.indexOf(b.name);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });

  // Stabile Sortierung der Artikel innerhalb jeder Kategorie, um Springen bei Cache/API-Updates zu verhindern
  sortedGroups.forEach(group => {
    group.items.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a.name || '').localeCompare(b.name || '');
    });
  });

  return sortedGroups;
});

const sortedActiveItems = computed(() => {
  return groupedActiveItems.value.reduce((acc, group) => {
    // Add the group def to each item so it can be easily accessed in the flat list
    const itemsWithDef = group.items.map(item => ({...item, _groupDef: group.def}));
    return acc.concat(itemsWithDef);
  }, []);
});

const completedItems = computed(() => {
  const list = items.value.filter(i => i.status === 'completed').map(item => {
    let catName = item.category || 'Sonstiges';
    return { ...item, category: mapLegacyCategory(catName) };
  });
  return list.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
});

const vMarquee = {
  mounted(el) {
    const checkOverflow = () => {
      const textEl = el.firstElementChild;
      if (!textEl) return;
      if (el.classList.contains('invisible') || !textEl.textContent.trim()) {
        el.classList.remove('has-marquee');
        el.style.removeProperty('--marquee-dist');
        return;
      }
      const containerWidth = el.clientWidth;
      const contentWidth = textEl.scrollWidth;
      if (contentWidth > containerWidth + 2) {
        const overflowDist = contentWidth - containerWidth + 8;
        el.style.setProperty('--marquee-dist', `${overflowDist}px`);
        el.classList.add('has-marquee');
      } else {
        el.classList.remove('has-marquee');
        el.style.removeProperty('--marquee-dist');
      }
    };

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(checkOverflow);
    });
    ro.observe(el);
    el._marqueeRo = ro;
    el._checkMarquee = checkOverflow;
    requestAnimationFrame(checkOverflow);
  },
  updated(el) {
    if (el._checkMarquee) {
      requestAnimationFrame(el._checkMarquee);
    }
  },
  unmounted(el) {
    if (el._marqueeRo) {
      el._marqueeRo.disconnect();
      delete el._marqueeRo;
      delete el._checkMarquee;
    }
  }
};


onMounted(() => {
  activeMetaFilter.value = 'all';
  loadItems(); // loadItems ruft am Ende loadCategoryOrder() auf
  loadCurrentUser();
  setupWebSocket();
  processOfflineQueue();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  document.addEventListener('visibilitychange', handleWakeLockVisibility);
  try {
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handleWakeLockVisibility();
    });
  } catch (e) {}

  setTimeout(() => {
    isInitialLoad.value = false;
  }, 400);

  // Auto-open recipe modal if shared via Share Target or query
  const pendingRecipe = localStorage.getItem('pending_recipe_import');
  if (pendingRecipe) {
    try {
      const parsed = JSON.parse(pendingRecipe);
      if (parsed.url) {
        openRecipeModal(parsed.url);
      }
    } catch {}
    localStorage.removeItem('pending_recipe_import');
  } else if (route.query.importRecipe && route.query.url) {
    openRecipeModal(route.query.url);
  } else if (route.query.openRecipeImport || route.query.importRecipe) {
    openRecipeModal();
  }
});

onUnmounted(() => {
  isViewUnmounted = true;
  document.removeEventListener('visibilitychange', handleWakeLockVisibility);
  keepAwakeEnabled.value = false;
  releaseScreenWakeLock();
  keepAwakeActive.value = false;
  if (filterNoticeTimer) {
    clearTimeout(filterNoticeTimer);
    filterNoticeTimer = null;
  }
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
});
</script>

<template>
  <div class="page-shell list-view-layout" :class="{ 'modal-open': isAddModalOpen, 'has-meta-filters': hasAnyMetaTags }" @click="showShareSheet = false; showSortSheet = false; showChangelogSheet = false; showSettingsSheet = false;">

    <header class="page-topbar" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
        <img src="/android-chrome-512x512.png" alt="KaufSync Logo" style="width: 24px; height: 24px; object-fit: contain; margin-right: 4px;">
        <button class="ks-icon-btn" @click.stop="router.push('/')" aria-label="Zurück">
          <svg viewBox="0 0 24 24"><path d="M11.175 19 4 12l7.175-7 1.425 1.4L7.85 11H20v2H7.85l4.75 4.6Z"/></svg>
        </button>
        <h1 class="list-title">{{ currentList ? currentList.name : 'Laden...' }}</h1>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button
          v-if="isKeepAwakeSupported"
          class="ks-icon-btn keep-awake-btn"
          :class="{ 'is-active': keepAwakeActive }"
          @click.stop="toggleKeepAwake"
          :title="keepAwakeActive ? 'Bildschirm wachhalten: Aktiv' : 'Bildschirm wachhalten: Inaktiv'"
          :aria-label="keepAwakeActive ? 'Bildschirm wachhalten: Aktiv' : 'Bildschirm wachhalten: Inaktiv'"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
          </svg>
        </button>
        <SyncStatusBadge />
        <button class="ks-icon-btn" @click.stop="showSettingsSheet = !showSettingsSheet" aria-label="Listen-Optionen">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- SHEET SCRIM -->
    <transition name="scrim-fade">
      <div v-if="showShareSheet || showSortSheet || showChangelogSheet || showSettingsSheet" class="ks-sheet-scrim" @click="showShareSheet = false; showSortSheet = false; showChangelogSheet = false; showSettingsSheet = false;"></div>
    </transition>

    <!-- SETTINGS MENU SHEET -->
    <transition name="sheet-slide">
      <div v-if="showSettingsSheet" class="ks-sheet" :style="settingsDrag.sheetStyle" @click.stop>
        <div class="ks-sheet-drag-header" @touchstart="settingsDrag.onTouchStart" @touchmove="settingsDrag.onTouchMove" @touchend="settingsDrag.onTouchEnd" style="touch-action: none; cursor: grab; padding-bottom: 4px;">
          <div class="ks-sheet__handle"></div>
          <div class="modal-header" style="margin-bottom: 12px;">
            <div>
              <h3 class="sheet-heading" style="margin: 0;">Listen-Optionen</h3>
              <p class="sheet-support" style="margin: 2px 0 0; font-size: 13px; color: #94a3b8;">{{ currentList?.name }}</p>
            </div>
          </div>
        </div>

        <div class="settings-menu-list">
          <!-- 1. EINKAUF STARTEN / BEENDEN -->
          <button v-if="!isShoppingSessionActive" class="settings-menu-item" @click="notifyShoppingStarted">
            <div class="settings-menu-icon" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M17.21 9l-4.38-6.56c-.19-.28-.51-.42-.83-.42-.32 0-.64.14-.83.43L6.79 9H2c-.55 0-1 .45-1 1 0 .09.01.18.04.27l2.54 9.27c.23.84 1 1.46 1.92 1.46h13c.92 0 1.69-.62 1.93-1.46l2.54-9.27L23 10c0-.55-.45-1-1-1h-4.79zM9 9l3-4.4L15 9H9zm3 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
              </svg>
            </div>
            <div class="settings-menu-content">
              <div class="settings-menu-title">„Ich gehe einkaufen!“</div>
              <div class="settings-menu-desc">Benachrichtige die Gruppe & schalte Bildschirm auf aktiv</div>
            </div>
            <div class="settings-menu-arrow">›</div>
          </button>
          <button v-else class="settings-menu-item" @click="finishShopping">
            <div class="settings-menu-icon" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
              </svg>
            </div>
            <div class="settings-menu-content">
              <div class="settings-menu-title">Einkauf abgeschlossen</div>
              <div class="settings-menu-desc">Einkauf beenden & Bildschirmsperre freigeben</div>
            </div>
            <span class="settings-menu-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.35);">Aktiv</span>
          </button>

          <!-- BILDSCHIRM WACHHALTEN TOGGLE -->
          <div class="settings-menu-item" style="cursor: pointer;" @click="toggleKeepAwake">
            <div class="settings-menu-icon" :style="{ background: keepAwakeActive ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)', color: keepAwakeActive ? '#fbbf24' : 'var(--ks-text-muted)' }">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
              </svg>
            </div>
            <div class="settings-menu-content">
              <div class="settings-menu-title">Bildschirm wachhalten</div>
              <div class="settings-menu-desc">Verhindert die automatische Bildschirmsperre im Markt</div>
            </div>
            <div v-if="isKeepAwakeSupported" class="ks-switch-pill" :class="{ 'is-on': keepAwakeActive }">
              <div class="ks-switch-thumb"></div>
            </div>
            <span v-else class="settings-menu-badge" style="opacity: 0.6;">Nicht verfügbar</span>
          </div>

          <!-- 2. TEILEN -->
          <button class="settings-menu-item" @click="showSettingsSheet = false; showShareSheet = true;">
            <div class="settings-menu-icon share-icon-bg">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M18 22q-1.25 0-2.125-.875T15 19q0-.15.025-.325.025-.175.075-.325L7.05 13.7q-.425.4-.95.65-.525.25-1.1.25-1.25 0-2.125-.875T2 11.4q0-1.25.875-2.125T5 8.4q.575 0 1.1.25.525.25.95.65l8.05-4.65q-.05-.15-.075-.325Q15 4.15 15 4q0-1.25.875-2.125T18 1q1.25 0 2.125.875T21 4q0 1.25-.875 2.125T18 7q-.575 0-1.1-.25-.525-.25-.95-.65L7.9 10.75q.05.15.075.325.025.175.025.325 0 .15-.025.325-.025.175-.075.325l8.05 4.65q.425-.4.95-.65.525-.25 1.1-.25 1.25 0 2.125.875T21 19q0 1.25-.875 2.125T18 22Z"/>
              </svg>
            </div>
            <div class="settings-menu-content">
              <div class="settings-menu-title">Liste teilen</div>
              <div class="settings-menu-desc">Freunde & Familie einladen, Mitglieder verwalten</div>
            </div>
            <div class="settings-menu-arrow">›</div>
          </button>

          <!-- 3. HISTORIE -->
          <button class="settings-menu-item" @click="showSettingsSheet = false; openChangelog();">
            <div class="settings-menu-icon history-icon-bg">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </div>
            <div class="settings-menu-content">
              <div class="settings-menu-title">Historie & Aktivitäten</div>
              <div class="settings-menu-desc">Protokoll über hinzugefügte & erledigte Artikel</div>
            </div>
            <div class="settings-menu-arrow">›</div>
          </button>

          <!-- 3. ANSICHT ÄNDERN -->
          <button class="settings-menu-item" @click="toggleCompactView">
            <div class="settings-menu-icon view-icon-bg">
              <svg v-if="isCompactView" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M4 18h17v-6H4v6zM4 5v6h17V5H4z"/>
              </svg>
            </div>
            <div class="settings-menu-content">
              <div class="settings-menu-title">Ansicht ändern</div>
              <div class="settings-menu-desc">Aktuell: <strong style="color: #38bdf8;">{{ isCompactView ? 'Kompakte Liste' : 'Kachelansicht' }}</strong></div>
            </div>
            <span class="settings-menu-badge">{{ isCompactView ? 'Kompakt' : 'Kacheln' }}</span>
          </button>

          <!-- 4. MARKTSORTIERUNG -->
          <button class="settings-menu-item" @click="showSettingsSheet = false; showSortSheet = true;">
            <div class="settings-menu-icon sort-icon-bg">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M3 18v-2h6v2H3Zm0-5v-2h12v2H3Zm0-5V6h18v2H3Z"/>
              </svg>
            </div>
            <div class="settings-menu-content">
              <div class="settings-menu-title">Marktsortierung ändern</div>
              <div class="settings-menu-desc">Reihenfolge der Gänge & Kategorien anpassen</div>
            </div>
            <div class="settings-menu-arrow">›</div>
          </button>
        </div>
      </div>
    </transition>

    <!-- SHARE SHEET -->
    <transition name="sheet-slide">
      <div v-if="showShareSheet" class="ks-sheet" :style="shareDrag.sheetStyle" @click.stop>
        <div class="ks-sheet-drag-header" @touchstart="shareDrag.onTouchStart" @touchmove="shareDrag.onTouchMove" @touchend="shareDrag.onTouchEnd" style="touch-action: none; cursor: grab; padding-bottom: 4px;">
          <div class="ks-sheet__handle"></div>
          <h3 class="sheet-heading">Liste teilen</h3>
        </div>

        <div v-if="!isOnline" class="ks-offline-notice">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          <span>Du bist offline. Das Teilen von Listen und Verwalten von Mitgliedern erfordert eine aktive Internetverbindung.</span>
        </div>

        <div class="share-section" style="display: flex; flex-direction: column; gap: 14px;">
          <p class="sheet-support" style="margin: 0; font-size: 13px; line-height: 1.4;">
            Über diesen Link kann jeder eine Beitrittsanfrage stellen. Du als Besitzer musst neue Mitglieder erst freigeben.
          </p>

          <button class="ks-btn-pill-primary full-width" :disabled="!isOnline" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;" @click="shareOrCopyLink">
             <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
             Einladungs-Link teilen / kopieren
          </button>
        </div>

        <!-- 2. NUR-LESEN LINK (ÖFFENTLICHE ANSICHT) -->
        <div v-if="isListOwner" class="share-section mt-4" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">👀</span>
              <p class="section-label" style="margin: 0; font-weight: 600; color: #f8fafc;">
                Nur-Lesen Link
              </p>
            </div>
            <!-- Toggle Switch -->
            <label class="ks-switch" title="Nur-Lesen Link aktivieren/deaktivieren">
              <input
                type="checkbox"
                :checked="currentList?.readonly_enabled"
                :disabled="isTogglingReadonly || !isOnline"
                @change="toggleReadonlyLink($event)"
              />
              <span class="ks-switch-slider"></span>
            </label>
          </div>

          <p class="sheet-support" style="margin: 0 0 10px 0; font-size: 13px; line-height: 1.4; color: var(--ks-text-muted);">
            {{ currentList?.readonly_enabled 
                ? 'Jeder mit diesem Link kann die Liste im Browser einsehen – ohne Account.' 
                : 'Deaktiviert. Niemand kann die Liste ohne Login/Freigabe einsehen.' }}
          </p>

          <div v-if="currentList?.readonly_enabled" style="display: flex; flex-direction: column; gap: 8px;">
            <button
              class="ks-btn-pill-secondary full-width"
              :disabled="!isOnline"
              style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;"
              @click="shareOrCopyReadonlyLink"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
              </svg>
              <span>Nur-Lesen Link teilen / kopieren</span>
            </button>
          </div>
        </div>

        <!-- AUSSTEHENDE ANFRAGEN (FÜR BESITZER) -->
        <div v-if="isListOwner" class="share-section mt-4" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <p class="section-label" style="margin: 0; font-weight: 600; color: #f8fafc;">
              Ausstehende Beitrittsanfragen
            </p>
            <span v-if="joinRequests.length > 0" class="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              {{ joinRequests.length }}
            </span>
          </div>

          <div v-if="isLoadingRequests" class="text-xs text-slate-400 py-3 text-center">
            Lade Anfragen...
          </div>

          <div v-else-if="joinRequests.length > 0" class="space-y-2 mt-2">
            <div v-for="req in joinRequests" :key="req.id" class="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 shadow-sm">
              <div class="min-w-0 flex-1 mr-2">
                <div class="text-sm font-semibold text-white truncate">{{ req.display_name }}</div>
                <div class="text-xs text-slate-400 truncate">{{ req.email }}</div>
              </div>
              <div class="flex items-center gap-1.5 flex-shrink-0">
                <button
                  class="px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-sm active:scale-95 transition-all disabled:opacity-50"
                  :disabled="!isOnline"
                  @click="approveJoinRequest(req.id)"
                >
                  Zulassen
                </button>
                <button
                  class="px-2.5 py-1.5 rounded-full bg-slate-700 hover:bg-rose-500/30 hover:text-rose-300 text-slate-300 font-semibold text-xs transition-all disabled:opacity-50"
                  :disabled="!isOnline"
                  @click="rejectJoinRequest(req.id)"
                >
                  Ablehnen
                </button>
              </div>
            </div>
          </div>

          <div v-else class="text-xs text-slate-500 italic py-2">
            Keine offenen Beitrittsanfragen.
          </div>
        </div>

        <!-- LISTE DER MITGLIEDER -->
        <div v-if="currentList?.members?.length" class="share-section mt-4" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px;">
          <p class="section-label" style="margin-bottom: 8px; font-weight: 600; color: #f8fafc;">
            Aktuelle Mitglieder ({{ currentList.members.length }})
          </p>
          <div class="space-y-1.5 max-h-36 overflow-y-auto">
            <div v-for="member in currentList.members" :key="member.id" class="flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-800/40 text-xs text-slate-300">
              <span class="font-medium truncate">{{ member.display_name }}</span>
              <span v-if="member.id === currentList.created_by" class="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">Besitzer</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- CHANGELOG SHEET -->
    <transition name="sheet-slide">
      <div v-if="showChangelogSheet" class="ks-sheet" :style="changelogDrag.sheetStyle" @click.stop>
        <div class="ks-sheet-drag-header" @touchstart="changelogDrag.onTouchStart" @touchmove="changelogDrag.onTouchMove" @touchend="changelogDrag.onTouchEnd" style="touch-action: none; cursor: grab; padding-bottom: 4px;">
          <div class="ks-sheet__handle"></div>
          <div class="modal-header" style="justify-content: space-between; margin-bottom: 12px;">
              <h3 class="sheet-heading" style="margin: 0;">Aktivitäten</h3>
          </div>
        </div>

        <div v-if="!isOnline" class="ks-offline-notice" style="margin-bottom: 12px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          <span>Offline – Stand möglicherweise nicht aktuell</span>
        </div>

        <div class="ks-activity-filter-bar" style="margin-bottom: 16px;">
            <button class="ks-activity-chip" :class="{ active: changelogFilter === 'all' }" @click="changelogFilter = 'all'">Alle</button>
            <button class="ks-activity-chip" :class="{ active: changelogFilter === 'added' }" @click="changelogFilter = 'added'">Hinzugefügt</button>
            <button class="ks-activity-chip" :class="{ active: changelogFilter === 'completed' }" @click="changelogFilter = 'completed'">Abgehakt</button>
        </div>

        <div class="changelog-list" style="max-height: 52vh; overflow-y: auto; padding-right: 4px;">
            <div v-for="dayGroup in filteredChangelog" :key="dayGroup.day" class="ks-activity-day-section">
                <div class="ks-activity-date-pill">
                  <span>{{ dayGroup.day }}</span>
                </div>

                <div v-for="(actionGroup, index) in dayGroup.actions" :key="index" class="ks-activity-card">
                    <div class="ks-activity-card-header">
                        <div class="ks-activity-user-info">
                            <div class="ks-activity-avatar" :style="getUserAvatarStyle(actionGroup.userName)">
                              {{ getInitial(actionGroup.userName) }}
                            </div>
                            <div class="ks-activity-user-text">
                              <span class="ks-activity-username">{{ actionGroup.userName }}</span>
                              <span v-if="actionGroup.time" class="ks-activity-time">{{ actionGroup.time }} Uhr</span>
                            </div>
                        </div>

                        <span class="ks-activity-badge" :class="getActionBadgeInfo(actionGroup.actionType, actionGroup.items.length).cssClass">
                          <svg v-if="actionGroup.actionType === 'added'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                          <svg v-else-if="actionGroup.actionType === 'completed'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                          <svg v-else-if="actionGroup.actionType === 'reactivated'" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                          <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
                          {{ getActionBadgeInfo(actionGroup.actionType, actionGroup.items.length).label }}
                        </span>
                    </div>

                    <div class="ks-activity-items-grid">
                        <div v-for="(itemName, idx) in actionGroup.items" :key="idx" class="ks-activity-item-chip">
                            <CategoryIcon class="ks-activity-item-icon" :name="itemName" size="24" />
                            <span class="ks-activity-item-name">{{ itemName }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="filteredChangelog.length === 0" class="ks-activity-empty">
                <div class="ks-activity-empty-icon">📝</div>
                <p class="ks-activity-empty-text">
                  {{ !isOnline ? 'Offline: Keine gespeicherten Aktivitäten für diese Liste verfügbar.' : 'Noch keine Aktivitäten in dieser Liste.' }}
                </p>
            </div>
        </div>
      </div>
    </transition>

    <!-- SORTIER SHEET -->
    <transition name="sheet-slide">
      <div v-if="showSortSheet" class="ks-sheet" :style="sortDrag.sheetStyle" @click.stop>
        <div class="ks-sheet-drag-header" @touchstart="sortDrag.onTouchStart" @touchmove="sortDrag.onTouchMove" @touchend="sortDrag.onTouchEnd" style="touch-action: none; cursor: grab; padding-bottom: 4px;">
          <div class="ks-sheet__handle"></div>
          <h3 class="sheet-heading">Laufweg im Supermarkt</h3>
          <p class="sheet-support">Sortiere die Kategorien, damit sie deinem Weg durch den Markt entsprechen.</p>
        </div>
        
        <div class="sort-list" ref="sortListRef">
          <div
            v-for="(catName, index) in categoryOrder"
            :key="catName"
            class="sort-item"
            :data-id="catName"
          >
            <div class="sort-info flex items-center gap-3">
               <div
                 class="sort-category-glow-bar"
                 :style="{
                   backgroundColor: getCategoryDef(catName).color,
                   boxShadow: '0 0 10px ' + getCategoryDef(catName).color
                 }"
               ></div>
               <span class="sort-category-name text-slate-100 font-medium text-sm">{{ formatCategoryName(catName) }}</span>
            </div>
            <div class="sort-actions">
              <span class="drag-handle" :style="{ color: getCategoryDef(catName).color }" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
                 <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 15v-2h18v2H3Zm0-4V9h18v2H3Z"/></svg>
              </span>
            </div>
          </div>
        </div>

        <button class="ks-btn-pill-primary full-width" style="width: 100%; margin-top: 16px;" @click="showSortSheet = false">Fertig</button>
        <button v-if="isCustomOrder" class="ks-btn-pill-secondary full-width" style="width: 100%; margin-top: 10px; color: #fca5a5;" @click="resetCategoryOrder">
          Auf Markt-Standard zurücksetzen
        </button>
      </div>
    </transition>

    <div class="ks-snackbar-stack">
      <transition-group name="toast">
        <div v-if="errorMessage" key="err" class="ks-snackbar ks-snackbar--error">{{ errorMessage }}</div>
        <div v-if="successMessage" key="succ" class="ks-snackbar ks-snackbar--success">{{ successMessage }}</div>
        <div v-if="infoToastMessage" key="info" class="ks-snackbar ks-snackbar--info">{{ infoToastMessage }}</div>
        <div v-if="filterNotice" key="filt" class="ks-snackbar ks-snackbar--filter">
          <span>{{ filterNotice.message }}</span>
          <button v-if="filterNotice.action" class="ks-filter-notice-btn" @click.stop="filterNotice.action">
            {{ filterNotice.actionLabel || 'Alle anzeigen' }}
          </button>
        </div>
      </transition-group>
    </div>

    <!-- GRUPPIERTE AKTIVE ARTIKEL -->
    <div class="list-scroll-area">
      <template v-if="groupedActiveItems.length > 0">
        <template v-if="!isCompactView">
          <section v-for="group in groupedActiveItems" :key="group.name" class="flex gap-3 mb-6" style="display: flex; gap: 12px; margin-bottom: 24px;">
            <div class="category-indicator" :style="{ color: group.def.color, backgroundColor: group.def.color }" style="width: 4px; border-radius: 9999px; flex-shrink: 0; box-shadow: 0 0 10px currentColor; opacity: 0.8;"></div>
            <div style="flex: 1;">
              <h2 :style="{ color: group.def.color }" style="font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                  {{ formatCategoryName(group.name) }} <span :style="{ backgroundColor: 'color-mix(in srgb, ' + group.def.color + ' 20%, transparent)', color: group.def.color }" style="padding: 2px 8px; border-radius: 9999px;">{{ group.items.length }}</span>
              </h2>

            <transition-group name="list" tag="div" :class="['ks-grid items-grid grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 w-full', { 'is-hydrating': isInitialLoad }]">
              <div v-for="item in group.items" :key="item.id" class="grid-card active" :id="'item-' + item.id"
                   @click="toggleItemStatus(item)"
                   @mousedown="startPress(item, $event)"
                   @touchstart="startPress(item, $event)"
                   @mouseup="cancelPress"
                   @mouseleave="cancelPress"
                   @touchend="cancelPress"
                   @touchmove="cancelPress">
              <div class="absolute -top-4 -right-4 w-24 h-24 rounded-full blur-xl opacity-15 pointer-events-none" :style="{ backgroundColor: group.def.color }"></div>
              <div class="item-icon-container flex items-center justify-center mb-1 select-none" :style="{ color: group.def.color }">
                <CategoryIcon class="icon-svg" :name="item.name" :category="item.category" size="66" />
              </div>
              <div v-if="getUrgencyTags(item.tags).length > 0" class="item-tags" style="position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; z-index: 2;">
                <span
                  v-for="tag in getUrgencyTags(item.tags)"
                  :key="tag"
                  :style="{ color: group.def.color }"
                >
                  <svg v-if="tag === 'Dringend'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>
                  <svg v-else-if="tag === 'Angebot'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2zm4 5h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </span>
              </div>
              <div class="card-text-area mb-2">
                <span v-marquee class="item-name">
                  <span class="item-name-text">{{ item.name }}</span>
                </span>
                <span v-marquee class="item-regular-tags" :class="{ 'invisible': !getRegularTags(item.tags).length }">
                  <span class="item-regular-tags-text">{{ getRegularTags(item.tags).length > 0 ? formatTags(item.tags) : '&nbsp;' }}</span>
                </span>
              </div>
              <div class="quantity-controls flex items-center justify-between w-full mt-auto bg-slate-900 rounded-lg p-1" @click.stop>
                <button @click.stop="updateItemQuantity(item, -1)" class="w-8 h-8 rounded-md bg-slate-800 text-slate-300 font-bold flex items-center justify-center active:scale-90 transition-transform">-</button>
                <span class="qty-val" :style="{ color: group.def.color }" style="font-weight: bold;">{{ formatQuantity(item) }}</span>
                <button @click.stop="updateItemQuantity(item, 1)" class="w-8 h-8 rounded-md font-bold text-slate-900 flex items-center justify-center active:scale-90 transition-transform" :style="{ backgroundColor: group.def.color }">+</button>
              </div>
              </div>
            </transition-group>
            </div>
          </section>
        </template>
        <template v-else>
          <transition-group name="list" tag="div" :class="['ks-grid items-grid grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 w-full', { 'is-hydrating': isInitialLoad }]" style="padding-top: 0;">
            <div v-for="item in sortedActiveItems" :key="item.id" class="grid-card active" :id="'item-' + item.id"
                   @click="toggleItemStatus(item)"
                   @mousedown="startPress(item, $event)"
                   @touchstart="startPress(item, $event)"
                   @mouseup="cancelPress"
                   @mouseleave="cancelPress"
                   @touchend="cancelPress"
                   @touchmove="cancelPress">
              <div class="absolute -top-4 -right-4 w-24 h-24 rounded-full blur-xl opacity-15 pointer-events-none" :style="{ backgroundColor: item._groupDef.color }"></div>
              <div class="item-icon-container flex items-center justify-center mb-1 select-none" :style="{ color: item._groupDef.color }">
                <CategoryIcon class="icon-svg" :name="item.name" :category="item.category" size="66" />
              </div>
              <div v-if="getUrgencyTags(item.tags).length > 0" class="item-tags" style="position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; z-index: 2;">
                <span
                  v-for="tag in getUrgencyTags(item.tags)"
                  :key="tag"
                  :style="{ color: item._groupDef.color }"
                >
                  <svg v-if="tag === 'Dringend'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>
                  <svg v-else-if="tag === 'Angebot'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2zm4 5h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </span>
              </div>
              <div class="card-text-area mb-2">
                <span v-marquee class="item-name">
                  <span class="item-name-text">{{ item.name }}</span>
                </span>
                <span v-marquee class="item-regular-tags" :class="{ 'invisible': !getRegularTags(item.tags).length }">
                  <span class="item-regular-tags-text">{{ getRegularTags(item.tags).length > 0 ? formatTags(item.tags) : '&nbsp;' }}</span>
                </span>
              </div>
              <div class="quantity-controls flex items-center justify-between w-full mt-auto bg-slate-900 rounded-lg p-1" @click.stop>
                <button @click.stop="updateItemQuantity(item, -1)" class="w-8 h-8 rounded-md bg-slate-800 text-slate-300 font-bold flex items-center justify-center active:scale-90 transition-transform">-</button>
                <span class="qty-val" :style="{ color: item._groupDef.color }" style="font-weight: bold;">{{ formatQuantity(item) }}</span>
                <button @click.stop="updateItemQuantity(item, 1)" class="w-8 h-8 rounded-md font-bold text-slate-900 flex items-center justify-center active:scale-90 transition-transform" :style="{ backgroundColor: item._groupDef.color }">+</button>
              </div>
            </div>
</transition-group>
        </template>
      </template>

      <!-- Empty state when active items exist in list, but current meta-filter yields 0 items -->
      <div v-if="groupedActiveItems.length === 0 && openActiveItems.length > 0" class="empty-filter-state">
        <div class="empty-filter-icon">🔍</div>
        <p class="empty-filter-title">Keine Artikel mit „{{ getFilterLabel(activeMetaFilter) }}“</p>
        <p class="empty-filter-desc">In dieser Liste gibt es keine offenen Artikel mit diesem Tag.</p>
        <button class="ks-btn-pill-secondary" @click="clearMetaFilter">Alle Artikel anzeigen ({{ totalOpenCount }})</button>
      </div>

      <div v-if="groupedActiveItems.length === 0 && completedItems.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4Z"/></svg>
        <p>Deine Liste ist leer!</p>
      </div>

      <div v-if="groupedActiveItems.length === 0 && completedItems.length > 0" class="all-done-banner text-center bg-green-100 text-green-700 p-4 rounded-xl mb-4 flex items-center justify-center gap-3" style="background-color: #d1fae5; color: #15803d; padding: 16px; border-radius: 12px; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; gap: 12px;">
        <svg class="modern-check-icon w-8 h-8" style="width: 45px; height: 45px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        <span class="font-bold text-lg" style="font-weight: 700; font-size: 18px;">Alles erledigt!</span>
      </div>

      <!-- ERLEDIGTE ARTIKEL -->
      <section v-if="completedItems.length > 0" class="flex gap-3 mb-6 completed-section"
               style="display: flex; gap: 12px; margin-bottom: 24px; margin-top: 32px;">

            <div class="category-indicator" style="background-color: var(--ks-surface-3); width: 4px; border-radius: 9999px; flex-shrink: 0; box-shadow: 0 0 10px rgba(0,0,0,0.5); opacity: 0.8;"></div>
            <div style="flex: 1;">
              <h2 style="color: var(--ks-text-muted); font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                      Erledigt <span style="background-color: var(--ks-surface-3); color: var(--ks-text-muted); padding: 2px 8px; border-radius: 9999px;">{{ completedItems.length }}</span>
                  </div>
                  <button class="clear-completed-btn-vertical" @click="clearCompleted" aria-label="Alle erledigten löschen" style="background: transparent; border: none; color: var(--ks-error); cursor: pointer; padding: 4px;">
                    <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;"><path d="M7 21q-.825 0-1.412-.587Q5 19.825 5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413Q17.825 21 17 21Zm2-4h2V8H9Zm4 0h2V8h-2Z"/></svg>
                  </button>
              </h2>
        
        <transition-group name="list" tag="div" :class="['grid grid-cols-2 gap-2 w-full pt-1', { 'is-hydrating': isInitialLoad }]">
          <div
            v-for="item in completedItems"
            :key="item.id"
            class="completed-item-card flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 hover:border-slate-500 text-slate-300 shadow-sm cursor-pointer active:scale-95 transition-all select-none"
            @click="toggleItemStatus(item)"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1 mr-1">
              <span class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
              <div class="min-w-0 flex-1">
                <div class="text-xs line-through text-slate-300 font-semibold truncate">{{ item.name }}</div>
                <div v-if="formatQuantity(item)" class="text-[10px] text-slate-500 truncate">{{ formatQuantity(item) }} {{ item.unit || '' }}</div>
              </div>
            </div>
            <button
              class="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-slate-700/50 flex-shrink-0 text-xs transition-colors"
              @click.stop="confirmDeleteItem(item)"
              aria-label="Löschen"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </transition-group>
            </div>
      </section>
    </div>

    <!-- Add Item Trigger & Thumb-Zone Meta-Tag Filter Bar -->
    <div class="input-container">
      <div class="bottom-action-inner">
        <!-- Thumb-Zone Meta-Tag Filter Bar -->
        <transition name="filter-slide">
          <div v-if="hasAnyMetaTags" class="ks-thumb-filter-bar">
            <div class="ks-thumb-filter-scroll">
              <!-- Alle Pill -->
              <button
                class="ks-thumb-filter-pill"
                :class="{ active: activeMetaFilter === 'all' }"
                @click="setMetaFilter('all')"
              >
                <span class="pill-label">Alle</span>
                <span class="pill-count">{{ totalOpenCount }}</span>
              </button>

              <!-- Dringend Pill (only if > 0) -->
              <button
                v-if="metaTagCounts.urgent > 0"
                class="ks-thumb-filter-pill pill-urgent"
                :class="{ active: activeMetaFilter === 'urgent' }"
                @click="toggleMetaFilter('urgent')"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                </svg>
                <span class="pill-label">Dringend</span>
                <span class="pill-count">{{ metaTagCounts.urgent }}</span>
              </button>

              <!-- Angebot Pill (only if > 0) -->
              <button
                v-if="metaTagCounts.offer > 0"
                class="ks-thumb-filter-pill pill-offer"
                :class="{ active: activeMetaFilter === 'offer' }"
                @click="toggleMetaFilter('offer')"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>
                </svg>
                <span class="pill-label">Angebot</span>
                <span class="pill-count">{{ metaTagCounts.offer }}</span>
              </button>

              <!-- Wenn's passt Pill (only if > 0) -->
              <button
                v-if="metaTagCounts.optional > 0"
                class="ks-thumb-filter-pill pill-optional"
                :class="{ active: activeMetaFilter === 'optional' }"
                @click="toggleMetaFilter('optional')"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2zm4 5h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <span class="pill-label">Wenn's passt</span>
                <span class="pill-count">{{ metaTagCounts.optional }}</span>
              </button>
            </div>
          </div>
        </transition>

        <div style="display: flex; gap: 8px; width: 100%;">
            <button class="add-trigger-btn" @click="openAddModal" style="flex: 1;">
                <svg viewBox="0 0 24 24"><path d="M11 19v-6H5v-2h6V5h2v6h6v2h-6v6Z"/></svg>
                <span>Artikel hinzufügen</span>
            </button>
            <button class="add-trigger-btn barcode-trigger-btn" @click="openScannerModal" aria-label="Barcode scannen" title="Barcode scannen">
                <svg viewBox="0 0 24 24" fill="currentColor" class="barcode-icon">
                  <path d="M3 4h4v2H5v2H3V4zm2 16H3v-4h2v2h2v2zm16-4h-2v2h-2v2h4v-4zm-2-12h-2V2h4v4h-2V4zM7 6h2v12H7V6zm3 0h1v12h-1V6zm2 0h3v12h-3V6zm4 0h1v12h-1V6zm2 0h1v12h-1V6z"/>
                </svg>
                <span>Barcode</span>
            </button>
        </div>
      </div>
    </div>

    <!-- Confirm Modal -->
    <ConfirmModal
      :show="showConfirmModal"
      title="Artikel löschen"
      :message="confirmMessage"
      confirmText="Löschen"
      @confirm="executeConfirmAction"
      @cancel="showConfirmModal = false"
    />

    <!-- Modal -->
    <AddItemModal
        :is-open="isAddModalOpen"
        :start-with-scanner="startScanner"
        :edit-item="itemToEdit"
        :active-items="items.filter(i => i.status === 'active')"
        @close="isAddModalOpen = false; itemToEdit = null; startScanner = false"
        @add="handleAddItem"
        @update="handleUpdateItem"
        @delete="deleteItem"
    />

    <!-- Recipe Import Modal -->
    <RecipeImportModal
        :is-open="isRecipeModalOpen"
        :list-id="listId"
        :initial-url="recipeInitialUrl"
        @close="isRecipeModalOpen = false; recipeInitialUrl = ''"
        @imported="handleRecipeImported"
    />

  </div>
</template>

<style scoped>
/* Um Platz für die doppelte Input-Bar (Chips + Input) zu machen */
.list-view-layout {
  padding-bottom: 160px; 
}

.list-title { margin: 0; font-size: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.items-section { margin-bottom: 32px; }

.category-group {
  display: flex;
  position: relative;
  margin-bottom: 8px;
  border-radius: 12px;
  overflow: hidden;
  align-items: stretch;
}


.category-lane {
  width: 24px;
  min-width: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  border-radius: 0 4px 4px 0;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  background: transparent !important;
  color: var(--ks-text-muted) !important;
  position: relative;
  overflow: visible;
}

.category-lane::before {
  content: '';
  position: absolute;
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 2px;
  background: currentColor;
  box-shadow: 0 0 10px currentColor;
}

.category-name {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: currentColor;
  white-space: nowrap;
}

.category-count {
  font-size: 10px;
  font-weight: 600;
  color: currentColor;
  margin-bottom: 8px;
  background: rgba(0,0,0,0.2);
  padding: 2px 6px;
  border-radius: 10px;
}


.completed-badge {
  background: var(--ks-surface-3); color: var(--ks-text-muted);
}
.clear-completed-btn {
  background: transparent;
  border: 1px solid var(--ks-border);
  color: var(--ks-error);
  padding: 4px 10px;
  border-radius: var(--ks-radius-xs);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.clear-completed-btn svg { width: 14px; height: 14px; fill: currentColor; }


.ks-grid {
  display: grid;

  gap: 8px;
  align-items: start;
}

.grid-card {
  display: flex; flex-direction: column;
  border-radius: 1.1rem;
  padding: 10px 8px;
  cursor: pointer; text-align: center;
  position: relative;
  background: #1e293b !important;
  border: 1px solid rgba(255, 255, 255, 0.07);
  min-height: 172px;
  height: 100%;
  overflow: hidden;
  justify-content: space-between;
  align-items: center;
  color: white !important;
  touch-action: manipulation;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  transition: transform 0.12s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s ease, border-color 0.2s ease;
}

.grid-card:hover {
  border-color: rgba(255, 255, 255, 0.14);
}

.grid-card:active {
  transform: scale(0.97);
}

.grid-card-glow {
  position: absolute;
  top: -16px;
  right: -16px;
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  filter: blur(24px);
  opacity: 0.15;
  pointer-events: none;
}

.card-icon-area {
  display: flex; justify-content: center; align-items: center;
  width: 100%;
  position: relative;
  z-index: 1;
}

.icon-svg-container {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.card-text-area {
  display: flex; flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 38px;
  width: 100%;
  margin: 4px 0 6px;
  position: relative;
  z-index: 1;
  overflow: hidden;
}

.item-name {
  font-size: 13px; font-weight: 600; line-height: 1.25;
  white-space: nowrap; overflow: hidden;
  width: 100%;
  padding: 0 4px;
  color: #f8fafc;
  display: block;
  text-align: center;
}

.item-name-text {
  display: inline-block;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Marquee Ping-Pong bei langen Namen */
.item-name.has-marquee {
  display: block;
  text-align: left;
  mask-image: linear-gradient(90deg, transparent 0%, black 8px, black calc(100% - 8px), transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 8px, black calc(100% - 8px), transparent 100%);
}

.item-name.has-marquee .item-name-text {
  max-width: none !important;
  overflow: visible;
  text-overflow: clip;
  padding-left: 4px;
  animation: marquee-pingpong 6s ease-in-out infinite alternate;
}

@keyframes marquee-pingpong {
  0%, 25% { transform: translateX(0); }
  75%, 100% { transform: translateX(calc(-1 * var(--marquee-dist, calc(100% - 75px)))); }
}

.item-icon-container {
  width: 100%;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.completed-item-card {
  min-height: 44px;
  touch-action: manipulation;
}

.list-view-layout.modal-open {
  overflow: hidden !important;
}

.item-regular-tags {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.2;
  width: 100%;
  padding: 0 4px;
  height: 14px;
  display: block;
  text-align: center;
}

.item-regular-tags-text {
  display: inline-block;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Marquee Ping-Pong bei langen Tags/Constellations */
.item-regular-tags.has-marquee {
  text-align: left;
  mask-image: linear-gradient(90deg, transparent 0%, black 6px, black calc(100% - 6px), transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 6px, black calc(100% - 6px), transparent 100%);
}

.item-regular-tags.has-marquee .item-regular-tags-text {
  max-width: none !important;
  overflow: visible;
  text-overflow: clip;
  padding-left: 2px;
  animation: marquee-pingpong-tags 7s ease-in-out infinite alternate;
}

@keyframes marquee-pingpong-tags {
  0%, 25% { transform: translateX(0); }
  75%, 100% { transform: translateX(calc(-1 * var(--marquee-dist, calc(100% - 75px)))); }
}

.quantity-controls {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-top: auto;
  position: relative;
  z-index: 1;
}
.qty-btn {
  width: 2rem; height: 2rem;
  border-radius: 999px;
  border: none;
  background: #334155;
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: bold; cursor: pointer;
}
.qty-val {
  font-size: 12px; font-weight: 600; min-width: 24px; text-align: center;
}


.delete-btn {
  position: absolute; top: -8px; right: -8px;
  width: 44px; height: 44px; border: none; border-radius: 50%;
  background: var(--ks-surface-4); color: var(--ks-error);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3); cursor: pointer;
  z-index: 2; /* ensure it's on top of the card */
}
.delete-btn svg { width: 22px; height: 22px; fill: currentColor; }

.empty-state { text-align: center; padding: 40px 0; color: var(--ks-text-muted); }
.empty-state svg { width: 40px; height: 40px; opacity: 0.5; margin-bottom: 8px; fill: currentColor; margin-inline: auto; }

.input-container {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(0deg, var(--ks-bg) 70%, transparent);
  padding: 0 16px max(24px, env(safe-area-inset-bottom));
  display: flex; justify-content: center;
  z-index: 40; pointer-events: none;
}
.input-container > * { pointer-events: auto; }

.add-trigger-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; max-width: var(--ks-page-width);
  min-height: 56px;
  background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
  color: #ffffff;
  border: none; border-radius: 20px;
  padding: 14px 20px; font-size: 15px; font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 25px -4px rgba(56, 189, 248, 0.4), 0 4px 12px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, filter 0.15s ease, box-shadow 0.2s ease;
}
.add-trigger-btn:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.add-trigger-btn:active {
  transform: scale(0.98);
}
.add-trigger-btn svg { width: 22px; height: 22px; fill: currentColor; }

.barcode-trigger-btn {
  flex-shrink: 0;
  width: auto;
  min-height: 56px;
  padding: 0 16px;
  gap: 8px;
  border-radius: 18px;
  background: rgba(30, 41, 59, 0.95);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.2s ease;
}
.barcode-trigger-btn:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
}
.barcode-trigger-btn:active {
  transform: scale(0.95);
}
.barcode-trigger-btn svg {
  width: 22px;
  height: 22px;
}

/* Modal & Sheets */
.sheet-heading { font-size: 20px; font-weight: 500; margin: 0 0 8px; color: var(--ks-text); }
.sheet-support { font-size: 14px; color: var(--ks-text-muted); margin: 0 0 20px; line-height: 1.4; }

.code-box {
  width: 100%; background: var(--ks-surface-3); border: none;
  border-radius: var(--ks-radius-xs);
  padding: 16px; display: flex; align-items: center; justify-content: center; gap: 16px;
  cursor: pointer; color: var(--ks-text);
}
.code-box .code { font-size: 24px; font-family: monospace; font-weight: 700; letter-spacing: 4px; }
.code-box svg { width: 24px; height: 24px; fill: currentColor; opacity: 0.6; }

/* Modern KaufSync Activities (Changelog) */
.ks-activity-filter-bar {
  display: flex;
  gap: 8px;
}
.ks-activity-chip {
  padding: 6px 14px;
  border-radius: 9999px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--ks-text-muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
}
.ks-activity-chip:hover {
  color: var(--ks-text);
  border-color: rgba(255, 255, 255, 0.16);
}
.ks-activity-chip.active {
  background: var(--ks-primary);
  color: #ffffff;
  border-color: var(--ks-primary);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
}

.changelog-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 20px;
}
.ks-activity-day-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ks-activity-date-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 4px 0 2px;
}
.ks-activity-date-pill span {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ks-text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 3px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.ks-activity-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.ks-activity-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ks-activity-user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ks-activity-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
}
.ks-activity-user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ks-activity-username {
  font-size: 14px;
  font-weight: 600;
  color: var(--ks-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ks-activity-time {
  font-size: 11px;
  color: var(--ks-text-muted);
}

.ks-activity-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 9999px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ks-badge-added {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.ks-badge-completed {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.ks-badge-reactivated {
  background: rgba(251, 146, 60, 0.15);
  color: #fb923c;
  border: 1px solid rgba(251, 146, 60, 0.3);
}
.ks-badge-deleted {
  background: rgba(244, 63, 94, 0.15);
  color: #f43f5e;
  border: 1px solid rgba(244, 63, 94, 0.3);
}
.ks-badge-default {
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.ks-activity-items-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 2px;
}
.ks-activity-item-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 5px 10px 5px 6px;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.ks-activity-item-chip:hover {
  border-color: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}
.ks-activity-item-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.ks-activity-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
}

.ks-activity-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  text-align: center;
  color: var(--ks-text-muted);
}
.ks-activity-empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
  opacity: 0.8;
}
.ks-activity-empty-text {
  font-size: 14px;
  margin: 0;
  max-width: 280px;
  line-height: 1.4;
}

/* Tags/Chips (reused from AddItemModal) */
.tag-group { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-chip { padding: 8px 16px; border-radius: 20px; background: var(--ks-surface-2); border: 1px solid transparent; color: var(--ks-text); cursor: pointer; font-size: 14px; font-weight: 500; }
.tag-chip.active { background: var(--ks-primary-container); color: var(--ks-primary); border-color: var(--ks-primary); }
.tag-pill-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-right: 4px; }

/* Sort List */
.sort-list {
  display: flex; flex-direction: column; gap: 8px;
}
.sort-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  background: rgba(30, 41, 59, 0.75);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: grab;
  user-select: none;
  transition: border-color 0.2s ease, transform 0.15s ease;
}
.sort-item:active {
  cursor: grabbing;
  transform: scale(0.99);
  border-color: rgba(56, 189, 248, 0.4);
}
.sort-category-glow-bar {
  width: 4px;
  height: 22px;
  border-radius: 999px;
  flex-shrink: 0;
}
.sort-info { display: flex; align-items: center; gap: 12px; font-weight: 500; }
.sort-actions { display: flex; gap: 4px; }
.small-btn { width: 36px; height: 36px; }
.small-btn:disabled { opacity: 0.2; pointer-events: none; }
.full-width { width: 100%; }

.share-section { margin-top: 16px; }
.section-label { font-size: 14px; font-weight: 500; color: var(--ks-text-muted); margin-bottom: 8px; }
.mt-4 { margin-top: 24px; }
.search-box { background: var(--ks-surface-2); border-radius: 12px; padding: 4px 12px; display: flex; align-items: center; }
.search-input { width: 100%; background: transparent; border: none; padding: 12px 0; color: var(--ks-text); outline: none; }
.search-input::placeholder { color: var(--ks-text-muted); }
.search-results { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
.user-result-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--ks-surface-3); border-radius: 12px; }
.user-info { display: flex; flex-direction: column; flex: 1; min-width: 0; padding-right: 12px; }
.user-name { font-weight: 500; color: var(--ks-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-email { font-size: 12px; color: var(--ks-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.no-results { color: var(--ks-text-muted); font-size: 14px; margin-top: 12px; text-align: center; }

.ks-grid {
  position: relative;
}

.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.18s cubic-bezier(0.2, 0, 0, 1);
}

.is-hydrating.list-move,
.is-hydrating .list-move,
.is-hydrating .list-enter-active,
.is-hydrating .list-leave-active {
  transition: none !important;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.list-leave-active {
  position: absolute;
  pointer-events: none;
}

/* SETTINGS MENU SHEET */
.settings-menu-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
}
.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  width: 100%;
}
.settings-menu-item:hover, .settings-menu-item:active {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(56, 189, 248, 0.35);
  transform: translateX(3px);
}
.settings-menu-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.share-icon-bg { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.history-icon-bg { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
.view-icon-bg { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.sort-icon-bg { background: rgba(251, 146, 60, 0.15); color: #fb923c; }

.settings-menu-content {
  flex: 1;
  min-width: 0;
}
.settings-menu-title {
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 2px;
}
.settings-menu-desc {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.settings-menu-arrow {
  font-size: 22px;
  color: #64748b;
  font-weight: 300;
  margin-left: 6px;
}
.settings-menu-badge {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  font-weight: 600;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

/* KEEP AWAKE BUTTON */
.keep-awake-btn {
  color: var(--ks-text-muted);
  position: relative;
  transition: all 0.25s ease;
}
.keep-awake-btn.is-active {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
  border-color: rgba(245, 158, 11, 0.4);
}

/* SWITCH PILL (LISTEN OPTIONEN) */
.ks-switch-pill {
  width: 44px;
  height: 24px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  position: relative;
  transition: background 0.2s ease, box-shadow 0.2s ease;
  flex-shrink: 0;
}
.ks-switch-pill.is-on {
  background: #f59e0b;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
}
.ks-switch-thumb {
  width: 18px;
  height: 18px;
  background: #ffffff;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: transform 0.2s ease;
}
.ks-switch-pill.is-on .ks-switch-thumb {
  transform: translateX(20px);
}

/* THUMB-ZONE META-TAG FILTER BAR */
.list-view-layout.has-meta-filters {
  padding-bottom: 210px;
}

.bottom-action-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: var(--ks-page-width);
}

.ks-thumb-filter-bar {
  width: 100%;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.ks-thumb-filter-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  width: 100%;
}
.ks-thumb-filter-scroll::-webkit-scrollbar {
  display: none;
}

.ks-thumb-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9999px;
  background: rgba(30, 41, 59, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--ks-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.ks-thumb-filter-pill:active {
  transform: scale(0.95);
}

.ks-thumb-filter-pill.active {
  background: var(--ks-primary);
  color: #ffffff;
  border-color: var(--ks-primary);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
}

.ks-thumb-filter-pill.pill-urgent.active {
  background: #f43f5e;
  border-color: #f43f5e;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(244, 63, 94, 0.45);
}

.ks-thumb-filter-pill.pill-offer.active {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.45);
}

.ks-thumb-filter-pill.pill-optional.active {
  background: #10b981;
  border-color: #10b981;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.45);
}

.pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.15);
  color: inherit;
}

.ks-thumb-filter-pill.active .pill-count {
  background: rgba(255, 255, 255, 0.25);
}

.filter-slide-enter-active,
.filter-slide-leave-active {
  transition: all 0.25s ease;
}
.filter-slide-enter-from,
.filter-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* EMPTY FILTER STATE */
.empty-filter-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
}
.empty-filter-icon {
  font-size: 36px;
  margin-bottom: 12px;
}
.empty-filter-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ks-text);
  margin: 0 0 4px;
}
.empty-filter-desc {
  font-size: 13px;
  color: var(--ks-text-muted);
  margin: 0 0 20px;
}

/* SNACKBAR VARIANTS */
.ks-snackbar--info {
  background: rgba(30, 41, 59, 0.95);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fbbf24;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.ks-snackbar--filter {
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 14px;
}
.ks-filter-notice-btn {
  background: var(--ks-primary);
  color: #ffffff;
  border: none;
  border-radius: 9999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
</style>
