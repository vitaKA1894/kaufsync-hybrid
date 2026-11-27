<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiUrl } from '../config/api';
import { clearAllLocalData, db } from '../db/index';
import { isOnline } from '../services/syncService';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  triggerTestNotification
} from '../utils/notificationService';
import { isWakeLockSupported } from '../utils/wakeLockService';
import { isHapticFeedbackEnabled, setHapticFeedbackEnabled } from '../utils/hapticsService';
import { isRestockSuggestionsEnabled, setRestockSuggestionsEnabled } from '../services/consumptionService';
import StoreLogo from '../components/StoreLogo.vue';
import LoyaltyCardEditModal from '../components/LoyaltyCardEditModal.vue';
import LearnedMappingsModal from '../components/LearnedMappingsModal.vue';
import {
  getAllCards,
  deleteCard,
  maskCardCode
} from '../services/loyaltyCardService';
import {
  mappingsCount,
  syncUserMappings,
  clearLocalUserMappings
} from '../services/userMappingService';
import { clearLocalTemplates } from '../services/templateService';
import { clearNativeWidgetOnLogout } from '../services/widgetBridgeService';
import {
  isPriceEstimateEnabled,
  setPriceEstimateEnabled,
  clearLocalPrices
} from '../services/priceService';

const router = useRouter();

const activeTab = ref('profile'); // 'profile' | 'notifications' | 'security'

const user = ref({
  email: '',
  display_name: '',
  is_admin: false,
  keep_screen_awake: localStorage.getItem('ks_keep_screen_awake') === 'true',
  haptic_feedback_enabled: isHapticFeedbackEnabled(),
  show_restock_suggestions: isRestockSuggestionsEnabled(),
  show_price_estimate: isPriceEstimateEnabled(),
  settings_push_async_events: true, // Master Switch
  settings_push_new_items: true,
  settings_push_completed_items: true,
  settings_push_cleared_items: true,
  settings_push_shopping_started: true,
  settings_push_shopping_done: false,
  settings_push_members: true
});

const userInitial = computed(() => {
  const name = user.value.display_name || user.value.email || '?';
  return name.charAt(0).toUpperCase();
});

const passwordData = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const permissionStatus = ref('prompt'); // 'granted' | 'denied' | 'prompt'
const isTestingNotification = ref(false);
const isPermissionLoading = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const isLoading = ref(false);

const checkPermissions = async () => {
  permissionStatus.value = await getNotificationPermissionStatus();
};

const loadUserProfile = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl('/api/users/me'), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('isLoggedIn');
      router.push('/login');
      return;
    }

    if (!response.ok) throw new Error('Profil konnte nicht geladen werden');

    const data = await response.json();
    user.value.email = data.email;
    user.value.display_name = data.display_name;
    user.value.is_admin = data.is_admin || false;
    user.value.settings_push_async_events = data.settings_push_async_events ?? true;
    user.value.settings_push_new_items = data.settings_push_new_items ?? true;
    user.value.settings_push_completed_items = data.settings_push_completed_items ?? true;
    user.value.settings_push_cleared_items = data.settings_push_cleared_items ?? true;
    user.value.settings_push_shopping_started = data.settings_push_shopping_started ?? true;
    user.value.settings_push_shopping_done = data.settings_push_shopping_done ?? false;
    user.value.settings_push_members = data.settings_push_members ?? true;
    user.value.keep_screen_awake = data.keep_screen_awake ?? (localStorage.getItem('ks_keep_screen_awake') === 'true');
    localStorage.setItem('ks_keep_screen_awake', String(user.value.keep_screen_awake));
    user.value.haptic_feedback_enabled = data.haptic_feedback_enabled ?? isHapticFeedbackEnabled();
    setHapticFeedbackEnabled(user.value.haptic_feedback_enabled);
    user.value.show_restock_suggestions = data.show_restock_suggestions ?? isRestockSuggestionsEnabled();
    setRestockSuggestionsEnabled(user.value.show_restock_suggestions);
    user.value.show_price_estimate = data.show_price_estimate ?? isPriceEstimateEnabled();
    setPriceEstimateEnabled(user.value.show_price_estimate);
  } catch (error) {
    console.error(error);
  }
};

const updateProfile = async (silent = false) => {
  if (!isOnline.value) {
    if (!silent) {
      errorMessage.value = 'Du bist offline. Profiländerungen können derzeit nicht gespeichert werden.';
    }
    return;
  }
  if (!silent) {
    errorMessage.value = '';
    successMessage.value = '';
  }
  isLoading.value = true;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl('/api/users/me'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        display_name: user.value.display_name,
        settings_push_async_events: user.value.settings_push_async_events,
        settings_push_new_items: user.value.settings_push_new_items,
        settings_push_completed_items: user.value.settings_push_completed_items,
        settings_push_cleared_items: user.value.settings_push_cleared_items,
        settings_push_shopping_started: user.value.settings_push_shopping_started,
        settings_push_shopping_done: user.value.settings_push_shopping_done,
        settings_push_members: user.value.settings_push_members,
        keep_screen_awake: user.value.keep_screen_awake,
        haptic_feedback_enabled: user.value.haptic_feedback_enabled,
        show_restock_suggestions: user.value.show_restock_suggestions,
        show_price_estimate: user.value.show_price_estimate
      })
    });

    if (!response.ok) throw new Error('Fehler beim Speichern der Einstellungen');

    if (!silent) {
      successMessage.value = 'Einstellungen erfolgreich gespeichert!';
      setTimeout(() => (successMessage.value = ''), 2500);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
};

const enableNotifications = async () => {
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Benachrichtigungen erfordern eine aktive Verbindung.';
    return;
  }
  isPermissionLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const granted = await requestNotificationPermission();
    await checkPermissions();

    if (granted || permissionStatus.value === 'granted') {
      successMessage.value = 'Benachrichtigungen wurden erfolgreich aktiviert! 🎉';
      await updateProfile(true);
    } else if (permissionStatus.value === 'denied') {
      errorMessage.value = 'Benachrichtigungen sind im Android-System deaktiviert. Bitte in den Handy-Einstellungen aktivieren.';
    }
    setTimeout(() => {
      successMessage.value = '';
    }, 3500);
  } catch (err) {
    errorMessage.value = err.message || 'Fehler beim Aktivieren';
  } finally {
    isPermissionLoading.value = false;
  }
};

const sendTest = async () => {
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Test-Benachrichtigungen können nicht gesendet werden.';
    return;
  }
  isTestingNotification.value = true;
  try {
    await triggerTestNotification({
      title: '🛒 KaufSync Test',
      body: 'Super! Deine Benachrichtigungen funktionieren einwandfrei.'
    });
    successMessage.value = 'Test-Benachrichtigung gesendet!';
    setTimeout(() => (successMessage.value = ''), 3000);
  } catch (err) {
    errorMessage.value = 'Test-Benachrichtigung konnte nicht gesendet werden.';
  } finally {
    isTestingNotification.value = false;
  }
};

const changePassword = async () => {
  if (!isOnline.value) {
    errorMessage.value = 'Du bist offline. Passwortänderungen erfordern eine aktive Internetverbindung.';
    return;
  }
  errorMessage.value = '';
  successMessage.value = '';

  if (passwordData.value.newPassword !== passwordData.value.confirmPassword) {
    errorMessage.value = 'Die neuen Passwörter stimmen nicht überein.';
    return;
  }
  if (passwordData.value.newPassword.length < 6) {
    errorMessage.value = 'Das neue Passwort muss mindestens 6 Zeichen lang sein.';
    return;
  }

  isLoading.value = true;
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl('/api/users/me/password'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        old_password: passwordData.value.oldPassword,
        new_password: passwordData.value.newPassword
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || 'Fehler beim Ändern des Passworts');
    }

    successMessage.value = 'Passwort erfolgreich geändert!';
    passwordData.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
    setTimeout(() => (successMessage.value = ''), 3000);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
};

const showDeleteAccountModal = ref(false);
const deleteAccountPassword = ref('');
const deleteAccountError = ref('');
const isDeletingAccount = ref(false);

const openDeleteAccountModal = () => {
  if (!isOnline.value) return;
  deleteAccountPassword.value = '';
  deleteAccountError.value = '';
  showDeleteAccountModal.value = true;
};

const closeDeleteAccountModal = () => {
  if (isDeletingAccount.value) return;
  showDeleteAccountModal.value = false;
  deleteAccountPassword.value = '';
  deleteAccountError.value = '';
};

const confirmDeleteAccount = async () => {
  if (!deleteAccountPassword.value || isDeletingAccount.value) return;
  if (!isOnline.value) {
    deleteAccountError.value = 'Du bist offline. Das Löschen des Kontos erfordert eine aktive Internetverbindung.';
    return;
  }
  isDeletingAccount.value = true;
  deleteAccountError.value = '';
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(apiUrl('/api/users/me'), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ current_password: deleteAccountPassword.value })
    });
    const resData = await response.json().catch(() => ({}));
    if (!response.ok) {
      deleteAccountError.value = resData.detail || 'Fehler beim Löschen des Kontos.';
      return;
    }
    showDeleteAccountModal.value = false;
    clearLocalUserMappings();
    clearLocalTemplates();
    clearLocalPrices();
    await clearNativeWidgetOnLogout();
    await clearAllLocalData();
    router.push('/login?deleted=1');
  } catch (err) {
    deleteAccountError.value = 'Verbindungsfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';
  } finally {
    isDeletingAccount.value = false;
  }
};

const logout = async () => {
  clearLocalUserMappings();
  clearLocalTemplates();
  clearLocalPrices();
  await clearNativeWidgetOnLogout();
  await clearAllLocalData();
  router.push('/login');
};

const goBack = () => router.push('/');

// Keep Screen Awake
const isWakeLockAvail = ref(isWakeLockSupported());

const handleToggleKeepScreenAwake = async () => {
  localStorage.setItem('ks_keep_screen_awake', String(user.value.keep_screen_awake));
  await updateProfile(true);
};

const handleToggleHapticFeedback = async () => {
  setHapticFeedbackEnabled(user.value.haptic_feedback_enabled);
  await updateProfile(true);
};

const handleToggleRestockSuggestions = async () => {
  setRestockSuggestionsEnabled(user.value.show_restock_suggestions);
  await updateProfile(true);
};

const handleTogglePriceEstimate = async () => {
  setPriceEstimateEnabled(user.value.show_price_estimate);
  await updateProfile(true);
};

// Loyalty Cards & Lists
const shoppingLists = ref([]);
const loyaltyCardsMap = ref({});
const isLoadingListsAndCards = ref(false);

const showCardEditModal = ref(false);
const selectedCardList = ref(null);
const showDeleteCardConfirm = ref(false);
const cardToDeleteList = ref(null);
const showLearnedMappingsModal = ref(false);

const loadShoppingListsAndCards = async () => {
  isLoadingListsAndCards.value = true;
  try {
    const token = localStorage.getItem('token');
    // 1. Read lists from Dexie first (instant local)
    try {
      const localLists = await db.lists.toArray();
      if (localLists && localLists.length > 0) {
        shoppingLists.value = localLists;
      }
    } catch (e) {}

    // 2. Fetch fresh lists from server if online
    if (isOnline.value && token) {
      try {
        const res = await fetch(apiUrl('/api/lists'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const remoteLists = await res.json();
          shoppingLists.value = remoteLists;
        }
      } catch (e) {}
    }

    // 3. Load loyalty cards
    const cards = await getAllCards(token);
    const map = {};
    for (const c of cards) {
      map[c.list_id] = c;
    }
    loyaltyCardsMap.value = map;
  } finally {
    isLoadingListsAndCards.value = false;
  }
};

const openCardModal = (list) => {
  selectedCardList.value = list;
  showCardEditModal.value = true;
};

const handleCardSaved = (savedCard) => {
  if (selectedCardList.value && savedCard) {
    loyaltyCardsMap.value[selectedCardList.value.id] = savedCard;
    successMessage.value = `Bonuskarte für '${selectedCardList.value.name}' gespeichert! 💳`;
    setTimeout(() => {
      if (successMessage.value && successMessage.value.includes('Bonuskarte')) successMessage.value = '';
    }, 3000);
  }
  showCardEditModal.value = false;
};

const confirmDeleteCard = (list) => {
  cardToDeleteList.value = list;
  showDeleteCardConfirm.value = true;
};

const executeDeleteCard = async () => {
  if (!cardToDeleteList.value) return;
  const list = cardToDeleteList.value;
  try {
    const token = localStorage.getItem('token');
    await deleteCard(list.id, token);
    delete loyaltyCardsMap.value[list.id];
    showDeleteCardConfirm.value = false;
    cardToDeleteList.value = null;
    successMessage.value = `Bonuskarte für '${list.name}' entfernt.`;
    setTimeout(() => { if (successMessage.value && successMessage.value.includes('Bonuskarte')) successMessage.value = ''; }, 3000);
  } catch (err) {
    errorMessage.value = err.message || 'Fehler beim Löschen der Bonuskarte.';
    setTimeout(() => { errorMessage.value = ''; }, 3500);
  }
};

onMounted(async () => {
  await loadUserProfile();
  await syncUserMappings();
  await checkPermissions();
  await loadShoppingListsAndCards();
});
</script>

<template>
  <div class="page-shell">
    <header class="page-topbar" style="justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="ks-icon-btn" @click="goBack" aria-label="Zurück">
          <svg viewBox="0 0 24 24"><path d="M11.175 19 4 12l7.175-7 1.425 1.4L7.85 11H20v2H7.85l4.75 4.6Z"/></svg>
        </button>
        <h1 style="margin: 0; font-size: 20px;">Mein Konto</h1>
      </div>
      <button class="ks-icon-btn logout-header-btn" @click="logout" aria-label="Logout" title="Abmelden">
        <svg viewBox="0 0 24 24"><path d="M5 21q-.825 0-1.412-.587Q3 19.825 3 19V5q0-.825.588-1.412Q4.175 3 5 3h7v2H5v14h7v2Zm11-4-1.375-1.45 2.55-2.55H9v-2h8.175l-2.55-2.55L16 7l5 5Z"/></svg>
      </button>
    </header>

    <div class="ks-snackbar-stack">
      <transition-group name="toast">
        <div v-if="errorMessage" key="err" class="ks-snackbar ks-snackbar--error">{{ errorMessage }}</div>
        <div v-if="successMessage" key="succ" class="ks-snackbar ks-snackbar--success">{{ successMessage }}</div>
      </transition-group>
    </div>

    <div class="profile-container">
      <!-- HERO CARD -->
      <div class="profile-hero-card">
        <div class="hero-top-row">
          <div class="hero-avatar">
            {{ userInitial }}
          </div>
          <div class="hero-details">
            <h2 class="hero-name">{{ user.display_name || 'Benutzer' }}</h2>
            <span class="hero-email">{{ user.email }}</span>
          </div>
          <div
            class="hero-badge"
            :class="{ 'hero-badge--admin': user.is_admin }"
          >
            <span v-if="user.is_admin">⚡ Admin</span>
            <span v-else>👤 Mitglied</span>
          </div>
        </div>
      </div>

      <!-- SEGMENTED TABS (GENAU 3 TABS, PASST AUF JEDES SMARTPHONE OHNE ABSCHNEIDEN) -->
      <div class="segmented-tabs-wrapper">
        <div class="segmented-tabs">
          <button
            class="seg-tab-btn"
            :class="{ 'is-active': activeTab === 'profile' }"
            @click="activeTab = 'profile'"
          >
            <span>👤 Profil</span>
          </button>
          <button
            class="seg-tab-btn"
            :class="{ 'is-active': activeTab === 'notifications' }"
            @click="activeTab = 'notifications'"
          >
            <span>🔔 Mitteilungen</span>
            <span v-if="permissionStatus === 'granted' && user.settings_push_async_events" class="seg-dot"></span>
          </button>
          <button
            class="seg-tab-btn"
            :class="{ 'is-active': activeTab === 'security' }"
            @click="activeTab = 'security'"
          >
            <span>🔒 Sicherheit</span>
          </button>
        </div>
      </div>

      <!-- TAB 1: PROFIL -->
      <div v-if="activeTab === 'profile'" class="tab-content">
        <section class="page-panel settings-card">
          <div class="card-head">
            <h3>Persönliche Daten</h3>
            <p class="settings-subtext">Verwalte deinen Anzeigenamen und deine Kontoinformationen.</p>
          </div>

          <div v-if="!isOnline" class="ks-offline-notice">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>Du bist offline. Profiländerungen können derzeit nicht gespeichert werden.</span>
          </div>

          <div class="ks-field" style="margin-bottom: 20px;">
            <input type="email" v-model="user.email" disabled placeholder=" " />
            <label>E-Mail-Adresse (nicht änderbar)</label>
          </div>

          <div class="ks-field" style="margin-bottom: 24px;">
            <input type="text" v-model="user.display_name" placeholder=" " :disabled="!isOnline" />
            <label>Anzeigename</label>
          </div>

          <button
            @click="() => updateProfile(false)"
            :disabled="!isOnline || isLoading"
            class="ks-btn-pill-primary full-width"
          >
            Profil speichern
          </button>
        </section>

        <!-- EINKAUFS-EINSTELLUNGEN -->
        <section class="page-panel settings-card" style="margin-top: 16px;">
          <div class="card-head">
            <h3>Einkaufs-Einstellungen</h3>
            <p class="settings-subtext">Passe dein Verhalten während des Einkaufs im Supermarkt an.</p>
          </div>

          <div class="master-toggle-card">
            <div class="master-toggle-info">
              <span class="master-toggle-title">Bildschirm beim Einkaufen wachhalten</span>
              <span class="master-toggle-desc">
                Verhindert die automatische Bildschirmsperre, solange eine Einkaufsliste geöffnet ist.
              </span>
              <span v-if="!isWakeLockAvail" class="wake-lock-unsupported-note" style="display: block; margin-top: 4px; font-size: 12px; color: #f59e0b;">
                ⚠️ Auf diesem Gerät oder Browser wird die Screen Wake Lock API nicht unterstützt.
              </span>
            </div>
            <label class="ks-switch">
              <input type="checkbox" v-model="user.keep_screen_awake" @change="handleToggleKeepScreenAwake" />
              <span class="ks-switch-slider"></span>
            </label>
          </div>

          <div class="master-toggle-card" style="margin-top: 10px;">
            <div class="master-toggle-info">
              <span class="master-toggle-title">Haptisches Feedback</span>
              <span class="master-toggle-desc">
                Dezente Vibration beim Abhaken und Anpassen von Mengen.
              </span>
            </div>
            <label class="ks-switch">
              <input type="checkbox" v-model="user.haptic_feedback_enabled" @change="handleToggleHapticFeedback" />
              <span class="ks-switch-slider"></span>
            </label>
          </div>

          <div class="master-toggle-card" style="margin-top: 10px;">
            <div class="master-toggle-info">
              <span class="master-toggle-title">Nachkauf-Vorschläge anzeigen</span>
              <span class="master-toggle-desc">
                Zeigt im Suchfenster Artikel an, die bald wieder leer sein könnten („Bald wieder leer“).
              </span>
            </div>
            <label class="ks-switch">
              <input type="checkbox" v-model="user.show_restock_suggestions" @change="handleToggleRestockSuggestions" />
              <span class="ks-switch-slider"></span>
            </label>
          </div>

          <div class="master-toggle-card" style="margin-top: 10px;">
            <div class="master-toggle-info">
              <span class="master-toggle-title">Geschätzten Warenwert anzeigen</span>
              <span class="master-toggle-desc">
                Zeigt den ungefähren Kassenbetrag in geöffneten Listen an.
              </span>
            </div>
            <label class="ks-switch">
              <input type="checkbox" v-model="user.show_price_estimate" @change="handleTogglePriceEstimate" />
              <span class="ks-switch-slider"></span>
            </label>
          </div>

          <button
            type="button"
            class="master-toggle-card learned-entry-btn"
            style="margin-top: 10px; width: 100%; text-align: left; cursor: pointer;"
            @click="showLearnedMappingsModal = true"
          >
            <div class="master-toggle-info">
              <span class="master-toggle-title">Gelernte Zuordnungen</span>
              <span class="master-toggle-desc">
                Persönliche Kategorie-Korrekturen, eigene Artikel und gemerkte Barcodes verwalten.
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
              <span class="learned-count-pill">
                {{ mappingsCount === 0 ? 'Keine' : (mappingsCount === 1 ? '1 Eintrag' : `${mappingsCount} Einträge`) }}
              </span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#94a3b8">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
              </svg>
            </div>
          </button>
        </section>

        <!-- BONUSKARTEN -->
        <section class="page-panel settings-card" style="margin-top: 16px;">
          <div class="card-head">
            <h3 style="margin: 0;">Bonuskarten</h3>
            <p class="settings-subtext">Hinterlege für deine Listen persönliche Kundenkarten. An der Kasse mit 1 Tap abrufbar – 100% offline.</p>
          </div>

          <div v-if="shoppingLists.length === 0" class="ks-empty-card-state" style="text-align: center; padding: 24px 12px; color: #94a3b8;">
            <p style="margin: 0 0 4px; font-weight: 600;">Noch keine Einkaufslisten vorhanden</p>
            <p style="margin: 0; font-size: 13px;">Erstelle zuerst eine Einkaufsliste auf dem Dashboard.</p>
          </div>

          <div v-else class="loyalty-lists-container" style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
            <div
              v-for="list in shoppingLists"
              :key="list.id"
              class="loyalty-list-row"
            >
              <div class="loyalty-list-info">
                <StoreLogo :name="list.name" :size="36" />
                <div class="loyalty-list-text">
                  <div class="loyalty-list-name">{{ list.name }}</div>
                  <div class="loyalty-list-status">
                    <span v-if="loyaltyCardsMap[list.id]" class="loyalty-status-badge has-card">
                      <span class="status-check">✓</span>
                      <span class="card-digits">{{ maskCardCode(loyaltyCardsMap[list.id].code_value) }}</span>
                    </span>
                    <span v-else class="loyalty-status-badge no-card">
                      Keine Karte hinterlegt
                    </span>
                  </div>
                </div>
              </div>

              <div class="loyalty-list-actions">
                <button
                  v-if="!loyaltyCardsMap[list.id]"
                  class="ks-btn-action-primary"
                  @click="openCardModal(list)"
                >
                  <span>+ Code</span>
                </button>
                <template v-else>
                  <button
                    class="ks-btn-action-edit"
                    @click="openCardModal(list)"
                    title="Code ändern"
                  >
                    Ändern
                  </button>
                  <button
                    class="ks-btn-action-delete"
                    @click="confirmDeleteCard(list)"
                    title="Karte entfernen"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </template>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- TAB 2: MITTEILUNGEN -->
      <div v-if="activeTab === 'notifications'" class="tab-content">
        <section class="page-panel settings-card notif-card">
          <div class="card-header-with-badge">
            <div>
              <h3>Push-Benachrichtigungen</h3>
              <p class="settings-subtext">Wähle, bei welchen Einkaufs-Ereignissen du benachrichtigt wirst.</p>
            </div>
            <span v-if="!user.settings_push_async_events" class="status-badge status-badge--disabled">
              Aus
            </span>
            <span v-else-if="permissionStatus === 'granted'" class="status-badge status-badge--active">
              <span class="status-dot"></span> Aktiv
            </span>
            <span v-else-if="permissionStatus === 'denied'" class="status-badge status-badge--denied">
              ✕ Deaktiviert
            </span>
            <span v-else class="status-badge status-badge--pending">
              ⚠️ Nicht aktiv
            </span>
          </div>

          <div v-if="!isOnline" class="ks-offline-notice" style="margin-top: 14px;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>Du bist offline. Benachrichtigungseinstellungen können derzeit nicht geändert werden.</span>
          </div>

          <!-- HAUPTSCHALTER (MASTER TOGGLE) -->
          <div class="master-toggle-card">
            <div class="master-toggle-info">
              <span class="master-toggle-title">Benachrichtigungen erlauben</span>
              <span class="master-toggle-desc">
                {{ user.settings_push_async_events ? 'Mitteilungen sind aktiv' : 'Alle Mitteilungen sind stummgeschaltet' }}
              </span>
            </div>
            <label class="ks-switch">
              <input type="checkbox" v-model="user.settings_push_async_events" @change="() => updateProfile(true)" />
              <span class="ks-switch-slider"></span>
            </label>
          </div>

          <!-- HINWEIS WENN DEAKTIVIERT -->
          <div v-if="!user.settings_push_async_events" class="notifications-disabled-notice">
            <span class="notice-icon">🔕</span>
            <p>Du erhältst aktuell keine Push-Benachrichtigungen. Schalte den Schalter oben ein, um Benachrichtigungen zu aktivieren.</p>
          </div>

          <!-- DETAIL OPTIONEN WENN AKTIVIERT -->
          <template v-else>
            <!-- PERMISSION CALLOUT -->
            <div v-if="permissionStatus !== 'granted'" class="permission-callout" :class="{ 'is-denied': permissionStatus === 'denied' }">
              <div class="callout-info">
                <span class="callout-icon" v-if="permissionStatus === 'denied'">🚫</span>
                <span class="callout-icon" v-else>🔔</span>
                <div class="callout-text">
                  <strong v-if="permissionStatus === 'denied'">Im Android-System blockiert</strong>
                  <strong v-else>Benachrichtigungen auf diesem Gerät erlauben</strong>
                  <p v-if="permissionStatus === 'denied'">
                    Benachrichtigungen wurden in den Android-App-Einstellungen blockiert. Bitte schalte sie in deinen Handy-Einstellungen ein.
                  </p>
                  <p v-else>
                    Erlaube KaufSync, dir Mitteilungen bei Änderungen in deinen Einkaufslisten anzuzeigen.
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="ks-btn-pill-accent callout-btn"
                :disabled="isPermissionLoading"
                @click="enableNotifications"
              >
                <span v-if="isPermissionLoading" class="spinner-small"></span>
                <span v-else-if="permissionStatus === 'denied'">Status prüfen</span>
                <span v-else>Jetzt aktivieren</span>
              </button>
            </div>

            <!-- TEST BUTTON BAR (Wenn erlaubt) -->
            <div v-else class="test-notification-bar">
              <span class="test-desc">Mitteilungen sind auf diesem Gerät aktiv.</span>
              <button
                type="button"
                class="ks-btn-pill-secondary test-btn"
                :disabled="isTestingNotification || !isOnline"
                @click="sendTest"
              >
                <span v-if="isTestingNotification" class="spinner-small"></span>
                <span v-else>🔔 Test senden</span>
              </button>
            </div>

            <!-- EREIGNIS-OPTIONEN -->
            <div class="notif-groups">
              <!-- GRUPPE 1: LISTEN-AKTIVITÄTEN -->
              <div class="notif-group">
                <div class="notif-group-title">
                  <span class="group-icon">🛒</span>
                  <span>Listen-Aktivitäten</span>
                </div>

                <div class="notif-option-row">
                  <div class="option-info">
                    <span class="option-label">Neue Artikel hinzugefügt</span>
                    <span class="option-hint">Wenn jemand Artikel zur Einkaufsliste hinzufügt</span>
                  </div>
                  <label class="ks-switch">
                    <input type="checkbox" v-model="user.settings_push_new_items" @change="() => updateProfile(true)" />
                    <span class="ks-switch-slider"></span>
                  </label>
                </div>

                <div class="notif-option-row">
                  <div class="option-info">
                    <span class="option-label">Artikel als erledigt markiert</span>
                    <span class="option-hint">Wenn jemand im Laden einen Artikel abhakt</span>
                  </div>
                  <label class="ks-switch">
                    <input type="checkbox" v-model="user.settings_push_completed_items" @change="() => updateProfile(true)" />
                    <span class="ks-switch-slider"></span>
                  </label>
                </div>

                <div class="notif-option-row">
                  <div class="option-info">
                    <span class="option-label">Artikel gelöscht / Liste aufgeräumt</span>
                    <span class="option-hint">Wenn erledigte Artikel entfernt werden</span>
                  </div>
                  <label class="ks-switch">
                    <input type="checkbox" v-model="user.settings_push_cleared_items" @change="() => updateProfile(true)" />
                    <span class="ks-switch-slider"></span>
                  </label>
                </div>
              </div>

              <!-- GRUPPE 2: EINKAUFS-AKTIONEN -->
              <div class="notif-group">
                <div class="notif-group-title">
                  <span class="group-icon">🛍️</span>
                  <span>Einkaufs-Aktionen</span>
                </div>

                <div class="notif-option-row">
                  <div class="option-info">
                    <span class="option-label">„Ich gehe einkaufen!“</span>
                    <span class="option-hint">Kündigt den Einkauf an („Braucht noch wer was?“)</span>
                  </div>
                  <label class="ks-switch">
                    <input type="checkbox" v-model="user.settings_push_shopping_started" @change="() => updateProfile(true)" />
                    <span class="ks-switch-slider"></span>
                  </label>
                </div>

                <div class="notif-option-row">
                  <div class="option-info">
                    <span class="option-label">Einkauf abgeschlossen</span>
                    <span class="option-hint">Meldung, wenn der Einkauf beendet wurde</span>
                  </div>
                  <label class="ks-switch">
                    <input type="checkbox" v-model="user.settings_push_shopping_done" @change="() => updateProfile(true)" />
                    <span class="ks-switch-slider"></span>
                  </label>
                </div>
              </div>

              <!-- GRUPPE 3: MITGLIEDER -->
              <div class="notif-group">
                <div class="notif-group-title">
                  <span class="group-icon">👥</span>
                  <span>Mitglieder & Teilen</span>
                </div>

                <div class="notif-option-row">
                  <div class="option-info">
                    <span class="option-label">Beitrittsanfragen & neue Mitglieder</span>
                    <span class="option-hint">Wenn jemand deiner Liste beitritt</span>
                  </div>
                  <label class="ks-switch">
                    <input type="checkbox" v-model="user.settings_push_members" @change="() => updateProfile(true)" />
                    <span class="ks-switch-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </template>
        </section>
      </div>

      <!-- TAB 3: SICHERHEIT -->
      <div v-if="activeTab === 'security'" class="tab-content">
        <section class="page-panel settings-card" style="margin-bottom: 20px;">
          <div class="card-head">
            <h3>Passwort ändern</h3>
            <p class="settings-subtext">Wähle ein sicheres Passwort mit mindestens 6 Zeichen.</p>
          </div>

          <div v-if="!isOnline" class="ks-offline-notice">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>Du bist offline. Passwortänderungen erfordern eine aktive Internetverbindung.</span>
          </div>

          <div class="ks-field" style="margin-bottom: 20px;">
            <input type="password" v-model="passwordData.oldPassword" placeholder=" " :disabled="!isOnline" />
            <label>Aktuelles Passwort</label>
          </div>

          <div class="ks-field" style="margin-bottom: 20px;">
            <input type="password" v-model="passwordData.newPassword" placeholder=" " :disabled="!isOnline" />
            <label>Neues Passwort</label>
          </div>

          <div class="ks-field" style="margin-bottom: 24px;">
            <input type="password" v-model="passwordData.confirmPassword" placeholder=" " :disabled="!isOnline" />
            <label>Passwort bestätigen</label>
          </div>

          <button
            @click="changePassword"
            :disabled="!isOnline || isLoading"
            class="ks-btn-pill-primary full-width"
          >
            Passwort ändern
          </button>
        </section>

        <!-- ADMIN BEREICH IM SICHERHEITS-TAB ALS ZUSÄTZLICHER EINSTIEG -->
        <section v-if="user.is_admin" class="page-panel settings-card" style="margin-bottom: 20px;">
          <div class="card-head">
            <h3>Administrator Dashboard</h3>
            <p class="settings-subtext">Benutzerverwaltung, Freischaltungen und Systemeinstellungen.</p>
          </div>
          <button
            @click="router.push('/admin')"
            class="ks-btn-pill-accent full-width"
          >
            ⚡ Zum Admin Dashboard
          </button>
        </section>

        <section class="page-panel settings-card" style="margin-bottom: 20px;">
          <div class="card-head">
            <h3>Sitzung beenden</h3>
            <p class="settings-subtext">Du wirst von deinem aktuellen Konto auf diesem Gerät abgemeldet.</p>
          </div>

          <button
            @click="logout"
            class="ks-btn-pill-secondary full-width"
          >
            Abmelden
          </button>
        </section>

        <!-- DANGER ZONE: KONTO LÖSCHEN -->
        <section class="page-panel settings-card settings-card--danger" style="border-color: rgba(239, 68, 68, 0.35);">
          <div class="card-head">
            <h3 style="color: var(--ks-error, #ef4444);">Konto dauerhaft löschen</h3>
            <p class="settings-subtext">Dein Benutzerkonto, deine persönlichen Listen und Profildaten werden unwiderruflich gelöscht.</p>
          </div>

          <div v-if="!isOnline" class="ks-offline-notice">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>Du bist offline. Das Löschen deines Kontos erfordert eine aktive Internetverbindung.</span>
          </div>

          <button
            @click="openDeleteAccountModal"
            :disabled="!isOnline"
            class="ks-btn-pill-danger full-width"
            style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4);"
          >
            Konto dauerhaft löschen
          </button>
        </section>
      </div>
    </div>

    <LearnedMappingsModal
      :is-open="showLearnedMappingsModal"
      @close="showLearnedMappingsModal = false"
    />

    <!-- MODAL: KONTO LÖSCHEN BESTÄTIGEN -->
    <div v-if="showDeleteAccountModal" class="ks-sheet-scrim" @click="closeDeleteAccountModal" style="display: flex; align-items: center; justify-content: center; z-index: 100;">
      <div class="ks-modal-card" @click.stop style="max-width: 480px; width: 90%; padding: 24px; background: var(--ks-surface, #1e293b); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 20px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
          <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">
            ⚠️
          </div>
          <div>
            <h2 style="font-size: 18px; font-weight: 700; color: #f8fafc; margin: 0;">Konto dauerhaft löschen?</h2>
            <p style="font-size: 12px; color: var(--ks-text-muted, #94a3b8); margin: 2px 0 0;">Diese Aktion ist unwiderruflich.</p>
          </div>
        </div>

        <p style="font-size: 13px; line-height: 1.5; color: #cbd5e1; margin-bottom: 12px;">
          Folgende Daten werden dauerhaft und ohne Wiederherstellungsmöglichkeit entfernt:
        </p>
        <ul style="font-size: 13px; line-height: 1.6; color: #94a3b8; margin: 0 0 16px 18px; padding: 0;">
          <li>Dein Benutzerkonto und deine Profilinformationen</li>
          <li>Alle persönlichen Einkaufslisten und deren Einträge</li>
          <li>Deine Mitgliedschaften in geteilten Listen (geteilte Listen bleiben für verbleibende Mitglieder erhalten)</li>
          <li>Alle Push-Benachrichtigungsregistrierungen und Sitzungsdaten</li>
        </ul>

        <div v-if="deleteAccountError" class="ks-error-banner" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 10px; padding: 10px 14px; color: #fca5a5; font-size: 13px; margin-bottom: 16px;">
          {{ deleteAccountError }}
        </div>

        <div class="ks-field" style="margin-bottom: 24px;">
          <input
            type="password"
            v-model="deleteAccountPassword"
            placeholder=" "
            @keyup.enter="confirmDeleteAccount"
            :disabled="isDeletingAccount"
          />
          <label>Aktuelles Passwort zur Bestätigung</label>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button
            class="ks-btn-pill-secondary"
            @click="closeDeleteAccountModal"
            :disabled="isDeletingAccount"
            style="flex: 1;"
          >
            Abbrechen
          </button>
          <button
            class="ks-btn-pill-danger"
            @click="confirmDeleteAccount"
            :disabled="!deleteAccountPassword || isDeletingAccount || !isOnline"
            style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;"
          >
            <span v-if="isDeletingAccount" class="spinner"></span>
            <span>{{ isDeletingAccount ? 'Wird gelöscht...' : 'Endgültig löschen' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- DEDICATED STANDALONE MODAL: BONUSKARTE HINTERLEGEN / ÄNDERN -->
    <LoyaltyCardEditModal
      :is-open="showCardEditModal"
      :list="selectedCardList"
      :existing-card="selectedCardList ? loyaltyCardsMap[selectedCardList.id] : null"
      @close="showCardEditModal = false"
      @saved="handleCardSaved"
    />

    <!-- CONFIRM DELETE CARD MODAL (TELEPORTED TO BODY) -->
    <teleport to="body">
      <div v-if="showDeleteCardConfirm" class="ks-confirm-modal-overlay" @click.self="showDeleteCardConfirm = false">
        <div class="ks-confirm-modal-card">
          <div class="ks-confirm-modal-header">
            <StoreLogo v-if="cardToDeleteList" :name="cardToDeleteList.name" :size="32" />
            <h3 class="ks-confirm-title">Bonuskarte entfernen?</h3>
          </div>
          <p class="ks-confirm-desc">
            Möchtest du die hinterlegte Bonuskarte für <strong class="ks-highlight-name">„{{ cardToDeleteList?.name }}“</strong> wirklich löschen?
          </p>
          <div class="ks-confirm-actions">
            <button class="ks-btn-modal-cancel" @click="showDeleteCardConfirm = false">
              Abbrechen
            </button>
            <button class="ks-btn-modal-danger" @click="executeDeleteCard">
              Löschen
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.logout-header-btn {
  color: var(--ks-error);
}

.profile-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

/* HERO CARD */
.profile-hero-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  background: rgba(30, 41, 59, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.hero-top-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.hero-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0ea5e9, #38bdf8);
  color: #0f172a;
  font-size: 22px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);
  flex-shrink: 0;
}

.hero-details {
  flex: 1;
  min-width: 0;
}

.hero-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-email {
  display: block;
  font-size: 13px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.hero-badge {
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.hero-badge--admin {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.35);
}

/* SEGMENTED PILL NAVIGATION (3 TABS, FIT AUF JEDEM DISPLAY) */
.segmented-tabs-wrapper {
  width: 100%;
  padding: 2px 0;
}

.segmented-tabs {
  display: flex;
  gap: 4px;
  background: rgba(15, 23, 42, 0.6);
  padding: 5px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  width: 100%;
}

.seg-tab-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.seg-tab-btn:hover:not(.is-active) {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.04);
}

.seg-tab-btn.is-active {
  background: #334155;
  color: #f8fafc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.seg-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
}

/* TAB CONTENT */
.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card {
  padding: 22px;
  border-radius: 20px;
}

.card-head {
  margin-bottom: 20px;
}

.card-head h3,
.settings-card h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  color: #f8fafc;
}

.settings-subtext {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.45;
}

.full-width {
  width: 100%;
}

.ks-field input:disabled {
  opacity: 0.55;
  background: rgba(255, 255, 255, 0.02);
  cursor: not-allowed;
}

/* NOTIFICATIONS CARD SPECIFICS */
.card-header-with-badge {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-badge--active {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-badge--disabled {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.status-badge--denied {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.status-badge--pending {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

/* MASTER TOGGLE CARD */
.master-toggle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  margin-bottom: 20px;
}

.master-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.master-toggle-title {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.master-toggle-desc {
  font-size: 12px;
  color: #94a3b8;
}

/* DISABLED NOTICE */
.notifications-disabled-notice {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.45;
}

.notifications-disabled-notice .notice-icon {
  font-size: 24px;
}

.notifications-disabled-notice p {
  margin: 0;
}

/* PERMISSION CALLOUT */
.permission-callout {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.25);
  margin-bottom: 24px;
}

.permission-callout.is-denied {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.25);
}

.callout-info {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.callout-icon {
  font-size: 22px;
  line-height: 1;
}

.callout-text strong {
  display: block;
  font-size: 14px;
  color: #f8fafc;
  margin-bottom: 4px;
}

.callout-text p {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.callout-btn {
  width: 100%;
}

.test-notification-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  margin-bottom: 24px;
  gap: 10px;
}

.test-desc {
  font-size: 12px;
  color: #94a3b8;
}

.test-btn {
  padding: 0 14px !important;
  min-height: 38px !important;
  font-size: 13px !important;
  flex-shrink: 0;
}

/* NOTIFICATION GROUPS */
.notif-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.notif-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.notif-group:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.notif-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #38bdf8;
  margin-bottom: 4px;
}

.group-icon {
  font-size: 15px;
}

.notif-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
}

.option-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.option-label {
  font-size: 14px;
  font-weight: 500;
  color: #f1f5f9;
}

.option-hint {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.35;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* LOYALTY CARDS SECTION */
.loyalty-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 12px 14px;
}
.loyalty-list-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.loyalty-list-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.loyalty-list-name {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.loyalty-list-status {
  font-size: 12px;
  margin-top: 2px;
}
.loyalty-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  white-space: nowrap;
}
.loyalty-status-badge.has-card {
  color: #f8fafc;
}
.status-check {
  color: #10b981;
  font-weight: 700;
  font-size: 13px;
}
.card-digits {
  color: #38bdf8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  letter-spacing: 0.5px;
}
.loyalty-status-badge.no-card {
  color: #64748b;
}

.loyalty-list-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.ks-btn-action-primary {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ks-btn-action-primary:hover {
  background: rgba(245, 158, 11, 0.3);
}
.ks-btn-action-edit {
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ks-btn-action-edit:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}
.ks-btn-action-delete {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.ks-btn-action-delete:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* CONFIRM DELETE CARD MODAL */
.ks-confirm-modal-overlay {
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

.ks-confirm-modal-card {
  background: #1e293b;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 20px;
  max-width: 400px;
  width: 100%;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: ksSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.ks-confirm-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ks-confirm-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
}

.ks-confirm-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #cbd5e1;
}

.ks-highlight-name {
  color: #f8fafc;
}

.ks-confirm-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.ks-btn-modal-cancel {
  flex: 1;
  padding: 12px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ks-btn-modal-cancel:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.ks-btn-modal-danger {
  flex: 1;
  padding: 12px;
  border-radius: 9999px;
  background: #ef4444;
  border: none;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
  transition: all 0.15s ease;
}

.ks-btn-modal-danger:hover {
  background: #dc2626;
  transform: translateY(-1px);
}

@keyframes ksFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes ksSlideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.learned-entry-btn {
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.learned-entry-btn:hover {
  border-color: rgba(56, 189, 248, 0.35);
}

.learned-count-pill {
  font-size: 12px;
  font-weight: 600;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.14);
  padding: 3px 9px;
  border-radius: 9999px;
}
</style>