import assert from 'node:assert';
import {
  is2DFormat,
  getFriendlyFormatLabel,
  mapFormatToBcid,
  renderBarcodeSvg
} from './barcodeRenderer.js';
import {
  normalizeCodeFormat,
  resolveManualFormat
} from '../services/imageBarcodeDecoder.js';

console.log('Testing loyaltyCardExtended & barcodeRenderer capabilities...\n');

// 1. Check all 2D formats
const twoDFormats = ['AZTEC', 'QR_CODE', 'QR', 'DATA_MATRIX', 'PDF_417', 'aztec', 'qr_code', 'datamatrix', 'pdf417'];
for (const fmt of twoDFormats) {
  assert.strictEqual(is2DFormat(fmt), true, `${fmt} should be identified as 2D format`);
  assert.strictEqual(getFriendlyFormatLabel(fmt), 'QR-Code', `${fmt} user label must be "QR-Code"`);
}
console.log('✓ All 2D formats correctly identified and labeled "QR-Code"');

// 2. Check all 1D formats
const oneDFormats = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'ITF', 'CODABAR'];
for (const fmt of oneDFormats) {
  assert.strictEqual(is2DFormat(fmt), false, `${fmt} should NOT be identified as 2D format`);
  assert.strictEqual(getFriendlyFormatLabel(fmt), 'Barcode', `${fmt} user label must be "Barcode"`);
}
console.log('✓ All 1D formats correctly identified and labeled "Barcode"');

// 3. Format Normalization
assert.strictEqual(normalizeCodeFormat('AZTEC'), 'AZTEC');
assert.strictEqual(normalizeCodeFormat('aztec'), 'AZTEC');
assert.strictEqual(normalizeCodeFormat('QR_CODE'), 'QR_CODE');
assert.strictEqual(normalizeCodeFormat('DATA_MATRIX'), 'DATA_MATRIX');
assert.strictEqual(normalizeCodeFormat('PDF_417'), 'PDF_417');
assert.strictEqual(normalizeCodeFormat('EAN_13'), 'EAN_13');
assert.strictEqual(normalizeCodeFormat('EAN_8'), 'EAN_8');
assert.strictEqual(normalizeCodeFormat('UPC_A'), 'UPC_A');
assert.strictEqual(normalizeCodeFormat('UPC_E'), 'UPC_E');
assert.strictEqual(normalizeCodeFormat('CODE_128'), 'CODE_128');
assert.strictEqual(normalizeCodeFormat('CODE_39'), 'CODE_39');
assert.strictEqual(normalizeCodeFormat('ITF'), 'ITF');
assert.strictEqual(normalizeCodeFormat('CODABAR'), 'CODABAR');

// 4. Heuristic for REWE / Penny (Aztec)
const reweCode = 'REWEDTP#privileges:loyalty-program#01234567890123';
const pennyCode = 'PENNY#card#99812401';
assert.strictEqual(normalizeCodeFormat('UNKNOWN', reweCode), 'AZTEC');
assert.strictEqual(normalizeCodeFormat('', pennyCode), 'AZTEC');
console.log('✓ REWE & Penny payloads correctly identified as AZTEC');

// 5. Manual resolution precedence
assert.strictEqual(resolveManualFormat('123456789', 'qr'), 'QR_CODE');
assert.strictEqual(resolveManualFormat(reweCode, 'qr'), 'AZTEC');
assert.strictEqual(resolveManualFormat('4006381333931', 'barcode'), 'EAN_13');
assert.strictEqual(resolveManualFormat('4006381333932', 'barcode'), 'CODE_128'); // invalid checksum fallback
assert.strictEqual(resolveManualFormat('12345678', 'barcode'), 'EAN_8');
assert.strictEqual(resolveManualFormat('012345678905', 'barcode'), 'UPC_A');
assert.strictEqual(resolveManualFormat('ABC-9920', 'barcode'), 'CODE_128');
console.log('✓ Manual format resolution works reliably');

// 6. Offline SVG Rendering verification for all common formats
const renderSamples = [
  { code: reweCode, format: 'AZTEC', is2D: true },
  { code: pennyCode, format: 'AZTEC', is2D: true },
  { code: 'https://lidl.de/coupon/test', format: 'QR_CODE', is2D: true },
  { code: 'DATAMATRIX-PAYLOAD-12345', format: 'DATA_MATRIX', is2D: true },
  { code: 'PDF417-PAYLOAD-12345', format: 'PDF_417', is2D: true },
  { code: '4006381333931', format: 'EAN_13', is2D: false },
  { code: '12345670', format: 'EAN_8', is2D: false },
  { code: '012345678905', format: 'UPC_A', is2D: false },
  { code: 'CARD-1234-XYZ', format: 'CODE_128', is2D: false },
  { code: 'CODE39TEST', format: 'CODE_39', is2D: false },
  { code: '123456', format: 'ITF', is2D: false }
];

for (const sample of renderSamples) {
  const result = renderBarcodeSvg({ code: sample.code, format: sample.format, compact: true });
  assert.strictEqual(result.success, true, `Render should succeed for ${sample.format}`);
  assert.strictEqual(result.is2D, sample.is2D, `is2D mismatch for ${sample.format}`);
  assert(result.svg.includes('<svg'), `Result should contain <svg tag for ${sample.format}`);
  assert(result.svg.includes('viewBox'), `Result should have viewBox attribute for responsive scaling in ${sample.format}`);
}
console.log('✓ Offline SVG rendering works for all 11 format samples including REWE & Penny Aztec codes');

// 7. Sizing & aspect ratio rules
const compactAztec = renderBarcodeSvg({ code: reweCode, format: 'AZTEC', compact: true });
const fullAztec = renderBarcodeSvg({ code: reweCode, format: 'AZTEC', compact: false });
assert(compactAztec.svg.length > 0 && fullAztec.svg.length > 0);

console.log('\n🎉 ALL LOYALTY CARD EXTENDED & PREVIEW TESTS PASSED SUCCESSFULLY!');
