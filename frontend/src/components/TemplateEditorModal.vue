<script setup>
import { ref, watch } from 'vue';
import CategoryIcon from './CategoryIcon.vue';
import { saveTemplate } from '../services/templateService';
import { searchWithUserOverrides, resolveArticleWithUserLayer } from '../services/userMappingService';
import { parseQuickInput } from '../utils/quickInputParser';
import { triggerLightHaptic, triggerConfirmationHaptic } from '../utils/hapticsService';

const props = defineProps({
  isOpen: Boolean,
  editTemplate: { type: Object, default: null },
  initialDraft: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);

const templateName = ref('');
const items = ref([]);
const searchQuery = ref('');
const searchResults = ref([]);
const isSaving = ref(false);
const errorMsg = ref('');

watch(() => [props.isOpen, props.editTemplate, props.initialDraft], () => {
  if (!props.isOpen) return;
  errorMsg.value = '';
  searchQuery.value = '';
  searchResults.value = [];

  if (props.editTemplate) {
    templateName.value = props.editTemplate.name || '';
    items.value = (props.editTemplate.items || []).map(it => ({ ...it, variants: [...(it.variants || [])], meta_tags: [...(it.meta_tags || [])] }));
  } else if (props.initialDraft) {
    templateName.value = props.initialDraft.name || '';
    items.value = (props.initialDraft.items || []).map(it => ({ ...it, variants: [...(it.variants || [])], meta_tags: [...(it.meta_tags || [])] }));
  } else {
    templateName.value = '';
    items.value = [];
  }
}, { immediate: true });

const onSearchInput = () => {
  const q = searchQuery.value.trim();
  if (!q) {
    searchResults.value = [];
    return;
  }
  const parsed = parseQuickInput(q, '');
  const searchTarget = (parsed?.has_modifiers && parsed?.core_query) ? parsed.core_query : q;
  searchResults.value = searchWithUserOverrides(searchTarget).slice(0, 8);
};

const addArticleFromSearch = (entry) => {
  triggerLightHaptic();
  const parsed = parseQuickInput(searchQuery.value.trim(), '');
  const qty = (parsed?.has_modifiers && parsed?.count_quantity) ? parsed.count_quantity : 1;
  const variants = [...(parsed?.detected_variant_pills || [])];
  if (entry.matchedAlias && entry.matchedAlias.toLowerCase() !== entry.name.toLowerCase() && !variants.includes(entry.matchedAlias)) {
    variants.push(entry.matchedAlias);
  }
  const metaTags = [...(parsed?.detected_meta_tags || [])];

  const existing = items.value.find(
    it => it.name.toLowerCase() === entry.name.toLowerCase() &&
      JSON.stringify(it.variants || []) === JSON.stringify(variants)
  );
  if (existing) {
    existing.quantity = (existing.quantity || 1) + qty;
  } else {
    items.value.push({
      id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: entry.name,
      quantity: qty,
      unit: entry.defaultUnit || 'Stk',
      category: entry.category || 'Sonstiges',
      icon: entry.icon || null,
      taxonomy_id: entry.id || entry.taxonomyId || null,
      variants,
      meta_tags: metaTags
    });
  }
  searchQuery.value = '';
  searchResults.value = [];
};

const addCustomFromInput = () => {
  const raw = searchQuery.value.trim();
  if (!raw) return;
  const parsed = parseQuickInput(raw, '');
  if (parsed?.has_modifiers && parsed?.matched_name) {
    addArticleFromSearch({
      id: parsed.matched_taxonomy_id,
      name: parsed.matched_name,
      category: parsed.matched_category,
      icon: parsed.matched_icon,
      defaultUnit: parsed.default_unit || 'Stk'
    });
    return;
  }
  if (searchResults.value.length > 0 && searchResults.value[0].name.toLowerCase() === raw.toLowerCase()) {
    addArticleFromSearch(searchResults.value[0]);
    return;
  }
  const resolved = resolveArticleWithUserLayer(raw);
  addArticleFromSearch({
    id: resolved.taxonomyId,
    name: resolved.name || raw,
    category: resolved.category || 'Sonstiges',
    icon: resolved.icon || null,
    defaultUnit: resolved.defaultUnit || 'Stk'
  });
};

const adjustQty = (idx, delta) => {
  triggerLightHaptic();
  const nextQty = (items.value[idx].quantity || 1) + delta;
  if (nextQty <= 0) {
    items.value.splice(idx, 1);
  } else {
    items.value[idx].quantity = nextQty;
  }
};

const removeItem = (idx) => {
  triggerLightHaptic();
  items.value.splice(idx, 1);
};

const handleSave = async () => {
  if (isSaving.value) return;
  errorMsg.value = '';
  isSaving.value = true;
  try {
    const saved = await saveTemplate({
      id: props.editTemplate?.id || null,
      name: templateName.value,
      items: items.value
    });
    triggerConfirmationHaptic();
    emit('saved', saved);
  } catch (err) {
    errorMsg.value = err?.message || 'Vorlage konnte nicht gespeichert werden.';
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <transition name="scrim-fade">
    <div v-if="isOpen" class="tmpl-editor-backdrop" @click="emit('close')">
      <div class="tmpl-editor-card" @click.stop>
        <div class="tmpl-editor-header">
          <h3 class="tmpl-editor-title">{{ editTemplate ? 'Vorlage bearbeiten' : 'Neue Vorlage speichern' }}</h3>
          <button type="button" class="ks-icon-btn" @click="emit('close')" aria-label="Schließen">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div v-if="errorMsg" class="tmpl-editor-error">{{ errorMsg }}</div>

        <input
          v-model="templateName"
          type="text"
          class="tmpl-name-input"
          placeholder="Name (z. B. Wochen-Basics, Grillabend)..."
        />

        <!-- Quick article search to add into template -->
        <div class="tmpl-search-box">
          <input
            v-model="searchQuery"
            type="text"
            class="tmpl-search-input"
            placeholder="Artikel suchen oder z. B. „6x Bratwurst“ + Enter..."
            @input="onSearchInput"
            @keydown.enter.prevent="addCustomFromInput"
          />
          <button
            v-if="searchQuery.trim()"
            type="button"
            class="tmpl-add-inline-btn"
            @click="addCustomFromInput"
          >
            +
          </button>
        </div>

        <div v-if="searchResults.length > 0" class="tmpl-search-results">
          <button
            v-for="res in searchResults"
            :key="res.id || res.name"
            type="button"
            class="tmpl-search-chip"
            @click="addArticleFromSearch(res)"
          >
            <CategoryIcon :name="res.name" :category="res.category" size="18" />
            <span>{{ res.name }}</span>
          </button>
        </div>

        <div class="tmpl-items-scroll">
          <div v-if="items.length === 0" class="tmpl-items-empty">
            Füge oben Artikel hinzu, die in dieser Vorlage gespeichert werden sollen.
          </div>
          <div v-for="(it, idx) in items" :key="it.id || idx" class="tmpl-edit-row">
            <CategoryIcon :name="it.name" :category="it.category" size="26" />
            <div class="tmpl-edit-info">
              <div class="tmpl-edit-name">{{ it.name }}</div>
              <div v-if="(it.variants?.length || 0) + (it.meta_tags?.length || 0) > 0" class="tmpl-edit-tags">
                {{ [...(it.variants || []), ...(it.meta_tags || [])].join(', ') }}
              </div>
            </div>
            <div class="tmpl-edit-stepper">
              <button type="button" class="tmpl-step-btn" @click="adjustQty(idx, -1)">−</button>
              <span class="tmpl-step-val">{{ it.quantity || 1 }}</span>
              <button type="button" class="tmpl-step-btn" @click="adjustQty(idx, 1)">+</button>
            </div>
            <button type="button" class="tmpl-remove-btn" @click="removeItem(idx)" aria-label="Entfernen">✕</button>
          </div>
        </div>

        <div class="tmpl-editor-footer">
          <button type="button" class="ks-btn-pill-secondary flex-1" @click="emit('close')">Abbrechen</button>
          <button
            type="button"
            class="ks-btn-pill-primary flex-1"
            :disabled="isSaving || !templateName.trim() || items.length === 0"
            @click="handleSave"
          >
            {{ isSaving ? 'Speichere...' : 'Vorlage speichern' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.tmpl-editor-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 15, 23, 0.72);
  backdrop-filter: blur(5px);
  z-index: 150;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.tmpl-editor-card {
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px 24px 0 0;
  padding: 16px 18px max(22px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tmpl-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tmpl-editor-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #f8fafc;
}

.tmpl-editor-error {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.4);
  color: #fda4af;
  font-size: 12px;
}

.tmpl-name-input,
.tmpl-search-input {
  width: 100%;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #f8fafc;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  box-sizing: border-box;
}

.tmpl-name-input:focus,
.tmpl-search-input:focus {
  border-color: #38bdf8;
}

.tmpl-search-box {
  display: flex;
  gap: 8px;
}

.tmpl-add-inline-btn {
  width: 42px;
  border-radius: 12px;
  border: none;
  background: #38bdf8;
  color: #0f172a;
  font-size: 20px;
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
}

.tmpl-search-results {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tmpl-search-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.14);
  border: 1px solid rgba(56, 189, 248, 0.32);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tmpl-items-scroll {
  overflow-y: auto;
  max-height: 38vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tmpl-items-empty {
  padding: 20px 12px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.tmpl-edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.tmpl-edit-info {
  flex: 1;
  min-width: 0;
}

.tmpl-edit-name {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.tmpl-edit-tags {
  font-size: 11px;
  color: #94a3b8;
}

.tmpl-edit-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tmpl-step-btn {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  font-weight: 700;
  cursor: pointer;
}

.tmpl-step-val {
  min-width: 18px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #38bdf8;
}

.tmpl-remove-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px 6px;
  font-size: 14px;
}

.tmpl-remove-btn:hover {
  color: #fb7185;
}

.tmpl-editor-footer {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.flex-1 {
  flex: 1;
}
</style>
