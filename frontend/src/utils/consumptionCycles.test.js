import assert from 'node:assert';
import {
  getCanonicalArticle,
  calculateMedian,
  formatCadence,
  computeSnoozeDays,
  calculateArticleCycle,
  computeDueSuggestions
} from './consumptionCycles.js';

console.log('Testing consumptionCycles.js...');

// 1. Taxonomy & Canonical matching
const canonMilch = getCanonicalArticle('Milch');
assert(canonMilch.articleKey, 'Milch should have an article key');
assert.strictEqual(canonMilch.displayName, 'Milch');

// Alias matching (e.g. Karotten vs Möhren)
const canonKarotten = getCanonicalArticle('Karotten');
const canonMoehren = getCanonicalArticle('Möhren');
assert.strictEqual(canonKarotten.articleKey, canonMoehren.articleKey, 'Möhren and Karotten should share canonical article key');

// Custom product fallback
const canonCustom = getCanonicalArticle('Exotischer Bio-Tee 123');
assert.strictEqual(canonCustom.articleKey, 'exotischer bio-tee 123');
assert.strictEqual(canonCustom.displayName, 'Exotischer Bio-Tee 123');

// 2. Median calculation
assert.strictEqual(calculateMedian([]), 0);
assert.strictEqual(calculateMedian([5]), 5);
assert.strictEqual(calculateMedian([3, 7, 5]), 5, 'Odd list median');
assert.strictEqual(calculateMedian([4, 6, 8, 10]), 7, 'Even list median should average middle two (6 + 8)/2 = 7');

// 3. Cadence formatting
assert.strictEqual(formatCadence(1), 'Täglich');
assert.strictEqual(formatCadence(4), 'Alle ~4 Tage');
assert.strictEqual(formatCadence(7), 'Wöchentlich');
assert.strictEqual(formatCadence(14), 'Meist alle 2 Wochen');
assert.strictEqual(formatCadence(21), 'Meist alle 3 Wochen');
assert.strictEqual(formatCadence(30), 'Meist monatlich');

// 4. Snooze duration
assert.strictEqual(computeSnoozeDays(4), 3, 'Min snooze is 3 days');
assert.strictEqual(computeSnoozeDays(10), 5, '10 days median -> 5 days snooze');
assert.strictEqual(computeSnoozeDays(20), 10, '20 days median -> 10 days snooze');

// 5. Threshold: < 3 distinct days -> null
const twoPurchases = ['2026-01-01', '2026-01-06'];
assert.strictEqual(calculateArticleCycle(twoPurchases, '2026-01-12'), null, 'Fewer than 3 distinct purchase dates must return null');

// 6. Same-day duplicate collapse
const sameDayPurchases = ['2026-01-01', '2026-01-01', '2026-01-06', '2026-01-06'];
assert.strictEqual(calculateArticleCycle(sameDayPurchases, '2026-01-12'), null, 'Collapses into 2 distinct dates, which is < 3 -> null');

// 7. Accurate cycle & 85% Due Window check
// Purchased: Jan 1, Jan 6 (diff 5), Jan 11 (diff 5) -> median = 5 days.
// 85% of 5 = 4.25 days.
const threePurchases = ['2026-01-01', '2026-01-06', '2026-01-11'];

// On Jan 15 (4 days later): 4 < 4.25 -> Not yet due!
const cycleJan15 = calculateArticleCycle(threePurchases, '2026-01-15');
assert.strictEqual(cycleJan15, null, 'At 4 days with 5-day cycle, article should not yet be due');

// On Jan 16 (5 days later): 5 >= 4.25 -> Due!
const cycleJan16 = calculateArticleCycle(threePurchases, '2026-01-16');
assert(cycleJan16 !== null, 'At 5 days with 5-day cycle, article should be due');
assert.strictEqual(cycleJan16.median_cycle_days, 5);
assert.strictEqual(cycleJan16.days_since_last_purchase, 5);
assert.strictEqual(cycleJan16.urgency_score, 1.0);
assert.strictEqual(cycleJan16.cadence_text, 'Alle ~5 Tage');

// 8. Outlier filtering (> 180 days)
// Purchases: Jan 1, Jan 8 (7d), Jan 15 (7d), Sep 1 (229d gap filtered out!), Sep 8 (7d), Sep 15 (7d)
const outlierPurchases = [
  '2025-01-01',
  '2025-01-08',
  '2025-01-15',
  '2025-09-01',
  '2025-09-08',
  '2025-09-15'
];
const cycleOutlier = calculateArticleCycle(outlierPurchases, '2025-09-22');
assert(cycleOutlier !== null, 'Outlier gaps should be filtered out and not invalidate cycle');
assert.strictEqual(cycleOutlier.median_cycle_days, 7, 'Median should remain 7 days despite long gap');

// 9. Staleness / Seasonal Cutoff
// Purchased: Jan 1, Jan 10, Jan 20 (median 9.5 -> 10 days).
// max_stale = max(10 * 3, 60) = 60 days.
// Checked 100 days later: 100 > 60 -> Stale!
const stalePurchases = ['2025-01-01', '2025-01-11', '2025-01-21'];
const cycleStale = calculateArticleCycle(stalePurchases, '2025-05-01');
assert.strictEqual(cycleStale, null, 'Stale items (> 60 days) should not be suggested');

// 10. computeDueSuggestions: Active items and Snooze filtering
const purchaseEvents = [
  // Item 1: Hafermilch (due: Jan 1, Jan 6, Jan 11; today: Jan 16)
  { article_key: 'hafermilch', display_name: 'Hafermilch', category: 'Milchprodukte & Tiefkühlkost', purchased_date: '2026-01-01' },
  { article_key: 'hafermilch', display_name: 'Hafermilch', category: 'Milchprodukte & Tiefkühlkost', purchased_date: '2026-01-06' },
  { article_key: 'hafermilch', display_name: 'Hafermilch', category: 'Milchprodukte & Tiefkühlkost', purchased_date: '2026-01-11' },

  // Item 2: Eier (due: Jan 1, Jan 8, Jan 15; today: Jan 22 -> 7 days, due)
  { article_key: 'eier', display_name: 'Eier', category: 'Milchprodukte & Tiefkühlkost', purchased_date: '2026-01-01' },
  { article_key: 'eier', display_name: 'Eier', category: 'Milchprodukte & Tiefkühlkost', purchased_date: '2026-01-08' },
  { article_key: 'eier', display_name: 'Eier', category: 'Milchprodukte & Tiefkühlkost', purchased_date: '2026-01-15' },

  // Item 3: Kaffee (due: Jan 1, Jan 15, Jan 29; today: Jan 22 -> not due yet)
  { article_key: 'kaffee', display_name: 'Kaffee', category: 'Vorratskammer', purchased_date: '2026-01-01' },
  { article_key: 'kaffee', display_name: 'Kaffee', category: 'Vorratskammer', purchased_date: '2026-01-15' },
  { article_key: 'kaffee', display_name: 'Kaffee', category: 'Vorratskammer', purchased_date: '2026-01-29' }
];

const today = new Date('2026-01-16T12:00:00Z');

// Scenario A: Hafermilch is due, Eier is not yet due on Jan 16, Kaffee not due
const resA = computeDueSuggestions({
  purchaseEvents,
  today
});
assert.strictEqual(resA.length, 1);
assert.strictEqual(resA[0].article_key, 'hafermilch');

// Scenario B: Hafermilch is already open on active shopping list -> must NOT be suggested
const resB = computeDueSuggestions({
  purchaseEvents,
  activeItems: [{ name: 'Hafermilch', status: 'active' }],
  today
});
assert.strictEqual(resB.length, 0, 'Active item must be excluded from suggestions');

// Scenario C: Hafermilch is snoozed until Jan 20 -> must NOT be suggested on Jan 16
const resC = computeDueSuggestions({
  purchaseEvents,
  snoozes: [{ article_key: 'hafermilch', snoozed_until: '2026-01-20T00:00:00Z' }],
  today
});
assert.strictEqual(resC.length, 0, 'Snoozed item must be excluded from suggestions');

// Scenario D: Snooze expired on Jan 15 -> must be suggested again on Jan 16
const resD = computeDueSuggestions({
  purchaseEvents,
  snoozes: [{ article_key: 'hafermilch', snoozed_until: '2026-01-15T00:00:00Z' }],
  today
});
assert.strictEqual(resD.length, 1, 'Expired snooze must allow item to appear again');

console.log('All consumptionCycles tests PASSED!');
