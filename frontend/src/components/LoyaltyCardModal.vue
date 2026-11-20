<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { Capacitor } from '@capacitor/core';
import { ScreenBrightness } from '@capacitor-community/screen-brightness';
import BarcodeRenderer from './BarcodeRenderer.vue';

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
let previousBrightness = null;

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
  } else {
    restoreBrightness();
  }
});

onMounted(() => {
  if (props.isOpen) {
    applyMaxBrightness();
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
          </div>

          <!-- Pure White High-Contrast Scan Surface -->
          <div class="ks-loyalty-scan-surface">
            <div class="ks-loyalty-quiet-zone">
              
              <!-- Vector Offline Code Renderer (Aztec, QR, Barcode, etc.) -->
              <div v-if="card?.code_value" class="ks-code-render-wrap">
                <BarcodeRenderer
                  :code="card.code_value"
                  :format="card.code_format"
                  :compact="false"
                />
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
  overflow: hidden;
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.ks-loyalty-modal-header {
  padding: 20px 20px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.ks-code-render-wrap {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-height: 100px;
}

.ks-card-number-display {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
}

.ks-card-number-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.ks-card-number-value {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  word-break: break-all;
  overflow-wrap: anywhere;
  white-space: normal;
  text-align: center;
  max-width: 100%;
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

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
