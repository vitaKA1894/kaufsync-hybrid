import { Capacitor } from '@capacitor/core';

/**
 * Returns the base URL for REST API requests.
 * Priority:
 * 1. Explicit VITE_API_URL environment variable (from .env or build config)
 * 2. Runtime override via localStorage ('ks_backend_url') for easy server switching
 * 3. On native platforms (Android): fallback URL
 * 4. On web platforms: empty string (relative paths /api/...)
 */
export function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }

  const customUrl = localStorage.getItem('ks_backend_url');
  if (customUrl) {
    return customUrl.replace(/\/$/, '');
  }

  if (Capacitor.isNativePlatform()) {
    // Standard-Fallback für lokales Netzwerk (deine aktuelle PC-WLAN-IP)
    return 'http://192.168.1.21:8000';
  }

  return ''; // Web: relative Pfade
}

export function setCustomBackendUrl(url) {
  if (!url || !url.trim()) {
    localStorage.removeItem('ks_backend_url');
  } else {
    localStorage.setItem('ks_backend_url', url.trim().replace(/\/$/, ''));
  }
}

/**
 * Returns the base URL for WebSocket connections.
 * e.g. ws://192.168.1.100:8000 oder wss://kaufsync.meinedomain.de
 */
export function getWsBaseUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL.replace(/\/$/, '');
  }

  const apiBase = getApiBaseUrl();
  if (apiBase) {
    return apiBase.replace(/^http/, 'ws');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

/**
 * Hilfsfunktion zum Erzeugen vollständiger API URLs für fetch
 * Beispiel: apiUrl('/api/lists') -> 'http://192.168.1.150:8000/api/lists' (nativ) oder '/api/lists' (Web)
 */
export function apiUrl(endpoint) {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}

/**
 * Hilfsfunktion zum Erzeugen von WebSocket URLs
 * Beispiel: wsUrl('/ws/123') -> 'ws://.../ws/123'
 */
export function wsUrl(endpoint) {
  const base = getWsBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
