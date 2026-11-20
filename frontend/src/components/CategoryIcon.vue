<script setup>
import { computed, ref, watch } from 'vue';
import { resolveItemIcon, isLetterIcon } from '../utils/iconResolver.js';

const props = defineProps({
  name: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  size: {
    type: [Number, String],
    default: 45
  },
  strokeWidth: {
    type: [Number, String],
    default: 2.5
  },
  color: {
    type: String,
    default: 'currentColor'
  }
});

const hasError = ref(false);

watch([() => props.name, () => props.category], () => {
  hasError.value = false;
});

const categoryClass = computed(() => {
  if (!props.category) return '';
  const lowerCat = props.category.toLowerCase();
  if (lowerCat.includes('obst & gemüse')) return 'cat-obst-gemuese';
  if (lowerCat.includes('brot & backwaren')) return 'cat-brot-backwaren';
  if (lowerCat.includes('fleisch & fisch')) return 'cat-fleisch-fisch';
  if (lowerCat.includes('milchprodukte & tiefkühlkost')) return 'cat-milch-tiefkuehl';
  if (lowerCat.includes('vorratskammer')) return 'cat-vorratskammer';
  if (lowerCat.includes('getränke & genussmittel')) return 'cat-getraenke-genuss';
  if (lowerCat.includes('drogerie, haushalt & tierbedarf')) return 'cat-drogerie-haushalt';
  return 'cat-sonstiges';
});

// Synchronous resolution to guaranteed existing SVG file
const currentImageSrc = computed(() => {
  if (hasError.value) return '';
  return resolveItemIcon(props.name, props.category);
});

const isLetterFallback = computed(() => {
  return isLetterIcon(currentImageSrc.value);
});

const onImageError = () => {
  hasError.value = true;
};
</script>

<template>
  <div class="icon-wrapper flex items-center justify-center shrink-0">
    <!-- Initial circle fallback if icon failed to load or has no icon -->
    <div
      v-if="(!currentImageSrc || hasError) && name"
      class="fallback-initial-icon"
      :class="categoryClass"
      :style="{
        backgroundColor: color === 'currentColor' ? 'var(--ks-surface-4)' : color,
        color: 'white',
        width: !isNaN(size) ? `${size}px` : size,
        height: !isNaN(size) ? `${size}px` : size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: !isNaN(size) ? `${size * 0.55}px` : '1em',
        fontWeight: 'bold',
        opacity: 0.8
      }"
      :title="name"
    >
      {{ name.charAt(0).toUpperCase() }}
    </div>

    <!-- Letter initial SVG fallback (/icons/letters/{letter}.svg) -->
    <div
      v-else-if="name && isLetterFallback"
      class="item-icon-svg"
      :class="categoryClass"
      :style="{
        '--icon-src': `url(${currentImageSrc})`,
        'background-color': color && color !== 'currentColor' ? color : 'currentColor',
        width: !isNaN(size) ? `${size}px` : size,
        height: !isNaN(size) ? `${size}px` : size
      }"
      :title="name"
    >
      <img
        :src="currentImageSrc"
        @error="onImageError"
        style="display: none;"
        alt=""
      />
    </div>

    <!-- Standard: All food & grocery items render full-color vector glow SVGs -->
    <img
      v-else-if="name && currentImageSrc"
      class="item-icon-natural"
      :src="currentImageSrc"
      :style="{
        width: !isNaN(size) ? `${size}px` : size,
        height: !isNaN(size) ? `${size}px` : size
      }"
      @error="onImageError"
      alt=""
      :title="name"
      loading="eager"
      decoding="async"
      draggable="false"
    />
  </div>
</template>

<style scoped>
.item-icon-natural {
  display: inline-block;
  object-fit: contain;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.35));
  transition: transform 0.15s ease;
  user-select: none;
}

.item-icon-svg {
  display: inline-block;
  mask-image: var(--icon-src);
  -webkit-mask-image: var(--icon-src);
  mask-size: contain;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-position: center;
  filter: drop-shadow(0 0 1px currentColor);
}

/* Fallback Classes in case color prop isn't passed down - they align with ListView colors */
.cat-obst-gemuese { color: #86efac; }
.cat-brot-backwaren { color: #fef08a; }
.cat-fleisch-fisch { color: #fca5a5; }
.cat-milch-tiefkuehl { color: #93c5fd; }
.cat-vorratskammer { color: #fdba74; }
.cat-getraenke-genuss { color: #a5b4fc; }
.cat-drogerie-haushalt { color: #5eead4; }
.cat-sonstiges { color: #d8b4fe; }
</style>
