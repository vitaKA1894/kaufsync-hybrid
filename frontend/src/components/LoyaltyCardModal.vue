<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Capacitor } from '@capacitor/core';
import { ScreenBrightness } from '@capacitor-community/screen-brightness';
import JsBarcode from 'jsbarcode';
import QrcodeVue from 'qrcode.vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  card: {
    type: Object,
    default: null
  },
  listName: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close']);

const barcodeSvgRef = ref(null);
let previousBrightness = null;
const renderError = ref('');

const formatCardCodeDisplay = (code) => {
  if (!code) return '';
  const s = String(code).trim();
  // If 13 digits (EAN-13), group nicely: 1 234567 890123
  if (/^\d{13}$/.test(s)) {
    return `${s.slice(0, 1)} ${s.slice(1, 7)} ${s.slice(7)}`;
  }
  // If 16 digits, 4x4
  if (/^\d{16}$/.test(s)) {
    return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)} ${s.slice(12)}`;
  }
  return s;
};

const mapToJsBarcodeFormat = (format) => {
  const f = (format || '').toUpperCase();
  switch (f) {
    case 'EAN_13':
    case 'EAN13':
      return 'EAN13';
    case 'EAN_8':
    case 'EAN8':
      return 'EAN8';
    case 'UPC_A':
    case 'UPCA':
      return 'UPC';
    case 'CODE_39':
    case 'CODE39':
      return 'CODE39';
    case 'ITF':
      return 'ITF';
    case 'CODE_128':
    case 'CODE128':
    default:
      return 'CODE128';
  }
};

const renderBarcode = () => {
  renderError.value = '';
  if (!props.card || !props.card.code_value) return;

  const isQr = props.card.code_format === 'QR_CODE' || props.card.code_format === 'QR';
  if (isQr) return; // QR code rendered by qrcode.vue

  nextTick(() => {
    if (!barcodeSvgRef.value) return;

    const requestedFormat = mapToJsBarcodeFormat(props.card.code_format);
    const code = String(props.card.code_value).trim();

    try {
      JsBarcode(barcodeSvgRef.value, code, {
        format: requestedFormat,
        displayValue: false,
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000',
        width: 2.2,
        height: 110
      });
    } catch (err) {
      console.warn(`JsBarcode failed with format ${requestedFormat}, falling back to CODE128:`, err);
      try {
        JsBarcode(barcodeSvgRef.value, code, {
          format: 'CODE128',
          displayValue: false,
          margin: 10,
          background: '#ffffff',
          lineColor: '#000000',
          width: 2.2,
          height: 110
        });
      } catch (fallbackErr) {
        console.error('JsBarcode failed completely:', fallbackErr);
        renderError.value = 'Barcode konnte nicht grafisch dargestellt werden.';
      }
    }
  });
};

const applyMaxBrightness = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const current = await ScreenBrightness.getBrightness();
      previousBrightness = current.brightness;
      await ScreenBrightness.setBrightness({ brightness: 1.0 });
    } catch (e) {
      console.warn('Screen brightness adjustment skipped or failed:', e);
    }
  }
};

const restoreBrightness = async () => {
  if (Capacitor.isNativePlatform() && previousBrightness !== null) {
    try {
      await ScreenBrightness.setBrightness({ brightness: previousBrightness });
      previousBrightness = null;
    } catch (e) {
      console.warn('Restoring brightness skipped or failed:', e);
    }
  }
};

const handleClose = () => {
  restoreBrightness();
  emit('close');
};

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    applyMaxBrightness();
    renderBarcode();
  } else {
    restoreBrightness();
  }
});

watch(() => props.card, () => {
  if (props.isOpen) {
    renderBarcode();
  }
}, { deep: true });

onMounted(() => {
  if (props.isOpen) {
    applyMaxBrightness();
    renderBarcode();
  }
});

onBeforeUnmount(() => {
  restoreBrightness();
});
</script>

<template>
  <teleport to="body">
    <transition name="ks-card-modal">
      <div v-if="isOpen" class="ks-loyalty-modal-overlay" @click.self="handleClose">
        <div class="ks-loyalty-modal-container">
          
          <!-- Header Bar -->
          <div class="ks-loyalty-modal-header">
            <div class="ks-loyalty-title-wrap">
              <span class="ks-loyalty-tag">Bonuskarte</span>
              <h2 class="ks-loyalty-title">{{ listName || 'Einkaufsliste' }}</h2>
            </div>
            <button class="ks-loyalty-close-btn" @click="handleClose" aria-label="Schließen">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <!-- Pure White High-Contrast Scan Surface -->
          <div class="ks-loyalty-scan-surface">
            <div class="ks-loyalty-quiet-zone">
              
              <!-- 2D QR Code -->
              <div v-if="card?.code_format === 'QR_CODE' || card?.code_format === 'QR'" class="ks-qr-container">
                <qrcode-vue
                  :value="card.code_value"
                  :size="240"
                  level="H"
                  render-as="svg"
                  class="ks-qr-svg"
                />
              </div>

              <!-- 1D Barcode (SVG) -->
              <div v-else class="ks-barcode-container">
                <svg ref="barcodeSvgRef" class="ks-barcode-svg"></svg>
                <div v-if="renderError" class="ks-render-error">
                  {{ renderError }}
                </div>
              </div>

              <!-- Legible Card Number below code -->
              <div class="ks-card-number-display">
                <span class="ks-card-number-label">Kartennummer:</span>
                <span class="ks-card-number-value">{{ formatCardCodeDisplay(card?.code_value) }}</span>
              </div>

            </div>
          </div>

          <!-- Bottom Advice & Dismiss Button -->
          <div class="ks-loyalty-modal-footer">
            <p class="ks-loyalty-hint">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <span>Halte das Display an den Kassenscanner.</span>
            </p>
            <button class="ks-btn-pill-primary full-width" @click="handleClose">
              Schließen
            </button>
          </div>

        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.ks-loyalty-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.2s ease-out;
}

.ks-loyalty-modal-container {
  width: 100%;
  max-width: 440px;
  background: #0f172a;
  border: 1px solid rgba(245, 158, 11, 0.4);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(245, 158, 11, 0.2);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ks-loyalty-modal-header {
  padding: 18px 20px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ks-loyalty-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ks-loyalty-tag {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #f59e0b;
}

.ks-loyalty-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: #f8fafc;
}

.ks-loyalty-close-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ks-loyalty-close-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

/* Pure White High-Contrast Scan Surface */
.ks-loyalty-scan-surface {
  background: #ffffff;
  padding: 24px 16px;
  margin: 16px;
  border-radius: 18px;
  display: flex;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.ks-loyalty-quiet-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 10px 4px;
}

.ks-qr-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.ks-barcode-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ks-barcode-svg {
  max-width: 100%;
  height: auto;
  display: block;
}

.ks-render-error {
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
  padding: 8px;
}

.ks-card-number-display {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.ks-card-number-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.ks-card-number-value {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ks-loyalty-modal-footer {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ks-loyalty-hint {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
}

.ks-loyalty-hint svg {
  color: #f59e0b;
  flex-shrink: 0;
}

.ks-card-modal-enter-active,
.ks-card-modal-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.ks-card-modal-enter-from,
.ks-card-modal-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
