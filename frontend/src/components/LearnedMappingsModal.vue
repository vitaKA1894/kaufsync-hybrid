<script setup>
import { ref, computed } from 'vue';
import CategoryIcon from './CategoryIcon.vue';
import ConfirmModal from './ConfirmModal.vue';
import {
  userMappings,
  deleteUserMapping,
  resetAllUserMappings
} from '../services/userMappingService';
import { triggerLightHaptic, triggerConfirmationHaptic } from '../utils/hapticsService';

const props = defineProps({
  isOpen: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);

const searchQuery = ref('');
const showResetAllConfirm = ref(false);
const isBusy = ref(false);

const categoryColors = {
  'Obst & Gemüse': '#86efac',
  'Brot & Backwaren': '#fef08a',
  'Fleisch & Fisch': '#fca5a5',
  'Milchprodukte & Tiefkühlkost': '#93c5fd',
  'Vorratskammer': '#fdba74',
  'Getränke & Genussmittel': '#a5b4fc',
  'Drogerie, Haushalt & Tierbedarf': '#5eead4',
  'Sonstiges': '#d8b4fe'
};

const getCatColor = (cat) => categoryColors[cat] || '#d8b4fe';

const filteredMappings = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return userMappings.value;
  return userMappings.value.filter(m =>
    (m.preferred_name || '').toLowerCase().includes(q) ||
    (m.preferred_category || '').toLowerCase().includes(q) ||
    (m.lookup_key || '').toLowerCase().includes(q)
  );
});

const handleDeleteOne = async (mapping) => {
  if (isBusy.value) return;
  isBusy.value = true;
  triggerLightHaptic();
  try {
    await deleteUserMapping(mapping.id);
  } finally {
    isBusy.value = false;
  }
};

const handleResetAll = async () => {
  showResetAllConfirm.value = false;
  isBusy.value = true;
  triggerConfirmationHaptic();
  try {
    await resetAllUserMappings();
  } finally {
    isBusy.value = false;
  }
};
</script>

<template>
  <transition name="scrim-fade">
    <div v-if="isOpen" class="learned-backdrop" @click="emit('close')">
      <div class="learned-sheet" @click.stop>
        <div class="sheet-handle"></div>

        <div class="learned-header">
          <div>
            <h3>Gelernte Zuordnungen</h3>
            <p class="learned-subtitle">
              Deine persönlichen Kategorien, eigenen Artikel und gemerkten Barcodes – geräteübergreifend nur für dein Konto.
            </p>
          </div>
          <button type="button" class="ks-icon-btn close-x-btn" @click="emit('close')" aria-label="Schließen">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div v-if="userMappings.length > 0" class="learned-search-wrap">
          <input
            v-model="searchQuery"
            type="text"
            class="learned-search-input"
            placeholder="Zuordnungen durchsuchen..."
          />
        </div>

        <div class="learned-body">
          <div v-if="userMappings.length === 0" class="learned-empty">
            <div class="empty-icon-circle">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7M9 21v-1h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/>
              </svg>
            </div>
            <p class="empty-title">Noch keine eigenen Zuordnungen gelernt</p>
            <p class="empty-hint">
              Ändere im Artikel-Detail, beim Rezept-Import oder nach einem Barcode-Scan eine Kategorie – KaufSync merkt sich das ab sofort automatisch.
            </p>
          </div>

          <div v-else-if="filteredMappings.length === 0" class="learned-empty">
            <p class="empty-title">Keine Treffer für „{{ searchQuery }}“</p>
          </div>

          <div v-else class="learned-list">
            <div v-for="m in filteredMappings" :key="m.id" class="learned-row">
              <div class="learned-row-icon" :style="{ color: getCatColor(m.preferred_category) }">
                <CategoryIcon :name="m.preferred_name" :category="m.preferred_category" size="30" />
              </div>

              <div class="learned-row-info">
                <div class="learned-row-title">{{ m.preferred_name }}</div>
                <div class="learned-row-meta">
                  <span
                    class="learned-cat-badge"
                    :style="{
                      borderColor: getCatColor(m.preferred_category),
                      color: getCatColor(m.preferred_category)
                    }"
                  >
                    {{ m.preferred_category }}
                  </span>
                  <span v-if="m.mapping_type === 'barcode'" class="learned-barcode-badge" title="Gespeicherter Barcode">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                      <path d="M3 4h4v2H5v2H3V4zm2 16H3v-4h2v2h2v2zm16-4h-2v2h-2v2h4v-4zm-2-12h-2V2h4v4h-2V4zM7 6h2v12H7V6zm3 0h1v12h-1V6zm2 0h3v12h-3V6zm4 0h1v12h-1V6zm2 0h1v12h-1V6z"/>
                    </svg>
                    {{ m.lookup_key }}
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="learned-delete-btn"
                :disabled="isBusy"
                @click="handleDeleteOne(m)"
                :aria-label="`${m.preferred_name} zurücksetzen`"
                title="Zurücksetzen"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="learned-footer">
          <button
            v-if="userMappings.length > 0"
            type="button"
            class="ks-btn-pill-danger reset-all-btn"
            :disabled="isBusy"
            @click="showResetAllConfirm = true"
          >
            Alle zurücksetzen
          </button>
          <button
            type="button"
            class="ks-btn-pill-secondary done-btn"
            @click="emit('close')"
          >
            Schließen
          </button>
        </div>
      </div>

      <ConfirmModal
        :show="showResetAllConfirm"
        title="Alle Zuordnungen zurücksetzen?"
        message="Möchtest du wirklich alle gelernten Kategorien, Artikel und Barcodes löschen? Zukünftige Artikel verwenden dann wieder die Standard-Taxonomie."
        confirmText="Alle löschen"
        @confirm="handleResetAll"
        @cancel="showResetAllConfirm = false"
      />
    </div>
  </transition>
</template>

<style scoped>
.learned-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 15, 23, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 140;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.learned-sheet {
  width: 100%;
  max-width: var(--ks-page-width, 640px);
  max-height: 86vh;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: none;
  border-radius: 26px 26px 0 0;
  padding: 14px 16px max(16px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6);
}

.sheet-handle {
  width: 44px;
  height: 5px;
  border-radius: 9999px;
  background: #334155;
  margin: 0 auto 12px;
  flex-shrink: 0;
}

.learned-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.learned-header h3 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
}

.learned-subtitle {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.close-x-btn {
  flex-shrink: 0;
  color: #94a3b8;
}

.learned-search-wrap {
  margin-bottom: 12px;
}

.learned-search-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 10px 14px;
  color: #f8fafc;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.learned-search-input:focus {
  border-color: var(--ks-primary, #38bdf8);
}

.learned-body {
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
}

.learned-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 28px 14px;
  color: #94a3b8;
}

.empty-icon-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.empty-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}

.empty-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  max-width: 340px;
}

.learned-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

.learned-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 10px 12px;
}

.learned-row-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.learned-row-info {
  flex: 1;
  min-width: 0;
}

.learned-row-title {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.learned-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.learned-cat-badge {
  font-size: 11px;
  font-weight: 600;
  border: 1px solid;
  padding: 1px 7px;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.5);
}

.learned-barcode-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
  background: rgba(51, 65, 85, 0.6);
  padding: 1px 7px;
  border-radius: 9999px;
}

.learned-delete-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.learned-delete-btn:active {
  transform: scale(0.94);
}

.learned-footer {
  display: flex;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.reset-all-btn,
.done-btn {
  flex: 1;
}
</style>
