<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { App as CapApp } from '@capacitor/app';
import { apiUrl, wsUrl } from './config/api';
import { isOnline, getLocalLists } from './services/syncService';
import ShareLoyaltyCardModal from './components/ShareLoyaltyCardModal.vue';
import {
  showIncomingNotification,
  ensurePushSubscription,
  setupNotificationListeners
} from './utils/notificationService';
import {
  parseShortcutIntent,
  savePendingShortcut,
  consumePendingShortcut,
  resolveShortcutRoute,
  getLastOpenedListId
} from './utils/shortcutRouter';
import {
  syncSnapshotToNativeWidget,
  reconcileNativeWidgetCheckoffs,
  consumeNativePendingShortcut
} from './services/widgetBridgeService';

const router = useRouter();

// In-app visual notification toast
const activeToast = ref(null);
let toastTimer = null;

const triggerInAppToast = (toast) => {
  if (toastTimer) clearTimeout(toastTimer);
  activeToast.value = toast;
  toastTimer = setTimeout(() => {
    activeToast.value = null;
  }, 6000);
};

const handleToastClick = () => {
  if (activeToast.value?.url) {
    router.push(activeToast.value.url);
  }
  activeToast.value = null;
};

// Global User WebSocket for live alerts (e.g. "Ich gehe einkaufen!", neue Artikel)
let userWs = null;
let userWsReconnectTimer = null;

const connectUserWs = () => {
  const token = localStorage.getItem('token');
  const userJson = localStorage.getItem('user');
  if (!token || !userJson) return;

  try {
    const user = JSON.parse(userJson);
    if (!user || !user.id) return;

    if (userWs && (userWs.readyState === WebSocket.OPEN || userWs.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const endpoint = wsUrl(`/ws/user/${user.id}?token=${encodeURIComponent(token)}`);
    userWs = new WebSocket(endpoint);

    userWs.onopen = () => {
      if (userWsReconnectTimer) {
        clearTimeout(userWsReconnectTimer);
        userWsReconnectTimer = null;
      }
    };

    userWs.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.event === 'NEW_NOTIFICATION' || msg.event === 'SHOPPING_STARTED') {
          const payload = msg.payload || {};
          const title = payload.title || (msg.event === 'SHOPPING_STARTED' ? '🛒 Ich gehe einkaufen!' : 'KaufSync');
          const body = payload.body || '';
          const url = payload.url || (payload.list_id ? `/list/${payload.list_id}` : '/');

          // Schedule / show system notification (Native LocalNotification or Web Notification)
          await showIncomingNotification({ title, body, url });

          // Also show prominent in-app toast
          triggerInAppToast({ title, body, url });
        }
      } catch (err) {
        console.warn('Error handling user WS message:', err);
      }
    };

    userWs.onclose = () => {
      userWs = null;
      if (isOnline.value) {
        if (userWsReconnectTimer) clearTimeout(userWsReconnectTimer);
        userWsReconnectTimer = setTimeout(connectUserWs, 5000);
      }
    };

    userWs.onerror = () => {
      try { userWs.close(); } catch (e) {}
    };
  } catch (err) {
    console.warn('Error initiating user WS:', err);
  }
};

const checkUnreadNotifications = async () => {
  const token = localStorage.getItem('token');
  if (!token || !isOnline.value) return;

  try {
    const res = await fetch(apiUrl('/api/notifications?unread_only=true'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const unread = await res.json();
      if (Array.isArray(unread) && unread.length > 0) {
        for (const notif of unread.slice(0, 3)) {
          await showIncomingNotification({
            title: notif.title,
            body: notif.body,
            url: notif.action_url || '/'
          });
          triggerInAppToast({
            title: notif.title,
            body: notif.body,
            url: notif.action_url || '/'
          });
        }
        await fetch(apiUrl('/api/notifications/mark-all-read'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Error polling unread notifications:', err);
  }
};

let lastHandledShortcutKey = '';
let lastHandledShortcutAt = 0;

const handleIncomingShortcut = async (rawShortcut) => {
  const input = (rawShortcut && typeof rawShortcut === 'object' && rawShortcut.url)
    ? rawShortcut.url
    : rawShortcut;
  const parsed = parseShortcutIntent(input);
  if (!parsed) return;

  const dedupeKey = `${parsed.action}:${parsed.listId || ''}`;
  const now = Date.now();
  if (dedupeKey === lastHandledShortcutKey && (now - lastHandledShortcutAt) < 500) {
    return;
  }
  lastHandledShortcutKey = dedupeKey;
  lastHandledShortcutAt = now;

  const token = localStorage.getItem('token');
  const isLoggedIn = Boolean(token && token !== 'undefined');
  if (!isLoggedIn) {
    savePendingShortcut(parsed);
    router.push('/login');
    return;
  }

  let lists = [];
  try {
    const cached = JSON.parse(localStorage.getItem('cachedLists') || '[]');
    if (Array.isArray(cached) && cached.length > 0) lists = cached;
  } catch {}
  if (lists.length === 0) {
    lists = await getLocalLists();
  }
  if (lists.length === 0 && isOnline.value) {
    try {
      const res = await fetch(apiUrl('/api/lists'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) lists = await res.json();
    } catch {}
  }

  const dest = resolveShortcutRoute({
    action: parsed.action,
    listId: parsed.listId,
    lists,
    lastListId: getLastOpenedListId()
  });
  router.push(dest);
};

const handleAppResume = async () => {
  connectUserWs();
  await reconcileNativeWidgetCheckoffs();
  await syncSnapshotToNativeWidget();
  const nativeShortcut = await consumeNativePendingShortcut();
  if (nativeShortcut) {
    await handleIncomingShortcut(nativeShortcut);
  }
  await checkUnreadNotifications();
  await ensurePushSubscription();
};

const handleIncomingShare = (sharedText) => {
  if (!sharedText) return;
  const match = sharedText.match(/https?:\/\/[^\s]+/i);
  const targetUrl = match ? match[0] : sharedText.trim();

  if (targetUrl) {
    if (targetUrl.includes('/s/')) {
      const sMatch = targetUrl.match(/\/s\/([a-zA-Z0-9_-]+)/);
      if (sMatch) {
        router.push(`/s/${sMatch[1]}`);
        return;
      }
    }
    if (targetUrl.includes('/join')) {
      const codeMatch = targetUrl.match(/code=([a-zA-Z0-9]+)/);
      if (codeMatch) {
        router.push(`/join?code=${codeMatch[1]}`);
        return;
      }
    }

    localStorage.setItem('pending_recipe_import', JSON.stringify({ url: targetUrl }));
    router.push(`/share-target?url=${encodeURIComponent(targetUrl)}`);
  }
};

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    handleAppResume();
  }
};

const onStorageChange = (e) => {
  if (e.key === 'token') {
    if (e.newValue) {
      handleAppResume();
    } else {
      if (userWs) {
        try { userWs.close(); } catch (err) {}
        userWs = null;
      }
    }
  }
};

// Shared image import (Loyalty Card from OS share sheet)
const showShareCardModal = ref(false);
const sharedImageData = ref(null);
const sharedImagePath = ref(null);

const handleIncomingShareImage = (detail) => {
  if (!detail) return;
  sharedImageData.value = detail.dataUrl || detail.image || null;
  sharedImagePath.value = detail.nativePath || null;
  if (sharedImageData.value || sharedImagePath.value) {
    showShareCardModal.value = true;
  }
};

const onSharedCardSaved = ({ list, card }) => {
  showShareCardModal.value = false;
  sharedImageData.value = null;
  sharedImagePath.value = null;
  triggerInAppToast({
    title: 'Bonuskarte gespeichert! 💳',
    body: `Kundenkarte wurde für „${list.name}“ hinterlegt.`,
    url: `/list/${list.id}`
  });
};

onMounted(() => {
  // Listen for native Android SEND intent dispatched from MainActivity
  window.addEventListener('appShareTarget', (e) => {
    if (e.detail && e.detail.text) {
      handleIncomingShare(e.detail.text);
    }
  });

  // Listen for native Android image SEND intent
  window.addEventListener('appShareTargetImage', (e) => {
    if (e.detail) {
      handleIncomingShareImage(e.detail);
    }
  });

  if (window.__pendingShareImage) {
    handleIncomingShareImage(window.__pendingShareImage);
    window.__pendingShareImage = null;
  }

  // Listen for native Android app shortcut / widget deep-link events
  window.addEventListener('appShortcutAction', (e) => {
    if (e.detail) {
      handleIncomingShortcut(e.detail);
    }
  });

  if (window.__pendingAppShortcut) {
    handleIncomingShortcut(window.__pendingAppShortcut);
    window.__pendingAppShortcut = null;
  }

  if (window.location?.search) {
    const initialUrlShortcut = parseShortcutIntent(window.location.href);
    if (initialUrlShortcut) {
      handleIncomingShortcut(initialUrlShortcut);
    }
  }

  // Listen for deep link URLs opened via Capacitor App plugin
  try {
    CapApp.addListener('appUrlOpen', (data) => {
      if (data && data.url) {
        const sc = parseShortcutIntent(data.url);
        if (sc) {
          handleIncomingShortcut(sc);
          return;
        }
        handleIncomingShare(data.url);
      }
    });
  } catch (err) {}

  // Native notification actions & routing
  setupNotificationListeners(router);

  // Initial connect & poll
  handleAppResume();

  // Listen for app coming to foreground
  try {
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        handleAppResume();
      }
    });
  } catch (err) {}

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('storage', onStorageChange);
});

onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer);
  if (userWsReconnectTimer) clearTimeout(userWsReconnectTimer);
  if (userWs) {
    try { userWs.close(); } catch (e) {}
    userWs = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('storage', onStorageChange);
});
</script>

<template>
  <div class="app-shell bg-slate-900 shadow-2xl overflow-hidden relative">
    <div class="app-shell__glow app-shell__glow--one"></div>
    <div class="app-shell__glow app-shell__glow--two"></div>

    <!-- GLOBAL IN-APP NOTIFICATION TOAST -->
    <transition name="toast-slide">
      <div
        v-if="activeToast"
        class="ks-global-toast-container"
        @click="handleToastClick"
      >
        <div class="ks-global-toast">
          <div class="ks-global-toast-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div class="ks-global-toast-content">
            <div class="ks-global-toast-title">{{ activeToast.title }}</div>
            <div class="ks-global-toast-body">{{ activeToast.body }}</div>
          </div>
          <button
            type="button"
            class="ks-global-toast-close"
            @click.stop="activeToast = null"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
      </div>
    </transition>

    <router-view />

    <!-- GLOBAL SHARE TARGET: LOYALTY CARD IMPORT MODAL -->
    <ShareLoyaltyCardModal
      v-if="showShareCardModal"
      :shared-image="sharedImageData"
      :shared-image-path="sharedImagePath"
      @close="showShareCardModal = false; sharedImageData = null; sharedImagePath = null;"
      @saved="onSharedCardSaved"
    />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100svh;
  overflow: hidden;
}

.app-shell__glow {
  position: fixed;
  inset: auto;
  pointer-events: none;
  filter: blur(72px);
  opacity: 0.32;
  z-index: 0;
}

.app-shell__glow--one {
  top: -120px;
  left: -60px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(168, 199, 250, 0.34) 0%, rgba(168, 199, 250, 0) 72%);
}

.app-shell__glow--two {
  right: -80px;
  bottom: 60px;
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(194, 231, 255, 0.18) 0%, rgba(194, 231, 255, 0) 72%);
}

/* Global In-App Toast */
.ks-global-toast-container {
  position: fixed;
  top: max(16px, env(safe-area-inset-top, 16px));
  left: 16px;
  right: 16px;
  max-width: 480px;
  margin: 0 auto;
  z-index: 9999;
  cursor: pointer;
}

.ks-global-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.2);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.ks-global-toast:active {
  transform: scale(0.98);
}

.ks-global-toast-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.3));
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ks-global-toast-content {
  flex: 1;
  min-width: 0;
}

.ks-global-toast-title {
  font-size: 14px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.25;
  margin-bottom: 2px;
}

.ks-global-toast-body {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ks-global-toast-close {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 14px;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.ks-global-toast-close:hover {
  color: #f8fafc;
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(-24px) scale(0.95);
}

.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-16px) scale(0.96);
}
</style>
