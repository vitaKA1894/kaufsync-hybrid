import assert from 'node:assert';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (i) => Array.from(store.keys())[i] ?? null
};

const { parseQuickInput } = await import('./quickInputParser.js');
const { saveCustomNote } = await import('./articleNoteHistory.js');

console.log('Testing quickInputParser.js...');

// 1. Combined phrase: "3x Milch 1,5% bio !"
const p1 = parseQuickInput('3x Milch 1,5% bio !', 'list-1');
assert.strictEqual(p1.has_modifiers, true);
assert.strictEqual(p1.count_quantity, 3);
assert.strictEqual(p1.matched_name, 'Milch');
assert.strictEqual(p1.matched_category, 'Milchprodukte & Tiefkühlkost');
assert(p1.detected_variant_pills.includes('1,5%'), 'Expected 1,5% variant');
assert(p1.detected_variant_pills.includes('Bio'), 'Expected Bio attribute/variant');
assert.deepStrictEqual(p1.detected_meta_tags, ['Dringend']);

// 2. Weight pill vs stepper count: "500g Hackfleisch" and "2x 500g Hackfleisch"
const p2a = parseQuickInput('500g Hackfleisch');
assert.strictEqual(p2a.has_modifiers, true);
assert.strictEqual(p2a.count_quantity, 1, '500g must NOT become quantity=500');
assert.strictEqual(p2a.package_size_pill, '500 g');
assert.strictEqual(p2a.matched_name, 'Hackfleisch');
assert(p2a.detected_variant_pills.includes('500 g'));

const p2b = parseQuickInput('2x 500g Hackfleisch');
assert.strictEqual(p2b.count_quantity, 2);
assert.strictEqual(p2b.package_size_pill, '500 g');
assert.strictEqual(p2b.matched_name, 'Hackfleisch');

// 3. Leading plain integer + Angeobt: "2 Bio Bananen Angebot"
const p3 = parseQuickInput('2 Bio Bananen Angebot');
assert.strictEqual(p3.has_modifiers, true);
assert.strictEqual(p3.count_quantity, 2);
assert.strictEqual(p3.matched_name, 'Bananen');
assert(p3.detected_variant_pills.includes('Bio'));
assert.deepStrictEqual(p3.detected_meta_tags, ['Angebot']);

// 4. Liter volume + variant: "2x 1,5l Wasser medium"
const p4 = parseQuickInput('2x 1,5l Wasser medium');
assert.strictEqual(p4.count_quantity, 2);
assert.strictEqual(p4.package_size_pill, '1,5 L');
assert.strictEqual(p4.matched_name, 'Mineralwasser');
assert(p4.detected_variant_pills.includes('Medium'));

// 5. Remembered custom note & brand pill: "2x Milch Weihenstephan"
saveCustomNote('list-1', 'Milch', 'Weihenstephan');
const p5 = parseQuickInput('2x Milch Weihenstephan', 'list-1');
assert.strictEqual(p5.count_quantity, 2);
assert.strictEqual(p5.matched_name, 'Milch');
assert(
  p5.detected_custom_pills.includes('Weihenstephan') || p5.detected_variant_pills.includes('Weihenstephan')
);

// 6. Unmatched free-text quick input: "2x Spezial-Soße !"
const p6 = parseQuickInput('2x Spezial-Soße !');
assert.strictEqual(p6.has_modifiers, true);
assert.strictEqual(p6.count_quantity, 2);
assert.strictEqual(p6.matched_name, 'Spezial-Soße');
assert.deepStrictEqual(p6.detected_meta_tags, ['Dringend']);

// 7. Plain input stays regular search workflow: "Milch"
const p7 = parseQuickInput('Milch');
assert.strictEqual(p7.has_modifiers, false);
assert.strictEqual(p7.count_quantity, 1);
assert.strictEqual(p7.matched_name, 'Milch');

// 8. Edge cases: fat % never becomes count or Angebot, Typ 405 never becomes count 405, barcodes guarded
const pEdge1 = parseQuickInput('Milch 3,5%');
assert.strictEqual(pEdge1.count_quantity, 1);
assert(pEdge1.detected_variant_pills.includes('3,5%'));
assert.deepStrictEqual(pEdge1.detected_meta_tags, [], '3,5% must NEVER trigger Angebot');

const pEdge2 = parseQuickInput('Typ 405 Mehl');
assert.strictEqual(pEdge2.count_quantity, 1, 'Typ 405 must NOT become quantity=405');
assert.strictEqual(pEdge2.matched_name, 'Mehl');

const pEdge3 = parseQuickInput('4001234567890');
assert.strictEqual(pEdge3.has_modifiers, false);
assert.strictEqual(pEdge3.count_quantity, 1, 'Barcode digits must NEVER become quantity');

const pEdge4 = parseQuickInput('0x Milch');
assert.strictEqual(pEdge4.count_quantity, 1, '0x must clamp cleanly to minimum 1');

const pEdge5 = parseQuickInput('8x4 Deo');
assert.strictEqual(pEdge5.count_quantity, 1, 'Product name 8x4 must NOT parse as multiplier 8');

console.log('All quickInputParser tests PASSED!');
