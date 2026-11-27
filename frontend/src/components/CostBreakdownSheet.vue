<script setup>
import { ref, watch } from 'vue';
import CategoryIcon from './CategoryIcon.vue';
import { useBottomSheetDrag } from '../utils/useBottomSheetDrag';
import {
  formatEurExact,
  parseGermanPriceInput
} from '../utils/priceEstimator';
import {
  savePersonalPrice,
  removePersonalPrice
} from '../services/priceService';
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
  listName: { type: String, default: '' },
  summary: {
    type: Object,
    default: () => ({
      totalEur: 0,
      pricedCount: 0,
      unpricedCount: 0,
      totalCountableCount: 0,
      excludedUnavailableCount: 0,
      hasAnyPriced: false,
      rows: []
    })
  }
});

const emit = defineEmits(['close']);

const editingRowId = ref(null);
const editPriceInput = ref('');
const editPriceError = ref('');

const { sheetStyle, onTouchStart, onTouchMove, onTouchEnd } = useBottomSheetDrag(() => {
  emit('close');
});

watch(() => props.isOpen, (open) => {
  if (!open) {
    editingRowId.value = null;
    editPriceInput.value = '';
    editPriceError.value = '';
  }
});

const getCatColor = (cat) => categoryColorMap[cat] || '#d8b4fe';

const startInlineEdit = (row) => {
  triggerLightHaptic();
  if (editingRowId.value === row.id) {
    editingRowId.value = null;
    editPriceError.value = '';
    return;
  }
  editingRowId.value = row.id;
  editPriceInput.value = row.source === 'user' && row.unitPriceEur
    ? row.unitPriceEur.toFixed(2).replace('.', ',')
    : '';
  editPriceError.value = '';
};

const saveInlinePrice = async (row) => {
  const parsed = parseGermanPriceInput(editPriceInput.value);
  if (parsed.isEmpty) {
    await removePersonalPrice({ item: row.item });
    triggerConfirmationHaptic();
    editingRowId.value = null;
    editPriceError.value = '';
    return;
  }
  if (!parsed.valid) {
    editPriceError.value = 'Bitte gültigen Preis (0,01 – 9999 €) eingeben.';
    return;
  }
  await savePersonalPrice({ item: row.item, unitPriceEur: parsed.value });
  triggerConfirmationHaptic();
  editingRowId.value = null;
  editPriceError.value = '';
};

const resetInlinePrice = async (row) => {
  await removePersonalPrice({ item: row.item });
  triggerLightHaptic();
  editingRowId.value = null;
  editPriceError.value = '';
};
</script>

<template>
  <transition name="scrim-fade">
    <div v-if="isOpen" class="cb-backdrop" @click="emit('close')">
      <div class="cb-sheet" :style="sheetStyle" @click.stop>
        <div class="ks-sheet-drag-header" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" style="touch-action: none; cursor: grab;">
          <div class="ks-sheet__handle"></div>
          <div class="cb-header">
            <div>
              <div class="cb-kicker">{{ listName || 'Einkaufsliste' }}</div>
              <h3 class="cb-total-title">
                Geschätzter Warenwert:
                <span class="cb-total-val">
                  {{ summary.hasAnyPriced ? `~${formatEurExact(summary.totalEur)}` : '~ – €' }}
                </span>
              </h3>
              <p class="cb-coverage">
                Schätzung auf Basis von {{ summary.pricedCount }} von {{ summary.totalCountableCount }} Artikeln
                <template v-if="summary.unpricedCount > 0">
                  · {{ summary.unpricedCount }} ohne Preis
                </template>
              </p>
              <p v-if="summary.excludedUnavailableCount > 0" class="cb-excluded-note">
                {{ summary.excludedUnavailableCount }} ausverkaufte{{ summary.excludedUnavailableCount === 1 ? 'r Artikel' : ' Artikel' }} nicht eingerechnet
              </p>
              <p class="cb-disclaimer">
                Richtwerte ohne Gewähr – Preise können je nach Markt und Angeboten abweichen. Tippe auf einen Artikel zum Anpassen.
              </p>
            </div>
          </div>
        </div>

        <div class="cb-rows-scroll" @touchstart.stop>
          <div v-for="row in summary.rows" :key="row.id" class="cb-row-wrap">
            <div class="cb-row" @click="startInlineEdit(row)">
              <div class="cb-row-icon" :style="{ color: getCatColor(row.category) }">
                <CategoryIcon :name="row.name" :category="row.category" size="28" />
              </div>

              <div class="cb-row-main">
                <div class="cb-row-name-line">
                  <span class="cb-row-name" :class="{ 'is-checked': row.isChecked }">{{ row.name }}</span>
                  <span v-if="row.isChecked" class="cb-checked-pill" title="Bereits im Wagen">✓</span>
                </div>
                <div class="cb-row-sub-line">
                  <span v-if="row.unitPriceEur !== null" class="cb-calc-text">
                    {{ row.quantity }} × {{ formatEurExact(row.unitPriceEur) }}
                  </span>
                  <span class="cb-source-badge" :class="'cb-src--' + row.source">
                    {{ row.sourceLabel }}
                  </span>
                </div>
              </div>

              <div class="cb-row-right">
                <span v-if="row.lineTotalEur !== null" class="cb-line-total">
                  {{ formatEurExact(row.lineTotalEur) }}
                </span>
                <span v-else class="cb-line-unpriced">Ohne Preis</span>
              </div>
            </div>

            <!-- Inline Quick Price Editor -->
            <div v-if="editingRowId === row.id" class="cb-inline-edit" @click.stop>
              <div class="cb-inline-input-wrap">
                <input
                  v-model="editPriceInput"
                  type="text"
                  inputmode="decimal"
                  class="cb-inline-input"
                  :placeholder="row.unitPriceEur ? row.unitPriceEur.toFixed(2).replace('.', ',') : 'z. B. 1,99'"
                  @keydown.enter.prevent="saveInlinePrice(row)"
                />
                <span class="cb-euro-suffix">€</span>
              </div>
              <button type="button" class="cb-save-btn" @click="saveInlinePrice(row)">Übernehmen</button>
              <button
                v-if="row.source === 'user'"
                type="button"
                class="cb-reset-btn"
                @click="resetInlinePrice(row)"
                title="Eigenen Preis entfernen"
              >
                Zurücksetzen
              </button>
            </div>
            <div v-if="editingRowId === row.id && editPriceError" class="cb-inline-error">
              {{ editPriceError }}
            </div>
          </div>
        </div>

        <button type="button" class="ks-btn-pill-secondary full-width" @click="emit('close')">Schließen</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.cb-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 15, 23, 0.62);
  backdrop-filter: blur(4px);
  z-index: 125;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.cb-sheet {
  width: 100%;
  max-width: 540px;
  max-height: 88vh;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px 24px 0 0;
  padding: 12px 18px max(20px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.55);
}

.cb-kicker {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #38bdf8;
}

.cb-total-title {
  margin: 3px 0 0;
  font-size: 17px;
  font-weight: 800;
  color: #f8fafc;
}

.cb-total-val {
  color: #38bdf8;
}

.cb-coverage {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}

.cb-excluded-note {
  margin: 3px 0 0;
  font-size: 11px;
  color: #fbbf24;
}

.cb-disclaimer {
  margin: 5px 0 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.35;
}

.cb-rows-scroll {
  overflow-y: auto;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-right: 2px;
}

.cb-row-wrap {
  border-radius: 14px;
  background: rgba(30, 41, 59, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.16);
  overflow: hidden;
}

.cb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

.cb-row-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.cb-row-main {
  flex: 1;
  min-width: 0;
}

.cb-row-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cb-row-name {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cb-row-name.is-checked {
  color: #94a3b8;
}

.cb-checked-pill {
  font-size: 10px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.cb-row-sub-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.cb-calc-text {
  font-size: 12px;
  color: #94a3b8;
}

.cb-source-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9999px;
}

.cb-src--user {
  background: rgba(56, 189, 248, 0.18);
  color: #7dd3fc;
}

.cb-src--community {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
}

.cb-src--reference {
  background: rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
}

.cb-src--none {
  display: none;
}

.cb-row-right {
  flex-shrink: 0;
  text-align: right;
}

.cb-line-total {
  font-size: 14px;
  font-weight: 800;
  color: #f8fafc;
}

.cb-line-unpriced {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.cb-inline-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 10px;
  background: rgba(15, 23, 42, 0.65);
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.cb-inline-input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.cb-inline-input {
  width: 100%;
  padding: 7px 26px 7px 10px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #f8fafc;
  font-size: 14px;
  font-weight: 700;
  outline: none;
}

.cb-euro-suffix {
  position: absolute;
  right: 10px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 700;
  pointer-events: none;
}

.cb-save-btn {
  padding: 7px 11px;
  border-radius: 10px;
  border: none;
  background: #38bdf8;
  color: #082f49;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.cb-reset-btn {
  padding: 7px 9px;
  border-radius: 10px;
  border: 1px solid rgba(244, 63, 94, 0.35);
  background: rgba(244, 63, 94, 0.14);
  color: #fda4af;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.cb-inline-error {
  padding: 0 12px 8px;
  font-size: 11px;
  color: #fda4af;
}

.full-width {
  width: 100%;
}
</style>
