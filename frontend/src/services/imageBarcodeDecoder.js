import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { scanImageData } from '@undecaf/zbar-wasm';
import { validateEan13 } from '../utils/barcodeValidation.js';

/**
 * Maps raw format strings from ML Kit, BarcodeDetector, or ZBar into canonical backend format names.
 */
export function normalizeCodeFormat(rawFormat, codeValue = '') {
  const f = String(rawFormat || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (f.includes('QR')) {
    return 'QR_CODE';
  }
  if (f.includes('EAN13')) {
    return 'EAN_13';
  }
  if (f.includes('EAN8')) {
    return 'EAN_8';
  }
  if (f.includes('UPCA')) {
    return 'UPC_A';
  }
  if (f.includes('CODE39')) {
    return 'CODE_39';
  }
  if (f.includes('CODE128')) {
    return 'CODE_128';
  }

  // Fallback: heuristic based on payload if format is generic/unknown
  const clean = String(codeValue).trim();
  if (/^https?:\/\//i.test(clean) || clean.length > 40) {
    return 'QR_CODE';
  }
  if (/^\d{13}$/.test(clean) && validateEan13(clean)) {
    return 'EAN_13';
  }
  if (/^\d{8}$/.test(clean)) {
    return 'EAN_8';
  }
  if (/^\d{12}$/.test(clean)) {
    return 'UPC_A';
  }
  return 'CODE_128';
}

/**
 * Resolves format for manual entry based on the user's simple 2-button choice ('barcode' | 'qr').
 */
export function resolveManualFormat(codeValue, manualType = 'barcode') {
  if (manualType === 'qr') {
    return 'QR_CODE';
  }
  const clean = String(codeValue || '').replace(/\s+/g, '');
  if (/^\d{13}$/.test(clean) && validateEan13(clean)) {
    return 'EAN_13';
  }
  if (/^\d{8}$/.test(clean)) {
    return 'EAN_8';
  }
  if (/^\d{12}$/.test(clean)) {
    return 'UPC_A';
  }
  return 'CODE_128';
}

/**
 * Helper to convert an image source (Blob, File, dataUrl, or URL) into an HTMLImageElement
 */
function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Konnte Bild nicht laden'));

    if (typeof source === 'string') {
      img.src = source;
    } else if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(new Error('Konnte Bild nicht laden'));
      };
      img.src = url;
    } else {
      reject(new Error('Ungültige Bildquelle'));
    }
  });
}

/**
 * Runs BarcodeDetector or ZBar on an ImageData canvas with scaling & optional rotation
 */
async function scanCanvasImageData(canvas, ctx) {
  // 1. Try native BarcodeDetector if available
  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({
        formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39']
      });
      const barcodes = await detector.detect(canvas);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return {
          code: barcodes[0].rawValue,
          rawFormat: barcodes[0].format || 'BARCODE'
        };
      }
    } catch (e) {
      // Ignore and fallback to zbar
    }
  }

  // 2. Try ZBar WASM
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const results = await scanImageData(imageData);
    if (results && results.length > 0) {
      const first = results[0];
      const decoded = typeof first.decode === 'function' ? first.decode() : first.decode;
      if (decoded && decoded.trim()) {
        return {
          code: decoded.trim(),
          rawFormat: first.typeName || 'BARCODE'
        };
      }
    }
  } catch (err) {
    console.warn('ZBar WASM scan error:', err);
  }

  return null;
}

/**
 * Decodes barcode or QR code from an image source on-device.
 * Handles downscaling large photos, multi-angle orientation, and cropping.
 * 
 * @param {File|Blob|string} imageSource File, Blob, DataURL or native file path
 * @param {string} [nativePath] Optional file path on Android/iOS
 * @returns {Promise<{ success: boolean, code?: string, format?: string, isQr?: boolean, error?: string }>}
 */
export async function decodeBarcodeFromImage(imageSource, nativePath = null) {
  // 1. Try native ML Kit on Android/iOS if nativePath is provided or if source is path string
  const filePath = nativePath || (typeof imageSource === 'string' && !imageSource.startsWith('data:') && !imageSource.startsWith('http') ? imageSource : null);
  
  if (Capacitor.isNativePlatform() && filePath) {
    try {
      const mlkitResult = await BarcodeScanner.readBarcodesFromImage({
        path: filePath,
        formats: [
          BarcodeFormat.QrCode,
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39
        ]
      });

      if (mlkitResult && mlkitResult.barcodes && mlkitResult.barcodes.length > 0) {
        const found = mlkitResult.barcodes[0];
        const canonicalFormat = normalizeCodeFormat(found.format, found.rawValue);
        return {
          success: true,
          code: found.rawValue.trim(),
          format: canonicalFormat,
          isQr: canonicalFormat === 'QR_CODE'
        };
      }
    } catch (nativeErr) {
      console.warn('Native ML Kit barcode read error, falling back to Web/WASM:', nativeErr);
    }
  }

  // 2. Web / WASM pipeline
  try {
    const img = await loadImageElement(imageSource);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Limit maximum dimensions to 1600px for optimal memory & speed
    const maxDim = 1600;
    let targetWidth = img.naturalWidth || img.width;
    let targetHeight = img.naturalHeight || img.height;

    if (targetWidth > maxDim || targetHeight > maxDim) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
        targetWidth = maxDim;
      } else {
        targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
        targetHeight = maxDim;
      }
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Pass 1: Full image
    let scanResult = await scanCanvasImageData(canvas, ctx);
    if (scanResult) {
      const canonicalFormat = normalizeCodeFormat(scanResult.rawFormat, scanResult.code);
      return {
        success: true,
        code: scanResult.code,
        format: canonicalFormat,
        isQr: canonicalFormat === 'QR_CODE'
      };
    }

    // Pass 2: Center crop 80% (removes smartphone status bar / navigation bar / headers)
    const cropCanvas = document.createElement('canvas');
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    const cropW = Math.round(targetWidth * 0.85);
    const cropH = Math.round(targetHeight * 0.75);
    const startX = Math.round((targetWidth - cropW) / 2);
    const startY = Math.round((targetHeight - cropH) / 2);

    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    cropCtx.drawImage(canvas, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

    scanResult = await scanCanvasImageData(cropCanvas, cropCtx);
    if (scanResult) {
      const canonicalFormat = normalizeCodeFormat(scanResult.rawFormat, scanResult.code);
      return {
        success: true,
        code: scanResult.code,
        format: canonicalFormat,
        isQr: canonicalFormat === 'QR_CODE'
      };
    }

    // Pass 3: 90 degree rotation (for screenshots taken in horizontal orientation)
    const rotCanvas = document.createElement('canvas');
    const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
    rotCanvas.width = targetHeight;
    rotCanvas.height = targetWidth;
    rotCtx.translate(targetHeight / 2, targetWidth / 2);
    rotCtx.rotate((90 * Math.PI) / 180);
    rotCtx.drawImage(canvas, -targetWidth / 2, -targetHeight / 2);

    scanResult = await scanCanvasImageData(rotCanvas, rotCtx);
    if (scanResult) {
      const canonicalFormat = normalizeCodeFormat(scanResult.rawFormat, scanResult.code);
      return {
        success: true,
        code: scanResult.code,
        format: canonicalFormat,
        isQr: canonicalFormat === 'QR_CODE'
      };
    }

  } catch (err) {
    console.error('Error during image decoding:', err);
  }

  // Not detected
  return {
    success: false,
    error: 'Kein Code im Bild erkannt – bitte näher heranzoomen oder Nummer manuell eingeben.'
  };
}
