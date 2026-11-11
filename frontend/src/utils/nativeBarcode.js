import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

/**
 * Prüft, ob wir auf einer nativen Plattform mit Barcode-Scanner-Support laufen.
 */
export async function isNativeScannerAvailable() {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  try {
    const { supported } = await BarcodeScanner.isSupported();
    return supported;
  } catch (e) {
    return false;
  }
}

/**
 * Führt einen nativen Scan über Google ML Kit durch.
 * Nutzt Google Code Scanner, der als modaler Dialog geöffnet wird.
 */
export async function scanBarcodeNative() {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    // 1. Google Barcode Scanner Modul bei Bedarf nachladen
    try {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    } catch (installErr) {
      console.warn('Google Barcode Modul Check/Install:', installErr);
    }

    // 2. Scan aufrufen
    const result = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
        BarcodeFormat.QrCode,
        BarcodeFormat.Code128
      ]
    });

    if (result && result.barcodes && result.barcodes.length > 0) {
      return result.barcodes[0].rawValue;
    }
  } catch (error) {
    console.error('Fehler beim nativen Barcode-Scan:', error);
    throw error;
  }

  return null;
}
