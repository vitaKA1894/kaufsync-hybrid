import assert from 'node:assert';

// Pure algorithmic functions for loyalty cards & view modes
export function maskCardCode(code) {
  if (!code) return '';
  const trimmed = String(code).trim();
  if (trimmed.length <= 4) return trimmed;
  const last4 = trimmed.slice(-4);
  return `•••• ${last4}`;
}

export function validateEan13(code) {
  const clean = String(code).replace(/\s+/g, '');
  if (!/^\d{13}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(clean[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(clean[12], 10);
}

export function detectCodeFormat(code) {
  const clean = String(code).trim();
  if (/^\d{13}$/.test(clean) && validateEan13(clean)) return 'EAN13';
  if (/^\d{8}$/.test(clean)) return 'EAN8';
  if (/^[A-Za-z0-9\-\.\ \$\/\+\%]{1,30}$/.test(clean)) return 'CODE128';
  return 'QR';
}

console.log('Testing loyaltyCard pure utilities...');

// 1. EAN-13 validation
assert.strictEqual(validateEan13('4006381333931'), true, 'Valid EAN-13 should return true');
assert.strictEqual(validateEan13('4006381333932'), false, 'Invalid checksum should return false');
assert.strictEqual(validateEan13('123'), false, 'Short code should return false');
assert.strictEqual(validateEan13('abc1234567890'), false, 'Non-digits should return false');
console.log('✓ EAN-13 validation passed');

// 2. Format detection
assert.strictEqual(detectCodeFormat('4006381333931'), 'EAN13', '13 digits should detect as EAN13');
assert.strictEqual(detectCodeFormat('12345678'), 'EAN8', '8 digits should detect as EAN8');
assert.strictEqual(detectCodeFormat('CARD-1234-XYZ'), 'CODE128', 'Alphanumeric string should detect as CODE128');
assert.strictEqual(detectCodeFormat('https://lidl.de/card/123456789012345'), 'QR', 'Long URL/string should detect as QR');
console.log('✓ Code format detection passed');

// 3. Code masking
assert.strictEqual(maskCardCode('4006381333931'), '•••• 3931');
assert.strictEqual(maskCardCode('123'), '123');
assert.strictEqual(maskCardCode(''), '');
console.log('✓ Code masking passed');

// 4. ViewMode cycling
const cycle = (current) => {
  if (current === 'tiles') return 'compact';
  if (current === 'compact') return 'rows';
  return 'tiles';
};
assert.strictEqual(cycle('tiles'), 'compact');
assert.strictEqual(cycle('compact'), 'rows');
assert.strictEqual(cycle('rows'), 'tiles');
console.log('✓ View mode cycling passed');

console.log('\n🎉 ALL LOYALTY CARD UTILITY TESTS PASSED!');
