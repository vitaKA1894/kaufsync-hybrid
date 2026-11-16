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
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#0050aa"/>
      <circle cx="50" cy="50" r="40" fill="#fff000" stroke="#e60a14" stroke-width="4"/>
      <text x="50" y="58" text-anchor="middle" font-size="23" font-weight="900" font-family="'Arial Black', Impact, sans-serif" fill="#0050aa" letter-spacing="-1">L<tspan fill="#e60a14">I</tspan>DL</text>
    </svg>

    <!-- 2. KAUFLAND -->
    <svg v-else-if="storeKey === 'kaufland'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#e10915"/>
      <text x="50" y="52" text-anchor="middle" font-size="44" font-weight="900" font-family="'Arial Black', Impact, sans-serif" fill="#ffffff">K</text>
      <text x="50" y="78" text-anchor="middle" font-size="12" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#ffffff" letter-spacing="1">Kaufland</text>
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
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#00185e" stroke="#00a0e2" stroke-width="4"/>
      <text x="50" y="58" text-anchor="middle" font-size="25" font-weight="900" font-family="'Arial Black', Impact, sans-serif" fill="#ffffff" letter-spacing="1">ALDI</text>
      <rect x="24" y="66" width="52" height="4" rx="2" fill="#f39200"/>
    </svg>

    <!-- 6. NETTO -->
    <svg v-else-if="storeKey === 'netto'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#ffea00" stroke="#d6001c" stroke-width="4"/>
      <text x="50" y="61" text-anchor="middle" font-size="30" font-weight="900" font-style="italic" font-family="'Arial Black', sans-serif" fill="#d6001c" letter-spacing="-1">Netto</text>
    </svg>

    <!-- 7. PENNY -->
    <svg v-else-if="storeKey === 'penny'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#cc0000"/>
      <text x="50" y="59" text-anchor="middle" font-size="24" font-weight="900" font-family="'Arial Black', Impact, sans-serif" fill="#ffffff" letter-spacing="0.5">PENNY.</text>
    </svg>

    <!-- 8. DM -->
    <svg v-else-if="storeKey === 'dm'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="16" fill="#ffffff" stroke="rgba(60, 36, 107, 0.15)" stroke-width="2"/>
      <text x="50" y="65" text-anchor="middle" font-size="52" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#3c246b" letter-spacing="-3">dm</text>
    </svg>

    <!-- 9. ROSSMANN -->
    <svg v-else-if="storeKey === 'rossmann'" viewBox="0 0 100 100" class="store-svg">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#ba0c2f"/>
      <text x="50" y="58" text-anchor="middle" font-size="15" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#ffffff" letter-spacing="1.5">ROSSMANN</text>
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
