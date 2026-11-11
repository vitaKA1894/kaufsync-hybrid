import { createApp } from 'vue'
import './style.css'  
import App from './App.vue'
import router from './router'
import { Capacitor } from '@capacitor/core'

const app = createApp(App)
app.use(router)
app.mount('#app')

// Service Worker nur im Web registrieren (PWA für iOS, Desktop, Browser).
// Auf nativen Android/iOS-Geräten werden statische Assets direkt aus dem App-Paket geladen.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(function(registration) {
    console.log('ServiceWorker registration successful with scope: ', registration.scope);
  }, function(err) {
    console.log('ServiceWorker registration failed: ', err);
  });
}