import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const HAPTIC_STORAGE_KEY = 'ks_haptic_feedback_enabled';

/**
 * Checks whether haptic feedback is currently enabled by the user.
 * Defaults to true for all new and existing users.
 */
export function isHapticFeedbackEnabled() {
  const val = localStorage.getItem(HAPTIC_STORAGE_KEY);
  return val === null ? true : val !== 'false';
}

/**
 * Persists the user preference in localStorage.
 */
export function setHapticFeedbackEnabled(enabled) {
  localStorage.setItem(HAPTIC_STORAGE_KEY, String(!!enabled));
}

/**
 * Light tap feedback:
 * Used for quantity adjustments (- / +) and switching meta-tag filters.
 */
export async function triggerLightHaptic() {
  if (!isHapticFeedbackEnabled()) return;
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  } catch (e) {
    // Silently degrade on unsupported platforms (e.g. iOS Safari)
  }
}

/**
 * Confirmation feedback:
 * Used for checking off an item and tapping "Rückgängig" (Undo).
 */
export async function triggerConfirmationHaptic() {
  if (!isHapticFeedbackEnabled()) return;
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(35);
    }
  } catch (e) {
    // Silently degrade
  }
}

/**
 * Success feedback:
 * Used for intentionally finishing a trip ("Einkauf abschließen").
 */
export async function triggerSuccessHaptic() {
  if (!isHapticFeedbackEnabled()) return;
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.notification({ type: NotificationType.Success });
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([30, 50, 40, 50, 60]);
    }
  } catch (e) {
    // Silently degrade
  }
}
