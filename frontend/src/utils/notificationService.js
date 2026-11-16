import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { apiUrl } from '../config/api';

/**
 * Helper to convert a Base64 URL string to a Uint8Array for VAPID.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Initialize default Android notification channel.
 */
export async function setupNotificationChannels() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.createChannel({
        id: 'kaufsync_channel',
        name: 'KaufSync Mitteilungen',
        description: 'Benachrichtigungen über neue Artikel, Einkäufe und Listen-Aktivitäten',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        vibration: true,
        sound: undefined
      });
    } catch (e) {
      console.warn('Could not create notification channel:', e);
    }
  }
}

/**
 * Check permission state across Native and Web.
 * Returns: 'granted' | 'denied' | 'prompt'
 */
export async function getNotificationPermissionStatus() {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await LocalNotifications.checkPermissions();
      if (res.display === 'granted') return 'granted';
      if (res.display === 'denied') return 'denied';
      return 'prompt';
    } catch (e) {
      console.warn('Error checking local notification permissions:', e);
      return 'prompt';
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'prompt';
  }

  return 'denied';
}

/**
 * Request notification permissions from OS (Android runtime prompt or Web prompt).
 */
export async function requestNotificationPermission() {
  let granted = false;

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await LocalNotifications.requestPermissions();
      granted = res.display === 'granted';
      if (granted) {
        await setupNotificationChannels();
      }
    } catch (e) {
      console.error('Error requesting LocalNotifications permission:', e);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window) {
    const res = await Notification.requestPermission();
    granted = res === 'granted';
  }

  // Also attempt Web Push subscription if supported
  if (granted) {
    await registerWebPushSubscription().catch(err => {
      console.warn('Web push subscription failed or not supported in this context:', err);
    });
  }

  return granted;
}

/**
 * Register Web Push VAPID subscription with backend.
 */
export async function registerWebPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const pubKeyRes = await fetch(apiUrl('/api/push/public-key'));
    if (!pubKeyRes.ok) return null;
    const { public_key } = await pubKeyRes.json();
    if (!public_key) return null;

    const registration = await navigator.serviceWorker.ready;
    const convertedKey = urlBase64ToUint8Array(public_key);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });

    const subData = JSON.parse(JSON.stringify(subscription));

    await fetch(apiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        endpoint: subData.endpoint,
        p256dh: subData.keys?.p256dh || '',
        auth: subData.keys?.auth || ''
      })
    });

    return subscription;
  } catch (err) {
    console.warn('registerWebPushSubscription error:', err);
    return null;
  }
}

/**
 * Send an immediate test notification.
 */
export async function triggerTestNotification({ title = 'KaufSync', body = 'Benachrichtigungen funktionieren einwandfrei! 🎉' } = {}) {
  let sentLocally = false;

  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannels();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 100000),
            title,
            body,
            channelId: 'kaufsync_channel',
            smallIcon: 'ic_launcher',
            extra: {
              url: '/'
            }
          }
        ]
      });
      sentLocally = true;
    } catch (e) {
      console.error('Failed to schedule native local notification:', e);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, {
          body,
          icon: '/android-chrome-192x192.png',
          badge: '/android-chrome-192x192.png'
        });
        sentLocally = true;
      } else {
        new Notification(title, { body });
        sentLocally = true;
      }
    } catch (e) {
      console.warn('Failed to show web notification:', e);
    }
  }

  // Also trigger backend test endpoint to test server push pipeline
  try {
    const token = localStorage.getItem('token');
    if (token) {
      await fetch(apiUrl('/api/push/test'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }
  } catch (e) {
    console.warn('Backend push test error:', e);
  }

  return sentLocally;
}
