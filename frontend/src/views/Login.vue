<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Capacitor } from '@capacitor/core';
import { apiUrl, getApiBaseUrl, setCustomBackendUrl } from '../config/api';

const router = useRouter();

const isLogin = ref(true);
const formData = ref({
  email: '',
  password: '',
  displayName: ''
});
const errorMessage = ref('');
const successMessage = ref('');
const isLoading = ref(false);
const showServerConfig = ref(false);
const serverUrlInput = ref(getApiBaseUrl());

const saveServerUrl = () => {
  setCustomBackendUrl(serverUrlInput.value);
  showServerConfig.value = false;
  successMessage.value = `Server-URL aktualisiert: ${getApiBaseUrl()}`;
  setTimeout(() => successMessage.value = '', 3000);
};

const toggleMode = () => {
  isLogin.value = !isLogin.value;
  errorMessage.value = '';
  successMessage.value = '';
};

// Check if user is already logged in and there is a pending join code
onMounted(async () => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const pendingJoinCode = localStorage.getItem('pending_join_code');

    if (isLoggedIn && pendingJoinCode) {
      try {
        const token = localStorage.getItem('token');
        const joinRes = await fetch(apiUrl('/api/lists/join'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ share_code: pendingJoinCode })
        });
        if (joinRes.ok) {
          const joinedList = await joinRes.json();
          localStorage.removeItem('pending_join_code');
          router.push(`/list/${joinedList.id}`);
        } else {
            // Might be unauthorized or invalid code, just redirect to dashboard
             localStorage.removeItem('pending_join_code');
             router.push('/');
        }
      } catch (e) {
        console.error("Failed to auto-join pending list", e);
        router.push('/');
      }
    }
});

const submitForm = async () => {
  if (!formData.value.email || !formData.value.password) {
    errorMessage.value = 'Bitte fülle alle Pflichtfelder aus.';
    return;
  }
  if (!isLogin.value && !formData.value.displayName) {
    errorMessage.value = 'Bitte gib einen Anzeigenamen ein.';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  const endpoint = isLogin.value ? '/api/auth/login' : '/api/auth/register';
  const payload = isLogin.value 
    ? { email: formData.value.email, password: formData.value.password }
    : { email: formData.value.email, password: formData.value.password, display_name: formData.value.displayName };

  try {
    const response = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Ein Fehler ist aufgetreten');
    }

    if (isLogin.value) {
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('isLoggedIn', 'true');
      if (data.user && data.user.status) {
        localStorage.setItem('status', data.user.status);
      }

      const pendingJoinCode = localStorage.getItem('pending_join_code');
      if (pendingJoinCode) {
        try {
          const joinRes = await fetch(apiUrl('/api/lists/join'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.access_token}` },
            body: JSON.stringify({ share_code: pendingJoinCode })
          });
          if (joinRes.ok) {
            const joinedList = await joinRes.json();
            localStorage.removeItem('pending_join_code');
            router.push(`/list/${joinedList.id}`);
            return; // prevent default redirect
          }
        } catch (e) {
          console.error("Failed to join pending list", e);
        }
      }

      router.push('/');
    } else {
      isLogin.value = true;
      successMessage.value = 'Registrierung erfolgreich! Bitte logge dich ein.';
    }
  } catch (error) {
    if (error?.message?.toLowerCase().includes('fetch')) {
      errorMessage.value = `Server (${getApiBaseUrl()}) nicht erreichbar. Bitte prüfe, ob dein lokales Backend läuft oder passe die Server-Adresse unten an.`;
    } else {
      errorMessage.value = error.message;
    }
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="page-shell login-view">
    <div class="page-panel login-panel">
      <div class="branding">
        <picture class="login-logo">
          <source srcset="/android-chrome-512x512.png" media="(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)" />
          <img src="/android-chrome-192x192.png" srcset="/android-chrome-512x512.png 2x" alt="KaufSync Logo" />
        </picture>
        <h1>KaufSync</h1>
        <p>{{ isLogin ? 'Willkommen zurück!' : 'Konto erstellen' }}</p>
      </div>

      <div class="ks-snackbar-stack">
        <div v-if="errorMessage" class="ks-snackbar ks-snackbar--error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="ks-snackbar ks-snackbar--success">{{ successMessage }}</div>
      </div>

      <form @submit.prevent="submitForm" class="login-form">
        <div class="ks-field" v-if="!isLogin">
          <input type="text" v-model="formData.displayName" placeholder=" " id="displayName" />
          <label for="displayName">Anzeigename</label>
        </div>

        <div class="ks-field">
          <input type="email" v-model="formData.email" placeholder=" " id="email" required />
          <label for="email">E-Mail-Adresse</label>
        </div>

        <div class="ks-field">
          <input type="password" v-model="formData.password" placeholder=" " id="password" required />
          <label for="password">Passwort</label>
        </div>

        <button type="submit" class="ks-btn-filled" :disabled="isLoading">
          {{ isLoading ? 'Lädt...' : (isLogin ? 'Einloggen' : 'Registrieren') }}
        </button>
      </form>

      <div class="toggle-section">
        <button type="button" class="ks-btn-text" @click="toggleMode">
          {{ isLogin ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Einloggen' }}
        </button>
      </div>

      <!-- Server-Adresse Konfiguration für Android -->
      <div v-if="Capacitor.isNativePlatform()" style="margin-top: 20px; text-align: center; border-top: 1px solid var(--ks-border); padding-top: 16px;">
        <button type="button" class="ks-btn-text" @click="showServerConfig = !showServerConfig" style="font-size: 13px; opacity: 0.85;">
          ⚙️ Server: {{ getApiBaseUrl() }}
        </button>

        <div v-if="showServerConfig" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
          <input 
            type="url" 
            v-model="serverUrlInput" 
            placeholder="http://localhost:8000" 
            style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--ks-border); background: var(--ks-surface-2); color: var(--ks-text); font-size: 14px;"
          />
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="ks-chip" @click="serverUrlInput = 'http://localhost:8000'; saveServerUrl();" style="font-size: 11px; cursor: pointer;">
              🔌 USB (localhost:8000)
            </button>
            <button type="button" class="ks-chip" @click="serverUrlInput = 'http://192.168.1.21:8000'; saveServerUrl();" style="font-size: 11px; cursor: pointer;">
              📶 WLAN (192.168.1.21:8000)
            </button>
          </div>
          <button type="button" class="ks-btn-filled" @click="saveServerUrl" style="padding: 8px 14px; font-size: 13px; margin-top: 4px;">
            Speichern
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-panel {
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
}

.branding { text-align: center; margin-bottom: 32px; }
.login-logo {
  display: flex;
  justify-content: center;
  width: 100%;
  margin: 0 auto 16px auto; /* 16px Abstand nach unten zum h1-Titel */
}

.login-logo img {
  display: block;
  margin: 0 auto;
  /* Optionale Begrenzung, falls das Logo auf großen Screens nicht zu riesig werden soll: */
  max-width: 120px; 
  height: auto;
}
.branding h1 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
.branding p { margin: 0; color: var(--ks-text-muted); font-size: 15px; }

.login-form { display: flex; flex-direction: column; gap: 20px; }
.toggle-section { text-align: center; margin-top: 24px; }
</style>