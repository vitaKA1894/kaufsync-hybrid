<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import StoreLogo from './StoreLogo.vue';
import BarcodeScanner from './BarcodeScanner.vue';
import BarcodeRenderer from './BarcodeRenderer.vue';
import { isNativeScannerAvailable, scanBarcodeNative } from '../utils/nativeBarcode.js';
import { decodeBarcodeFromImage, normalizeCodeFormat, resolveManualFormat } from '../services/imageBarcodeDecoder.js';
import { is2DFormat, getFriendlyFormatLabel } from '../utils/barcodeRenderer.js';
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

// Form & Capture State
const cardCode = ref('');
const detectedExactFormat = ref(null);
const captureSource = ref('manual'); // 'camera' | 'image' | 'manual' | 'saved'
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
      detectedExactFormat.value = props.existingCard.code_format || null;
      captureSource.value = 'saved';
      manualType.value = is2DFormat(props.existingCard.code_format) ? 'qr' : 'barcode';
    } else {
      cardCode.value = '';
      detectedExactFormat.value = null;
      captureSource.value = 'manual';
      manualType.value = 'barcode';
    }
  }
}, { immediate: true });

// Active format calculation (critical to avoid overwrite bug)
const currentFormat = computed(() => {
  if ((captureSource.value === 'camera' || captureSource.value === 'image' || captureSource.value === 'saved') && detectedExactFormat.value) {
    return detectedExactFormat.value;
  }
  return resolveManualFormat(cardCode.value, manualType.value);
});

// Non-technical status label for the live preview ("QR-Code" or "Barcode" only)
const previewLabel = computed(() => {
  const friendly = getFriendlyFormatLabel(currentFormat.value);
  if (captureSource.value === 'camera' || captureSource.value === 'image') {
    return `Erkannt: ${friendly}`;
  }
  return `Vorschau: ${friendly}`;
});

// Helper to record detection atomically
const applyDetectedCode = (code, rawFormat, source) => {
  const clean = String(code || '').trim();
  cardCode.value = clean;
  const canonical = normalizeCodeFormat(rawFormat, clean);
  detectedExactFormat.value = canonical;
  captureSource.value = source;
  manualType.value = is2DFormat(canonical) ? 'qr' : 'barcode';
  decodeSuccess.value = true;
  decodeError.value = '';
  errorMessage.value = '';
};

// 1. Live Camera Scan
const handleStartCameraScan = async () => {
  errorMessage.value = '';
  decodeError.value = '';
  try {
    const nativeAvail = await isNativeScannerAvailable();
    if (nativeAvail) {
      const scanRes = await scanBarcodeNative();
      if (scanRes) {
        const rawCode = typeof scanRes === 'object' && scanRes !== null ? scanRes.code : scanRes;
        const rawFmt = typeof scanRes === 'object' && scanRes !== null ? scanRes.format : '';
        applyDetectedCode(rawCode, rawFmt, 'camera');
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

const handleWebCameraScan = (code, rawFormat) => {
  showWebScanner.value = false;
  if (code) {
    applyDetectedCode(code, rawFormat, 'camera');
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
      applyDetectedCode(result.code, result.format, 'image');
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

// 3. Manual Input & Toggles
const handleManualInput = () => {
  captureSource.value = 'manual';
  detectedExactFormat.value = null;
  decodeSuccess.value = false;
  decodeError.value = '';
  errorMessage.value = '';
};

const setManualType = (type) => {
  manualType.value = type;
  captureSource.value = 'manual';
  detectedExactFormat.value = null;
};

// 4. Save
const handleSave = async () => {
  if (!cardCode.value.trim() || !props.list?.id) {
    errorMessage.value = 'Bitte gib eine Kartennummer oder einen Code ein.';
    return;
  }

  isSaving.value = true;
  errorMessage.value = '';

  try {
    const token = localStorage.getItem('token');
    const finalFormat = currentFormat.value;
    const saved = await saveCard(props.list.id, cardCode.value.trim(), finalFormat, token);
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

            <!-- Simple 2-Button Choice: Barcode vs. QR-Code -->
            <div class="code-type-segmented-control">
              <button
                type="button"
                class="type-btn"
                :class="{ active: manualType === 'barcode' }"
                @click="setManualType('barcode')"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M3 4h4v2H5v2H3V4zm2 16H3v-4h2v2h2v2zm16-4h-2v2h-2v2h4v-4zm-2-12h-2V2h4v4h-2V4zM7 6h2v12H7V6zm3 0h1v12h-1V6zm2 0h3v12h-3V6zm4 0h1v12h-1V6zm2 0h1v12h-1V6z"/>
                </svg>
                <span>Barcode</span>
              </button>

              <button
                type="button"
                class="type-btn"
                :class="{ active: manualType === 'qr' }"
                @click="setManualType('qr')"
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
                @input="handleManualInput"
              />
              <label for="loyalty-card-input">Kartennummer / Code</label>
            </div>

            <!-- Compact Live Preview Card (Hidden when empty) -->
            <div v-if="cardCode.trim()" class="ks-live-preview-box">
              <div class="preview-header">
                <span
                  class="preview-badge"
                  :class="{ 'is-detected': captureSource === 'camera' || captureSource === 'image' }"
                >
                  <span v-if="captureSource === 'camera' || captureSource === 'image'" class="preview-check">✓</span>
                  <span>{{ previewLabel }}</span>
                </span>
              </div>
              <div class="preview-canvas-card">
                <BarcodeRenderer
                  :code="cardCode"
                  :format="currentFormat"
                  :compact="true"
                />
              </div>
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
  z-index: 9999;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: ksFadeIn 0.2s ease-out;
}

.ks-modal-card {
  width: 100%;
  max-width: 440px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ksSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 90vh;
}

.ks-modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
}

.modal-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.ks-modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

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
  padding: 11px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.camera-btn {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.35);
}

.camera-btn:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.25);
  border-color: rgba(245, 158, 11, 0.5);
}

.gallery-btn {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}

.gallery-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.22);
  border-color: rgba(56, 189, 248, 0.45);
}

.capture-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.decoding-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px;
  font-size: 13px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
  border-radius: 10px;
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.ks-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(56, 189, 248, 0.3);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: ksSpin 0.8s linear infinite;
}

.modal-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.divider-text {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.code-type-segmented-control {
  display: flex;
  background: rgba(15, 23, 42, 0.6);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  gap: 4px;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.type-btn:hover:not(.active) {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.04);
}

.type-btn.active {
  background: #334155;
  color: #f8fafc;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.ks-field {
  position: relative;
  display: flex;
  flex-direction: column;
}

.ks-field input {
  width: 100%;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 14px 14px 10px;
  font-size: 14px;
  color: #f8fafc;
  outline: none;
  transition: all 0.15s ease;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ks-field input:focus {
  border-color: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.ks-field label {
  position: absolute;
  left: 14px;
  top: 13px;
  font-size: 13px;
  color: #64748b;
  pointer-events: none;
  transition: all 0.15s ease;
}

.ks-field input:focus ~ label,
.ks-field input:not(:placeholder-shown) ~ label {
  top: 4px;
  font-size: 10px;
  font-weight: 600;
  color: #f59e0b;
}

/* LIVE PREVIEW BOX */
.ks-live-preview-box {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.preview-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 10px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-badge.is-detected {
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.25);
}

.preview-check {
  font-weight: 700;
  font-size: 13px;
}

.preview-canvas-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  min-height: 70px;
  overflow: hidden;
}

/* Alert Banners */
.ks-alert-banner {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ks-alert-success {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.ks-alert-warning {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.ks-alert-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.ks-modal-footer {
  padding: 14px 20px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 10px;
}

.ks-btn-pill-secondary {
  flex: 1;
  padding: 11px 16px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ks-btn-pill-secondary:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.ks-btn-pill-primary {
  flex: 1;
  padding: 11px 16px;
  border-radius: 9999px;
  background: #f59e0b;
  border: none;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
}

.ks-btn-pill-primary:hover:not(:disabled) {
  background: #fbbf24;
  transform: translateY(-1px);
}

.ks-btn-pill-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes ksFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes ksSlideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes ksSpin {
  to { transform: rotate(360deg); }
}
</style>
