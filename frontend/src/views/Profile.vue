<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiUrl } from '../config/api';
import { clearAllLocalData } from '../db/index';
import { isOnline } from '../services/syncService';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  triggerTestNotification
} from '../utils/notificationService';

const router = useRouter();

const activeTab = ref('profile'); // 'profile' | 'notifications' | 'security'

const user = ref({
  email: '',
  display_name: '',
  is_admin: false,
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
        settings_push_members: user.value.settings_push_members
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
    await clearAllLocalData();
    router.push('/login?deleted=1');
  } catch (err) {
    deleteAccountError.value = 'Verbindungsfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.';
  } finally {
    isDeletingAccount.value = false;
  }
};

const logout = async () => {
  await clearAllLocalData();
  router.push('/login');
};

const goBack = () => router.push('/');

onMounted(async () => {
  await loadUserProfile();
  await checkPermissions();
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
            @click="user.is_admin ? router.push('/admin') : null"
            :style="user.is_admin ? 'cursor: pointer;' : ''"
            :title="user.is_admin ? 'Admin Dashboard öffnen' : ''"
          >
            <span v-if="user.is_admin">⚡ Admin</span>
            <span v-else>👤 Mitglied</span>
          </div>
        </div>

        <!-- DEDIZIERTER ADMIN BUTTON IN HERO CARD -->
        <div v-if="user.is_admin" class="hero-admin-bar">
          <button @click="router.push('/admin')" class="hero-admin-action-btn">
            <span class="admin-icon">⚡</span>
            <span class="admin-btn-text">Admin Dashboard öffnen</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="admin-arrow"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
          </button>
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
.hero-badge--admin:hover {
  background: rgba(56, 189, 248, 0.25);
  transform: translateY(-1px);
}

.hero-admin-bar {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
  margin-top: -2px;
}

.hero-admin-action-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 12px;
  color: #38bdf8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.hero-admin-action-btn:hover {
  background: rgba(56, 189, 248, 0.18);
  border-color: rgba(56, 189, 248, 0.4);
}
.hero-admin-action-btn:active {
  transform: scale(0.985);
}
.admin-icon {
  font-size: 15px;
}
.admin-btn-text {
  flex: 1;
  text-align: left;
}
.admin-arrow {
  opacity: 0.8;
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
</style>