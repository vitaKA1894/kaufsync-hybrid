<script setup>
import { computed } from 'vue';
import { isOnline } from '../services/syncService';

const props = defineProps({
  compact: {
    type: Boolean,
    default: false
  }
});

const labelText = computed(() => {
  return isOnline.value ? 'Online' : 'Offline';
});
</script>

<template>
  <div
    class="sync-status-badge"
    :class="{
      'is-offline': !isOnline,
      'is-online': isOnline
    }"
    :title="isOnline ? 'Online: Verbunden' : 'Offline: Keine Internetverbindung'"
  >
    <!-- Offline Dot (Amber) -->
    <span
      v-if="!isOnline"
      class="status-dot dot-amber"
    ></span>

    <!-- Online Dot (Emerald) -->
    <span
      v-else
      class="status-dot dot-emerald"
    ></span>

    <span v-if="!compact" class="badge-text">{{ labelText }}</span>
  </div>
</template>

<style scoped>
.sync-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(51, 65, 85, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  user-select: none;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-emerald {
  background-color: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.75);
}

.dot-amber {
  background-color: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.75);
  animation: pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.15); }
}

.is-online {
  color: #cbd5e1;
}

.is-offline {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.35);
}

.badge-text {
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
