/**
 * Screen Wake Lock Service
 * Prevents smartphone screens from dimming and auto-locking during in-store shopping.
 * Supports standard Screen Wake Lock API across Chromium browsers, Safari 16.4+, iOS 16.4+ PWA, and Android WebViews.
 */

let activeSentinel = null;
let releaseCallback = null;

export function isWakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof navigator.wakeLock?.request === 'function';
}

export async function requestScreenWakeLock({ onRelease } = {}) {
  if (!isWakeLockSupported()) {
    return { success: false, reason: 'unsupported' };
  }

  try {
    // If an active lock is already held and not released, return true
    if (activeSentinel && !activeSentinel.released) {
      return { success: true };
    }

    activeSentinel = await navigator.wakeLock.request('screen');
    releaseCallback = onRelease;

    activeSentinel.addEventListener('release', () => {
      activeSentinel = null;
      if (typeof releaseCallback === 'function') {
        releaseCallback();
      }
    });

    return { success: true };
  } catch (err) {
    // Fails on low battery mode, screen off, or permissions denied
    console.warn('Screen WakeLock request denied/failed:', err);
    activeSentinel = null;
    return {
      success: false,
      reason: err.name === 'NotAllowedError' ? 'denied' : 'error',
      error: err
    };
  }
}

export async function releaseScreenWakeLock() {
  if (activeSentinel && !activeSentinel.released) {
    try {
      await activeSentinel.release();
    } catch (err) {
      console.warn('Error releasing screen wake lock:', err);
    }
  }
  activeSentinel = null;
  releaseCallback = null;
}

export function isScreenWakeLockActive() {
  return activeSentinel !== null && !activeSentinel.released;
}
