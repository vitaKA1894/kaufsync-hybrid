<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { renderBarcodeSvg, is2DFormat } from '../utils/barcodeRenderer.js';

const props = defineProps({
  code: {
    type: String,
    default: ''
  },
  format: {
    type: String,
    default: 'CODE_128'
  },
  compact: {
    type: Boolean,
    default: false
  }
});

const renderedSvg = ref('');
const is2D = ref(false);
const renderError = ref('');

const updateBarcode = () => {
  if (!props.code || !String(props.code).trim()) {
    renderedSvg.value = '';
    renderError.value = '';
    is2D.value = false;
    return;
  }

  const result = renderBarcodeSvg({
    code: props.code,
    format: props.format,
    compact: props.compact
  });

  if (result.success && result.svg) {
    renderedSvg.value = result.svg;
    is2D.value = result.is2D;
    renderError.value = '';
  } else {
    renderedSvg.value = '';
    is2D.value = result.is2D;
    renderError.value = result.error || 'Code konnte nicht dargestellt werden';
  }
};

watch(() => [props.code, props.format, props.compact], () => {
  updateBarcode();
}, { immediate: true });

onMounted(() => {
  updateBarcode();
});
</script>

<template>
  <div
    class="ks-barcode-renderer-root"
    :class="{
      'is-compact': compact,
      'is-2d': is2D,
      'is-1d': !is2D
    }"
  >
    <div v-if="renderedSvg" class="ks-barcode-svg-wrapper" v-html="renderedSvg"></div>
    <div v-else-if="renderError" class="ks-barcode-render-error">
      {{ renderError }}
    </div>
  </div>
</template>

<style scoped>
.ks-barcode-renderer-root {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.ks-barcode-svg-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.ks-barcode-svg-wrapper :deep(svg) {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  height: auto;
}

/* 2D Codes (Aztec, QR, DataMatrix) - Maintain square aspect ratio */
.ks-barcode-renderer-root.is-2d.is-compact .ks-barcode-svg-wrapper :deep(svg) {
  max-height: 140px;
  max-width: 140px;
}

.ks-barcode-renderer-root.is-2d:not(.is-compact) .ks-barcode-svg-wrapper :deep(svg) {
  max-height: 240px;
  max-width: 240px;
}

/* 1D Barcodes (EAN-13, Code-128, etc.) - Wide horizontal layout */
.ks-barcode-renderer-root.is-1d.is-compact .ks-barcode-svg-wrapper :deep(svg) {
  max-height: 65px;
  width: 100%;
}

.ks-barcode-renderer-root.is-1d:not(.is-compact) .ks-barcode-svg-wrapper :deep(svg) {
  max-height: 110px;
  width: 100%;
}

.ks-barcode-render-error {
  color: #ef4444;
  font-size: 12px;
  text-align: center;
  padding: 8px;
}
</style>
