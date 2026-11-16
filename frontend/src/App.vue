<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { App as CapApp } from '@capacitor/app';

const router = useRouter();

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

onMounted(() => {
  // Listen for native Android SEND intent dispatched from MainActivity
  window.addEventListener('appShareTarget', (e) => {
    if (e.detail && e.detail.text) {
      handleIncomingShare(e.detail.text);
    }
  });

  // Listen for deep link URLs opened via Capacitor App plugin
  try {
    CapApp.addListener('appUrlOpen', (data) => {
      if (data && data.url) {
        handleIncomingShare(data.url);
      }
    });
  } catch (err) {}
});
</script>

<template>
  <div class="app-shell bg-slate-900 shadow-2xl overflow-hidden relative">
    <div class="app-shell__glow app-shell__glow--one"></div>
    <div class="app-shell__glow app-shell__glow--two"></div>
    <router-view />
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
</style>