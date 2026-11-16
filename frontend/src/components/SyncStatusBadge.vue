<script setup>
import { computed } from 'vue';
import { isOnline, syncStatus, pendingCount, triggerSync } from '../services/syncService';

const props = defineProps({
  compact: {
    type: Boolean,
    default: false
  }
});

const labelText = computed(() => {
  if (!isOnline.value) {
    return pendingCount.value > 0 ? `Offline (${pendingCount.value})` : 'Offline';
  }
  if (syncStatus.value === 'syncing') {
    return 'Sync...';
  }
  if (pendingCount.value > 0) {
    return `${pendingCount.value} warten`;
  }
  return 'Synchron';
});

const handleBadgeClick = () => {
  if (isOnline.value) {
    triggerSync(0);
  }
};
</script>

<template>
  <button
    type="button"
    class="sync-status-badge"
    :class="{
      'is-offline': !isOnline || syncStatus === 'offline',
      'is-syncing': syncStatus === 'syncing',
      'is-pending': isOnline && pendingCount > 0,
      'is-synced': isOnline && syncStatus === 'synced' && pendingCount === 0
    }"
    @click="handleBadgeClick"
    :title="isOnline ? 'Klicken, um jetzt zu synchronisieren' : 'Offline-Modus aktiv: Änderungen werden lokal gespeichert und später übertragen'"
  >
    <!-- Syncing Spinner -->
    <svg
      v-if="syncStatus === 'syncing'"
      class="sync-icon animate-spin text-sky-400"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
    </svg>

    <!-- Offline / Pending Dot -->
    <span
      v-else-if="!isOnline || pendingCount > 0"
      class="status-dot dot-amber"
    ></span>

    <!-- Synced Dot -->
    <span
      v-else
      class="status-dot dot-emerald"
    ></span>

    <span v-if="!compact" class="badge-text">{{ labelText }}</span>
  </button>
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
  cursor: pointer;
  user-select: none;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.sync-status-badge:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(100, 116, 139, 0.7);
  transform: translateY(-1px);
}

.sync-status-badge:active {
  transform: scale(0.96);
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

.is-synced {
  color: #cbd5e1;
}

.is-syncing {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.35);
}

.is-offline, .is-pending {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.35);
}

.badge-text {
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
