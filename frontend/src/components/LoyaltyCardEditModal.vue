<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import StoreLogo from './StoreLogo.vue';
import BarcodeScanner from './BarcodeScanner.vue';
import { isNativeScannerAvailable, scanBarcodeNative } from '../utils/nativeBarcode.js';
import { decodeBarcodeFromImage, resolveManualFormat } from '../services/imageBarcodeDecoder.js';
import { saveCard } from '../services/loyaltyCardService.js';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  list: {
    type: Object,
    default: null
  },
  existingCard: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close', 'saved']);

const cardCode = ref('');
const manualType = ref('barcode'); // 'barcode' | 'qr'
const isDecoding = ref(false);
const decodeSuccess = ref(false);
const decodeError = ref('');
const isSaving = ref(false);
const errorMessage = ref('');

// Web camera scanner fallback
const showWebScanner = ref(false);
const fileInputRef = ref(null);

watch(() => props.isOpen, (open) => {
  if (open) {
    errorMessage.value = '';
    decodeError.value = '';
    decodeSuccess.value = false;
    isDecoding.value = false;

    if (props.existingCard) {
      cardCode.value = props.existingCard.code_value || '';
      manualType.value = props.existingCard.code_format === 'QR_CODE' || props.existingCard.code_format === 'QR' ? 'qr' : 'barcode';
    } else {
      cardCode.value = '';
      manualType.value = 'barcode';
    }
  }
}, { immediate: true });

// 1. Live Camera Scan
const handleStartCameraScan = async () => {
  errorMessage.value = '';
  decodeError.value = '';
  try {
    const nativeAvail = await isNativeScannerAvailable();
    if (nativeAvail) {
      const scannedCode = await scanBarcodeNative();
      if (scannedCode) {
        cardCode.value = scannedCode.trim();
        // Detect if QR or Barcode
        manualType.value = /^https?:\/\//i.test(cardCode.value) || cardCode.value.length > 40 ? 'qr' : 'barcode';
        decodeSuccess.value = true;
      }
    } else {
      showWebScanner.value = true;
    }
  } catch (err) {
    if (err && (err.message?.includes('canceled') || err.message?.includes('cancelled'))) {
      return;
    }
    showWebScanner.value = true;
  }
};

const handleWebCameraScan = (code) => {
  showWebScanner.value = false;
  if (code) {
    cardCode.value = String(code).trim();
    manualType.value = /^https?:\/\//i.test(cardCode.value) || cardCode.value.length > 40 ? 'qr' : 'barcode';
    decodeSuccess.value = true;
  }
};

// 2. Photo / Screenshot Image Picker
const triggerImagePicker = () => {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
};

const handleImageFileSelected = async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  isDecoding.value = true;
  decodeError.value = '';
  decodeSuccess.value = false;
  errorMessage.value = '';

  try {
    const result = await decodeBarcodeFromImage(file);
    if (result.success && result.code) {
      cardCode.value = result.code;
      manualType.value = result.isQr ? 'qr' : 'barcode';
      decodeSuccess.value = true;
    } else {
      decodeError.value = result.error || 'Kein Code im Bild erkannt – bitte näher heranzoomen oder Nummer manuell eingeben.';
    }
  } catch (err) {
    console.error('Error during image decoding:', err);
    decodeError.value = 'Kein Code im Bild erkannt – bitte näher heranzoomen oder Nummer manuell eingeben.';
  } finally {
    isDecoding.value = false;
  }
};

// 3. Save
const handleSave = async () => {
  if (!cardCode.value.trim() || !props.list?.id) {
    errorMessage.value = 'Bitte gib eine Kartennummer oder einen Code ein.';
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';

  try {
    const token = localStorage.getItem('token');
    const resolvedFormat = resolveManualFormat(cardCode.value, manualType.value);
    const saved = await saveCard(props.list.id, cardCode.value.trim(), resolvedFormat, token);
    emit('saved', saved);
    emit('close');
  } catch (err) {
    console.error('Failed to save loyalty card:', err);
    errorMessage.value = err.message || 'Konnte Bonuskarte nicht speichern.';
  } finally {
    isSaving.value = false;
  }
};

const handleClose = () => {
  emit('close');
};

const handleKeydown = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <teleport to="body">
    <transition name="modal-fade">
      <div v-if="isOpen" class="ks-modal-overlay" @click.self="handleClose">
        <div class="ks-modal-card" role="dialog" aria-modal="true">
          
          <!-- Header -->
          <div class="ks-modal-header">
            <div class="header-left">
              <StoreLogo :name="list?.name || ''" :size="32" />
              <div>
                <h3 class="modal-title">Bonuskarte: {{ list?.name || 'Liste' }}</h3>
                <p class="modal-subtitle">Scanne den Barcode oder gib die Nummer ein</p>
              </div>
            </div>
            <button class="modal-close-btn" @click="handleClose" aria-label="Schließen">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <!-- Hidden Image File Input -->
          <input
            type="file"
            ref="fileInputRef"
            accept="image/*"
            style="display: none;"
            @change="handleImageFileSelected"
          />

          <!-- Body -->
          <div class="ks-modal-body">
            
            <!-- Error Banner -->
            <div v-if="errorMessage" class="ks-alert-banner ks-alert-danger">
              {{ errorMessage }}
            </div>

            <!-- Top Capture Actions: Camera & Photo/Screenshot -->
            <div class="capture-actions-row">
              <button
                class="capture-action-btn camera-btn"
                @click="handleStartCameraScan"
                :disabled="isDecoding"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 12c1.65 0 3-1.35 3-3s-1.35-3-3-3-3 1.35-3 3 1.35 3 3 3zm0-4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm8-4h-3.17l-1.83-2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h3.83l1.83-2h4.68l1.83 2H20v12z"/>
                </svg>
                <span>Mit Kamera scannen</span>
              </button>

              <button
                class="capture-action-btn gallery-btn"
                @click="triggerImagePicker"
                :disabled="isDecoding"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
                <span>Screenshot / Foto</span>
              </button>
            </div>

            <!-- Image Decoding Feedback States -->
            <div v-if="isDecoding" class="decoding-state">
              <div class="ks-spinner"></div>
              <span>Code wird aus Bild gelesen…</span>
            </div>

            <div v-else-if="decodeSuccess" class="ks-alert-banner ks-alert-success">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              <span>Code erfolgreich erkannt!</span>
            </div>

            <div v-else-if="decodeError" class="ks-alert-banner ks-alert-warning">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              <span>{{ decodeError }}</span>
            </div>

            <!-- Divider -->
            <div class="modal-divider">
              <span class="divider-line"></span>
              <span class="divider-text">oder manuell</span>
              <span class="divider-line"></span>
            </div>

            <!-- Simple 2-Button Choice: Strichcode vs. QR-Code -->
            <div class="code-type-segmented-control">
              <button
                type="button"
                class="type-btn"
                :class="{ active: manualType === 'barcode' }"
                @click="manualType = 'barcode'"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M3 4h4v2H5v2H3V4zm2 16H3v-4h2v2h2v2zm16-4h-2v2h-2v2h4v-4zm-2-12h-2V2h4v4h-2V4zM7 6h2v12H7V6zm3 0h1v12h-1V6zm2 0h3v12h-3V6zm4 0h1v12h-1V6zm2 0h1v12h-1V6z"/>
                </svg>
                <span>Strichcode</span>
              </button>

              <button
                type="button"
                class="type-btn"
                :class="{ active: manualType === 'qr' }"
                @click="manualType = 'qr'"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v3h-3v-3zm-5 0h3v3h-3v-3zm2 3h3v3h-3v-3zm3 0h3v3h-3v-3zm-5 2h3v3h-3v-3z"/>
                </svg>
                <span>QR-Code</span>
              </button>
            </div>

            <!-- Card Code Input -->
            <div class="ks-field">
              <input
                type="text"
                v-model="cardCode"
                placeholder=" "
                id="loyalty-card-input"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
              />
              <label for="loyalty-card-input">Kartennummer / Code</label>
            </div>

          </div>

          <!-- Footer Actions -->
          <div class="ks-modal-footer">
            <button
              class="ks-btn-pill-secondary"
              @click="handleClose"
              type="button"
            >
              Abbrechen
            </button>
            <button
              class="ks-btn-pill-primary"
              :disabled="!cardCode.trim() || isSaving"
              @click="handleSave"
              type="button"
            >
              {{ isSaving ? 'Speichern...' : 'Speichern' }}
            </button>
          </div>

        </div>
      </div>
    </transition>

    <!-- Web Camera Scanner Modal -->
    <BarcodeScanner
      v-if="showWebScanner"
      @close="showWebScanner = false"
      @scan="handleWebCameraScan"
    />
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
  z-index: 9999;
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
  animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPop {
  0% { transform: scale(0.95); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.ks-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
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
  flex-shrink: 0;
}

.modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.ks-modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Capture actions */
.capture-actions-row {
  display: flex;
  gap: 10px;
}

.capture-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 10px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.camera-btn {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}

.camera-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
}

.gallery-btn {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}

.gallery-btn:hover {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
}

/* Feedback banners */
.ks-alert-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.ks-alert-danger {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.ks-alert-success {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.ks-alert-warning {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fde68a;
}

.decoding-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  font-size: 13px;
  color: #cbd5e1;
}

.ks-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Divider */
.modal-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 2px 0;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.divider-text {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 2-Button Toggle */
.code-type-segmented-control {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 4px;
  gap: 4px;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-btn.active {
  background: #1e293b;
  color: #38bdf8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.ks-modal-footer {
  display: flex;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.ks-modal-footer button {
  flex: 1;
}

/* Animations */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
