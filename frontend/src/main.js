import { createApp } from 'vue'
import './style.css'  
import App from './App.vue'
import router from './router'
import { Capacitor } from '@capacitor/core'

const app = createApp(App)
app.use(router)
app.mount('#app')

// Native App nutzt lokale APK-Assets direkt (alter WebView-SW-Cache wird beim Update bereinigt)
if ('serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.includes('workbox')).map((k) => caches.delete(k))))
        .catch(() => {});
    }
  } else {
    navigator.serviceWorker.register('/sw.js').then(function(registration) {
      registration.update().catch(() => {});
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }).catch(function(err) {
      console.warn('ServiceWorker registration failed: ', err);
    });
  }
}