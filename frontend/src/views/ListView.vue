<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiUrl, wsUrl } from '../config/api';
import CategoryIcon from '../components/CategoryIcon.vue';
import AddItemModal from '../components/AddItemModal.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import Sortable from 'sortablejs';
import QrcodeVue from 'qrcode.vue';

const route = useRoute();
const router = useRouter();
const listId = route.params.id;

const items = ref([]);
const currentList = ref(null);
const newItemName = ref('');
const isAddModalOpen = ref(false);
const startScanner = ref(false);
const itemToEdit = ref(null);
const errorMessage = ref('');
const showConfirmModal = ref(false);
const confirmMessage = ref('');
const confirmAction = ref(null);
const successMessage = ref('');
const showShareSheet = ref(false);
const showSortSheet = ref(false);
const showChangelogSheet = ref(false);
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
const isOnline = ref(navigator.onLine);

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
    return typeof tagsStr === 'string' ? JSON.parse(tagsStr) : tagsStr;
  } catch (e) {
    return [];
  }
};

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
    categoryOrder.value = JSON.parse(saved);
    isCustomOrder.value = true;
  } else {
    isCustomOrder.value = false;
    const chainKey = currentChainKey.value;
    if (chainKey && chainsConfig[chainKey]) {
      categoryOrder.value = [...chainsConfig[chainKey].defaultOrder];
    } else {
      categoryOrder.value = predefinedCategories.map(c => c.name);
    }
  }
};

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

    currentList.value = lists.find(l => l.id === listId);
    if (currentList.value) items.value = currentList.value.items;
  } catch (error) {
    const cachedData = localStorage.getItem('cachedLists');
    if (cachedData) {
      const lists = JSON.parse(cachedData);
      currentList.value = lists.find(l => l.id === listId);
      if (currentList.value) items.value = currentList.value.items;
    } else {
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
    const originalItem = { ...items.value[index] };
    items.value[index] = { ...items.value[index], ...updatedPayload };
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl(`/api/items/${updatedPayload.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updatedPayload)
      });
      if (!response.ok) throw new Error('API Fehler');
    } catch (error) {
      items.value[index] = originalItem;
      errorMessage.value = "Offline: Konnte Artikel nicht aktualisieren.";
    }
  }
};

const handleAddItem = async (itemPayload) => {
  // Optimistisches Update
  const tempId = 'temp-' + Date.now();
  const newItem = {
    id: tempId,
    name: itemPayload.name,
    quantity: itemPayload.quantity || 1,
    unit: itemPayload.unit || 'Stk',
    category: itemPayload.category,
    tags: itemPayload.tags,
    status: 'active'
  };
  
  items.value.push(newItem);

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/lists/${listId}/items`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ 
        name: itemPayload.name,
        quantity: itemPayload.quantity || 1,
        unit: itemPayload.unit || 'Stk',
        category: itemPayload.category,
        tags: itemPayload.tags
      })
    });
    
    if (response.ok) {
      const savedItem = await response.json();
      items.value = items.value.filter(i => i.id !== tempId);
      const alreadyAddedViaWS = items.value.some(i => i.id === savedItem.id);
      if (!alreadyAddedViaWS) {
        items.value.push(savedItem);
      }
    } else {
      throw new Error('API Fehler');
    }
  } catch (error) { 
    items.value = items.value.filter(i => i.id !== tempId);
    errorMessage.value = "Fehler beim Hinzufügen."; 
  }
};

const processOfflineQueue = async () => {
  const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
  if (queue.length === 0) return;

  const token = localStorage.getItem('token');
  const remainingQueue = [];
  for (const action of queue) {
    try {
      if (action.type === 'TOGGLE_STATUS') {
        await fetch(apiUrl(`/api/items/${action.itemId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ status: action.newStatus })
        });
      }
    } catch (error) {
      remainingQueue.push(action);
    }
  }
  localStorage.setItem('offlineQueue', JSON.stringify(remainingQueue));
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

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/items/${item.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus })
    });
    if (!response.ok) throw new Error('API Fehler');
  } catch (error) {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    queue.push({ type: 'TOGGLE_STATUS', itemId: item.id, newStatus: newStatus });
    localStorage.setItem('offlineQueue', JSON.stringify(queue));
  }
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
    for (const id of completedIds) {
      await deleteItem(id);
    }
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
  const previousItems = [...items.value];
  items.value = items.value.filter(i => i.id !== itemId);
  
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/items/${itemId}`), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error();
  } catch (error) {
    items.value = previousItems;
    errorMessage.value = "Fehler beim Löschen.";
  }
};

const loadChangelog = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl(`/api/lists/${listId}/changelog`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      changelog.value = await response.json();
    }
  } catch (error) {
    console.error("Fehler beim Laden des Changelogs", error);
  }
};

const openChangelog = () => {
  showChangelogSheet.value = true;
  loadChangelog();
};

const filteredChangelog = computed(() => {
  let logs = changelog.value;
  if (changelogFilter.value === 'added') logs = logs.filter(log => log.action_type === 'added');
  if (changelogFilter.value === 'completed') logs = logs.filter(log => log.action_type === 'completed');

  const grouped = [];

  logs.forEach(log => {
      const d = new Date(log.created_at + 'Z');
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dayKey = '';
      if (d.toDateString() === today.toDateString()) {
          dayKey = `Heute – ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
      } else if (d.toDateString() === yesterday.toDateString()) {
          dayKey = `Gestern – ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
      } else {
          dayKey = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      }

      let dayGroup = grouped.find(g => g.day === dayKey);
      if (!dayGroup) {
          dayGroup = { day: dayKey, actions: [] };
          grouped.push(dayGroup);
      }

      const userName = log.user_name || 'Unbekannt';
      const actionType = log.action_type;

      let actionGroup = dayGroup.actions.find(a => a.userName === userName && a.actionType === actionType);
      if (!actionGroup) {
          actionGroup = { userName, actionType, items: [] };
          dayGroup.actions.push(actionGroup);
      }

      actionGroup.items.push(log.item_name);
  });

  return grouped;
});

const formatChangelogActionText = (userName, actionType, count) => {
  const map = {
    'added': 'hinzugefügt',
    'completed': 'abgehakt',
    'deleted': 'entfernt',
    'reactivated': 'wiederhergestellt'
  };
  const actionWord = map[actionType] || actionType;
  return `${userName} hat ${count} Artikel ${actionWord}`;
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
    }
  } catch (err) {
    errorMessage.value = "Fehler beim Freischalten.";
    setTimeout(() => errorMessage.value = '', 3000);
  }
};

const rejectJoinRequest = async (requestId) => {
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
    }
  } catch (err) {
    errorMessage.value = "Fehler beim Ablehnen.";
    setTimeout(() => errorMessage.value = '', 3000);
  }
};

const shareOrCopyLink = async () => {
  if (!currentList.value) return;
  const joinLink = `${window.location.origin}/join?code=${currentList.value.share_code}`;
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
  const activeItems = items.value.filter(i => i.status === 'active');
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
  return Object.values(groups).sort((a, b) => {
    let indexA = categoryOrder.value.indexOf(a.name);
    let indexB = categoryOrder.value.indexOf(b.name);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });
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
  if (regular.length <= 2) return regular.join(', ');
  return regular.slice(0, 2).join(', ') + '...';
};


onMounted(() => {
  loadItems(); // loadItems ruft am Ende loadCategoryOrder() auf
  loadCurrentUser();
  setupWebSocket();
  processOfflineQueue();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
});

onUnmounted(() => {
  isViewUnmounted = true;
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
  <div class="page-shell list-view-layout" :class="{ 'modal-open': isAddModalOpen }" @click="showShareSheet = false; showSortSheet = false; showChangelogSheet = false;">

    <header class="page-topbar" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
        <img src="/android-chrome-512x512.png" alt="KaufSync Logo" style="width: 24px; height: 24px; object-fit: contain; margin-right: 4px;">
        <button class="ks-icon-btn" @click.stop="router.push('/')" aria-label="Zurück">
          <svg viewBox="0 0 24 24"><path d="M11.175 19 4 12l7.175-7 1.425 1.4L7.85 11H20v2H7.85l4.75 4.6Z"/></svg>
        </button>
        <h1 class="list-title">{{ currentList ? currentList.name : 'Laden...' }}</h1>
      </div>
      <div style="display: flex; gap: 8px;">

        <button class="ks-icon-btn" @click.stop="openChangelog" aria-label="Aktivitätenprotokoll">
           <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
        </button>
        <button class="ks-icon-btn" @click.stop="toggleCompactView" aria-label="Ansicht anpassen">
           <svg v-if="isCompactView" viewBox="0 0 24 24"><path d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"/></svg>
           <svg v-else viewBox="0 0 24 24"><path d="M4 18h17v-6H4v6zM4 5v6h17V5H4z"/></svg>
        </button>
        <button class="ks-icon-btn" @click.stop="showSortSheet = !showSortSheet" aria-label="Kategorien sortieren">
           <svg viewBox="0 0 24 24"><path d="M3 18v-2h6v2H3Zm0-5v-2h12v2H3Zm0-5V6h18v2H3Z"/></svg>
        </button>
        <button v-if="currentList" class="ks-icon-btn" @click.stop="showShareSheet = !showShareSheet" aria-label="Teilen">
          <svg viewBox="0 0 24 24"><path d="M18 22q-1.25 0-2.125-.875T15 19q0-.15.025-.325.025-.175.075-.325L7.05 13.7q-.425.4-.95.65-.525.25-1.1.25-1.25 0-2.125-.875T2 11.4q0-1.25.875-2.125T5 8.4q.575 0 1.1.25.525.25.95.65l8.05-4.65q-.05-.15-.075-.325Q15 4.15 15 4q0-1.25.875-2.125T18 1q1.25 0 2.125.875T21 4q0 1.25-.875 2.125T18 7q-.575 0-1.1-.25-.525-.25-.95-.65L7.9 10.75q.05.15.075.325.025.175.025.325 0 .15-.025.325-.025.175-.075.325l8.05 4.65q.425-.4.95-.65.525-.25 1.1-.25 1.25 0 2.125.875T21 19q0 1.25-.875 2.125T18 22Z"/></svg>
        </button>
      </div>
    </header>

    <!-- SHARE SHEET -->
    <transition name="scrim-fade">
      <div v-if="showShareSheet || showSortSheet || showChangelogSheet" class="ks-sheet-scrim" @click="showShareSheet = false; showSortSheet = false; showChangelogSheet = false;"></div>
    </transition>

    <transition name="sheet-slide">
      <div v-if="showShareSheet" class="ks-sheet" @click.stop>
        <div class="ks-sheet__handle"></div>
        <h3 class="sheet-heading">Liste teilen</h3>

        <div class="share-section" style="display: flex; flex-direction: column; gap: 14px;">
          <p class="sheet-support" style="margin: 0; font-size: 13px; line-height: 1.4;">
            Über diesen Link kann jeder eine Beitrittsanfrage stellen. Du als Besitzer musst neue Mitglieder erst freigeben.
          </p>

          <button class="ks-btn-filled full-width" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px;" @click="shareOrCopyLink">
             <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
             Einladungs-Link teilen / kopieren
          </button>
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
                  class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-sm active:scale-95 transition-all"
                  @click="approveJoinRequest(req.id)"
                >
                  Zulassen
                </button>
                <button
                  class="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-rose-500/30 hover:text-rose-300 text-slate-300 font-semibold text-xs transition-all"
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
      <div v-if="showChangelogSheet" class="ks-sheet" @click.stop>
        <div class="ks-sheet__handle"></div>
        <div class="modal-header" style="justify-content: space-between; margin-bottom: 16px;">
            <h3 class="sheet-heading" style="margin: 0;">Aktivitäten</h3>
            <button class="close-btn ks-icon-btn" @click="showChangelogSheet = false">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
        </div>

        <div class="tag-group" style="margin-bottom: 16px;">
            <button class="ks-chip tag-chip" :class="{ active: changelogFilter === 'all' }" @click="changelogFilter = 'all'">Alle</button>
            <button class="ks-chip tag-chip" :class="{ active: changelogFilter === 'added' }" @click="changelogFilter = 'added'">Hinzugefügt</button>
            <button class="ks-chip tag-chip" :class="{ active: changelogFilter === 'completed' }" @click="changelogFilter = 'completed'">Abgehakt</button>
        </div>

        <div class="changelog-list" style="max-height: 50vh; overflow-y: auto; padding-right: 8px;">
            <div v-for="dayGroup in filteredChangelog" :key="dayGroup.day" class="changelog-day-group">
                <div v-for="(actionGroup, index) in dayGroup.actions" :key="index" class="changelog-action-group">
                    <div class="changelog-group-header">
                        <div class="changelog-avatar">{{ getInitial(actionGroup.userName) }}</div>
                        <div class="changelog-group-title">
                            <span class="changelog-day">{{ dayGroup.day }}</span>
                            <span class="changelog-action-text">{{ formatChangelogActionText(actionGroup.userName, actionGroup.actionType, actionGroup.items.length) }}</span>
                        </div>
                    </div>
                    <div class="changelog-items-list">
                        <div v-for="(itemName, idx) in actionGroup.items" :key="idx" class="changelog-item-row">
                            <CategoryIcon class="changelog-item-icon" :name="itemName" size="24" color="var(--ks-text-muted)" />
                            <span class="changelog-item-name">{{ itemName }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="filteredChangelog.length === 0" class="empty-state">
                Keine Aktivitäten gefunden.
            </div>
        </div>
      </div>
    </transition>

    <!-- SORTIER SHEET -->
    <transition name="sheet-slide">
      <div v-if="showSortSheet" class="ks-sheet" @click.stop>
        <div class="ks-sheet__handle"></div>
        <h3 class="sheet-heading">Laufweg im Supermarkt</h3>
        <p class="sheet-support">Sortiere die Kategorien, damit sie deinem Weg durch den Markt entsprechen.</p>
        
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

        <button class="ks-btn-filled full-width" style="margin-top: 16px;" @click="showSortSheet = false">Fertig</button>
        <button v-if="isCustomOrder" class="ks-btn-text full-width" style="margin-top: 8px; color: var(--ks-error)" @click="resetCategoryOrder">
          Auf Markt-Standard zurücksetzen
        </button>
      </div>
    </transition>

    <div class="ks-snackbar-stack">
      <div v-if="!isOnline" class="ks-snackbar ks-snackbar--warning">Offline. Änderungen werden später synchronisiert.</div>
      <transition-group name="toast">
        <div v-if="errorMessage" key="err" class="ks-snackbar ks-snackbar--error">{{ errorMessage }}</div>
        <div v-if="successMessage" key="succ" class="ks-snackbar ks-snackbar--success">{{ successMessage }}</div>
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

            <transition-group name="list" tag="div" class="ks-grid items-grid grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 w-full">
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
                <span class="item-name" :class="{ 'has-marquee': item.name.length > 11 }">
                  <span class="item-name-text">{{ item.name }}</span>
                </span>
                <span class="item-regular-tags" :class="{ 'invisible': !getRegularTags(item.tags).length, 'has-marquee': formatTags(item.tags).length > 13 }">
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
          <transition-group name="list" tag="div" class="ks-grid items-grid grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 w-full" style="padding-top: 0;">
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
                <span class="item-name" :class="{ 'has-marquee': item.name.length > 11 }">
                  <span class="item-name-text">{{ item.name }}</span>
                </span>
                <span class="item-regular-tags" :class="{ 'invisible': !getRegularTags(item.tags).length, 'has-marquee': formatTags(item.tags).length > 13 }">
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
        
        <transition-group name="list" tag="div" class="grid grid-cols-2 gap-2 w-full pt-1">
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

    <!-- Add Item Trigger -->
    <div class="input-container">
        <div style="display: flex; gap: 8px; width: 100%; max-width: var(--ks-page-width);">
            <button class="add-trigger-btn" @click="openAddModal" style="flex: 1;">
                <svg viewBox="0 0 24 24"><path d="M11 19v-6H5v-2h6V5h2v6h6v2h-6v6Z"/></svg>
                Neuen Artikel hinzufügen
            </button>
            <button class="add-trigger-btn barcode-trigger-btn" @click="openScannerModal" aria-label="Scanner öffnen">
                <svg viewBox="0 0 24 24" fill="currentColor" class="barcode-icon">
                  <path d="M3 4h4v2H5v2H3V4zm2 16H3v-4h2v2h2v2zm16-4h-2v2h-2v2h4v-4zm-2-12h-2V2h4v4h-2V4zM7 6h2v12H7V6zm3 0h1v12h-1V6zm2 0h3v12h-3V6zm4 0h1v12h-1V6zm2 0h1v12h-1V6z"/>
                </svg>
            </button>
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
  75%, 100% { transform: translateX(calc(-100% + 75px)); }
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
  75%, 100% { transform: translateX(calc(-100% + 75px)); }
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
  width: 56px;
  height: 56px;
  padding: 0;
  border-radius: 18px;
  background: rgba(30, 41, 59, 0.95);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
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

/* Changelog */
.changelog-list { display: flex; flex-direction: column; gap: 24px; padding-bottom: 24px; }
.changelog-day-group { display: flex; flex-direction: column; gap: 20px; }
.changelog-action-group { display: flex; flex-direction: column; gap: 12px; background: var(--ks-surface-2); padding: 16px; border-radius: 12px; }
.changelog-group-header { display: flex; align-items: center; gap: 12px; }
.changelog-avatar { width: 40px; height: 40px; border-radius: 50%; background: #a58f84; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 18px; flex-shrink: 0; }
.changelog-group-title { display: flex; flex-direction: column; gap: 2px; }
.changelog-day { font-size: 13px; color: var(--ks-text-muted); }
.changelog-action-text { font-size: 15px; font-weight: 600; color: var(--ks-text); }
.changelog-items-list { display: flex; flex-direction: column; gap: 8px; margin-left: 12px; border-left: 2px solid var(--ks-primary); padding-left: 12px; padding-top: 4px; padding-bottom: 4px; }
.changelog-item-row { display: flex; align-items: center; gap: 12px; }
.changelog-item-icon { width: 24px; height: 24px; color: var(--ks-text); }
.changelog-item-name { font-size: 15px; font-weight: 600; color: var(--ks-text); }

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

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.list-leave-active {
  position: absolute;
  pointer-events: none;
}
</style>
