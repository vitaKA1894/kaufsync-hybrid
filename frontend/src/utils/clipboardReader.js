import { Capacitor, registerPlugin } from '@capacitor/core';

const KaufSyncBridge = registerPlugin('KaufSyncBridge');

export const CLIPBOARD_EMPTY_MESSAGE = 'Zwischenablage ist leer.';
export const CLIPBOARD_FALLBACK_MESSAGE =
  'Zwischenablage konnte nicht gelesen werden. Bitte tippe lange ins Feld und wähle „Einfügen“.';

function isNativeAndroidPlatform() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * Reads plain text from the system clipboard across Android (Capacitor bridge)
 * and PWA/Web browsers with friendly German error/empty feedback.
 */
export async function readClipboardTextWithFeedback({
  isNativeAndroid = isNativeAndroidPlatform(),
  nativeRead = () => KaufSyncBridge.readClipboardText(),
  webReadText = typeof navigator !== 'undefined' && navigator.clipboard?.readText
    ? () => navigator.clipboard.readText()
    : null
} = {}) {
  let rawText = null;
  let hadError = false;

  if (isNativeAndroid && typeof nativeRead === 'function') {
    try {
      const res = await nativeRead();
      if (typeof res?.text === 'string' && res.text.trim()) {
        return { ok: true, text: res.text.trim(), reason: 'ok', message: '' };
      }
      if (!res?.error) {
        rawText = res?.text ?? '';
      } else {
        hadError = true;
      }
    } catch {
      hadError = true;
    }
  }

  if (typeof webReadText === 'function') {
    try {
      const webText = await webReadText();
      if (typeof webText === 'string' && webText.trim()) {
        return { ok: true, text: webText.trim(), reason: 'ok', message: '' };
      }
      rawText = webText ?? '';
      hadError = false;
    } catch {
      hadError = true;
    }
  } else if (!isNativeAndroid) {
    hadError = true;
  }

  if (!hadError && (rawText === '' || (typeof rawText === 'string' && rawText.trim() === ''))) {
    return { ok: false, text: '', reason: 'empty', message: CLIPBOARD_EMPTY_MESSAGE };
  }

  return { ok: false, text: '', reason: 'denied', message: CLIPBOARD_FALLBACK_MESSAGE };
}
