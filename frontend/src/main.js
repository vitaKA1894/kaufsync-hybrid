import { createApp } from 'vue'
import './style.css'  
import App from './App.vue'
import router from './router'
import { Capacitor } from '@capacitor/core'

const app = createApp(App)
app.use(router)
app.mount('#app')

// Service Worker für Offline-Caching und Web-Push registrieren
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(function(registration) {
    console.log('ServiceWorker registration successful with scope: ', registration.scope);
  }).catch(function(err) {
    console.warn('ServiceWorker registration failed: ', err);
  });
}