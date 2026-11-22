<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { apiUrl } from '../config/api';
import { clearAllLocalData } from '../db/index';
import { clearAllNoteHistories } from '../utils/articleNoteHistory';
import { isOnline } from '../services/syncService';

const router = useRouter();

// Auth & Flow State
const token = ref(localStorage.getItem('token'));
const isLoggedIn = computed(() => !!token.value && token.value !== 'undefined');

// Form States
const loginEmail = ref('');
const loginPassword = ref('');
const loginError = ref('');
const isLoggingIn = ref(false);

const showConfirmModal = ref(false);
const confirmPassword = ref('');
const deleteError = ref('');
const isDeleting = ref(false);

// Handle direct inline login on this page
const handleInlineLogin = async () => {
  if (!loginEmail.value || !loginPassword.value) {
    loginError.value = 'Bitte gib deine E-Mail-Adresse und dein Passwort ein.';
    return;
  }
  if (!isOnline.value) {
    loginError.value = 'Du bist offline. Eine Anmeldung ist derzeit nicht möglich.';
    return;
  }
  isLoggingIn.value = true;
  loginError.value = '';

  try {
    const formData = new URLSearchParams();
    formData.append('username', loginEmail.value.trim());
    formData.append('password', loginPassword.value);

    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      loginError.value = data.detail || 'Anmeldung fehlgeschlagen. Bitte prüfe deine Zugangsdaten.';
      return;
    }

    localStorage.setItem('token', data.access_token);
    localStorage.setItem('isLoggedIn', 'true');
    token.value = data.access_token;

    // Prefill the confirm password from login for smooth deletion confirmation
    confirmPassword.value = loginPassword.value;
    showConfirmModal.value = true;
  } catch (err) {
    loginError.value = 'Verbindungsfehler beim Anmelden. Bitte prüfe deine Internetverbindung.';
  } finally {
    isLoggingIn.value = false;
  }
};

const openConfirmModal = () => {
  if (!isOnline.value) return;
  confirmPassword.value = '';
  deleteError.value = '';
  showConfirmModal.value = true;
};

const closeConfirmModal = () => {
  if (isDeleting.value) return;
  showConfirmModal.value = false;
  confirmPassword.value = '';
  deleteError.value = '';
};

const executeAccountDeletion = async () => {
  if (!confirmPassword.value || isDeleting.value) return;
  if (!isOnline.value) {
    deleteError.value = 'Du bist offline. Das Löschen des Kontos erfordert eine aktive Internetverbindung.';
    return;
  }

  isDeleting.value = true;
  deleteError.value = '';

  try {
    const response = await fetch(apiUrl('/api/users/me'), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`
      },
      body: JSON.stringify({ current_password: confirmPassword.value })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      deleteError.value = data.detail || 'Fehler beim Löschen des Kontos.';
      return;
    }

    showConfirmModal.value = false;
    await clearAllLocalData();
    clearAllNoteHistories();
    router.push('/login?deleted=1');
  } catch (err) {
    deleteError.value = 'Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut.';
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div class="page-shell delete-account-page">
    <div class="delete-container">
      <!-- HEADER & BRANDING -->
      <header class="delete-header">
        <div class="brand-badge">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1" fill="currentColor"></circle>
            <circle cx="20" cy="21" r="1" fill="currentColor"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
        </div>
        <h1 class="brand-title">KaufSync</h1>
        <p class="brand-subtitle">Konto & Daten dauerhaft löschen</p>
      </header>

      <!-- OFFLINE NOTICE -->
      <div v-if="!isOnline" class="ks-offline-notice">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>Du bist offline. Das Löschen eines KaufSync-Kontos erfordert eine aktive Internetverbindung.</span>
      </div>

      <!-- INFORMATION / COMPLIANCE CARD -->
      <section class="page-panel info-card">
        <h2 class="card-headline">Informationen zur Kontolöschung</h2>
        <p class="card-desc">
          Gemäß den Richtlinien von KaufSync und dem Google Play Store kannst du dein Konto und sämtliche damit verbundenen personenbezogenen Daten jederzeit vollständig und unwiderruflich löschen – auch wenn du die Android-App bereits deinstalliert hast.
        </p>

        <div class="data-section">
          <h3 class="data-title">Was wird sofort und dauerhaft gelöscht?</h3>
          <ul class="data-list">
            <li><strong>Benutzerkonto:</strong> E-Mail-Adresse, Name, gehashtes Passwort und Sicherheitstoken.</li>
            <li><strong>Profil- & Gerätedaten:</strong> Alle Push-Benachrichtigungsregistrierungen und Endgeräteverbindungen.</li>
            <li><strong>Persönliche Listen:</strong> Alle von dir erstellten Einkaufslisten, für die es keine anderen Mitglieder gibt, samt allen Artikeln und Historien.</li>
            <li><strong>Mitgliedschaften:</strong> Deine Verknüpfungen mit geteilten Listen werden aufgehoben.</li>
          </ul>
        </div>

        <div class="data-section">
          <h3 class="data-title">Was passiert mit gemeinsam genutzten Listen?</h3>
          <p class="data-note">
            Wenn du Eigentümer einer geteilten Liste bist, in der weitere Personen eingetragen sind (z. B. Haushaltsmitglieder), wird das Eigentum automatisch an das dienstälteste verbleibende Mitglied übertragen, damit dein Haushalt die Einkaufsliste nahtlos weiterverwenden kann. Dein Name in historischen Aktivitäten wird vollständig anonymisiert (<em>„Ehemaliges Mitglied“</em>).
          </p>
        </div>

        <div class="data-section">
          <h3 class="data-title">Aufbewahrungsfristen</h3>
          <p class="data-note">
            Die Löschung erfolgt <strong>sofort und unwiderruflich</strong>. Es gibt keine Karenzzeit und keine Wiederherstellungsmöglichkeit.
          </p>
        </div>
      </section>

      <!-- ACTION SECTION -->
      <section class="page-panel action-card">
        <!-- SCENARIO A: USER IS LOGGED IN -->
        <div v-if="isLoggedIn" class="logged-in-box">
          <div class="logged-in-status">
            <span class="status-indicator"></span>
            <span>Angemeldet als aktiver KaufSync-Nutzer</span>
          </div>
          <p class="action-desc">
            Klicke auf die folgende Schaltfläche, um die Löschung deines Kontos mit deinem aktuellen Passwort zu bestätigen.
          </p>
          <button
            class="ks-btn-pill-danger full-width"
            :disabled="!isOnline"
            @click="openConfirmModal"
          >
            Konto dauerhaft löschen
          </button>
        </div>

        <!-- SCENARIO B: USER IS NOT LOGGED IN -->
        <div v-else class="logged-out-box">
          <h3 class="card-headline">1. Zur Verifizierung anmelden</h3>
          <p class="action-desc">
            Um Missbrauch zu verhindern, melde dich bitte mit deinen KaufSync-Zugangsdaten an. Danach kannst du die endgültige Löschung bestätigen.
          </p>

          <div v-if="loginError" class="ks-error-banner">
            {{ loginError }}
          </div>

          <form @submit.prevent="handleInlineLogin" class="inline-login-form">
            <div class="ks-field" style="margin-bottom: 16px;">
              <input
                type="email"
                v-model="loginEmail"
                placeholder=" "
                required
                autocomplete="email"
                :disabled="isLoggingIn"
              />
              <label>E-Mail-Adresse</label>
            </div>

            <div class="ks-field" style="margin-bottom: 20px;">
              <input
                type="password"
                v-model="loginPassword"
                placeholder=" "
                required
                autocomplete="current-password"
                :disabled="isLoggingIn"
              />
              <label>Passwort</label>
            </div>

            <button
              type="submit"
              class="ks-btn-pill-primary full-width"
              :disabled="isLoggingIn || !loginEmail.trim() || !loginPassword || !isOnline"
            >
              <span v-if="isLoggingIn" class="spinner"></span>
              <span>{{ isLoggingIn ? 'Wird geprüft...' : 'Anmelden & zur Kontolöschung' }}</span>
            </button>
          </form>
        </div>
      </section>

      <!-- FOOTER -->
      <footer class="delete-footer">
        <router-link to="/login" class="back-link">← Zurück zum Login</router-link>
        <span class="copyright">KaufSync &bull; Datenschutz & Kontoverwaltung</span>
      </footer>
    </div>

    <!-- CONFIRMATION MODAL -->
    <div v-if="showConfirmModal" class="ks-sheet-scrim" @click="closeConfirmModal">
      <div class="ks-modal-card" @click.stop>
        <div class="modal-header">
          <div class="warning-icon-wrap">⚠️</div>
          <div>
            <h2 class="modal-title">Konto endgültig löschen?</h2>
            <p class="modal-subtitle">Dieser Schritt kann nicht rückgängig gemacht werden.</p>
          </div>
        </div>

        <p class="modal-text">
          Bitte bestätige die endgültige Löschung deines KaufSync-Kontos durch Eingabe deines Passworts. Alle persönlichen Listen und Kontodaten werden sofort gelöscht.
        </p>

        <div v-if="deleteError" class="ks-error-banner" style="margin-bottom: 16px;">
          {{ deleteError }}
        </div>

        <div class="ks-field" style="margin-bottom: 24px;">
          <input
            type="password"
            v-model="confirmPassword"
            placeholder=" "
            @keyup.enter="executeAccountDeletion"
            :disabled="isDeleting"
            autofocus
          />
          <label>Aktuelles Passwort</label>
        </div>

        <div class="modal-actions">
          <button
            class="ks-btn-pill-secondary"
            @click="closeConfirmModal"
            :disabled="isDeleting"
            style="flex: 1;"
          >
            Abbrechen
          </button>
          <button
            class="ks-btn-pill-danger"
            @click="executeAccountDeletion"
            :disabled="!confirmPassword || isDeleting || !isOnline"
            style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;"
          >
            <span v-if="isDeleting" class="spinner"></span>
            <span>{{ isDeleting ? 'Löschen...' : 'Endgültig löschen' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delete-account-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 32px 16px 48px;
  background-color: var(--ks-bg, #0f172a);
  color: var(--ks-text, #f8fafc);
}

.delete-container {
  width: 100%;
  max-width: 580px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.delete-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.brand-badge {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.4));
  border: 1px solid rgba(56, 189, 248, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #38bdf8;
  margin-bottom: 4px;
}

.brand-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.5px;
  margin: 0;
  color: #f8fafc;
}

.brand-subtitle {
  font-size: 14px;
  color: var(--ks-text-muted, #94a3b8);
  margin: 0;
}

.card-headline {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 10px;
  color: #f8fafc;
}

.card-desc {
  font-size: 13px;
  line-height: 1.55;
  color: #cbd5e1;
  margin: 0 0 16px;
}

.data-section {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 14px;
  margin-top: 14px;
}

.data-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0 0 8px;
}

.data-list {
  font-size: 13px;
  line-height: 1.6;
  color: #94a3b8;
  margin: 0 0 0 18px;
  padding: 0;
}

.data-list strong {
  color: #cbd5e1;
}

.data-note {
  font-size: 13px;
  line-height: 1.5;
  color: #94a3b8;
  margin: 0;
}

.action-card {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(30, 41, 59, 0.7);
}

.logged-in-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 12px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.7);
}

.action-desc {
  font-size: 13px;
  line-height: 1.5;
  color: #cbd5e1;
  margin-bottom: 16px;
}

.ks-error-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 10px;
  padding: 10px 14px;
  color: #fca5a5;
  font-size: 13px;
  margin-bottom: 16px;
}

.delete-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 4px;
  font-size: 12px;
  color: var(--ks-text-muted, #94a3b8);
}

.back-link {
  color: #38bdf8;
  text-decoration: none;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}

/* Modal styles */
.ks-modal-card {
  max-width: 480px;
  width: 90%;
  margin: auto;
  padding: 24px;
  background: var(--ks-surface, #1e293b);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 20px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.warning-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.modal-subtitle {
  font-size: 12px;
  color: var(--ks-text-muted, #94a3b8);
  margin: 2px 0 0;
}

.modal-text {
  font-size: 13px;
  line-height: 1.5;
  color: #cbd5e1;
  margin-bottom: 16px;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
