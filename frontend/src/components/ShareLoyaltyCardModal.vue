<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import StoreLogo from './StoreLogo.vue';
import { decodeBarcodeFromImage } from '../services/imageBarcodeDecoder.js';
import { saveCard, maskCardCode } from '../services/loyaltyCardService.js';
import { db } from '../db/index.js';
import { apiUrl } from '../config/api.js';
import { isOnline } from '../services/syncService.js';

const props = defineProps({
  sharedImage: {
    type: [Blob, File, String],
    default: null
  },
  sharedImagePath: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['close', 'saved']);
const router = useRouter();

const isAnalyzing = ref(true);
const detectedCode = ref('');
const detectedFormat = ref('CODE_128');
const isQrCode = ref(false);
const decodeError = ref('');
const shoppingLists = ref([]);
const existingCardsMap = ref({});
const isSaving = ref(false);
const targetListToConfirm = ref(null);
const successMessage = ref('');

const loadListsAndCards = async () => {
  const token = localStorage.getItem('token');
  try {
    const localLists = await db.lists.toArray();
    if (localLists && localLists.length > 0) {
      shoppingLists.value = localLists;
    }
  } catch (e) {}

  if (isOnline.value && token) {
    try {
      const res = await fetch(apiUrl('/api/lists'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        shoppingLists.value = await res.json();
      }
    } catch (e) {}
  }

  // Load existing loyalty cards map
  try {
    const localCards = await db.loyaltyCards.toArray();
    const map = {};
    for (const c of localCards) {
      map[c.list_id] = c;
    }
    existingCardsMap.value = map;
  } catch (e) {}
};

const analyzeImage = async () => {
  if (!props.sharedImage && !props.sharedImagePath) return;

  isAnalyzing.value = true;
  decodeError.value = '';
  detectedCode.value = '';
  targetListToConfirm.value = null;

  try {
    await loadListsAndCards();
    const result = await decodeBarcodeFromImage(props.sharedImage, props.sharedImagePath);
    if (result.success && result.code) {
      detectedCode.value = result.code;
      detectedFormat.value = result.format;
      isQrCode.value = result.isQr;
    } else {
      decodeError.value = result.error || 'Kein Code im Bild erkannt – bitte näher heranzoomen oder Nummer manuell eingeben.';
    }
  } catch (err) {
    console.error('Error analyzing shared image:', err);
    decodeError.value = 'Kein Code im Bild erkannt – bitte näher heranzoomen oder Nummer manuell eingeben.';
  } finally {
    isAnalyzing.value = false;
  }
};

watch(() => props.sharedImage, () => {
  if (props.sharedImage || props.sharedImagePath) {
    analyzeImage();
  }
}, { immediate: true });

const selectList = (list) => {
  if (existingCardsMap.value[list.id]) {
    targetListToConfirm.value = list;
  } else {
    executeSaveForList(list);
  }
};

const confirmReplace = () => {
  if (targetListToConfirm.value) {
    executeSaveForList(targetListToConfirm.value);
  }
};

const executeSaveForList = async (list) => {
  isSaving.value = true;
  try {
    const token = localStorage.getItem('token');
    await saveCard(list.id, detectedCode.value, detectedFormat.value, token);
    successMessage.value = `Bonuskarte für „${list.name}“ erfolgreich gespeichert!`;
    setTimeout(() => {
      emit('saved', { listId: list.id, code: detectedCode.value, format: detectedFormat.value });
      emit('close');
    }, 1200);
  } catch (err) {
    console.error('Save loyalty card failed:', err);
    decodeError.value = err.message || 'Konnte Bonuskarte nicht speichern.';
  } finally {
    isSaving.value = false;
  }
};

const goToProfileManagement = () => {
  emit('close');
  router.push('/profile');
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <teleport to="body">
    <div class="ks-modal-overlay" @click.self="handleClose">
      <div class="ks-modal-card" role="dialog" aria-modal="true">
        
        <!-- Header -->
        <div class="ks-modal-header">
          <div class="header-info">
            <span class="header-badge">Geteiltes Bild</span>
            <h3 class="modal-title">Bonuskarte erkannt</h3>
          </div>
          <button class="modal-close-btn" @click="handleClose" aria-label="Schließen">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="ks-modal-body">
          
          <!-- Analyzing State -->
          <div v-if="isAnalyzing" class="analyzing-box">
            <div class="ks-spinner"></div>
            <p class="analyzing-text">Code wird auf deinem Gerät analysiert…</p>
          </div>

          <!-- Success State Toast -->
          <div v-else-if="successMessage" class="ks-alert-banner ks-alert-success">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <span>{{ successMessage }}</span>
          </div>

          <!-- Error / No Code State -->
          <div v-else-if="decodeError" class="no-code-box">
            <div class="error-icon">🔍</div>
            <h4 class="error-title">Kein Code erkannt</h4>
            <p class="error-desc">{{ decodeError }}</p>
            <div class="error-actions">
              <button class="ks-btn-pill-secondary" @click="handleClose">Schließen</button>
              <button class="ks-btn-pill-primary" @click="goToProfileManagement">Zu den Bonuskarten</button>
            </div>
          </div>

          <!-- Replace Confirmation Dialog -->
          <div v-else-if="targetListToConfirm" class="replace-confirm-box">
            <StoreLogo :name="targetListToConfirm.name" :size="38" />
            <h4 class="replace-title">Vorhandene Karte ersetzen?</h4>
            <p class="replace-desc">
              Für „{{ targetListToConfirm.name }}“ ist bereits eine Bonuskarte hinterlegt ({{ maskCardCode(existingCardsMap[targetListToConfirm.id]?.code_value) }}).
              Möchtest du sie durch die neue Karte ({{ maskCardCode(detectedCode) }}) ersetzen?
            </p>
            <div class="replace-actions">
              <button class="ks-btn-pill-secondary" @click="targetListToConfirm = null">Anderen Markt wählen</button>
              <button class="ks-btn-pill-danger" :disabled="isSaving" @click="confirmReplace">
                {{ isSaving ? 'Ersetzen...' : 'Karte ersetzen' }}
              </button>
            </div>
          </div>

          <!-- Code Detected -> Pick Shopping List -->
          <div v-else-if="detectedCode" class="list-picker-container">
            <!-- Detected Code Pill -->
            <div class="detected-code-card">
              <div class="code-info">
                <span class="code-type-pill">{{ isQrCode ? 'QR-Code' : 'Strichcode' }}</span>
                <span class="code-value">{{ detectedCode }}</span>
              </div>
            </div>

            <p class="picker-instructions">
              Wähle die Einkaufsliste aus, für die diese Karte hinterlegt werden soll:
            </p>

            <!-- Shopping Lists List -->
            <div v-if="shoppingLists.length === 0" class="no-lists-box">
              <p>Lege zuerst eine Einkaufsliste an, um eine Bonuskarte zu hinterlegen.</p>
              <button class="ks-btn-pill-primary" @click="handleClose">Verstanden</button>
            </div>

            <div v-else class="lists-options-scroll">
              <button
                v-for="list in shoppingLists"
                :key="list.id"
                class="list-option-row"
                :disabled="isSaving"
                @click="selectList(list)"
              >
                <div class="list-left">
                  <StoreLogo :name="list.name" :size="36" />
                  <div class="list-names">
                    <span class="list-title-text">{{ list.name }}</span>
                    <span v-if="existingCardsMap[list.id]" class="existing-warning-badge">
                      Vorhandene Karte wird ersetzt
                    </span>
                    <span v-else class="empty-status-text">
                      Noch keine Karte hinterlegt
                    </span>
                  </div>
                </div>
                <div class="list-right-arrow">›</div>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  </teleport>
</template>

<style scoped>
.ks-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
}

.ks-modal-card {
  width: 100%;
  max-width: 440px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 85vh;
}

.ks-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-badge {
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.modal-title {
  margin: 2px 0 0;
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
}

.modal-close-btn {
  background: rgba(255, 255, 255, 0.06);
  border: none;
  color: #94a3b8;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.ks-modal-body {
  padding: 18px 20px;
  overflow-y: auto;
}

.analyzing-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 12px;
  text-align: center;
}

.analyzing-text {
  margin-top: 14px;
  font-size: 14px;
  color: #94a3b8;
}

.ks-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.detected-code-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.code-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.code-type-pill {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
}

.code-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  font-size: 14px;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-instructions {
  margin: 0 0 12px;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.4;
}

.lists-options-scroll {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 48vh;
  overflow-y: auto;
}

.list-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.list-option-row:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(56, 189, 248, 0.4);
}

.list-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.list-names {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.list-title-text {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.existing-warning-badge {
  font-size: 11px;
  color: #fbbf24;
  margin-top: 2px;
}

.empty-status-text {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.list-right-arrow {
  color: #64748b;
  font-size: 18px;
  padding-left: 8px;
}

/* Replace confirm dialog */
.replace-confirm-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 12px 6px;
  gap: 10px;
}

.replace-title {
  margin: 4px 0 0;
  font-size: 16px;
  color: #f8fafc;
}

.replace-desc {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.4;
}

.replace-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: 8px;
}

.replace-actions button {
  flex: 1;
}

/* No code box */
.no-code-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 10px;
}

.error-icon {
  font-size: 34px;
  margin-bottom: 8px;
}

.error-title {
  margin: 0 0 6px;
  font-size: 16px;
  color: #f8fafc;
}

.error-desc {
  margin: 0 0 18px;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.4;
  max-width: 280px;
}

.error-actions {
  display: flex;
  gap: 10px;
  width: 100%;
}

.error-actions button {
  flex: 1;
}
</style>
