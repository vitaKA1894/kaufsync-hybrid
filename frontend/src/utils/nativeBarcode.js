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

    // 2. Scan aufrufen mit allen gängigen 1D- und 2D-Formaten (inkl. Aztec für REWE & Penny)
    const result = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.Aztec,
        BarcodeFormat.QrCode,
        BarcodeFormat.DataMatrix,
        BarcodeFormat.Pdf417,
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39,
        BarcodeFormat.Itf,
        BarcodeFormat.Codabar
      ]
    });

    if (result && result.barcodes && result.barcodes.length > 0) {
      const b = result.barcodes[0];
      const rawCode = b.rawValue || '';
      return {
        code: rawCode,
        format: b.format || '',
        toString() {
          return rawCode;
        }
      };
    }
  } catch (error) {
    console.error('Fehler beim nativen Barcode-Scan:', error);
    throw error;
  }

  return null;
}
