import assert from 'node:assert';
import { normalizeCodeFormat, resolveManualFormat } from './imageBarcodeDecoder.js';

console.log('Testing imageBarcodeDecoder utilities...');

// 1. normalizeCodeFormat with raw scanner format names
assert.strictEqual(normalizeCodeFormat('AZTEC'), 'AZTEC');
assert.strictEqual(normalizeCodeFormat('aztec'), 'AZTEC');
assert.strictEqual(normalizeCodeFormat('QR_CODE'), 'QR_CODE');
assert.strictEqual(normalizeCodeFormat('org.iso.QRCode'), 'QR_CODE');
assert.strictEqual(normalizeCodeFormat('DATA_MATRIX'), 'DATA_MATRIX');
assert.strictEqual(normalizeCodeFormat('pdf417'), 'PDF_417');
assert.strictEqual(normalizeCodeFormat('EAN_13'), 'EAN_13');
assert.strictEqual(normalizeCodeFormat('org.gs1.EAN-13'), 'EAN_13');
assert.strictEqual(normalizeCodeFormat('EAN_8'), 'EAN_8');
assert.strictEqual(normalizeCodeFormat('UPC_A'), 'UPC_A');
assert.strictEqual(normalizeCodeFormat('UPC_E'), 'UPC_E');
assert.strictEqual(normalizeCodeFormat('CODE_128'), 'CODE_128');
assert.strictEqual(normalizeCodeFormat('CODE_39'), 'CODE_39');
assert.strictEqual(normalizeCodeFormat('ITF'), 'ITF');
assert.strictEqual(normalizeCodeFormat('CODABAR'), 'CODABAR');

// 2. normalizeCodeFormat fallback heuristics based on payload
assert.strictEqual(normalizeCodeFormat('UNKNOWN', 'REWEDTP#privileges:loyalty-program#12345'), 'AZTEC'); // REWE Aztec code
assert.strictEqual(normalizeCodeFormat('UNKNOWN', 'PENNY#card#99812'), 'AZTEC'); // Penny Aztec code
assert.strictEqual(normalizeCodeFormat('UNKNOWN', '4006381333931'), 'EAN_13'); // valid EAN-13
assert.strictEqual(normalizeCodeFormat('UNKNOWN', '12345670'), 'EAN_8'); // 8 digits
assert.strictEqual(normalizeCodeFormat('UNKNOWN', '012345678905'), 'UPC_A'); // 12 digits
assert.strictEqual(normalizeCodeFormat('UNKNOWN', 'https://lidl.de/coupon/abc'), 'QR_CODE'); // URL
assert.strictEqual(normalizeCodeFormat('UNKNOWN', 'ABC-99281'), 'CODE_128'); // alphanumeric fallback

// 3. resolveManualFormat
// QR mode maps to AZTEC for REWE/Penny, otherwise QR_CODE
assert.strictEqual(resolveManualFormat('REWEDTP#privileges:loyalty-program#12345', 'qr'), 'AZTEC');
assert.strictEqual(resolveManualFormat('123456789', 'qr'), 'QR_CODE');
assert.strictEqual(resolveManualFormat('https://example.com', 'qr'), 'QR_CODE');

// Barcode mode maps deterministically
assert.strictEqual(resolveManualFormat('4006381333931', 'barcode'), 'EAN_13'); // valid 13-digit EAN
assert.strictEqual(resolveManualFormat('4006381333932', 'barcode'), 'CODE_128'); // invalid checksum falls back to CODE_128
assert.strictEqual(resolveManualFormat('12345678', 'barcode'), 'EAN_8'); // 8 digits
assert.strictEqual(resolveManualFormat('012345678905', 'barcode'), 'UPC_A'); // 12 digits
assert.strictEqual(resolveManualFormat('KAUF-8820', 'barcode'), 'CODE_128'); // alphanumeric

console.log('✓ All imageBarcodeDecoder format resolution tests passed successfully!');
