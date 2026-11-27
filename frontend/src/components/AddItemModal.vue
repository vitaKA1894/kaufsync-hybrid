<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useBottomSheetDrag } from '../utils/useBottomSheetDrag';

import { searchTaxonomy, findTaxonomyItem, debounce } from '../utils/search';
import { parseQuickInput } from '../utils/quickInputParser';
import { findMergeCandidate } from '../utils/itemMerge';
import {
  resolveArticleWithUserLayer,
  searchWithUserOverrides,
  learnArticleMapping,
  learnBarcodeMapping,
  syncUserMappings
} from '../services/userMappingService';
import { isOnline } from '../services/syncService';
import CategoryIcon from './CategoryIcon.vue';
import BarcodeScanner from './BarcodeScanner.vue';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { scanBarcodeNative } from '../utils/nativeBarcode';
import { triggerLightHaptic } from '../utils/hapticsService';
import {
  getRememberedNotes,
  saveCustomNote,
  removeCustomNote
} from '../utils/articleNoteHistory';
import {
  getDueSuggestions,
  snoozeSuggestion,
  isRestockSuggestionsEnabled
} from '../services/consumptionService';

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

const mapLegacyCategory = (catName) => {
  if (catName === 'Milch & Tiefkühl') return 'Milchprodukte & Tiefkühlkost';
  if (catName === 'Getränke') return 'Getränke & Genussmittel';
  if (catName === 'Drogerie & Haushalt') return 'Drogerie, Haushalt & Tierbedarf';
  return catName;
};

const getCategoryDef = (catName) => {
  const mappedCatName = mapLegacyCategory(catName);
  return predefinedCategories.find(c => c.name === mappedCatName) || predefinedCategories[7];
};

const props = defineProps({
  isOpen: Boolean,
  startWithScanner: { type: Boolean, default: false },
  editItem: { type: Object, default: null },
  activeItems: { type: Array, default: () => [] },
  listId: { type: String, default: '' }
});

const emit = defineEmits(['close', 'add', 'update', 'delete']);
const route = useRoute();

const query = ref('');
const duplicateWarning = ref(false);
const results = ref([]);
const inputRef = ref(null);
const selectedItem = ref(null);

// Scanner State
const showScanner = ref(false);
const isContinuousAdd = ref(false);

// Step 2 Redesign State + Quick Input & Personal Learning State
const currentQuantity = ref(1);
const currentUnit = ref('Stk');
const customNoteInput = ref('');
const openedFromNewAdd = ref(false);
const isSliderExpanded = ref(false);
const localNotesVersion = ref(0);
const showCategorySelector = ref(false);
const activeTags = ref([]);

const parsedQuickInput = ref(null);
const quickAddFeedback = ref('');
let quickAddFeedbackTimer = null;
const editIncrementNotice = ref('');
const pendingBarcode = ref(null);
const categoryChangedInModal = ref(false);
const isCustomNewItem = ref(false);

// Restock Suggestions State ("Bald wieder leer")
const dueSuggestions = ref([]);
const recentlyAddedKeys = ref([]);
const dismissedKeys = ref([]);

const loadDueSuggestions = () => {
  if (!props.listId || !isRestockSuggestionsEnabled()) {
    dueSuggestions.value = [];
    return;
  }
  try {
    const list = getDueSuggestions(props.listId, props.activeItems || []);
    dueSuggestions.value = list;
  } catch (err) {
    console.error("Fehler beim Laden der Nachkauf-Vorschläge:", err);
    dueSuggestions.value = [];
  }
};

const visibleDueSuggestions = computed(() => {
  if (!isRestockSuggestionsEnabled()) return [];
  if (query.value.trim() !== '') return [];

  const activeNames = new Set((props.activeItems || []).map(i => i.name.trim().toLowerCase()));

  return dueSuggestions.value.filter(sug => {
    const key = sug.article_key || sug.articleKey;
    const name = (sug.display_name || sug.name || '').trim().toLowerCase();
    if (recentlyAddedKeys.value.includes(key)) return false;
    if (dismissedKeys.value.includes(key)) return false;
    if (name && activeNames.has(name)) return false;
    return true;
  });
});

const restockSuggestion = (sug) => {
  triggerLightHaptic();
  const newId = crypto.randomUUID();
  const sugName = sug.display_name || sug.name;
  const sugKey = sug.article_key || sug.articleKey;
  const searchMatch = findTaxonomyItem(sugName);
  const unit = searchMatch?.defaultUnit || searchMatch?.unit || 'Stk';

  recentlyAddedKeys.value.push(sugKey);

  emit('add', {
    id: newId,
    name: sugName,
    category: sug.category || 'Sonstiges',
    quantity: 1,
    unit: unit,
    tags: JSON.stringify([]),
    note: ''
  });
};

const dismissSuggestion = (sug) => {
  triggerLightHaptic();
  const sugKey = sug.article_key || sug.articleKey;
  const medianDays = sug.median_cycle_days || sug.medianCycleDays;
  dismissedKeys.value.push(sugKey);
  snoozeSuggestion(props.listId, sugKey, medianDays);
};

// Sheet Dragging Logic
const {
  sheetRef,
  sheetStyle,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  resetDrag
} = useBottomSheetDrag(() => handleDismiss(), 100);

const {
  sheetStyle: catSheetStyle,
  onTouchStart: onCatTouchStart,
  onTouchMove: onCatTouchMove,
  onTouchEnd: onCatTouchEnd
} = useBottomSheetDrag(() => { showCategorySelector.value = false; }, 90);

const activeChipStyle = computed(() => {
  const catDef = getCategoryDef(selectedItem.value?.category);
  return {
    background: `color-mix(in srgb, ${catDef.bg} 20%, transparent)`,
    color: catDef.color,
    borderColor: `color-mix(in srgb, ${catDef.bg} 50%, transparent)`
  };
});

const defaultChipStyle = {
  background: '#1e293b',
  color: '#cbd5e1',
  borderColor: '#334155'
};

// Pills computation: Custom notes first, then v2 variants -> attributes -> packSizes (with legacy constellations fallback)
const getTaxonomySuggestions = (item) => {
  if (!item) return [];
  if (Array.isArray(item.variants) || Array.isArray(item.attributes) || Array.isArray(item.packSizes)) {
    const merged = [
      ...(item.variants || []),
      ...(item.attributes || []),
      ...(item.packSizes || [])
    ];
    return Array.from(new Set(merged));
  }
  return item.tags?.constellations || [];
};

const allCustomNotes = computed(() => {
  localNotesVersion.value; // Reactivity dependency
  const remembered = getRememberedNotes(props.listId, selectedItem.value?.name);
  const result = [...remembered];

  const urgencyTags = ['Dringend', 'Angebot', "Wenn's passt"];
  const taxPills = getTaxonomySuggestions(selectedItem.value);
  const meta = selectedItem.value?.tags?.global_meta || [];

  for (const tag of activeTags.value) {
    if (!urgencyTags.includes(tag) && !taxPills.includes(tag) && !meta.includes(tag)) {
      if (!result.includes(tag)) {
        result.push(tag);
      }
    }
  }
  return result;
});

const constellationPills = computed(() => {
  const custom = allCustomNotes.value;
  return getTaxonomySuggestions(selectedItem.value).filter(c => !custom.includes(c));
});

const metaPills = computed(() => {
  const custom = allCustomNotes.value;
  const consts = getTaxonomySuggestions(selectedItem.value);
  const meta = selectedItem.value?.tags?.global_meta || [];
  const urgencyTags = ['Dringend', 'Angebot', "Wenn's passt"];
  return meta.filter(m => !urgencyTags.includes(m) && !custom.includes(m) && !consts.includes(m));
});

const totalSliderPillsCount = computed(() => {
  return allCustomNotes.value.length + constellationPills.value.length + metaPills.value.length;
});

const availableUnits = computed(() => {
  const units = Array.isArray(selectedItem.value?.allowedUnits) && selectedItem.value.allowedUnits.length > 0
    ? [...selectedItem.value.allowedUnits]
    : ['Stk'];
  if (currentUnit.value && !units.includes(currentUnit.value)) {
    units.unshift(currentUnit.value);
  }
  return units;
});

const selectUnit = (u) => {
  if (currentUnit.value === u) return;
  currentUnit.value = u;
  triggerLightHaptic();
  liveAutoSave();
};

// Live Auto-Save
const liveAutoSave = () => {
  if (!selectedItem.value || !selectedItem.value.id) return;
  emit('update', {
    id: selectedItem.value.id,
    name: selectedItem.value.name,
    category: selectedItem.value.category,
    quantity: currentQuantity.value,
    unit: currentUnit.value,
    tags: JSON.stringify(activeTags.value),
    note: ''
  });
};

// Quantity Stepper (min 1, tapping - at 1 stays at 1)
const decrementQuantity = () => {
  if (currentQuantity.value > 1) {
    currentQuantity.value--;
    triggerLightHaptic();
    liveAutoSave();
  }
};

const incrementQuantity = () => {
  currentQuantity.value++;
  triggerLightHaptic();
  liveAutoSave();
};

// Tag toggling
const toggleTag = (tag) => {
  if (activeTags.value.includes(tag)) {
    activeTags.value = activeTags.value.filter(t => t !== tag);
  } else {
    activeTags.value.push(tag);
  }
  triggerLightHaptic();
  liveAutoSave();
};

// Custom Notes
const handleAddCustomNote = () => {
  const text = customNoteInput.value.trim();
  if (!text || !selectedItem.value) return;
  if (!activeTags.value.includes(text)) {
    activeTags.value.push(text);
  }
  saveCustomNote(props.listId, selectedItem.value.name, text);
  customNoteInput.value = '';
  localNotesVersion.value++;
  triggerLightHaptic();
  liveAutoSave();
};

const handleRemoveCustomNote = (note) => {
  removeCustomNote(props.listId, selectedItem.value.name, note);
  if (activeTags.value.includes(note)) {
    activeTags.value = activeTags.value.filter(t => t !== note);
    liveAutoSave();
  }
  localNotesVersion.value++;
  triggerLightHaptic();
};

const commitPendingCustomNote = () => {
  const text = customNoteInput.value.trim();
  if (text && selectedItem.value) {
    if (!activeTags.value.includes(text)) {
      activeTags.value.push(text);
    }
    saveCustomNote(props.listId, selectedItem.value.name, text);
    customNoteInput.value = '';
    localNotesVersion.value++;
    liveAutoSave();
  }
};

const selectCategory = (catName) => {
  if (selectedItem.value && selectedItem.value.category !== catName) {
    selectedItem.value.category = catName;
    categoryChangedInModal.value = true;
  } else if (selectedItem.value) {
    selectedItem.value.category = catName;
  }
  showCategorySelector.value = false;
  triggerLightHaptic();
  liveAutoSave();
};

const commitLearnedMappings = async () => {
  if (!selectedItem.value || !selectedItem.value.name) return;
  const itemName = selectedItem.value.name.trim();
  const itemCat = selectedItem.value.category || 'Sonstiges';
  const itemIcon = selectedItem.value.icon || null;
  const taxId = selectedItem.value.taxonomyId || null;

  if (pendingBarcode.value) {
    await learnBarcodeMapping({
      barcode: pendingBarcode.value,
      name: itemName,
      category: itemCat,
      icon: itemIcon,
      taxonomyId: taxId
    });
    pendingBarcode.value = null;
  }

  if (categoryChangedInModal.value || isCustomNewItem.value) {
    await learnArticleMapping({
      name: itemName,
      category: itemCat,
      icon: itemIcon,
      taxonomyId: taxId
    });
    categoryChangedInModal.value = false;
    isCustomNewItem.value = false;
  }
};

// Footer Actions
const handleCancel = () => {
  customNoteInput.value = '';
  pendingBarcode.value = null;
  categoryChangedInModal.value = false;
  isCustomNewItem.value = false;
  if (selectedItem.value && selectedItem.value.id) {
    emit('delete', selectedItem.value.id);
  }
  closeModal();
};

const handleDelete = () => {
  customNoteInput.value = '';
  pendingBarcode.value = null;
  categoryChangedInModal.value = false;
  isCustomNewItem.value = false;
  if (selectedItem.value && selectedItem.value.id) {
    emit('delete', selectedItem.value.id);
  }
  closeModal();
};

const handleDone = async () => {
  commitPendingCustomNote();
  await commitLearnedMappings();
  closeModal();
};

const handleDismiss = async () => {
  commitPendingCustomNote();
  await commitLearnedMappings();
  closeModal();
};

const setupEditItem = (item) => {
  const mappedCategory = mapLegacyCategory(item.category || 'Sonstiges');
  const taxonomyMatch = findTaxonomyItem(item.name);

  selectedItem.value = {
    id: item.id,
    name: item.name,
    category: mappedCategory,
    subcategory: taxonomyMatch?.subcategory || '',
    taxonomyId: item.taxonomy_id || taxonomyMatch?.id || null,
    icon: taxonomyMatch?.icon || null,
    unit: item.unit || taxonomyMatch?.defaultUnit || 'Stk',
    allowedUnits: taxonomyMatch?.allowedUnits || ['Stk'],
    variants: taxonomyMatch?.variants || null,
    attributes: taxonomyMatch?.attributes || null,
    packSizes: taxonomyMatch?.packSizes || null,
    tags: taxonomyMatch?.tags || { constellations: [] }
  };

  categoryChangedInModal.value = false;
  isCustomNewItem.value = false;

  currentQuantity.value = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
  currentUnit.value = item.unit || taxonomyMatch?.defaultUnit || 'Stk';

  let parsedTags = [];
  try {
    parsedTags = typeof item.tags === 'string' ? JSON.parse(item.tags) : (Array.isArray(item.tags) ? item.tags : []);
  } catch (e) {
    if (typeof item.tags === 'string' && item.tags.trim()) {
      parsedTags = item.tags.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  activeTags.value = [...parsedTags];
  customNoteInput.value = '';
  isSliderExpanded.value = false;
  localNotesVersion.value++;
};

// Scanner Logic
const triggerScan = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const scanResult = await scanBarcodeNative();
      const code = typeof scanResult === 'object' && scanResult !== null ? scanResult.code : scanResult;
      if (code) {
        await handleScan(code);
      } else {
        if (props.startWithScanner && !selectedItem.value && !query.value) {
          closeModal();
        }
      }
    } catch (err) {
      console.log("Nativer Scan abgebrochen oder fehlgeschlagen:", err);
      if (props.startWithScanner && !selectedItem.value && !query.value) {
        closeModal();
      }
    }
  } else {
    showScanner.value = true;
  }
};

const handleWebScannerClose = () => {
  showScanner.value = false;
  if (props.startWithScanner && !selectedItem.value && !query.value) {
    closeModal();
  }
};

const isBarcodeLoading = ref(false);
const barcodeError = ref('');

const handleScan = async (barcode) => {
  showScanner.value = false;
  isBarcodeLoading.value = true;
  barcodeError.value = '';
  pendingBarcode.value = String(barcode || '').trim();

  try {
    // 1. Layer 1 Personal Barcode Mapping (100% instant & offline)
    const learnedBarcode = resolveArticleWithUserLayer('', pendingBarcode.value);
    if (learnedBarcode.source === 'user_mapping') {
      const taxItem = learnedBarcode.taxItem || {};
      selectItem({
        ...taxItem,
        id: learnedBarcode.taxonomyId || undefined,
        name: learnedBarcode.name,
        category: learnedBarcode.category,
        icon: learnedBarcode.icon,
        defaultUnit: learnedBarcode.defaultUnit,
        allowedUnits: learnedBarcode.allowedUnits
      });
      return;
    }

    let productData = null;

    if (Capacitor.isNativePlatform()) {
      try {
        const nativeResp = await CapacitorHttp.get({
          url: `https://world.openfoodfacts.org/api/v3/product/${barcode}`,
          headers: {
            'User-Agent': 'KaufSync - Android - Version 1.0 (admin@kaufsync.com)'
          }
        });
        if (nativeResp.status === 200 && nativeResp.data && nativeResp.data.product) {
          productData = nativeResp.data.product;
        }
      } catch (httpErr) {
        console.warn("CapacitorHttp barcode fetch failed:", httpErr);
      }
    }

    if (!productData) {
      try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${barcode}`);
        if (response.ok) {
          const data = await response.json();
          if (data.product) {
            productData = data.product;
          }
        }
      } catch (fetchErr) {
        console.warn("Web fetch barcode error:", fetchErr);
      }
    }

    if (productData) {
      const productName = productData.product_name || productData.abbreviated_product_name || productData.product_name_de || '';
      const genericName = productData.generic_name_de || productData.generic_name || '';
      const brandsStr = productData.brands || '';
      let brand = '';

      if (brandsStr) {
        brand = brandsStr.split(',')[0].trim();
      }

      let searchTarget = genericName || productName;
      let searchResults = searchWithUserOverrides(searchTarget);
      if ((!searchResults || searchResults.length === 0) && brand) {
        searchResults = searchWithUserOverrides(brand);
      }
      if ((!searchResults || searchResults.length === 0) && productName) {
        searchResults = searchWithUserOverrides(productName);
      }

      let matchingItem;
      let auspraegung = '';

      if (searchResults && searchResults.length > 0) {
        matchingItem = searchResults[0];
        if (brand && !matchingItem.name.toLowerCase().includes(brand.toLowerCase())) {
          auspraegung = brand;
        } else if (productName && productName.toLowerCase() !== matchingItem.name.toLowerCase()) {
          auspraegung = productName;
        }
      } else {
        const fallbackName = genericName || productName || 'Unbekanntes Produkt';
        const resolvedFallback = resolveArticleWithUserLayer(fallbackName);
        matchingItem = {
          name: resolvedFallback.name || fallbackName,
          category: resolvedFallback.category || 'Sonstiges',
          icon: resolvedFallback.icon || null,
          _isCustomNew: true,
          tags: { constellations: [] }
        };
        auspraegung = brand || productName;
      }

      selectItem(matchingItem);

      if (auspraegung && auspraegung.toLowerCase() !== matchingItem.name.toLowerCase()) {
        if (!activeTags.value.includes(auspraegung)) {
          activeTags.value.push(auspraegung);
          liveAutoSave();
        }
      }
    } else {
      selectedItem.value = null;
      query.value = '';
      barcodeError.value = !isOnline.value
        ? 'Du bist offline – Online-Produktsuche nicht verfügbar. Du kannst den Artikel direkt manuell eingeben.'
        : `Kein Artikel zum Barcode ${barcode} gefunden. Du kannst ihn jetzt manuell eingeben.`;
      nextTick(() => {
        inputRef.value?.focus({ preventScroll: true });
      });
    }
  } catch (e) {
    console.error("Error fetching barcode info:", e);
    selectedItem.value = null;
    query.value = '';
    barcodeError.value = !isOnline.value
      ? 'Du bist offline – Online-Produktsuche nicht verfügbar. Du kannst den Artikel direkt manuell eingeben.'
      : `Kein Artikel zum Barcode ${barcode} gefunden. Du kannst ihn jetzt manuell eingeben.`;
    nextTick(() => {
      inputRef.value?.focus({ preventScroll: true });
    });
  } finally {
    isBarcodeLoading.value = false;
  }
};

const search = debounce((val) => {
  const parsed = parsedQuickInput.value;
  const searchTarget = (parsed?.has_modifiers && parsed?.core_query) ? parsed.core_query : val;
  if (searchTarget && searchTarget.trim().length >= 2) {
    results.value = searchWithUserOverrides(searchTarget);
  } else {
    results.value = [];
  }
}, 200);

const handleInput = (e) => {
  query.value = e.target.value;
  parsedQuickInput.value = parseQuickInput(query.value, props.listId);
  search(query.value);
};

const showQuickFeedback = (msg) => {
  if (quickAddFeedbackTimer) clearTimeout(quickAddFeedbackTimer);
  quickAddFeedback.value = msg;
  quickAddFeedbackTimer = setTimeout(() => {
    quickAddFeedback.value = '';
  }, 2600);
};

const quickAddParsedItem = async () => {
  const p = parsedQuickInput.value;
  if (!p || !p.matched_name) return;

  triggerLightHaptic();
  const allPills = [
    ...(p.detected_variant_pills || []),
    ...(p.detected_custom_pills || []),
    ...(p.detected_meta_tags || [])
  ];

  // Remember custom note pills locally per list
  for (const customPill of (p.detected_custom_pills || [])) {
    saveCustomNote(props.listId, p.matched_name, customPill);
  }

  // If a scanned unknown barcode was pending, learn it now
  if (pendingBarcode.value) {
    await learnBarcodeMapping({
      barcode: pendingBarcode.value,
      name: p.matched_name,
      category: p.matched_category,
      icon: p.matched_icon,
      taxonomyId: p.matched_taxonomy_id
    });
    pendingBarcode.value = null;
  }

  const newId = crypto.randomUUID();
  emit('add', {
    id: newId,
    name: p.matched_name,
    category: p.matched_category || 'Sonstiges',
    quantity: p.count_quantity || 1,
    unit: p.default_unit || 'Stk',
    tags: JSON.stringify(allPills),
    note: '',
    taxonomy_id: p.matched_taxonomy_id || null
  });

  const pillStr = allPills.length > 0 ? ` (${allPills.join(' · ')})` : '';
  showQuickFeedback(`${p.count_quantity}× ${p.matched_name}${pillStr} hinzugefügt`);

  query.value = '';
  results.value = [];
  parsedQuickInput.value = null;
  barcodeError.value = '';
  nextTick(() => {
    inputRef.value?.focus({ preventScroll: true });
  });
};

const selectItem = (item) => {
  const resolved = resolveArticleWithUserLayer(item.name);
  const primaryName = resolved.name || item.name;
  const matchedAlias = item.matchedAlias;
  editIncrementNotice.value = '';

  // Check for existing open item (Spec 2.3.4):
  // On plain search tap (single unambiguous match or compatible plain match), increment by +1 and open edit mode
  const openMatches = props.activeItems.filter(i => {
    const iResolved = resolveArticleWithUserLayer(i.name);
    if (resolved.taxonomyId && iResolved.taxonomyId && resolved.taxonomyId === iResolved.taxonomyId) return true;
    return i.name.trim().toLowerCase() === primaryName.trim().toLowerCase();
  });

  let existingToIncrement = null;
  if (openMatches.length === 1) {
    existingToIncrement = openMatches[0];
  } else if (openMatches.length > 1) {
    existingToIncrement = findMergeCandidate(
      openMatches,
      { name: primaryName, tags: JSON.stringify([]), taxonomy_id: resolved.taxonomyId },
      resolveArticleWithUserLayer
    );
  }

  if (existingToIncrement) {
    const newQty = (Number(existingToIncrement.quantity) || 1) + 1;
    openedFromNewAdd.value = false;
    triggerLightHaptic();
    emit('update', { id: existingToIncrement.id, quantity: newQty });
    setupEditItem({ ...existingToIncrement, quantity: newQty });
    editIncrementNotice.value = `Menge von „${existingToIncrement.name}“ auf ${newQty} erhöht`;
    return;
  }

  // New item: instant save with quantity 1
  const newId = crypto.randomUUID();
  openedFromNewAdd.value = true;
  categoryChangedInModal.value = false;
  isCustomNewItem.value = Boolean(item._isCustomNew);

  const defUnit = resolved.defaultUnit || item.defaultUnit || item.unit || 'Stk';
  const taxSource = resolved.taxItem || item;
  selectedItem.value = {
    id: newId,
    name: primaryName,
    category: resolved.category || item.category || 'Sonstiges',
    subcategory: taxSource.subcategory || '',
    taxonomyId: resolved.taxonomyId || item.id || null,
    icon: resolved.icon || item.icon || null,
    unit: defUnit,
    allowedUnits: resolved.allowedUnits || item.allowedUnits || ['Stk'],
    variants: taxSource.variants || null,
    attributes: taxSource.attributes || null,
    packSizes: taxSource.packSizes || null,
    tags: taxSource.tags || { constellations: [] }
  };
  currentQuantity.value = 1;
  currentUnit.value = defUnit;
  activeTags.value = [];
  customNoteInput.value = '';
  isSliderExpanded.value = false;
  localNotesVersion.value++;

  if (matchedAlias && matchedAlias.toLowerCase() !== primaryName.toLowerCase()) {
    activeTags.value.push(matchedAlias);
  }

  // Emit 'add' immediately
  emit('add', {
    id: newId,
    name: selectedItem.value.name,
    category: selectedItem.value.category,
    quantity: currentQuantity.value,
    unit: currentUnit.value,
    tags: JSON.stringify(activeTags.value),
    note: '',
    taxonomy_id: selectedItem.value.taxonomyId
  });
};

const confirmSelection = (bypassWarning = false) => {
  if (!query.value || query.value.trim() === '') return;

  // If natural-language modifiers are detected, Enter triggers immediate Quick-Add!
  if (parsedQuickInput.value?.has_modifiers && parsedQuickInput.value?.matched_name) {
    quickAddParsedItem();
    return;
  }

  const qTrimmed = query.value.trim();
  const qLower = qTrimmed.toLowerCase();

  // Check Layer 1 (user mapping) -> Layer 2 (global taxonomy)
  const resolved = resolveArticleWithUserLayer(qTrimmed);
  if (resolved.source === 'user_mapping' || resolved.source === 'taxonomy') {
    const taxObj = resolved.taxItem || {};
    selectItem({
      ...taxObj,
      id: resolved.taxonomyId || taxObj.id,
      name: resolved.name,
      category: resolved.category,
      icon: resolved.icon,
      defaultUnit: resolved.defaultUnit,
      allowedUnits: resolved.allowedUnits
    });
    return;
  }

  const searchRes = searchWithUserOverrides(qTrimmed);
  if (searchRes.length > 0) {
    selectItem(searchRes[0]);
    return;
  }

  // Custom Item not in taxonomy
  const existingItem = props.activeItems.find(
    i => i.name.trim().toLowerCase() === qLower
  );
  if (existingItem) {
    const newQty = (Number(existingItem.quantity) || 1) + 1;
    openedFromNewAdd.value = false;
    emit('update', { id: existingItem.id, quantity: newQty });
    setupEditItem({ ...existingItem, quantity: newQty });
    editIncrementNotice.value = `Menge von „${existingItem.name}“ auf ${newQty} erhöht`;
    return;
  }

  const customItem = {
    name: qTrimmed,
    category: resolved.category || 'Sonstiges',
    unit: 'Stk',
    _isCustomNew: true,
    tags: { constellations: [] }
  };
  selectItem(customItem);
};

let savedScrollY = 0;
const lockBackgroundScroll = () => {
  savedScrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
};

const unlockBackgroundScroll = () => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, savedScrollY);
};

const closeModal = () => {
  unlockBackgroundScroll();
  isContinuousAdd.value = false;
  query.value = '';
  results.value = [];
  parsedQuickInput.value = null;
  quickAddFeedback.value = '';
  editIncrementNotice.value = '';
  pendingBarcode.value = null;
  categoryChangedInModal.value = false;
  isCustomNewItem.value = false;
  selectedItem.value = null;
  activeTags.value = [];
  customNoteInput.value = '';
  isSliderExpanded.value = false;
  openedFromNewAdd.value = false;
  duplicateWarning.value = false;
  barcodeError.value = '';
  recentlyAddedKeys.value = [];
  dismissedKeys.value = [];
  emit('close');
};

const highlightText = (text, match) => {
  if (!match) return text;
  const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedMatch})`, 'gi');
  return text.replace(regex, '<strong>$1</strong>');
};

onMounted(() => {
  if (props.isOpen) {
    lockBackgroundScroll();
    loadDueSuggestions();
    if (props.editItem) {
      openedFromNewAdd.value = false;
      setupEditItem(props.editItem);
    } else {
      nextTick(() => {
        inputRef.value?.focus({ preventScroll: true });
      });
    }
  }
});

onUnmounted(() => {
  unlockBackgroundScroll();
});

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    lockBackgroundScroll();
    recentlyAddedKeys.value = [];
    dismissedKeys.value = [];
    syncUserMappings();
    loadDueSuggestions();
    if (props.editItem) {
      openedFromNewAdd.value = false;
      setupEditItem(props.editItem);
    } else if (props.startWithScanner) {
      openedFromNewAdd.value = false;
      triggerScan();
    } else {
      showScanner.value = false;
      openedFromNewAdd.value = false;
      nextTick(() => {
        inputRef.value?.focus({ preventScroll: true });
      });
    }
  } else {
    unlockBackgroundScroll();
    closeModal();
  }
});

watch(() => props.listId, () => {
  if (props.isOpen) {
    loadDueSuggestions();
  }
});

watch(() => props.editItem, (newVal) => {
  if (newVal && props.isOpen) {
    openedFromNewAdd.value = false;
    setupEditItem(newVal);
  }
});
</script>

<template>
  <transition name="scrim-fade">
    <div v-if="isOpen" class="modal-backdrop" @click="handleDismiss">
      <div class="modal-content" :class="{ 'is-details': selectedItem }" @click.stop ref="sheetRef" :style="sheetStyle">

        <!-- STEP 1: Search -->
        <div v-if="!selectedItem" class="search-step-container" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
          <!-- Scanner View -->
          <BarcodeScanner v-if="showScanner" @close="handleWebScannerClose" @scan="handleScan" />

          <!-- Search Step View -->
          <div class="search-step" v-show="!showScanner" style="flex-direction: column-reverse;">
            <div v-if="query.length >= 1" class="results-list" style="margin-bottom: 16px;">
              <!-- Pinned Quick-Add Card when Natural-Language Modifiers are detected -->
              <button
                v-if="parsedQuickInput?.has_modifiers && parsedQuickInput?.matched_name"
                type="button"
                class="quick-add-card"
                :style="{ '--qa-accent': getCategoryDef(parsedQuickInput.matched_category).color }"
                @click="quickAddParsedItem"
              >
                <div class="quick-add-left" :style="{ color: getCategoryDef(parsedQuickInput.matched_category).color }">
                  <CategoryIcon :name="parsedQuickInput.matched_name" :category="parsedQuickInput.matched_category" size="34" />
                </div>
                <div class="quick-add-center">
                  <div class="quick-add-name-row">
                    <span class="quick-add-name">{{ parsedQuickInput.matched_name }}</span>
                    <span class="quick-add-cat-dot" :style="{ backgroundColor: getCategoryDef(parsedQuickInput.matched_category).color }"></span>
                  </div>
                  <div class="quick-add-pills">
                    <span
                      v-for="vp in parsedQuickInput.detected_variant_pills"
                      :key="'qv-' + vp"
                      class="qa-pill qa-pill--variant"
                    >
                      {{ vp }}
                    </span>
                    <span
                      v-for="cp in parsedQuickInput.detected_custom_pills"
                      :key="'qc-' + cp"
                      class="qa-pill qa-pill--custom"
                    >
                      {{ cp }}
                    </span>
                    <span
                      v-for="mp in parsedQuickInput.detected_meta_tags"
                      :key="'qm-' + mp"
                      class="qa-pill qa-pill--meta"
                    >
                      {{ mp }}
                    </span>
                  </div>
                </div>
                <div class="quick-add-right">
                  <span class="quick-add-qty-badge">{{ parsedQuickInput.count_quantity }}×</span>
                  <span class="quick-add-plus-btn" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </span>
                </div>
              </button>

              <div class="ks-grid items-grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2" style="padding: 0 4px;">
                <div
                  v-for="item in results"
                  :key="item.id || item.name"
                  class="grid-card"
                  @click="selectItem(item)"
                >
                  <div class="absolute -top-4 -right-4 w-24 h-24 rounded-full blur-xl opacity-15 pointer-events-none" :style="{ backgroundColor: getCategoryDef(item.category).color }"></div>
                  <div class="item-icon-container flex items-center justify-center mb-1 select-none" :style="{ color: getCategoryDef(item.category).color }">
                    <CategoryIcon class="icon-svg" :name="item.name" :category="item.category" size="64" />
                  </div>
                  <div class="card-text-area">
                    <span class="item-name" v-html="highlightText(item.name, query)"></span>
                    <span class="item-regular-tags" v-if="item.matchedAlias">{{ item.matchedAlias }}</span>
                  </div>
                </div>
              </div>

              <div v-if="results.length === 0 && !parsedQuickInput?.has_modifiers" class="no-results">
                Keine Vorschläge gefunden. Drücke Enter, um "{{ query }}" hinzuzufügen.
              </div>
            </div>

            <!-- Instant Quick-Add Confirmation Banner -->
            <div v-if="quickAddFeedback" class="quick-add-feedback-banner">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              <span>{{ quickAddFeedback }}</span>
            </div>

            <!-- "Bald wieder leer" Suggestions Section -->
            <div
              v-if="!query.trim() && visibleDueSuggestions.length > 0"
              class="restock-suggestions-section"
            >
              <div class="restock-section-header">
                <div class="restock-title-wrapper">
                  <svg class="restock-header-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                  </svg>
                  <span class="restock-title">Bald wieder leer</span>
                  <span class="restock-count-badge">{{ visibleDueSuggestions.length }}</span>
                </div>
              </div>

              <div class="restock-chips-slider" @touchstart.stop @touchmove.stop>
                <div
                  v-for="sug in visibleDueSuggestions"
                  :key="sug.article_key || sug.articleKey"
                  class="restock-card"
                  :style="{ '--cat-accent': getCategoryDef(sug.category).color }"
                  @click="restockSuggestion(sug)"
                  role="button"
                  tabindex="0"
                  :aria-label="`${sug.display_name || sug.name} wieder auf die Liste setzen`"
                >
                  <button
                    type="button"
                    class="restock-dismiss-btn"
                    @click.stop="dismissSuggestion(sug)"
                    :aria-label="`${sug.display_name || sug.name} Vorschlag verwerfen`"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>

                  <div class="restock-card-main">
                    <div class="restock-icon-wrapper" :style="{ color: getCategoryDef(sug.category).color }">
                      <CategoryIcon :name="sug.display_name || sug.name" :category="sug.category" size="26" />
                    </div>
                    <div class="restock-card-text">
                      <span class="restock-item-name">{{ sug.display_name || sug.name }}</span>
                      <span class="restock-cadence">{{ sug.cadence_text || sug.cadenceText }}</span>
                    </div>
                  </div>

                  <div class="restock-add-badge">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-header">
              <div style="flex: 1; display: flex; flex-direction: column; position: relative;">
                <div v-if="barcodeError" class="barcode-not-found-banner">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <span>{{ barcodeError }}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <input
                    ref="inputRef"
                    v-model="query"
                    @input="handleInput($event); barcodeError = '';"
                    type="text"
                    class="modal-input"
                    placeholder="Suchen oder z. B. „2x Milch bio !“..."
                    @keyup.enter="confirmSelection(false)"
                  />
                </div>
              </div>
              <button class="close-btn ks-icon-btn" @click="closeModal" aria-label="Schließen">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- STEP 2: Compact Slider & Stepper Details -->
        <div v-else class="tags-step">
          <div class="ks-sheet__handle" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd"></div>

          <div v-if="editIncrementNotice" class="edit-increment-notice">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>{{ editIncrementNotice }}</span>
          </div>

          <!-- Header: Icon, Name, Category Selector (No saved badge, no trash icon) -->
          <div class="modal-header modal-header--details">
            <div class="header-content">
              <div
                class="item-icon-container flex items-center justify-center p-0 flex-shrink-0"
                :style="{ color: getCategoryDef(selectedItem.category).color }"
              >
                <CategoryIcon
                  :name="selectedItem.name"
                  :category="selectedItem.category"
                  size="56"
                />
              </div>
              <div class="header-text-col">
                <h2 class="item-title">{{ selectedItem.name }}</h2>
                <button
                  type="button"
                  class="category-select-btn"
                  @click="showCategorySelector = true"
                >
                  <div class="cat-pill-content">
                    <span
                      class="cat-dot"
                      :style="{
                        backgroundColor: getCategoryDef(selectedItem.category).color,
                        boxShadow: '0 0 8px ' + getCategoryDef(selectedItem.category).color
                      }"
                    ></span>
                    <span class="cat-label">{{ selectedItem.category }}</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cat-chevron">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div class="tags-content">
            <!-- Dedicated Quantity Stepper Row -->
            <div class="quantity-stepper-row">
              <span class="quantity-stepper-label">Menge</span>
              <div class="quantity-stepper-controls">
                <button
                  type="button"
                  class="stepper-btn"
                  :class="{ 'is-disabled': currentQuantity <= 1 }"
                  @click="decrementQuantity"
                  aria-label="Menge verringern"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M19 13H5v-2h14v2z"/>
                  </svg>
                </button>
                <span class="stepper-value">{{ currentQuantity }}</span>
                <button
                  type="button"
                  class="stepper-btn"
                  @click="incrementQuantity"
                  aria-label="Menge erhöhen"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Compact Unit Selector Pills (only shown when item defines multiple allowed units) -->
            <div v-if="availableUnits.length > 1" class="unit-pill-row" @touchstart.stop>
              <button
                v-for="u in availableUnits"
                :key="'unit-' + u"
                type="button"
                class="unit-pill-btn"
                :class="{ active: currentUnit === u }"
                :style="currentUnit === u ? activeChipStyle : defaultChipStyle"
                @click="selectUnit(u)"
              >
                {{ u }}
              </button>
            </div>

            <!-- Compact Variant & Notes Slider -->
            <div v-if="totalSliderPillsCount > 0" class="slider-header">
              <span class="slider-title">Varianten & Notizen</span>
              <button
                v-if="totalSliderPillsCount > 7"
                type="button"
                class="slider-expand-btn"
                @click="isSliderExpanded = !isSliderExpanded"
              >
                {{ isSliderExpanded ? 'Weniger' : `+ Alle (${totalSliderPillsCount})` }}
              </button>
            </div>

            <div
              v-if="totalSliderPillsCount > 0"
              class="variant-slider"
              :class="{ 'is-expanded': isSliderExpanded }"
              @touchstart.stop
            >
              <!-- 1. Remembered Custom Note Pills -->
              <button
                v-for="note in allCustomNotes"
                :key="'note-' + note"
                type="button"
                class="ks-chip tag-chip tag-custom-note"
                :class="{ active: activeTags.includes(note) }"
                :style="activeTags.includes(note) ? activeChipStyle : defaultChipStyle"
                @click="toggleTag(note)"
              >
                <span class="pill-text">{{ note }}</span>
                <span
                  class="pill-remove-btn"
                  @click.stop="handleRemoveCustomNote(note)"
                  title="Notiz entfernen"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </span>
              </button>

              <!-- 2. Constellations Pills -->
              <button
                v-for="tag in constellationPills"
                :key="'c-' + tag"
                type="button"
                class="ks-chip tag-chip tag-meta"
                :class="{ active: activeTags.includes(tag) }"
                :style="activeTags.includes(tag) ? activeChipStyle : defaultChipStyle"
                @click="toggleTag(tag)"
              >
                {{ tag }}
              </button>

              <!-- 3. Global Meta Pills (diet, brand, etc.) -->
              <button
                v-for="tag in metaPills"
                :key="'m-' + tag"
                type="button"
                class="ks-chip tag-chip tag-meta"
                :class="{ active: activeTags.includes(tag) }"
                :style="activeTags.includes(tag) ? activeChipStyle : defaultChipStyle"
                @click="toggleTag(tag)"
              >
                {{ tag }}
              </button>
            </div>

            <!-- Custom Note Input -->
            <div class="custom-note-input-row">
              <input
                type="text"
                v-model="customNoteInput"
                placeholder="Eigene Notiz hinzufügen..."
                class="custom-note-input"
                @keydown.enter.prevent="handleAddCustomNote"
              />
              <button
                type="button"
                class="custom-note-add-btn"
                :disabled="!customNoteInput.trim()"
                @click="handleAddCustomNote"
                aria-label="Notiz hinzufügen"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
            </div>

            <!-- 3-Column Meta-Tags Row -->
            <div class="meta-tags-three-col">
              <button
                v-for="tag in ['Dringend', 'Angebot', 'Wenn\'s passt']"
                :key="'u-' + tag"
                type="button"
                class="ks-chip meta-tag-col-btn"
                :class="{ active: activeTags.includes(tag) }"
                :style="activeTags.includes(tag) ? activeChipStyle : defaultChipStyle"
                @click="toggleTag(tag)"
              >
                <svg v-if="tag === 'Dringend'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                </svg>
                <svg v-if="tag === 'Angebot'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 6.33 7 5.5 7z"/>
                </svg>
                <svg v-if="tag === 'Wenn\'s passt'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2zm4 5h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <span class="meta-tag-text">{{ tag }}</span>
              </button>
            </div>

            <!-- Two-Button Footer -->
            <div class="modal-footer-two-btn">
              <button
                v-if="openedFromNewAdd"
                type="button"
                class="ks-btn-pill-secondary flex-1"
                @click="handleCancel"
              >
                Abbrechen
              </button>
              <button
                v-else
                type="button"
                class="ks-btn-pill-danger flex-1"
                @click="handleDelete"
              >
                Löschen
              </button>
              <button
                type="button"
                class="ks-btn-pill-primary flex-1"
                @click="handleDone"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>

        <!-- Category Selector Sheet -->
        <transition name="sheet-slide">
          <div v-if="showCategorySelector" class="ks-sheet" :style="catSheetStyle" @click.stop style="z-index: 101;">
            <div class="ks-sheet__handle" @touchstart="onCatTouchStart" @touchmove="onCatTouchMove" @touchend="onCatTouchEnd"></div>
            <h3 class="sheet-heading">Kategorie auswählen</h3>
            <div class="category-list">
              <button
                v-for="cat in predefinedCategories"
                :key="cat.name"
                class="category-list-item"
                @click="selectCategory(cat.name)"
              >
                <span class="cat-color-dot" :style="{ backgroundColor: cat.color }"></span>
                <span class="cat-name">{{ cat.name }}</span>
                <svg v-if="selectedItem?.category === cat.name" class="check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </button>
            </div>
            <button class="ks-btn-pill-secondary full-width mt-3" @click="showCategorySelector = false">Abbrechen</button>
          </div>
        </transition>

      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(11, 15, 23, 0.45);
  backdrop-filter: blur(1.5px);
  -webkit-backdrop-filter: blur(1.5px);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.modal-content {
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: none;
  width: 100%;
  max-width: var(--ks-page-width);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border-radius: 28px 28px 0 0;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6);
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.modal-content.is-details {
  max-height: 90vh;
}

.ks-sheet__handle {
  width: 48px;
  height: 6px;
  background: #334155;
  border-radius: 3px;
  margin: 0 auto 16px auto;
  flex-shrink: 0;
}

.search-step {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
}

.modal-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header--details {
  margin-top: 0;
  padding-bottom: 14px;
}

.header-content {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
}

.header-text-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.item-title {
  margin: 0 0 6px 0;
  font-size: 22px;
  font-weight: 700;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-select-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(51, 65, 85, 0.85);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  color: #e2e8f0;
  width: 100%;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.cat-pill-content {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.cat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cat-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.cat-chevron {
  flex-shrink: 0;
  opacity: 0.7;
}

.modal-input {
  width: 100%;
  background: var(--ks-surface-2);
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 18px;
  color: var(--ks-text);
  outline: none;
  transition: border-color 0.2s;
}

.modal-input::placeholder {
  color: var(--ks-text-muted);
}

.barcode-not-found-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  line-height: 1.35;
}

.barcode-not-found-banner svg {
  flex-shrink: 0;
  fill: #ef4444;
}

.close-btn {
  margin-left: 8px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn svg { width: 24px; height: 24px; fill: currentColor; }

.results-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.ks-grid {
  display: grid;
  gap: 8px;
  align-items: start;
}

.grid-card {
  display: flex; flex-direction: column;
  border-radius: 1rem;
  padding: 8px;
  cursor: pointer; text-align: center;
  transition: transform 0.1s, opacity 0.2s, background 0.2s, border-color 0.3s;
  position: relative;
  background: #1e293b !important;
  border: none;
  min-height: 0;
  overflow: hidden;
  justify-content: flex-start;
  align-items: center;
  color: white !important;
}

.grid-card:active { transform: scale(0.95); }
.grid-card:hover { background: #334155 !important; }

.icon-svg { display: flex; align-items: center; justify-content: center; }
.icon-svg :deep(svg) { width: 55px; height: 55px; }

.card-text-area {
  display: flex; flex-direction: column;
  margin-top: 4px;
  width: 100%;
  position: relative;
  z-index: 1;
}

.item-name {
  font-size: 12px; font-weight: 600;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; line-height: 1.2; color: var(--ks-text);
}

.item-regular-tags {
  font-size: 10px; color: #94a3b8; line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 2px;
}

.no-results {
  padding: 16px;
  text-align: center;
  color: var(--ks-text-muted);
  font-size: 14px;
}

/* Step 2 Layout */
.tags-step {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.tags-content {
  overflow-y: auto;
  padding-bottom: 12px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Quantity Stepper Row */
.quantity-stepper-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(51, 65, 85, 0.7);
  border-radius: 14px;
  margin-bottom: 16px;
}

.quantity-stepper-label {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}

.quantity-stepper-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stepper-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #334155;
  border: 1px solid #475569;
  color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s, transform 0.1s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.stepper-btn:active {
  transform: scale(0.92);
}

.stepper-btn.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.stepper-value {
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
  min-width: 28px;
  text-align: center;
}

.unit-pill-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  white-space: nowrap;
  margin-top: -6px;
  margin-bottom: 14px;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.unit-pill-row::-webkit-scrollbar {
  display: none;
}

.unit-pill-btn {
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid #334155;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

/* Variant Slider */
.slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.slider-title {
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slider-expand-btn {
  background: transparent;
  border: none;
  color: var(--ks-primary, #38bdf8);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}

.variant-slider {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  white-space: nowrap;
  touch-action: pan-x;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 6px;
  scrollbar-width: none;
}

.variant-slider::-webkit-scrollbar {
  display: none;
}

.variant-slider.is-expanded {
  flex-wrap: wrap;
  overflow-x: visible;
  white-space: normal;
}

.tag-chip {
  padding: 8px 14px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #334155;
  color: #cbd5e1;
  background: #1e293b;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tag-chip.active {
  border-color: currentColor;
}

.tag-custom-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 8px 14px;
}

.pill-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  margin-left: 2px;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
}

.pill-remove-btn:hover,
.pill-remove-btn:active {
  background: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

/* Custom Note Input */
.custom-note-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  margin-bottom: 16px;
  position: relative;
}

.custom-note-input {
  flex: 1;
  min-width: 0;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 10px 42px 10px 14px;
  font-size: 14px;
  color: #f1f5f9;
  outline: none;
  transition: border-color 0.2s;
}

.custom-note-input:focus {
  border-color: var(--ks-primary, #38bdf8);
}

.custom-note-add-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--ks-primary, #38bdf8);
  border: none;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.custom-note-add-btn:active {
  transform: translateY(-50%) scale(0.92);
}

.custom-note-add-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Meta-tags 3-Column Row */
.meta-tags-three-col {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.meta-tag-col-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.15s ease;
}

.meta-tag-col-btn.active {
  border-color: currentColor;
}

.meta-tag-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Modal Footer Two Buttons */
.modal-footer-two-btn {
  display: flex;
  gap: 12px;
  margin-top: auto;
  padding-top: 12px;
}

.flex-1 {
  flex: 1;
}

/* Category Selector */
.category-list {
  display: flex; flex-direction: column; gap: 4px; max-height: 40vh; overflow-y: auto; margin-top: 12px;
}
.category-list-item {
  display: flex; align-items: center; padding: 12px 16px;
  background: var(--ks-surface-2); border: none; border-radius: 12px;
  cursor: pointer; color: var(--ks-text); font-size: 16px; text-align: left;
}
.cat-color-dot { width: 12px; height: 12px; border-radius: 50%; margin-right: 12px; }
.cat-name { flex: 1; }
.check-icon { width: 20px; height: 20px; fill: var(--ks-primary); }

.mt-3 {
  margin-top: 12px;
}
.full-width {
  width: 100%;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
}

/* Restock Suggestions Section ("Bald wieder leer") */
.restock-suggestions-section {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  animation: restockFadeIn 0.2s ease-out;
}

@keyframes restockFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.restock-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 6px 4px;
}

.restock-title-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.restock-header-icon {
  color: #38bdf8;
}

.restock-title {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.restock-count-badge {
  font-size: 11px;
  font-weight: 700;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 1px 6px;
  border-radius: 9999px;
}

.restock-chips-slider {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 4px 8px 4px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  scroll-snap-type: x mandatory;
}

.restock-chips-slider::-webkit-scrollbar {
  display: none;
}

.restock-card {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: 3px solid var(--cat-accent, #38bdf8);
  border-radius: 14px;
  padding: 8px 10px 8px 10px;
  min-height: 48px;
  cursor: pointer;
  user-select: none;
  touch-action: pan-x;
  scroll-snap-align: start;
  transition: transform 0.15s ease, background-color 0.15s ease, opacity 0.2s ease;
}

.restock-card:active {
  transform: scale(0.96);
  background: rgba(51, 65, 85, 0.95);
}

.restock-card-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.restock-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.restock-card-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.restock-item-name {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
}

.restock-cadence {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.restock-add-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  flex-shrink: 0;
  margin-left: 2px;
}

.restock-dismiss-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #334155;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
  z-index: 2;
}

.restock-dismiss-btn::before {
  content: '';
  position: absolute;
  top: -8px;
  left: -8px;
  right: -8px;
  bottom: -8px;
}

.restock-dismiss-btn:hover,
.restock-dismiss-btn:active {
  background: #475569;
  color: #f8fafc;
  transform: scale(1.1);
}

/* Quick-Add Card & Feedback */
.quick-add-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.16), rgba(30, 41, 59, 0.96));
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-left: 4px solid var(--qa-accent, #38bdf8);
  color: #f8fafc;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: transform 0.12s ease, background 0.15s ease;
}

.quick-add-card:active {
  transform: scale(0.98);
}

.quick-add-left {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.quick-add-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quick-add-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.quick-add-name {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-add-cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.quick-add-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.qa-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 9999px;
  line-height: 1.3;
}

.qa-pill--variant {
  background: rgba(56, 189, 248, 0.15);
  color: #7dd3fc;
}

.qa-pill--custom {
  background: rgba(148, 163, 184, 0.18);
  color: #e2e8f0;
}

.qa-pill--meta {
  background: rgba(244, 63, 94, 0.2);
  color: #fda4af;
}

.quick-add-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.quick-add-qty-badge {
  font-size: 15px;
  font-weight: 800;
  color: #38bdf8;
}

.quick-add-plus-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #38bdf8;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-add-feedback-banner,
.edit-increment-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(34, 197, 94, 0.14);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #86efac;
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}
</style>
