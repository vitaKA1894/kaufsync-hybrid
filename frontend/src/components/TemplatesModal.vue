<script setup>
import { ref, watch } from 'vue';
import ConfirmModal from './ConfirmModal.vue';
import TemplateApplyModal from './TemplateApplyModal.vue';
import TemplateEditorModal from './TemplateEditorModal.vue';
import { getLocalTemplates, syncTemplates, deleteTemplate } from '../services/templateService';
import { useBottomSheetDrag } from '../utils/useBottomSheetDrag';
import { triggerLightHaptic } from '../utils/hapticsService';

const props = defineProps({
  isOpen: Boolean,
  availableLists: { type: Array, default: () => [] },
  defaultListId: { type: String, default: '' },
  initialMode: { type: String, default: 'overview' }, // 'overview' | 'create'
  initialDraft: { type: Object, default: null }
});

const emit = defineEmits(['close', 'applied', 'saved']);

const templates = ref(getLocalTemplates());
const showEditor = ref(false);
const editingTemplate = ref(null);
const draftForEditor = ref(null);
const showApply = ref(false);
const applyTemplateObj = ref(null);
const templateToDelete = ref(null);

const { sheetStyle, onTouchStart, onTouchMove, onTouchEnd } = useBottomSheetDrag(() => {
  if (!showEditor.value && !showApply.value && !templateToDelete.value) {
    emit('close');
  }
});

const refreshTemplates = async () => {
  templates.value = getLocalTemplates();
  const synced = await syncTemplates();
  templates.value = synced;
};

watch(() => props.isOpen, async (open) => {
  if (!open) {
    showEditor.value = false;
    showApply.value = false;
    editingTemplate.value = null;
    draftForEditor.value = null;
    applyTemplateObj.value = null;
    templateToDelete.value = null;
    return;
  }

  await refreshTemplates();

  if (props.initialMode === 'create') {
    editingTemplate.value = null;
    draftForEditor.value = props.initialDraft || { name: '', items: [] };
    showEditor.value = true;
  }
});

const openCreate = () => {
  triggerLightHaptic();
  editingTemplate.value = null;
  draftForEditor.value = null;
  showEditor.value = true;
};

const openEdit = (tmpl) => {
  triggerLightHaptic();
  editingTemplate.value = tmpl;
  draftForEditor.value = null;
  showEditor.value = true;
};

const openApply = (tmpl) => {
  triggerLightHaptic();
  applyTemplateObj.value = tmpl;
  showApply.value = true;
};

const onTemplateSaved = (saved) => {
  showEditor.value = false;
  templates.value = getLocalTemplates();
  emit('saved', saved);
  if (props.initialMode === 'create') {
    emit('close');
  }
};

const onEditorClose = () => {
  showEditor.value = false;
  if (props.initialMode === 'create') {
    emit('close');
  }
};

const onApplied = (info) => {
  showApply.value = false;
  applyTemplateObj.value = null;
  emit('applied', info);
  emit('close');
};

const executeDelete = async () => {
  if (!templateToDelete.value) return;
  await deleteTemplate(templateToDelete.value.id);
  templates.value = getLocalTemplates();
  templateToDelete.value = null;
};

const formatPreview = (tmpl) => {
  const names = (tmpl?.items || []).map(it => it.name);
  if (names.length <= 4) return names.join(', ');
  return `${names.slice(0, 4).join(', ')} +${names.length - 4}`;
};
</script>

<template>
  <div>
    <transition name="scrim-fade">
      <div v-if="isOpen && !showEditor && !showApply" class="tmpl-backdrop" @click="emit('close')">
        <div class="tmpl-sheet" :style="sheetStyle" @click.stop>
          <div class="ks-sheet-drag-header" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" style="touch-action: none; cursor: grab;">
            <div class="ks-sheet__handle"></div>
            <div class="tmpl-header">
              <div>
                <h3 class="tmpl-heading">Einkaufsvorlagen</h3>
                <p class="tmpl-sub">Wiederkehrende Einkäufe mit 1 Tipp übernehmen</p>
              </div>
              <button type="button" class="tmpl-new-btn" @click="openCreate">+ Neu</button>
            </div>
          </div>

          <div class="tmpl-list-scroll" @touchstart.stop>
            <div v-if="templates.length === 0" class="tmpl-empty">
              <div class="tmpl-empty-icon">📋</div>
              <div class="tmpl-empty-title">Noch keine Vorlagen gespeichert</div>
              <p class="tmpl-empty-desc">
                Speichere z. B. „Wochen-Basics“ oder „Grillabend“, oder erstelle eine Vorlage direkt aus deinen Listen &amp; Aktivitäten.
              </p>
              <button type="button" class="ks-btn-pill-primary" @click="openCreate">Erste Vorlage erstellen</button>
            </div>

            <div v-for="tmpl in templates" :key="tmpl.id" class="tmpl-card">
              <div class="tmpl-card-main">
                <div class="tmpl-card-title-row">
                  <span class="tmpl-card-title">{{ tmpl.name }}</span>
                  <span class="tmpl-card-count">{{ tmpl.items?.length || 0 }} Artikel</span>
                </div>
                <div class="tmpl-card-preview">{{ formatPreview(tmpl) }}</div>
              </div>
              <div class="tmpl-card-actions">
                <button type="button" class="tmpl-apply-btn" @click="openApply(tmpl)">Übernehmen</button>
                <button type="button" class="tmpl-icon-action" @click="openEdit(tmpl)" aria-label="Vorlage bearbeiten" title="Bearbeiten">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
                <button type="button" class="tmpl-icon-action danger" @click="templateToDelete = tmpl" aria-label="Vorlage löschen" title="Löschen">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <button type="button" class="ks-btn-pill-secondary full-width" @click="emit('close')">Schließen</button>
        </div>
      </div>
    </transition>

    <TemplateApplyModal
      :is-open="showApply"
      :template="applyTemplateObj"
      :available-lists="availableLists"
      :default-list-id="defaultListId"
      @close="showApply = false"
      @applied="onApplied"
    />

    <TemplateEditorModal
      :is-open="showEditor"
      :edit-template="editingTemplate"
      :initial-draft="draftForEditor"
      @close="onEditorClose"
      @saved="onTemplateSaved"
    />

    <ConfirmModal
      :show="!!templateToDelete"
      title="Vorlage löschen"
      :message="`Möchtest du die Vorlage „${templateToDelete?.name || ''}“ wirklich dauerhaft löschen?`"
      confirm-text="Löschen"
      @confirm="executeDelete"
      @cancel="templateToDelete = null"
    />
  </div>
</template>

<style scoped>
.tmpl-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 15, 23, 0.55);
  backdrop-filter: blur(3px);
  z-index: 120;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.tmpl-sheet {
  width: 100%;
  max-width: 540px;
  max-height: 88vh;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px 24px 0 0;
  padding: 12px 18px max(20px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
}

.tmpl-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.tmpl-heading {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  color: #f8fafc;
}

.tmpl-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.tmpl-new-btn {
  padding: 8px 14px;
  border-radius: 9999px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.16);
  color: #7dd3fc;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.tmpl-list-scroll {
  overflow-y: auto;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tmpl-empty {
  text-align: center;
  padding: 24px 12px;
}

.tmpl-empty-icon {
  font-size: 34px;
  margin-bottom: 6px;
}

.tmpl-empty-title {
  font-size: 15px;
  font-weight: 700;
  color: #f8fafc;
}

.tmpl-empty-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 6px auto 14px;
  max-width: 340px;
  line-height: 1.4;
}

.tmpl-card {
  padding: 13px 14px;
  border-radius: 16px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tmpl-card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tmpl-card-title {
  font-size: 15px;
  font-weight: 800;
  color: #f8fafc;
}

.tmpl-card-count {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(56, 189, 248, 0.14);
  color: #7dd3fc;
}

.tmpl-card-preview {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
  line-height: 1.35;
}

.tmpl-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tmpl-apply-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #38bdf8, #0284c7);
  color: #082f49;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.tmpl-icon-action {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.7);
  color: #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.tmpl-icon-action.danger {
  color: #fda4af;
}

.full-width {
  width: 100%;
}
</style>
