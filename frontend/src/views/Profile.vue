<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiUrl } from '../config/api';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  triggerTestNotification
} from '../utils/notificationService';

const router = useRouter();

const activeTab = ref('profile'); // 'profile' | 'notifications' | 'security' | 'admin'

const user = ref({
  email: '',
  display_name: '',
  is_admin: false,
  settings_push_new_items: true,
  settings_push_completed_items: true,
  settings_push_cleared_items: true,
  settings_push_shopping_started: true,
  settings_push_shopping_done: false,
  settings_push_members: true,
  settings_push_quiet_hours: false,
  settings_push_quiet_start: '22:00',
  settings_push_quiet_end: '07:00',
  settings_sound_enabled: true,
  settings_vibration_enabled: true
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
    user.value.settings_push_new_items = data.settings_push_new_items ?? true;
    user.value.settings_push_completed_items = data.settings_push_completed_items ?? true;
    user.value.settings_push_cleared_items = data.settings_push_cleared_items ?? true;
    user.value.settings_push_shopping_started = data.settings_push_shopping_started ?? true;
    user.value.settings_push_shopping_done = data.settings_push_shopping_done ?? false;
    user.value.settings_push_members = data.settings_push_members ?? true;
    user.value.settings_push_quiet_hours = data.settings_push_quiet_hours ?? false;
    user.value.settings_push_quiet_start = data.settings_push_quiet_start || '22:00';
    user.value.settings_push_quiet_end = data.settings_push_quiet_end || '07:00';
    user.value.settings_sound_enabled = data.settings_sound_enabled ?? true;
    user.value.settings_vibration_enabled = data.settings_vibration_enabled ?? true;
  } catch (error) {
    console.error(error);
  }
};

const updateProfile = async (silent = false) => {
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
        settings_push_new_items: user.value.settings_push_new_items,
        settings_push_completed_items: user.value.settings_push_completed_items,
        settings_push_cleared_items: user.value.settings_push_cleared_items,
        settings_push_shopping_started: user.value.settings_push_shopping_started,
        settings_push_shopping_done: user.value.settings_push_shopping_done,
        settings_push_members: user.value.settings_push_members,
        settings_push_quiet_hours: user.value.settings_push_quiet_hours,
        settings_push_quiet_start: user.value.settings_push_quiet_start,
        settings_push_quiet_end: user.value.settings_push_quiet_end,
        settings_sound_enabled: user.value.settings_sound_enabled,
        settings_vibration_enabled: user.value.settings_vibration_enabled
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

const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('isLoggedIn');
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
        <div class="hero-avatar">
          {{ userInitial }}
        </div>
        <div class="hero-details">
          <h2 class="hero-name">{{ user.display_name || 'Benutzer' }}</h2>
          <span class="hero-email">{{ user.email }}</span>
        </div>
        <div class="hero-badge" :class="{ 'hero-badge--admin': user.is_admin }">
          <span v-if="user.is_admin">⚡ Admin</span>
          <span v-else>👤 Mitglied</span>
        </div>
      </div>

      <!-- SEGMENTED TABS -->
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
            <span v-if="permissionStatus === 'granted'" class="seg-dot"></span>
          </button>
          <button
            class="seg-tab-btn"
            :class="{ 'is-active': activeTab === 'security' }"
            @click="activeTab = 'security'"
          >
            <span>🔒 Sicherheit</span>
          </button>
          <button
            v-if="user.is_admin"
            class="seg-tab-btn"
            :class="{ 'is-active': activeTab === 'admin' }"
            @click="activeTab = 'admin'"
          >
            <span>⚡ Admin</span>
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

          <div class="ks-field" style="margin-bottom: 20px;">
            <input type="email" v-model="user.email" disabled placeholder=" " />
            <label>E-Mail-Adresse (nicht änderbar)</label>
          </div>

          <div class="ks-field" style="margin-bottom: 24px;">
            <input type="text" v-model="user.display_name" placeholder=" " />
            <label>Anzeigename</label>
          </div>

          <button
            @click="() => updateProfile(false)"
            :disabled="isLoading"
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
              <p class="settings-subtext">Fein granular einstellen, wann Mitteilungen erfolgen sollen.</p>
            </div>
            <span v-if="permissionStatus === 'granted'" class="status-badge status-badge--active">
              <span class="status-dot"></span> Aktiv
            </span>
            <span v-else-if="permissionStatus === 'denied'" class="status-badge status-badge--denied">
              ✕ Deaktiviert
            </span>
            <span v-else class="status-badge status-badge--pending">
              ⚠️ Nicht aktiv
            </span>
          </div>

          <!-- PERMISSION CALLOUT -->
          <div v-if="permissionStatus !== 'granted'" class="permission-callout" :class="{ 'is-denied': permissionStatus === 'denied' }">
            <div class="callout-info">
              <span class="callout-icon" v-if="permissionStatus === 'denied'">🚫</span>
              <span class="callout-icon" v-else>🔔</span>
              <div class="callout-text">
                <strong v-if="permissionStatus === 'denied'">Im Android-System blockiert</strong>
                <strong v-else>Benachrichtigungen aktivieren</strong>
                <p v-if="permissionStatus === 'denied'">
                  Benachrichtigungen wurden in den Android-App-Einstellungen blockiert. Bitte schalte sie in deinen Handy-Einstellungen ein.
                </p>
                <p v-else>
                  Erlaube KaufSync, dir Mitteilungen zu senden (z. B. wenn jemand Artikel hinzufügt oder einkaufen geht).
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
              :disabled="isTestingNotification"
              @click="sendTest"
            >
              <span v-if="isTestingNotification" class="spinner-small"></span>
              <span v-else>🔔 Test senden</span>
            </button>
          </div>

          <!-- EINSTELLUNGS-GRUPPEN (BRING-STYLE) -->
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
                <span>Einkaufs-Aktionen (Bring-Modus)</span>
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

            <!-- GRUPPE 4: RUHEZEITEN -->
            <div class="notif-group">
              <div class="notif-group-title">
                <span class="group-icon">🌙</span>
                <span>Ruhezeit (Bitte nicht stören)</span>
              </div>

              <div class="notif-option-row">
                <div class="option-info">
                  <span class="option-label">Ruhemodus aktivieren</span>
                  <span class="option-hint">Keine Benachrichtigungen während des gewählten Zeitraums</span>
                </div>
                <label class="ks-switch">
                  <input type="checkbox" v-model="user.settings_push_quiet_hours" @change="() => updateProfile(true)" />
                  <span class="ks-switch-slider"></span>
                </label>
              </div>

              <div v-if="user.settings_push_quiet_hours" class="quiet-hours-range">
                <div class="time-input-group">
                  <label>Von</label>
                  <input
                    type="time"
                    v-model="user.settings_push_quiet_start"
                    class="time-picker"
                    @change="() => updateProfile(true)"
                  />
                </div>
                <span class="time-sep">bis</span>
                <div class="time-input-group">
                  <label>Bis</label>
                  <input
                    type="time"
                    v-model="user.settings_push_quiet_end"
                    class="time-picker"
                    @change="() => updateProfile(true)"
                  />
                </div>
              </div>
            </div>

            <!-- GRUPPE 5: SIGNALE -->
            <div class="notif-group">
              <div class="notif-group-title">
                <span class="group-icon">🔊</span>
                <span>Signale</span>
              </div>

              <div class="notif-option-row">
                <div class="option-info">
                  <span class="option-label">Benachrichtigungston</span>
                  <span class="option-hint">Akustisches Signal bei neuen Mitteilungen</span>
                </div>
                <label class="ks-switch">
                  <input type="checkbox" v-model="user.settings_sound_enabled" @change="() => updateProfile(true)" />
                  <span class="ks-switch-slider"></span>
                </label>
              </div>

              <div class="notif-option-row">
                <div class="option-info">
                  <span class="option-label">Vibration</span>
                  <span class="option-hint">Vibration bei Benachrichtigungen</span>
                </div>
                <label class="ks-switch">
                  <input type="checkbox" v-model="user.settings_vibration_enabled" @change="() => updateProfile(true)" />
                  <span class="ks-switch-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- TAB 3: SICHERHEIT -->
      <div v-if="activeTab === 'security'" class="tab-content">
        <section class="page-panel settings-card" style="margin-bottom: 20px;">
          <div class="card-head">
            <h3>Passwort ändern</h3>
            <p class="settings-subtext">Wähle ein sicheres Passwort mit mindestens 6 Zeichen.</p>
          </div>

          <div class="ks-field" style="margin-bottom: 20px;">
            <input type="password" v-model="passwordData.oldPassword" placeholder=" " />
            <label>Aktuelles Passwort</label>
          </div>

          <div class="ks-field" style="margin-bottom: 20px;">
            <input type="password" v-model="passwordData.newPassword" placeholder=" " />
            <label>Neues Passwort</label>
          </div>

          <div class="ks-field" style="margin-bottom: 24px;">
            <input type="password" v-model="passwordData.confirmPassword" placeholder=" " />
            <label>Passwort bestätigen</label>
          </div>

          <button
            @click="changePassword"
            :disabled="isLoading"
            class="ks-btn-pill-primary full-width"
          >
            Passwort ändern
          </button>
        </section>

        <section class="page-panel settings-card">
          <div class="card-head">
            <h3>Sitzung beenden</h3>
            <p class="settings-subtext">Du wirst von deinem aktuellen Konto auf diesem Gerät abgemeldet.</p>
          </div>

          <button
            @click="logout"
            class="ks-btn-pill-danger full-width"
          >
            Abmelden
          </button>
        </section>
      </div>

      <!-- TAB 4: ADMIN (falls Admin) -->
      <div v-if="activeTab === 'admin' && user.is_admin" class="tab-content">
        <section class="page-panel settings-card">
          <div class="card-head">
            <h3>Administrator Dashboard</h3>
            <p class="settings-subtext">
              Du besitzt Administrator-Rechte. Im Admin-Bereich kannst du registrierte Benutzer verwalten, freischalten oder sperren.
            </p>
          </div>

          <button
            @click="router.push('/admin')"
            class="ks-btn-pill-accent full-width"
            style="margin-top: 12px;"
          >
            ⚡ Zum Admin Dashboard
          </button>
        </section>
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
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: rgba(30, 41, 59, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
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
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.12);
  white-space: nowrap;
  flex-shrink: 0;
}

.hero-badge--admin {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.35);
}

/* SEGMENTED PILL NAVIGATION */
.segmented-tabs-wrapper {
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  margin: 0 -4px;
  padding: 2px 4px;
}
.segmented-tabs-wrapper::-webkit-scrollbar {
  display: none;
}

.segmented-tabs {
  display: inline-flex;
  gap: 6px;
  background: rgba(15, 23, 42, 0.6);
  padding: 5px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  min-width: 100%;
}

.seg-tab-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
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
  margin-bottom: 20px;
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

/* QUIET HOURS RANGE PICKER */
.quiet-hours-range {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  margin-top: 4px;
}

.time-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.time-input-group label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.time-picker {
  background: #1e2430;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  width: 100%;
}

.time-picker:focus {
  border-color: #38bdf8;
}

.time-sep {
  color: #64748b;
  font-size: 12px;
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