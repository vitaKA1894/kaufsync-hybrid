import assert from 'node:assert';

// Mock localStorage
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i) => Array.from(store.keys())[i] ?? null
};

// Import consumptionService
import {
  isRestockSuggestionsEnabled,
  setRestockSuggestionsEnabled,
  getLocalPurchases,
  saveLocalPurchases,
  recordPurchase,
  retractPurchase,
  snoozeSuggestion,
  getLocalSnoozes,
  clearListConsumptionData
} from './consumptionService.js';

console.log('Testing consumptionService.js...');

// 1. Preference toggle
assert.strictEqual(isRestockSuggestionsEnabled(), true, 'Default must be true');
setRestockSuggestionsEnabled(false);
assert.strictEqual(isRestockSuggestionsEnabled(), false, 'Must be false when disabled');
setRestockSuggestionsEnabled(true);
assert.strictEqual(isRestockSuggestionsEnabled(), true, 'Must be true when re-enabled');

// 2. Record purchase
const listId = 'test-list-42';
store.clear();

recordPurchase(listId, { id: 'item-1', name: 'Milch', category: 'Milchprodukte & Tiefkühlkost' });
const purchases1 = getLocalPurchases(listId);
assert.strictEqual(purchases1.length, 1);
assert.strictEqual(purchases1[0].display_name, 'Milch');
assert.strictEqual(purchases1[0].source_item_id, 'item-1');

// Recording same item on same day again should be idempotent
recordPurchase(listId, { id: 'item-2', name: 'Milch', category: 'Milchprodukte & Tiefkühlkost' });
const purchases2 = getLocalPurchases(listId);
assert.strictEqual(purchases2.length, 1, 'Same day purchase should not duplicate');

// 3. Retract purchase (Smart Undo)
retractPurchase(listId, 'item-1');
const purchases3 = getLocalPurchases(listId);
assert.strictEqual(purchases3.length, 0, 'Retracting item-1 must remove the purchase event');

// 4. Snooze & clear snooze on subsequent purchase
recordPurchase(listId, { id: 'item-3', name: 'Brot', category: 'Brot & Backwaren' });
const brotKey = getLocalPurchases(listId)[0].article_key;

// Snooze it for median 10 days
snoozeSuggestion(listId, brotKey, 10);
const snoozes = getLocalSnoozes(listId);
assert.strictEqual(snoozes.length, 1);
assert.strictEqual(snoozes[0].article_key, brotKey);

// Now re-checking off Brot later clears the snooze
recordPurchase(listId, { id: 'item-4', name: 'Brot', category: 'Brot & Backwaren' });
const snoozesAfter = getLocalSnoozes(listId);
assert.strictEqual(snoozesAfter.length, 0, 'Re-checking off an item must clear its snooze');

// 5. Clear list consumption data
clearListConsumptionData(listId);
assert.strictEqual(getLocalPurchases(listId).length, 0);
assert.strictEqual(getLocalSnoozes(listId).length, 0);

console.log('All consumptionService tests PASSED!');
