<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: {
    type: String,
    default: ''
  },
  size: {
    type: [Number, String],
    default: 36
  }
});

const storeKey = computed(() => {
  const n = (props.name || '').toLowerCase().trim();
  if (n.includes('lidl')) return 'lidl';
  if (n.includes('kaufland')) return 'kaufland';
  if (n.includes('rewe')) return 'rewe';
  if (n.includes('edeka')) return 'edeka';
  if (n.includes('aldi')) return 'aldi';
  if (n.includes('netto')) return 'netto';
  if (n.includes('penny')) return 'penny';
  if (n.includes('dm') && !n.includes('edeka')) return 'dm';
  if (n.includes('rossmann')) return 'rossmann';
  if (n.includes('metro')) return 'metro';
  if (n.includes('selgros')) return 'selgros';
  if (n.includes('müller') || n.includes('mueller')) return 'mueller';
  return 'generic';
});

const pixelSize = computed(() => {
  return typeof props.size === 'number' ? `${props.size}px` : props.size;
});
</script>

<template>
  <div class="store-logo-wrapper" :style="{ width: pixelSize, height: pixelSize }" :title="name">
    <!-- 1. LIDL -->
    <svg v-if="storeKey === 'lidl'" viewBox="0 0 100 100" class="store-svg">
      <circle cx="50" cy="50" r="48" fill="#fff000" stroke="#0050aa" stroke-width="6"/>
      <circle cx="50" cy="50" r="43" fill="#fff000" stroke="#e60a14" stroke-width="2"/>
      <!-- L -->
      <path d="M 24 30 L 24 68 L 40 68 L 40 60 L 32 60 L 32 30 Z" fill="#0050aa"/>
      <!-- i (tilted red) -->
      <g transform="rotate(12 47 48)">
        <circle cx="47" cy="33" r="4" fill="#e60a14"/>
        <rect x="43" y="41" width="8" height="26" rx="2" fill="#e60a14"/>
      </g>
      <!-- d -->
      <path d="M 62 30 L 62 44 C 60 41 57 40 54 40 C 47 40 43 46 43 54 C 43 62 47 68 54 68 C 57 68 60 67 62 64 L 62 68 L 69 68 L 69 30 Z M 62 54 C 62 59 59 62 56 62 C 52 62 50 59 50 54 C 50 49 52 46 56 46 C 59 46 62 49 62 54 Z" fill="#0050aa"/>
      <!-- l -->
      <rect x="73" y="30" width="8" height="38" rx="1.5" fill="#0050aa"/>
    </svg>

    <!-- 2. KAUFLAND -->
    <svg v-else-if="storeKey === 'kaufland'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="12" fill="#e10915"/>
      <rect x="8" y="8" width="84" height="84" rx="8" fill="#ffffff"/>
      <!-- Kaufland 4 triangles / chevrons -->
      <path d="M 12 12 L 32 12 L 12 32 Z" fill="#e10915"/>
      <path d="M 88 12 L 68 12 L 88 32 Z" fill="#e10915"/>
      <path d="M 12 88 L 32 88 L 12 68 Z" fill="#e10915"/>
      <path d="M 88 88 L 68 88 L 88 68 Z" fill="#e10915"/>
      <!-- Kaufland K -->
      <path d="M 32 26 L 42 26 L 42 46 L 58 26 L 70 26 L 50 50 L 72 74 L 59 74 L 42 54 L 42 74 L 32 74 Z" fill="#e10915"/>
      <text x="50" y="84" text-anchor="middle" font-size="9" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#e10915" letter-spacing="0.5">KAUFLAND</text>
    </svg>

    <!-- 3. REWE -->
    <svg v-else-if="storeKey === 'rewe'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="16" fill="#cc071e"/>
      <text x="50" y="62" text-anchor="middle" font-size="32" font-weight="900" font-family="'Arial Black', Impact, sans-serif" fill="#ffffff" letter-spacing="-1">REWE</text>
    </svg>

    <!-- 4. EDEKA -->
    <svg v-else-if="storeKey === 'edeka'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#004b93"/>
      <rect x="6" y="6" width="88" height="88" rx="10" fill="#fedb00"/>
      <!-- EDEKA Iconic E -->
      <path d="M 28 20 L 72 20 L 72 32 L 42 32 L 42 44 L 66 44 L 66 54 L 42 54 L 42 68 L 72 68 L 72 80 L 28 80 Z" fill="#004b93"/>
      <text x="50" y="93" text-anchor="middle" font-size="11" font-weight="900" font-family="system-ui, sans-serif" fill="#004b93" letter-spacing="1">EDEKA</text>
    </svg>

    <!-- 5. ALDI -->
    <svg v-else-if="storeKey === 'aldi'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="16" fill="#001a70"/>
      <rect x="6" y="6" width="88" height="88" rx="12" fill="#002b88" stroke="#00a3e0" stroke-width="3"/>
      <!-- Aldi striped A -->
      <path d="M 50 16 L 24 64 L 38 64 L 43 54 L 57 54 L 62 64 L 76 64 Z M 50 36 L 54 46 L 46 46 Z" fill="#ffffff"/>
      <path d="M 28 64 L 46 30 L 46 64 Z" fill="#f39200"/>
      <path d="M 54 64 L 54 30 L 72 64 Z" fill="#e30613"/>
      <text x="50" y="82" text-anchor="middle" font-size="14" font-weight="900" font-family="system-ui, sans-serif" fill="#ffffff" letter-spacing="2">ALDI</text>
    </svg>

    <!-- 6. NETTO -->
    <svg v-else-if="storeKey === 'netto'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#ffea00" stroke="#d6001c" stroke-width="4"/>
      <text x="50" y="55" text-anchor="middle" font-size="28" font-weight="900" font-style="italic" font-family="'Arial Black', sans-serif" fill="#d6001c" letter-spacing="-0.5">Netto</text>
      <rect x="14" y="64" width="72" height="15" rx="3" fill="#d6001c"/>
      <text x="50" y="75" text-anchor="middle" font-size="7.5" font-weight="800" font-family="system-ui, sans-serif" fill="#ffffff" letter-spacing="0.2">MARKEN-DISCOUNT</text>
    </svg>

    <!-- 7. PENNY -->
    <svg v-else-if="storeKey === 'penny'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#cc0000"/>
      <text x="50" y="59" text-anchor="middle" font-size="24" font-weight="900" font-family="'Arial Black', Impact, sans-serif" fill="#ffffff" letter-spacing="0.5">PENNY.</text>
    </svg>

    <!-- 8. DM -->
    <svg v-else-if="storeKey === 'dm'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="16" fill="#f8fafc"/>
      <!-- dm text -->
      <text x="48" y="58" text-anchor="middle" font-size="44" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#4c236e" letter-spacing="-2">dm</text>
      <!-- yellow swoosh -->
      <path d="M 22 66 Q 50 78 78 66 Q 50 72 22 66 Z" fill="#ffd100"/>
    </svg>

    <!-- 9. ROSSMANN -->
    <svg v-else-if="storeKey === 'rossmann'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#ba0c2f"/>
      <!-- Centaur icon abstract -->
      <circle cx="50" cy="38" r="14" fill="none" stroke="#ffffff" stroke-width="4"/>
      <path d="M 44 38 L 56 38 M 50 32 L 50 44" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
      <text x="50" y="74" text-anchor="middle" font-size="11" font-weight="900" font-family="system-ui, sans-serif" fill="#ffffff" letter-spacing="1">ROSSMANN</text>
    </svg>

    <!-- 10. METRO -->
    <svg v-else-if="storeKey === 'metro'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#002d72"/>
      <text x="50" y="60" text-anchor="middle" font-size="24" font-weight="900" font-family="'Arial Black', sans-serif" fill="#ffd100" letter-spacing="0.5">METRO</text>
    </svg>

    <!-- 11. SELGROS -->
    <svg v-else-if="storeKey === 'selgros'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#d5001c"/>
      <text x="50" y="56" text-anchor="middle" font-size="18" font-weight="900" font-family="'Arial Black', sans-serif" fill="#ffffff" letter-spacing="0.5">SELGROS</text>
      <text x="50" y="72" text-anchor="middle" font-size="7" font-weight="800" font-family="system-ui, sans-serif" fill="#ffd100" letter-spacing="1">CASH & CARRY</text>
    </svg>

    <!-- 12. MÜLLER -->
    <svg v-else-if="storeKey === 'mueller'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#ffffff" stroke="#ff6600" stroke-width="4"/>
      <text x="50" y="58" text-anchor="middle" font-size="24" font-weight="900" font-family="system-ui, sans-serif" fill="#ff6600">Müller</text>
    </svg>

    <!-- 13. GENERIC / FALLBACK CART -->
    <svg v-else viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="16" fill="#1e293b" stroke="#334155" stroke-width="2"/>
      <path d="M 28 32 L 35 32 L 44 60 L 68 60 L 75 40 L 38 40" fill="none" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="45" cy="70" r="5" fill="#38bdf8"/>
      <circle cx="67" cy="70" r="5" fill="#38bdf8"/>
    </svg>
  </div>
</template>

<style scoped>
.store-logo-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  user-select: none;
}

.store-svg {
  width: 100%;
  height: 100%;
  display: block;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}
</style>
