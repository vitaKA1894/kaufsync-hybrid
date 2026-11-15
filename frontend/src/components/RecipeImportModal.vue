<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { apiUrl } from '../config/api';
import CategoryIcon from './CategoryIcon.vue';
import { parseRecipeClientSide } from '../utils/clientRecipeParser';
import { useBottomSheetDrag } from '../utils/useBottomSheetDrag';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  listId: {
    type: String,
    default: ''
  },
  initialUrl: {
    type: String,
    default: ''
  },
  shoppingLists: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'imported', 'list-created']);

// State
const url = ref('');
const isLoading = ref(false);
const isImporting = ref(false);
const errorMessage = ref('');
const recipeData = ref(null);
const currentServings = ref(4);
const inputRef = ref(null);

// Sheet Dragging Logic
const {
  sheetRef,
  sheetStyle,
  onTouchStart,
  onTouchMove,
  onTouchEnd
} = useBottomSheetDrag(() => emit('close'), 100);

// Predefined Categories for manual adjustments
const predefinedCategories = [
  'Obst & Gemüse',
  'Brot & Backwaren',
  'Fleisch & Fisch',
  'Milchprodukte & Tiefkühlkost',
  'Vorratskammer',
  'Getränke & Genussmittel',
  'Drogerie, Haushalt & Tierbedarf',
  'Sonstiges'
];

// Inline Ingredient Editing State
const editingIndex = ref(null);
const editForm = ref({
  name: '',
  display_amount: '',
  category: 'Sonstiges'
});

const startEditItem = (idx) => {
  const it = recipeData.value?.ingredients?.[idx];
  if (!it) return;
  editingIndex.value = idx;
  editForm.value = {
    name: it.name,
    display_amount: it.display_amount || (it.quantity ? `${it.quantity} ${it.unit || 'Stk'}` : ''),
    category: it.category || 'Sonstiges'
  };
};

const cancelEditItem = () => {
  editingIndex.value = null;
};

const saveEditItem = (idx) => {
  const it = recipeData.value?.ingredients?.[idx];
  if (!it) return;
  const newName = editForm.value.name.trim();
  if (newName) {
    it.name = newName;
  }
  it.category = editForm.value.category || 'Sonstiges';
  const newAmount = editForm.value.display_amount.trim();
  it.display_amount = newAmount;
  if (newAmount) {
    it.tags = [newAmount];
  }
  it.selected = true; // Ensure edited item is selected
  editingIndex.value = null;
};

// Target list selection & quick creation
const selectedListId = ref(props.listId || '');
const availableLists = ref([]);
const isCreatingListLoading = ref(false);

const loadAvailableLists = async () => {
  if (props.shoppingLists && props.shoppingLists.length > 0) {
    availableLists.value = [...props.shoppingLists];
  } else {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await fetch(apiUrl('/api/lists'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        availableLists.value = await response.json();
      }
    } catch (err) {
      console.error('Fehler beim Laden der Listen:', err);
    }
  }

  // Pre-select if listId passed
  if (props.listId) {
    selectedListId.value = props.listId;
  } else {
    selectedListId.value = '';
  }
};

// Reset state
const resetState = () => {
  url.value = props.initialUrl || '';
  isLoading.value = false;
  isImporting.value = false;
  errorMessage.value = '';
  recipeData.value = null;
  currentServings.value = 4;
  selectedListId.value = props.listId || '';
  isCreatingListLoading.value = false;
};

watch(() => props.isOpen, async (newVal) => {
  if (newVal) {
    await loadAvailableLists();
    if (props.initialUrl) {
      url.value = props.initialUrl;
      fetchRecipe();
    } else {
      nextTick(() => {
        if (inputRef.value) inputRef.value.focus();
      });
    }
  } else {
    resetState();
  }
});

watch(() => props.shoppingLists, (newVal) => {
  if (newVal && newVal.length > 0) {
    availableLists.value = [...newVal];
  }
}, { deep: true });

// Paste from clipboard helper
const pasteFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      url.value = text.trim();
      errorMessage.value = '';
    }
  } catch (err) {
    // Clipboard permission denied or unavailable
  }
};

// Fetch & parse recipe
const fetchRecipe = async () => {
  const targetUrl = url.value.trim();
  if (!targetUrl) {
    errorMessage.value = 'Bitte gib eine Rezept-URL ein.';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  recipeData.value = null;

  try {
    const token = localStorage.getItem('token');
    let data = null;

    try {
      const response = await fetch(apiUrl('/api/recipes/parse'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url: targetUrl })
      });

      if (response.ok) {
        data = await response.json();
      } else if (response.status === 405 || response.status === 404) {
        // Backend noch nicht aktualisiert -> Client-seitiger Fallback-Parser
        data = await parseRecipeClientSide(targetUrl);
      } else {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Rezept konnte nicht geladen werden.');
      }
    } catch (netErr) {
      // Wenn der Server nicht erreichbar ist oder Endpoint fehlt, nutze Client-Parser
      if (!data) {
        data = await parseRecipeClientSide(targetUrl);
      }
    }

    if (!data) {
      throw new Error('Kein Rezept mit strukturierten Zutaten gefunden.');
    }

    if (data && data.ingredients) {
      data.ingredients.forEach(item => {
        if (item.selected === undefined) {
          item.selected = true;
        }
      });
    }

    recipeData.value = data;
    currentServings.value = data.servings || 4;
  } catch (err) {
    errorMessage.value = err.message || 'Verbindung zum Server fehlgeschlagen.';
  } finally {
    isLoading.value = false;
  }
};

// Portions scaling
const baseServings = computed(() => recipeData.value?.servings || 4);

const updateServings = (delta) => {
  const next = currentServings.value + delta;
  if (next < 1) return;
  currentServings.value = next;

  // Scale quantities
  if (recipeData.value && recipeData.value.ingredients) {
    const factor = currentServings.value / baseServings.value;
    recipeData.value.ingredients.forEach(item => {
      const origRecipeQty = item.recipe_quantity ?? item.base_quantity;
      const unit = item.recipe_unit || item.unit || '';
      const uClean = unit.toLowerCase().replace(/\.$/, '');
      const isWeightOrVol = ['g', 'gramm', 'kg', 'kilogramm', 'ml', 'milliliter', 'cl', 'dl', 'l', 'liter'].includes(uClean);
      const isSpoonOrPinch = ['el', 'esslöffel', 'tl', 'teelöffel', 'prise', 'prisen', 'msp', 'msp.', 'n.b.', 'n. b.'].includes(uClean);
      const isContainer = ['dose', 'dosen', 'becher', 'glas', 'gläser', 'packung', 'pck', 'pck.', 'bund', 'bündel', 'flasche', 'fl.'].includes(uClean);

      if (origRecipeQty != null && origRecipeQty > 0) {
        let scaledRecipeQty = origRecipeQty * factor;
        scaledRecipeQty = Math.round(scaledRecipeQty * 10) / 10;
        const qStr = Number.isInteger(scaledRecipeQty) ? scaledRecipeQty.toString() : scaledRecipeQty.toString();

        if (isWeightOrVol) {
          item.quantity = 1.0;
          item.tags = [`${qStr}${unit}`];
          item.display_amount = `${qStr} ${unit}`.trim();
        } else if (isSpoonOrPinch) {
          item.quantity = 1.0;
          item.tags = [`${qStr} ${unit}`.trim()];
          item.display_amount = `${qStr} ${unit}`.trim();
        } else if (isContainer) {
          item.quantity = Math.max(1, Math.round(scaledRecipeQty * 10) / 10);
          item.display_amount = `${qStr} ${unit}`.trim();
          if (['dose', 'dosen'].includes(uClean)) {
            item.tags = [item.quantity > 1 ? `${item.quantity} Dosen` : 'Dose'];
          } else if (['becher'].includes(uClean)) {
            item.tags = ['Becher'];
          } else if (['glas', 'gläser'].includes(uClean)) {
            item.tags = ['Glas'];
          } else if (['bund', 'bündel'].includes(uClean)) {
            item.tags = ['Bund'];
          } else {
            item.tags = [unit];
          }
        } else {
          item.quantity = Math.max(0.5, Math.round(scaledRecipeQty * 10) / 10);
          item.display_amount = `${qStr} ${unit}`.trim();
        }
      }
    });
  }
};

// Select all / deselect all
const selectAll = () => {
  if (!recipeData.value) return;
  recipeData.value.ingredients.forEach(i => i.selected = true);
};

const deselectAll = () => {
  if (!recipeData.value) return;
  recipeData.value.ingredients.forEach(i => i.selected = false);
};

// Selected count
const selectedCount = computed(() => {
  if (!recipeData.value?.ingredients) return 0;
  return recipeData.value.ingredients.filter(i => i.selected).length;
});

// Toggle staples (Gewürze & Vorrat)
const areStaplesSelected = computed(() => {
  if (!recipeData.value?.ingredients) return false;
  const staples = recipeData.value.ingredients.filter(i => i.is_staple);
  if (staples.length === 0) return false;
  return staples.some(i => i.selected);
});

const toggleStaples = () => {
  if (!recipeData.value?.ingredients) return;
  const shouldSelect = !areStaplesSelected.value;
  recipeData.value.ingredients.forEach(i => {
    if (i.is_staple) {
      i.selected = shouldSelect;
    }
  });
};

// --- PREDEFINED STORES (LOGOS & PRESETS) ---
const predefinedStores = [
  { name: 'Aldi', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/ALDI_SUD.svg' },
  { name: 'dm', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Dm_Logo.svg' },
  { name: 'Edeka', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Logo_Edeka.svg' },
  { name: 'Kaufland', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kaufland_Logo.svg' },
  { name: 'Lidl', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Lidl-Logo.svg' },
  { name: 'Metro', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Metro_Deutschland_Logo_2024.svg' },
  { name: 'Netto', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Netto_Logo.svg' },
  { name: 'Penny', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Penny-Markt.svg' },
  { name: 'REWE', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Logo_REWE.svg' },
  { name: 'Rossmann', icon: 'https://commons.wikimedia.org/wiki/Special:FilePath/Logo_rossmann_2024.svg' },
];

const selectedStorePreset = ref('');

const getStoreIcon = (name) => {
  if (!name) return null;
  const nameLower = name.toLowerCase();
  const matched = predefinedStores.find(s => nameLower.includes(s.name.toLowerCase()));
  return matched ? matched.icon : null;
};

const getSelectedListName = computed(() => {
  if (!selectedListId.value) return '';
  const found = availableLists.value.find(l => l.id === selectedListId.value);
  return found ? found.name : '';
});

// Quick 1-click list creation from recipe title
const createQuickListFromRecipe = async () => {
  if (!recipeData.value) return;
  const listName = `${recipeData.value.title || 'Rezept'} Liste`.trim();

  isCreatingListLoading.value = true;
  errorMessage.value = '';

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl('/api/lists'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: listName,
        icon: 'mdi-cart',
        icon_name: 'mdi-cart'
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Fehler beim Erstellen der Liste');
    }

    const created = await response.json();
    availableLists.value.push(created);
    selectedListId.value = created.id;
    emit('list-created', created);
  } catch (err) {
    errorMessage.value = err.message || 'Konnte Liste nicht erstellen.';
  } finally {
    isCreatingListLoading.value = false;
  }
};

// Import into KaufSync list
const importSelectedItems = async () => {
  const targetId = selectedListId.value;
  if (!recipeData.value || selectedCount.value === 0 || !targetId || targetId === '__NEW__') return;

  const itemsToCreate = recipeData.value.ingredients
    .filter(i => i.selected)
    .map(i => {
      let tagsVal = null;
      if (i.tags && Array.isArray(i.tags) && i.tags.length > 0) {
        tagsVal = JSON.stringify(i.tags);
      } else if (typeof i.tags === 'string' && i.tags.trim()) {
        tagsVal = i.tags;
      }
      return {
        name: i.name.trim(),
        category: i.category || 'Sonstiges',
        quantity: parseFloat(i.quantity) || 1.0,
        unit: i.unit || 'Stk',
        tags: tagsVal,
        note: i.original_name && i.original_name !== i.name ? `Rezept: ${i.original_name}` : null
      };
    });

  isImporting.value = true;
  errorMessage.value = '';

  let successCount = 0;

  try {
    const token = localStorage.getItem('token');
    
    // 1. Erst versuchen, gebündelt über den Bulk-Endpoint zu speichern
    let bulkSuccess = false;
    try {
      const response = await fetch(apiUrl(`/api/lists/${targetId}/items/bulk`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipe_title: recipeData.value.title,
          items: itemsToCreate
        })
      });

      if (response.ok) {
        bulkSuccess = true;
        successCount = itemsToCreate.length;
      }
    } catch (e) {
      // Bulk endpoint noch nicht verfügbar oder Netzwerkfehler
      bulkSuccess = false;
    }

    // 2. Falls Bulk nicht erfolgreich, resilient einzeln mit Promise.allSettled anlegen
    if (!bulkSuccess) {
      const results = await Promise.allSettled(
        itemsToCreate.map(item =>
          fetch(apiUrl(`/api/lists/${targetId}/items`), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(item)
          }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
          })
        )
      );

      successCount = results.filter(r => r.status === 'fulfilled').length;
    }

    if (successCount > 0) {
      emit('imported', {
        count: successCount,
        title: recipeData.value.title,
        listId: targetId
      });
      emit('close');
    } else {
      throw new Error('Artikel konnten nicht gespeichert werden. Bitte Verbindung prüfen.');
    }
  } catch (err) {
    errorMessage.value = err.message || 'Konnte Artikel nicht speichern.';
  } finally {
    isImporting.value = false;
  }
};

const getHostname = (link) => {
  try {
    const parsed = new URL(link);
    return parsed.hostname.replace('www.', '');
  } catch {
    return 'Rezept';
  }
};
</script>

<template>
  <div v-if="isOpen" class="recipe-modal-backdrop" @click="emit('close')">
    <div class="recipe-modal-sheet" :style="sheetStyle" ref="sheetRef" @click.stop>
      <div class="sheet-handle" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd"></div>

      <!-- HEADER -->
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-box">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M12 3a5.5 5.5 0 0 0-4.7 2.65A4.5 4.5 0 0 0 3 10c0 2.16 1.5 3.96 3.5 4.38V18a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3.62c2-.42 3.5-2.22 3.5-4.38a4.5 4.5 0 0 0-4.3-4.35A5.5 5.5 0 0 0 12 3zm0 2c1.9 0 3.5 1.28 4 3a1 1 0 0 0 .9.73 2.5 2.5 0 0 1 2.1 2.27c0 1.38-1.12 2.5-2.5 2.5a1 1 0 0 0-1 1v4.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5V14.5a1 1 0 0 0-1-1C6.12 13.5 5 12.38 5 11a2.5 2.5 0 0 1 2.1-2.27 1 1 0 0 0 .9-.73 3.5 3.5 0 0 1 4-3zM8.5 20v1a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-1h-7z"/>
            </svg>
          </div>
          <div>
            <h2 class="modal-title">Rezept importieren</h2>
            <p class="modal-subtitle">Mealie, Chefkoch & alle Rezeptseiten</p>
          </div>
        </div>
        <button class="close-btn" @click="emit('close')" aria-label="Schließen">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <!-- ERROR MESSAGE -->
      <div v-if="errorMessage" class="error-banner">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <span>{{ errorMessage }}</span>
      </div>

      <!-- RECIPE DISCLAIMER BANNER (TOP) -->
      <div v-if="recipeData" class="recipe-disclaimer-box top-disclaimer">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span><strong>Hinweis:</strong> Zutaten & Mengen werden automatisch aus dem Rezept übernommen. Bitte prüfe die Angaben kurz vor dem Import.</span>
      </div>

      <!-- PHASE 1: URL INPUT (IF NO RECIPE LOADED YET) -->
      <div v-if="!recipeData" class="url-input-section">
        <div class="input-wrapper">
          <input
            ref="inputRef"
            type="url"
            v-model="url"
            class="url-input"
            placeholder="Rezept-Link einfügen (z. B. Mealie, Chefkoch...)"
            :disabled="isLoading"
            @keyup.enter="fetchRecipe"
          />
          <button v-if="!url" type="button" class="paste-btn" @click="pasteFromClipboard" title="Aus Zwischenablage einfügen">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>
            Einfügen
          </button>
          <button v-else type="button" class="clear-btn" @click="url = ''" title="Löschen">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <button class="ks-btn-pill-primary full-width" :disabled="isLoading || !url.trim()" @click="fetchRecipe" style="width: 100%; margin-top: 14px;">
          <span v-if="isLoading" class="spinner"></span>
          <span v-else>Rezept laden</span>
        </button>

        <div class="hint-box">
          <div class="hint-title">💡 Tipp für Mealie & Web:</div>
          <p class="hint-text">
            Du kannst auch direkt auf deinem Handy im Browser oder in Mealie auf <strong>„Teilen“</strong> tippen und <strong>KaufSync</strong> auswählen!
          </p>
        </div>
      </div>

      <!-- PHASE 2: RECIPE PREVIEW & INGREDIENT LIST -->
      <div v-else class="recipe-review-section">
        <!-- SINGLE SCROLLABLE BODY: Natural top-to-bottom flow, no overlapping windows -->
        <div class="recipe-modal-scroll-body">
          <!-- RECIPE HEADER CARD -->
          <div class="recipe-card">
            <img v-if="recipeData.image" :src="recipeData.image" :alt="recipeData.title" class="recipe-thumb" />
            <div v-else class="recipe-thumb-placeholder">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.48l1.3-11.23a1.503 1.503 0 0 0-1.49-1.67h-3.1v-2c0-3.31-2.69-6-6-6s-6 2.69-6 6v2H3c-.88 0-1.58.74-1.49 1.67l1.3 11.23c.1.84.79 1.48 1.63 1.48h13.62zM8 6.61c0-2.21 1.79-4 4-4s4 1.79 4 4v2H8v-2z"/></svg>
            </div>
            <div class="recipe-meta">
              <span class="source-badge">{{ getHostname(recipeData.url) }}</span>
              <h3 class="recipe-name" :title="recipeData.title">{{ recipeData.title }}</h3>
              
              <!-- PORTIONEN SKALIERER -->
              <div class="servings-stepper">
                <span class="servings-label">Portionen:</span>
                <div class="stepper-controls">
                  <button type="button" class="step-btn" @click="updateServings(-1)" :disabled="currentServings <= 1">−</button>
                  <span class="step-value">{{ currentServings }}</span>
                  <button type="button" class="step-btn" @click="updateServings(1)">+</button>
                </div>
              </div>
            </div>
          </div>

          <!-- SELECTION BAR -->
          <div class="selection-bar">
            <button
              type="button"
              class="staple-toggle-btn"
              :class="{ 'staples-active': areStaplesSelected }"
              @click="toggleStaples"
              title="Gewürze & Vorratsartikel ein- oder abwählen"
            >
              <span class="toggle-icon">🧂</span>
              <span>Gewürze & Vorrat {{ areStaplesSelected ? 'abwählen' : 'auswählen' }}</span>
            </button>
            <div class="selection-actions">
              <button type="button" class="text-link" @click="selectAll">Alle</button>
              <span class="divider">|</span>
              <button type="button" class="text-link" @click="deselectAll">Keine</button>
            </div>
          </div>

          <!-- INGREDIENTS LIST -->
          <div class="ingredients-list">
            <template v-for="(item, idx) in recipeData.ingredients" :key="idx">
              <!-- INLINE EDIT MODE FOR THIS ITEM -->
              <div v-if="editingIndex === idx" class="ingredient-edit-card" @click.stop>
                <div class="edit-card-header">
                  <span class="edit-card-title">Zutat anpassen</span>
                  <button type="button" class="edit-close-x" @click="cancelEditItem">✕</button>
                </div>
                
                <div class="edit-fields-row">
                  <div class="edit-field flex-2">
                    <label>Artikelname</label>
                    <input type="text" v-model="editForm.name" placeholder="z. B. Hähnchenbrust" class="edit-input" />
                  </div>
                  <div class="edit-field flex-1">
                    <label>Menge / Ausprägung</label>
                    <input type="text" v-model="editForm.display_amount" placeholder="z. B. 250g" class="edit-input" />
                  </div>
                </div>

                <div class="edit-category-section">
                  <label>Kategorie</label>
                  <div class="edit-cat-chips">
                    <button
                      v-for="cat in predefinedCategories"
                      :key="cat"
                      type="button"
                      class="edit-cat-chip"
                      :class="{ 'active': editForm.category === cat }"
                      @click="editForm.category = cat"
                    >
                      {{ cat }}
                    </button>
                  </div>
                </div>

                <div class="edit-actions-row">
                  <button type="button" class="ks-btn-pill-secondary edit-action-btn" @click="cancelEditItem">
                    Abbrechen
                  </button>
                  <button type="button" class="ks-btn-pill-primary edit-action-btn" @click="saveEditItem(idx)">
                    Übernehmen
                  </button>
                </div>
              </div>

              <!-- NORMAL ROW DISPLAY -->
              <div
                v-else
                class="ingredient-row"
                :class="{ 'is-selected': item.selected }"
                @click="item.selected = !item.selected"
              >
                <!-- CHECKBOX -->
                <div class="checkbox-container" @click.stop>
                  <input type="checkbox" v-model="item.selected" :id="'ing-' + idx" class="custom-checkbox" />
                </div>

                <!-- ICON -->
                <div class="ing-icon">
                  <CategoryIcon :name="item.name" :category="item.category" :size="34" />
                </div>

                <!-- DETAILS -->
                <div class="ing-details">
                  <div class="ing-main-line">
                    <span class="ing-qty" v-if="item.display_amount">{{ item.display_amount }}</span>
                    <span class="ing-qty" v-else-if="item.quantity">{{ item.quantity }} {{ item.unit }}</span>
                    <span class="ing-name">{{ item.name }}</span>
                  </div>
                  <div class="ing-sub-line">
                    <span class="cat-pill">{{ item.category }}</span>
                    <span v-if="item.is_staple" class="staple-pill">Gewürz / Vorrat</span>
                  </div>
                  <div v-if="item.raw" class="ing-basis" :title="item.raw">
                    <span class="basis-prefix">Basis:</span> „{{ item.raw }}“
                  </div>
                </div>

                <!-- EDIT ACTION BUTTON -->
                <button
                  type="button"
                  class="edit-ing-btn"
                  @click.stop="startEditItem(idx)"
                  title="Artikel oder Menge korrigieren"
                  aria-label="Artikel bearbeiten"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
              </div>
            </template>
          </div>

          <!-- TARGET LIST SECTION: Directly following ingredients, slightly color-separated -->
          <div class="target-list-section">
            <div class="target-list-top-row">
              <div class="target-heading-wrap">
                <span class="target-list-heading">In welche Liste importieren?</span>
                <span class="target-list-sub">Liste auswählen oder über + neue anlegen</span>
              </div>
              <button
                type="button"
                class="add-list-quick-btn"
                :disabled="isCreatingListLoading"
                @click="createQuickListFromRecipe"
                :title="'Neue Liste „' + (recipeData?.title || 'Rezept') + ' Liste“ erstellen'"
              >
                <span v-if="isCreatingListLoading" class="spinner-small"></span>
                <span v-else class="plus-icon-label">+</span>
              </button>
            </div>

            <!-- LIST SELECTION CARDS -->
            <div class="available-lists-grid">
              <div
                v-for="l in availableLists"
                :key="l.id"
                class="store-list-card"
                :class="{ 'is-selected': selectedListId === l.id }"
                @click="selectedListId = l.id"
              >
                <div class="store-card-logo-box">
                  <img v-if="getStoreIcon(l.name)" :src="getStoreIcon(l.name)" :alt="l.name" class="store-card-logo" />
                  <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </div>

                <div class="store-card-info">
                  <span class="store-card-name">{{ l.name }}</span>
                  <span class="store-card-count" v-if="l.items && l.items.length">{{ l.items.filter(i => i.status === 'active').length }} Artikel</span>
                  <span class="store-card-count" v-else>Einkaufsliste</span>
                </div>

                <div class="store-card-radio">
                  <div class="radio-indicator" :class="{ 'checked': selectedListId === l.id }">
                    <svg v-if="selectedListId === l.id" viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div
                v-if="availableLists.length === 0"
                class="empty-lists-card"
                @click="createQuickListFromRecipe"
              >
                <span>Noch keine Liste vorhanden. Auf <strong>+</strong> tippen, um „{{ recipeData?.title || 'Rezept' }} Liste“ anzulegen!</span>
              </div>
            </div>
          </div>

          <!-- STATIC FOOTER ACTIONS (SCROLLS WITH CONTENT) -->
          <div class="modal-footer static-footer">
            <button type="button" class="ks-btn-pill-secondary" @click="recipeData = null">
              Anderes Rezept
            </button>
            <button
              type="button"
              class="ks-btn-pill-primary flex-1"
              :disabled="isImporting || selectedCount === 0 || !selectedListId"
              @click="importSelectedItems"
            >
              <span v-if="isImporting" class="spinner"></span>
              <span v-else-if="!selectedListId">Liste auswählen</span>
              <span v-else>{{ selectedCount }} Zutaten zu {{ getSelectedListName }} hinzufügen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recipe-modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.recipe-modal-sheet {
  background-color: #161a22;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: none;
  width: 100%;
  max-width: var(--ks-page-width, 600px);
  height: 88vh;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 28px 28px 0 0;
  padding: 16px 20px 14px;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.7);
  animation: slideUp 0.25s cubic-bezier(0.2, 0, 0, 1);
  overflow: hidden;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.sheet-handle {
  width: 48px;
  height: 6px;
  background: #334155;
  border-radius: 9999px;
  margin: 0 auto 16px auto;
  flex-shrink: 0;
  cursor: grab;
  touch-action: none;
  transition: background-color 0.2s;
}

.sheet-handle:active {
  cursor: grabbing;
  background: #475569;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(239, 68, 68, 0.2));
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.modal-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

.close-btn {
  background: #212631;
  border: none;
  color: #94a3b8;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #2e3646;
  color: #fff;
}

.error-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

/* URL INPUT SECTION */
.url-input-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.url-input {
  width: 100%;
  background: #212631;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 14px 90px 14px 16px;
  font-size: 15px;
  color: #f8fafc;
  outline: none;
  transition: border-color 0.2s;
}

.url-input:focus {
  border-color: #3b82f6;
}

.paste-btn, .clear-btn {
  position: absolute;
  right: 8px;
  background: #2e3646;
  border: none;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.clear-btn {
  padding: 6px;
  border-radius: 50%;
}

.primary-action-btn {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  border: none;
  border-radius: 14px;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}

.primary-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-action-btn:not(:disabled):active {
  transform: scale(0.98);
}

.secondary-btn {
  background: #212631;
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.hint-box {
  background: #1e2430;
  border-radius: 12px;
  padding: 12px 14px;
  margin-top: 6px;
}

.hint-title {
  font-size: 12px;
  font-weight: 700;
  color: #f59e0b;
  margin-bottom: 4px;
}

.hint-text {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
  margin: 0;
}

/* RECIPE REVIEW SECTION */
.recipe-review-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.recipe-modal-scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  padding-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
}

.recipe-card {
  display: flex;
  gap: 14px;
  background: #212631;
  border-radius: 16px;
  padding: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.recipe-thumb {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}

.recipe-thumb-placeholder {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background: #2d3446;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recipe-meta {
  flex: 1;
  min-width: 0;
}

.source-badge {
  font-size: 11px;
  font-weight: 600;
  color: #60a5fa;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.recipe-name {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  margin: 2px 0 6px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.servings-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.servings-label {
  font-size: 12px;
  color: #94a3b8;
}

.stepper-controls {
  display: inline-flex;
  align-items: center;
  background: #161a22;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.step-btn {
  background: transparent;
  border: none;
  color: #f8fafc;
  font-size: 14px;
  font-weight: bold;
  width: 26px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.step-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.step-value {
  font-size: 12px;
  font-weight: 700;
  color: #38bdf8;
  padding: 0 6px;
  min-width: 20px;
  text-align: center;
}

/* DISCLAIMER HINT BOX */
.recipe-disclaimer-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.22);
  border-radius: 14px;
  padding: 10px 14px;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: #fde68a;
}

.recipe-disclaimer-box.top-disclaimer {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.recipe-disclaimer-box svg {
  flex-shrink: 0;
  fill: #f59e0b;
}

/* SELECTION BAR */
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  margin-bottom: 6px;
}

.staple-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 500;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.staple-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.staple-toggle-btn:active {
  transform: scale(0.96);
}

.staple-toggle-btn.staples-active {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.35);
  color: #fbbf24;
}

.staple-toggle-btn .toggle-icon {
  font-size: 13px;
}

.selection-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.text-link {
  background: transparent;
  border: none;
  color: #38bdf8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.divider {
  color: #475569;
  font-size: 11px;
}

/* INGREDIENTS LIST */
.ingredients-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ingredient-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #212631;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.ingredient-row.is-selected {
  background: #242c3b;
  border-color: rgba(59, 130, 246, 0.3);
}

.ingredient-row:not(.is-selected) {
  opacity: 0.55;
}

.checkbox-container {
  display: flex;
  align-items: center;
}

.custom-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #3b82f6;
}

.ing-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ing-details {
  flex: 1;
  min-width: 0;
}

.ing-main-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
}

.ing-qty {
  font-size: 13px;
  font-weight: 700;
  color: #38bdf8;
  white-space: nowrap;
}

.ing-name {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ing-sub-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cat-pill {
  font-size: 10px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 4px;
}

.staple-pill {
  font-size: 10px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}

.ing-basis {
  font-size: 11px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.75;
}

.basis-prefix {
  font-style: normal;
  font-weight: 500;
  color: #64748b;
  margin-right: 2px;
}

/* EDIT BUTTON IN ROW */
.edit-ing-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.edit-ing-btn:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
  color: #38bdf8;
}

/* INLINE INGREDIENT EDIT CARD */
.ingredient-edit-card {
  background: #1e2430;
  border: 1px solid #38bdf8;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeIn 0.2s ease;
}

.edit-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edit-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #38bdf8;
}

.edit-close-x {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
}

.edit-fields-row {
  display: flex;
  gap: 10px;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-field.flex-2 { flex: 2; }
.edit-field.flex-1 { flex: 1; }

.edit-field label,
.edit-category-section label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}

.edit-input {
  width: 100%;
  background: #161a22;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  color: #f8fafc;
  outline: none;
}

.edit-input:focus {
  border-color: #38bdf8;
}

.edit-category-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 85px;
  overflow-y: auto;
}

.edit-cat-chip {
  background: #161a22;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  padding: 4px 10px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.15s ease;
}

.edit-cat-chip.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 600;
}

.edit-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.edit-action-btn {
  min-height: 38px !important;
  padding: 0 16px !important;
  font-size: 13px !important;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* TARGET LIST SECTION */
.target-list-section {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(56, 189, 248, 0.22);
  border-radius: 18px;
  padding: 14px;
  margin-top: 8px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.target-list-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.target-heading-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.target-list-heading {
  font-size: 13px;
  font-weight: 700;
  color: #f1f5f9;
}

.target-list-sub {
  font-size: 11px;
  color: #94a3b8;
}

.add-list-quick-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  font-size: 22px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.add-list-quick-btn:hover {
  background: rgba(56, 189, 248, 0.25);
  transform: scale(1.05);
}

.add-list-quick-btn:active {
  transform: scale(0.95);
}

.plus-icon-label {
  line-height: 1;
  margin-top: -2px;
}

/* LIST SELECTION CARDS */
.available-lists-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.store-list-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.store-list-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
}

.store-list-card.is-selected {
  background: rgba(56, 189, 248, 0.12);
  border-color: #38bdf8;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.2);
}

.store-card-logo-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  flex-shrink: 0;
  color: #38bdf8;
}

.store-card-logo {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.store-card-info {
  flex: 1;
  min-width: 0;
}

.store-card-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-card-count {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 1px;
}

.store-card-radio {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.radio-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.radio-indicator.checked {
  border-color: #38bdf8;
  background: #38bdf8;
  color: #0f172a;
}

.empty-lists-card {
  padding: 14px;
  text-align: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
}

.empty-lists-card:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f1f5f9;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

.modal-footer {
  display: flex;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.modal-footer.static-footer {
  margin-top: 14px;
  padding-top: 14px;
  padding-bottom: 8px;
}

.flex-1 {
  flex: 1;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
