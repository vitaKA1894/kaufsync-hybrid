import assert from 'node:assert';
import {
  parseGermanPriceInput,
  formatEurExact,
  formatEurPill,
  isBulkPackItem,
  resolveItemPrice,
  computeListCheckoutSummary
} from './priceEstimator.js';

console.log('Testing priceEstimator.js...');

// 1. German decimal & validation
assert.deepStrictEqual(parseGermanPriceInput('1,29'), { valid: true, value: 1.29, isEmpty: false });
assert.deepStrictEqual(parseGermanPriceInput('2.39 €'), { valid: true, value: 2.39, isEmpty: false });
assert.deepStrictEqual(parseGermanPriceInput(''), { valid: false, value: null, isEmpty: true });
assert.strictEqual(parseGermanPriceInput('-5').valid, false);
assert.strictEqual(parseGermanPriceInput('0').valid, false);
assert.strictEqual(parseGermanPriceInput('10000').valid, false);
assert.strictEqual(parseGermanPriceInput('abc').valid, false);

// 2. Pill & Currency formatting
assert.strictEqual(formatEurExact(42.3), '42,30 €');
assert.strictEqual(formatEurPill(42.3, true), '~42 €');
assert.strictEqual(formatEurPill(4.5, true), '~4,50 €');
assert.strictEqual(formatEurPill(0, false), '~ – €');

// 3. Bulk variant detection
assert.strictEqual(isBulkPackItem(JSON.stringify(['Bio', '1,5%'])), false);
assert.strictEqual(isBulkPackItem(JSON.stringify(['Kasten 20x0,5l'])), true);
assert.strictEqual(isBulkPackItem(JSON.stringify(['24er'])), true);

// 4. 4-tier waterfall precedence & checkout summary
const userPricesMap = new Map([
  ['article:milch', 1.29],
  ['barcode:4001234567890', 2.99]
]);
const crowdPricesMap = new Map([
  ['article:milch', { median_price_eur: 1.19, contributor_count: 5, source: 'crowd' }],
  ['article:butter', { median_price_eur: 2.19, contributor_count: 4, source: 'crowd' }],
  ['article:too_few', { median_price_eur: 9.99, contributor_count: 2, source: 'crowd' }],
  ['barcode:4009999999999', { median_price_eur: 1.89, contributor_count: 1, source: 'external_open_prices' }]
]);

const mockTax = (name) => {
  const lower = name.toLowerCase();
  if (lower === 'milch') return { id: 'milch', reference_price_eur: 1.15 };
  if (lower === 'butter') return { id: 'butter', reference_price_eur: 2.39 };
  if (lower === 'eier') return { id: 'eier', reference_price_eur: 2.49 };
  return null;
};

// User overrides crowd & taxonomy
const rMilk = resolveItemPrice({ name: 'Milch', quantity: 3 }, { userPricesMap, crowdPricesMap, findTaxFn: mockTax });
assert.strictEqual(rMilk.source, 'user');
assert.strictEqual(rMilk.unitPriceEur, 1.29);
assert.strictEqual(rMilk.lineTotalEur, 3.87);

// Scanned barcode user override beats article
const rBarcode = resolveItemPrice({ name: 'Milch', quantity: 1, scanned_barcode: '4001234567890' }, { userPricesMap, crowdPricesMap, findTaxFn: mockTax });
assert.strictEqual(rBarcode.source, 'user');
assert.strictEqual(rBarcode.unitPriceEur, 2.99);

// External open prices barcode lookup beats taxonomy
const rExt = resolveItemPrice({ name: 'Unbekannt', quantity: 2, scanned_barcode: '4009999999999' }, { userPricesMap, crowdPricesMap, findTaxFn: mockTax });
assert.strictEqual(rExt.source, 'community');
assert.strictEqual(rExt.lineTotalEur, 3.78);

// Crowd >= 3 beats taxonomy
const rButter = resolveItemPrice({ name: 'Butter', quantity: 1 }, { userPricesMap, crowdPricesMap, findTaxFn: mockTax });
assert.strictEqual(rButter.source, 'community');
assert.strictEqual(rButter.unitPriceEur, 2.19);

// Quorum < 3 ignored -> fallback none / taxonomy
const rTooFew = resolveItemPrice({ name: 'too_few', quantity: 1 }, { userPricesMap, crowdPricesMap, findTaxFn: mockTax });
assert.strictEqual(rTooFew.source, 'none');

// Summary sums open + checked, excludes unavailable
const summary = computeListCheckoutSummary([
  { id: '1', name: 'Milch', quantity: 3, status: 'active' },      // 3.87 (user)
  { id: '2', name: 'Eier', quantity: 1, status: 'completed' },    // 2.49 (reference) -> included!
  { id: '3', name: 'Butter', quantity: 2, status: 'unavailable' },// excluded!
  { id: '4', name: 'Spezialding', quantity: 1, status: 'open' }   // unpriced
], { userPricesMap, crowdPricesMap, findTaxFn: mockTax });

assert.strictEqual(summary.totalEur, 6.36);
assert.strictEqual(summary.pricedCount, 2);
assert.strictEqual(summary.unpricedCount, 1);
assert.strictEqual(summary.totalCountableCount, 3);
assert.strictEqual(summary.excludedUnavailableCount, 1);
assert.strictEqual(summary.pillLabel, '~6,36 €');

console.log('All priceEstimator tests PASSED!');
