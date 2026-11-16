<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiUrl } from '../config/api';
import StoreLogo from '../components/StoreLogo.vue';
import CategoryIcon from '../components/CategoryIcon.vue';

const route = useRoute();
const router = useRouter();
const token = route.params.token;

const list = ref(null);
const isLoading = ref(true);
const isRefreshing = ref(false);
const errorMessage = ref('');
const lastUpdated = ref(null);
const searchQuery = ref('');
const filterMode = ref('active'); // 'active', 'all', 'completed'

// Local client-side checked items (for convenience during shopping in store)
const localChecked = ref(new Set());

let pollInterval = null;

const loadLocalChecked = () => {
  try {
    const saved = localStorage.getItem(`ks_readonly_checked_${token}`);
    if (saved) {
      localChecked.value = new Set(JSON.parse(saved));
    }
  } catch (e) {}
};

const saveLocalChecked = () => {
  try {
    localStorage.setItem(
      `ks_readonly_checked_${token}`,
      JSON.stringify(Array.from(localChecked.value))
    );
  } catch (e) {}
};

const toggleLocalCheck = (itemId) => {
  if (localChecked.value.has(itemId)) {
    localChecked.value.delete(itemId);
  } else {
    localChecked.value.add(itemId);
  }
  saveLocalChecked();
};

const fetchList = async (isBackground = false) => {
  if (!isBackground) {
    if (!list.value) isLoading.value = true;
    else isRefreshing.value = true;
  }
  errorMessage.value = '';

  try {
    const res = await fetch(apiUrl(`/api/public/list/${token}`));
    if (res.status === 404) {
      errorMessage.value = 'Diese Einkaufsliste ist nicht mehr öffentlich freigegeben oder der Link ist ungültig.';
      list.value = null;
      return;
    }
    if (!res.ok) {
      throw new Error(`Fehler beim Laden (${res.status})`);
    }

    const data = await res.json();
    list.value = data;
    lastUpdated.value = new Date();
  } catch (err) {
    if (!list.value) {
      errorMessage.value = 'Verbindung zum Server fehlgeschlagen. Bitte prüfe deine Internetverbindung.';
    }
  } finally {
    isLoading.value = false;
    isRefreshing.value = false;
  }
};

onMounted(() => {
  loadLocalChecked();
  fetchList();
  // Poll every 15 seconds
  pollInterval = setInterval(() => {
    fetchList(true);
  }, 15000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});

// Category ordering (matching KaufSync standard categories)
const categoryOrder = [
  'Obst & Gemüse',
  'Backwaren',
  'Kühlregal',
  'Fleisch & Fisch',
  'Tiefkühl',
  'Getränke',
  'Vorrat',
  'Süßes & Snacks',
  'Drogerie & Kosmetik',
  'Haushalt',
  'Haustier',
  'Sonstiges'
];

const normalizedItems = computed(() => {
  if (!list.value || !list.value.items) return [];

  return list.value.items.map(item => {
    // An item is considered checked if server says completed OR user ticked it locally
    const isCompleted = item.status === 'completed' || localChecked.value.has(item.id);
    return {
      ...item,
      isCompleted,
      category: item.category || 'Sonstiges'
    };
  });
});

const filteredItems = computed(() => {
  let items = normalizedItems.value;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    items = items.filter(i => 
      i.name.toLowerCase().includes(q) || 
      (i.note && i.note.toLowerCase().includes(q)) ||
      (i.category && i.category.toLowerCase().includes(q))
    );
  }

  if (filterMode.value === 'active') {
    return items.filter(i => !i.isCompleted);
  } else if (filterMode.value === 'completed') {
    return items.filter(i => i.isCompleted);
  }
  return items;
});

const groupedCategories = computed(() => {
  const groups = {};

  filteredItems.value.forEach(item => {
    const cat = item.category || 'Sonstiges';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  // Sort groups by predefined order
  return Object.keys(groups).sort((a, b) => {
    const idxA = categoryOrder.indexOf(a);
    const idxB = categoryOrder.indexOf(b);
    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  }).map(cat => ({
    name: cat,
    items: groups[cat]
  }));
});

const activeCount = computed(() => {
  return normalizedItems.value.filter(i => !i.isCompleted).length;
});

const completedCount = computed(() => {
  return normalizedItems.value.filter(i => i.isCompleted).length;
});

const totalCount = computed(() => {
  return normalizedItems.value.length;
});

const formattedTime = computed(() => {
  if (!lastUpdated.value) return '';
  return lastUpdated.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

const clearLocalChecks = () => {
  localChecked.value.clear();
  saveLocalChecked();
};
</script>

<template>
  <div class="public-view-container">
    <!-- TOP HEADER -->
    <header class="public-header">
      <div class="brand-row">
        <div class="brand-badge">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
          <span class="brand-text">KaufSync</span>
        </div>
        <div class="badge-readonly">
          <span class="pulse-dot"></span>
          <span>Nur-Lesen</span>
        </div>
      </div>
    </header>

    <!-- MAIN CONTENT -->
    <main class="public-main">
      <!-- LOADING STATE -->
      <div v-if="isLoading" class="state-card loading-state">
        <div class="spinner"></div>
        <p>Lade Einkaufsliste...</p>
      </div>

      <!-- ERROR STATE -->
      <div v-else-if="errorMessage" class="state-card error-state">
        <div class="state-icon">🔒</div>
        <h2 class="state-title">Link nicht verfügbar</h2>
        <p class="state-desc">{{ errorMessage }}</p>
        <button class="ks-btn-pill-primary" style="margin-top: 16px;" @click="fetchList()">
          Erneut versuchen
        </button>
      </div>

      <!-- LIST CONTENT -->
      <div v-else-if="list" class="list-wrapper">
        <!-- LIST HERO CARD -->
        <div class="hero-card">
          <div class="hero-header">
            <div class="store-badge">
              <StoreLogo :name="list.name || list.icon_name" :size="48" />
            </div>
            <div class="hero-info">
              <h1 class="list-title">{{ list.name }}</h1>
              <div class="list-meta">
                <span>{{ totalCount }} Artikel</span>
                <span class="meta-dot">•</span>
                <span class="meta-active">{{ activeCount }} offen</span>
                <span v-if="completedCount > 0" class="meta-dot">•</span>
                <span v-if="completedCount > 0" class="meta-done">{{ completedCount }} erledigt</span>
              </div>
            </div>
            <button
              class="refresh-btn"
              :class="{ 'is-spinning': isRefreshing }"
              :title="'Aktualisieren (Zuletzt: ' + formattedTime + ')'"
              @click="fetchList()"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
          </div>

          <!-- LOCAL CHECK NOTE -->
          <div class="local-check-tip">
            <span class="tip-icon">💡</span>
            <span class="tip-text">Tippe auf einen Artikel, um ihn im Laden für dich abzuhaken.</span>
            <button v-if="localChecked.size > 0" class="clear-checks-btn" @click="clearLocalChecks">
              Zurücksetzen
            </button>
          </div>
        </div>

        <!-- SEARCH & FILTER BAR -->
        <div class="filter-bar">
          <div class="search-input-wrapper">
            <svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Artikel suchen..."
              class="search-input"
            />
            <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">✕</button>
          </div>

          <div class="pill-tabs">
            <button
              class="pill-tab"
              :class="{ active: filterMode === 'active' }"
              @click="filterMode = 'active'"
            >
              Offen ({{ activeCount }})
            </button>
            <button
              class="pill-tab"
              :class="{ active: filterMode === 'all' }"
              @click="filterMode = 'all'"
            >
              Alle ({{ totalCount }})
            </button>
            <button
              v-if="completedCount > 0"
              class="pill-tab"
              :class="{ active: filterMode === 'completed' }"
              @click="filterMode = 'completed'"
            >
              Erledigt ({{ completedCount }})
            </button>
          </div>
        </div>

        <!-- ITEMS LIST -->
        <div v-if="filteredItems.length === 0" class="empty-state">
          <span class="empty-icon">🛒</span>
          <p v-if="searchQuery">Keine Artikel gefunden für "{{ searchQuery }}"</p>
          <p v-else-if="filterMode === 'active'">Alles erledigt! Keine offenen Artikel.</p>
          <p v-else>Diese Liste hat aktuell keine Artikel.</p>
        </div>

        <div v-else class="categories-list">
          <div
            v-for="group in groupedCategories"
            :key="group.name"
            class="category-group"
          >
            <div class="category-header">
              <CategoryIcon :category="group.name" :size="20" />
              <h2 class="category-name">{{ group.name }}</h2>
              <span class="category-count">{{ group.items.length }}</span>
            </div>

            <div class="items-list">
              <div
                v-for="item in group.items"
                :key="item.id"
                class="item-card"
                :class="{ 'is-completed': item.isCompleted }"
                @click="toggleLocalCheck(item.id)"
              >
                <!-- CHECKBOX -->
                <div class="item-checkbox" :class="{ checked: item.isCompleted }">
                  <svg v-if="item.isCompleted" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>

                <!-- INFO -->
                <div class="item-info">
                  <span class="item-name">{{ item.name }}</span>
                  <span v-if="item.note" class="item-note">{{ item.note }}</span>
                </div>

                <!-- QUANTITY / UNIT BADGE -->
                <div v-if="item.quantity > 1 || item.unit !== 'Stk'" class="item-quantity">
                  {{ item.quantity }} {{ item.unit }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- FOOTER INFO -->
        <footer class="public-footer">
          <div class="footer-sync-info">
            <span class="sync-dot"></span>
            <span>Automatische Aktualisierung aktiv (alle 15s)</span>
          </div>
          <div class="footer-app-banner">
            <p>Gemeinsam smarter einkaufen mit <strong>KaufSync</strong></p>
            <button class="ks-btn-pill-secondary ks-btn-pill-sm" @click="router.push('/login')">
              Zum Login / App öffnen
            </button>
          </div>
        </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
.public-view-container {
  min-height: 100vh;
  background: var(--ks-bg, #0f1115);
  color: var(--ks-text, #e7eaf0);
  display: flex;
  flex-direction: column;
  padding-bottom: 40px;
}

.public-header {
  padding: 16px 20px;
  background: rgba(18, 19, 23, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--ks-border, rgba(255, 255, 255, 0.08));
  position: sticky;
  top: 0;
  z-index: 30;
}

.brand-row {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ks-primary, #38bdf8);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.3px;
}

.badge-readonly {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.28);
  color: var(--ks-primary, #38bdf8);
  font-size: 11px;
  font-weight: 600;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ks-primary, #38bdf8);
  box-shadow: 0 0 8px var(--ks-primary, #38bdf8);
}

.public-main {
  flex: 1;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  padding: 20px 16px;
}

/* STATE CARDS */
.state-card {
  margin: 40px auto;
  padding: 32px 24px;
  border-radius: var(--ks-radius-md, 20px);
  background: var(--ks-surface-2, rgba(27, 30, 36, 0.94));
  border: 1px solid var(--ks-border, rgba(255, 255, 255, 0.08));
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.state-icon {
  font-size: 40px;
  margin-bottom: 4px;
}

.state-title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.state-desc {
  font-size: 14px;
  color: var(--ks-text-muted, #97a0ad);
  line-height: 1.5;
  margin: 0;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: var(--ks-primary, #38bdf8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* HERO CARD */
.hero-card {
  background: var(--ks-surface-2, rgba(27, 30, 36, 0.94));
  border: 1px solid var(--ks-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--ks-radius-md, 20px);
  padding: 18px 20px;
  margin-bottom: 16px;
  box-shadow: var(--ks-shadow-1, 0 10px 30px rgba(0,0,0,0.28));
}

.hero-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.store-badge {
  flex-shrink: 0;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.list-title {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ks-text-muted, #97a0ad);
}

.meta-dot {
  opacity: 0.5;
}

.meta-active {
  color: var(--ks-primary, #38bdf8);
  font-weight: 600;
}

.meta-done {
  color: #a6f0b3;
}

.refresh-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--ks-text-soft, #c2c7d0);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.refresh-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.refresh-btn.is-spinning svg {
  animation: spin 0.8s linear infinite;
}

/* LOCAL CHECK TIP */
.local-check-tip {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--ks-radius-xs, 12px);
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ks-text-soft, #c2c7d0);
}

.tip-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.tip-text {
  flex: 1;
  line-height: 1.35;
}

.clear-checks-btn {
  background: none;
  border: none;
  color: var(--ks-primary, #38bdf8);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  flex-shrink: 0;
}

.clear-checks-btn:hover {
  text-decoration: underline;
}

/* FILTER BAR */
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: var(--ks-text-muted, #97a0ad);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 42px;
  background: var(--ks-surface-2, rgba(27, 30, 36, 0.94));
  border: 1px solid var(--ks-border, rgba(255, 255, 255, 0.08));
  border-radius: 999px;
  padding: 0 38px 0 42px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--ks-primary, #38bdf8);
}

.clear-search {
  position: absolute;
  right: 14px;
  background: none;
  border: none;
  color: var(--ks-text-muted, #97a0ad);
  cursor: pointer;
  font-size: 14px;
}

.pill-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.pill-tab {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--ks-text-muted, #97a0ad);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.pill-tab.active {
  background: var(--ks-primary, #38bdf8);
  border-color: var(--ks-primary, #38bdf8);
  color: #0b1120;
  font-weight: 700;
}

/* CATEGORIES & ITEMS */
.categories-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.category-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
}

.category-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ks-primary, #38bdf8);
  letter-spacing: -0.2px;
}

.category-count {
  font-size: 12px;
  color: var(--ks-text-muted, #97a0ad);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 7px;
  border-radius: 999px;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--ks-surface-2, rgba(27, 30, 36, 0.94));
  border: 1px solid var(--ks-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--ks-radius-xs, 12px);
  cursor: pointer;
  transition: all 0.15s ease;
}

.item-card:hover {
  background: rgba(37, 40, 48, 0.98);
  border-color: rgba(255, 255, 255, 0.14);
}

.item-card.is-completed {
  opacity: 0.55;
  background: rgba(20, 22, 26, 0.7);
}

.item-checkbox {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
  color: #0b1120;
}

.item-checkbox.checked {
  background: #a6f0b3;
  border-color: #a6f0b3;
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 15px;
  font-weight: 500;
  color: #fff;
  transition: color 0.15s;
}

.item-card.is-completed .item-name {
  text-decoration: line-through;
  color: var(--ks-text-muted, #97a0ad);
}

.item-note {
  font-size: 12px;
  color: var(--ks-text-muted, #97a0ad);
  line-height: 1.3;
}

.item-quantity {
  font-size: 13px;
  font-weight: 600;
  color: var(--ks-text-soft, #c2c7d0);
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

/* EMPTY STATE */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--ks-text-muted, #97a0ad);
}

.empty-icon {
  font-size: 36px;
  display: block;
  margin-bottom: 8px;
}

/* FOOTER */
.public-footer {
  margin-top: 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  text-align: center;
}

.footer-sync-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ks-text-muted, #97a0ad);
}

.sync-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a6f0b3;
}

.footer-app-banner {
  padding: 16px 20px;
  border-radius: var(--ks-radius-md, 20px);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.footer-app-banner p {
  margin: 0;
  font-size: 13px;
  color: var(--ks-text-soft, #c2c7d0);
}
</style>
