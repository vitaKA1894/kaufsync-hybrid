/**
 * Pure barcode utilities & checksum validators (zero external dependencies).
 */

export function validateEan13(code) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{13}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(clean[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(clean[12], 10);
}

export function maskCardCode(code) {
  if (!code) return '';
  const trimmed = String(code).trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  const last4 = trimmed.slice(-4);
  return `•••• ${last4}`;
}
