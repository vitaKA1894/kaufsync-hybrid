<script setup>
import { ref, computed, watch } from 'vue';
import CategoryIcon from './CategoryIcon.vue';
import StoreLogo from './StoreLogo.vue';
import { applyTemplateToTargetList } from '../services/templateService';
import { useBottomSheetDrag } from '../utils/useBottomSheetDrag';
import { triggerLightHaptic, triggerConfirmationHaptic } from '../utils/hapticsService';

const categoryColorMap = {
  'Obst & Gemüse': '#86efac',
  'Brot & Backwaren': '#fef08a',
  'Fleisch & Fisch': '#fca5a5',
  'Milchprodukte & Tiefkühlkost': '#93c5fd',
  'Vorratskammer': '#fdba74',
  'Getränke & Genussmittel': '#a5b4fc',
  'Drogerie, Haushalt & Tierbedarf': '#5eead4',
  'Sonstiges': '#d8b4fe'
};

const props = defineProps({
  isOpen: Boolean,
  template: { type: Object, default: null },
  availableLists: { type: Array, default: () => [] },
  defaultListId: { type: String, default: '' }
});

const emit = defineEmits(['close', 'applied']);

const selectedIds = ref(new Set());
const targetListId = ref('');
const isApplying = ref(false);
const errorMsg = ref('');

const { sheetStyle, onTouchStart, onTouchMove, onTouchEnd } = useBottomSheetDrag(() => {
  if (!isApplying.value) emit('close');
});

const templateItems = computed(() => {
  return Array.isArray(props.template?.items) ? props.template.items : [];
});

watch(() => [props.isOpen, props.template, props.defaultListId, props.availableLists], () => {
  if (props.isOpen && props.template) {
    errorMsg.value = '';
    selectedIds.value = new Set(templateItems.value.map(it => it.id));
    if (props.defaultListId && (props.availableLists || []).some(l => l.id === props.defaultListId)) {
      targetListId.value = props.defaultListId;
    } else if ((props.availableLists || []).length > 0) {
      targetListId.value = props.availableLists[0].id;
    } else {
      targetListId.value = '';
    }
  }
}, { immediate: true });

const selectedCount = computed(() => selectedIds.value.size);

const toggleItem = (id) => {
  triggerLightHaptic();
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
};

const selectAll = () => {
  triggerLightHaptic();
  selectedIds.value = new Set(templateItems.value.map(it => it.id));
};

const selectNone = () => {
  triggerLightHaptic();
  selectedIds.value = new Set();
};

const getCatColor = (cat) => categoryColorMap[cat] || '#d8b4fe';

const handleApply = async () => {
  if (isApplying.value) return;
  if (!targetListId.value) {
    errorMsg.value = 'Bitte wähle eine Ziel-Einkaufsliste aus.';
    return;
  }
  const chosenItems = templateItems.value.filter(it => selectedIds.value.has(it.id));
  if (chosenItems.length === 0) {
    errorMsg.value = 'Bitte wähle mindestens einen Artikel aus.';
    return;
  }

  isApplying.value = true;
  errorMsg.value = '';
  try {
    await applyTemplateToTargetList({
      listId: targetListId.value,
      templateName: props.template?.name || 'Vorlage',
      selectedItems: chosenItems
    });
    triggerConfirmationHaptic();
    const targetList = (props.availableLists || []).find(l => l.id === targetListId.value);
    emit('applied', {
      count: chosenItems.length,
      templateName: props.template?.name || 'Vorlage',
      listId: targetListId.value,
      listName: targetList?.name || 'Liste'
    });
  } catch (err) {
    errorMsg.value = err?.message || 'Vorlage konnte nicht übernommen werden.';
  } finally {
    isApplying.value = false;
  }
};
</script>

<template>
  <transition name="scrim-fade">
    <div v-if="isOpen && template" class="tmpl-apply-backdrop" @click="emit('close')">
      <div class="tmpl-apply-sheet" :style="sheetStyle" @click.stop>
        <div class="ks-sheet-drag-header" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" style="touch-action: none; cursor: grab;">
          <div class="ks-sheet__handle"></div>
          <div class="tmpl-apply-header">
            <div class="tmpl-apply-title-group">
              <h3 class="tmpl-apply-title">{{ template.name }}</h3>
              <p class="tmpl-apply-sub">Artikel prüfen &amp; übernehmen ({{ selectedCount }}/{{ templateItems.length }})</p>
            </div>
            <div class="tmpl-toggle-pills">
              <button type="button" class="tmpl-mini-pill" @click="selectAll">Alle</button>
              <button type="button" class="tmpl-mini-pill" @click="selectNone">Keine</button>
            </div>
          </div>
        </div>

        <div v-if="errorMsg" class="tmpl-apply-error">{{ errorMsg }}</div>

        <div class="tmpl-apply-checklist" @touchstart.stop>
          <div
            v-for="item in templateItems"
            :key="item.id"
            class="tmpl-check-row"
            :class="{ 'is-unchecked': !selectedIds.has(item.id) }"
            @click="toggleItem(item.id)"
          >
            <div class="tmpl-checkbox" :class="{ checked: selectedIds.has(item.id) }">
              <svg v-if="selectedIds.has(item.id)" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </div>
            <div class="tmpl-row-icon" :style="{ color: getCatColor(item.category) }">
              <CategoryIcon :name="item.name" :category="item.category" size="30" />
            </div>
            <div class="tmpl-row-info">
              <div class="tmpl-row-top">
                <span class="tmpl-row-name">{{ item.name }}</span>
                <span v-if="(item.quantity || 1) > 1" class="tmpl-row-qty">{{ item.quantity }}×</span>
              </div>
              <div class="tmpl-row-meta">
                <span class="tmpl-cat-badge" :style="{ color: getCatColor(item.category), borderColor: getCatColor(item.category) + '44' }">
                  {{ item.category }}
                </span>
                <span
                  v-for="tag in [...(item.variants || []), ...(item.meta_tags || [])]"
                  :key="tag"
                  class="tmpl-variant-pill"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Target List Selector -->
        <div class="tmpl-target-section">
          <div class="tmpl-target-label">Ziel-Einkaufsliste</div>
          <div v-if="(availableLists || []).length === 0" class="tmpl-no-lists">
            Erstelle zuerst eine Einkaufsliste.
          </div>
          <div v-else class="tmpl-target-slider" @touchstart.stop>
            <button
              v-for="l in availableLists"
              :key="'tgt-' + l.id"
              type="button"
              class="tmpl-target-chip"
              :class="{ active: targetListId === l.id }"
              @click="targetListId = l.id; triggerLightHaptic();"
            >
              <StoreLogo :name="l.name" :size="20" />
              <span>{{ l.name }}</span>
            </button>
          </div>
        </div>

        <div class="tmpl-apply-footer">
          <button type="button" class="ks-btn-pill-secondary flex-1" @click="emit('close')">Abbrechen</button>
          <button
            type="button"
            class="ks-btn-pill-primary flex-1"
            :disabled="isApplying || selectedCount === 0 || !targetListId"
            @click="handleApply"
          >
            {{ isApplying ? 'Übernehme...' : `In Liste übernehmen (${selectedCount})` }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.tmpl-apply-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 15, 23, 0.65);
  backdrop-filter: blur(4px);
  z-index: 140;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.tmpl-apply-sheet {
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px 24px 0 0;
  padding: 12px 18px max(20px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.55);
}

.tmpl-apply-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tmpl-apply-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #f8fafc;
}

.tmpl-apply-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.tmpl-toggle-pills {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.tmpl-mini-pill {
  padding: 5px 10px;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.14);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.tmpl-apply-error {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.4);
  color: #fda4af;
  font-size: 12px;
}

.tmpl-apply-checklist {
  overflow-y: auto;
  max-height: 44vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.tmpl-check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(30, 41, 59, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.18);
  cursor: pointer;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}

.tmpl-check-row.is-unchecked {
  opacity: 0.48;
}

.tmpl-checkbox {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 2px solid rgba(148, 163, 184, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #0f172a;
}

.tmpl-checkbox.checked {
  background: #38bdf8;
  border-color: #38bdf8;
}

.tmpl-row-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.tmpl-row-info {
  flex: 1;
  min-width: 0;
}

.tmpl-row-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tmpl-row-name {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
}

.tmpl-row-qty {
  font-size: 12px;
  font-weight: 800;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 1px 6px;
  border-radius: 6px;
}

.tmpl-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.tmpl-cat-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9999px;
  border: 1px solid;
}

.tmpl-variant-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
}

.tmpl-target-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tmpl-target-label {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tmpl-target-slider {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.tmpl-target-slider::-webkit-scrollbar {
  display: none;
}

.tmpl-target-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-radius: 9999px;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
}

.tmpl-target-chip.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #ffffff;
}

.tmpl-no-lists {
  font-size: 13px;
  color: #fda4af;
}

.tmpl-apply-footer {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.flex-1 {
  flex: 1;
}
</style>
