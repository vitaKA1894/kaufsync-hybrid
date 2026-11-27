import assert from 'node:assert';

// Mock localStorage before importing services
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => Array.from(store.keys())[i] || null,
  get length() { return store.size; }
};

const {
  buildTemplateItemsFromList,
  buildTemplateItemsFromActivityBatch,
  toBulkItemPayloads
} = await import('./templateService.js');

console.log('Testing templateService.js...');

// 1. Build TemplateItems from open + unavailable items (excluding completed & deleted)
{
  const listItems = [
    { id: '1', name: 'Milch', quantity: 2, category: 'Milchprodukte & Tiefkühlkost', status: 'active', tags: JSON.stringify(['Bio', 'Dringend']) },
    { id: '2', name: 'Butter', quantity: 1, category: 'Milchprodukte & Tiefkühlkost', status: 'unavailable', tags: '[]' },
    { id: '3', name: 'Brot', quantity: 1, category: 'Brot & Backwaren', status: 'completed', tags: '[]' },
    { id: '4', name: 'Eier', quantity: 1, category: 'Milchprodukte & Tiefkühlkost', status: 'active', is_deleted: true }
  ];
  const drafted = buildTemplateItemsFromList(listItems);
  assert.strictEqual(drafted.length, 2);
  assert.strictEqual(drafted[0].name, 'Milch');
  assert.strictEqual(drafted[0].quantity, 2);
  assert.deepStrictEqual(drafted[0].variants, ['Bio']);
  assert.deepStrictEqual(drafted[0].meta_tags, ['Dringend']);
  assert.strictEqual(drafted[1].name, 'Butter');
}

// 2. Build self-contained TemplateItems from grouped activity log check-off batch (coalescing repeats)
{
  const batchNames = ['Äpfel', 'Milch', 'Äpfel', 'Spezialprodukt XYZ'];
  const drafted = buildTemplateItemsFromActivityBatch(batchNames);
  assert.strictEqual(drafted.length, 3);
  const apples = drafted.find(i => i.name.toLowerCase().includes('apfel') || i.name.toLowerCase().includes('äpfel'));
  assert.ok(apples && apples.quantity === 2, 'Repeated checked items coalesce quantity');
  const unknown = drafted.find(i => i.name === 'Spezialprodukt XYZ');
  assert.ok(unknown && unknown.category === 'Sonstiges');
}

// 3. Bulk payload conversion merges variants + meta_tags cleanly
{
  const payloads = toBulkItemPayloads([
    { name: 'Toastbrot', quantity: 2, category: 'Brot & Backwaren', unit: 'Pck', variants: ['Vollkorn'], meta_tags: ['Angebot'], taxonomy_id: 'toastbrot' }
  ]);
  assert.strictEqual(payloads.length, 1);
  assert.strictEqual(payloads[0].quantity, 2);
  const parsedTags = JSON.parse(payloads[0].tags);
  assert.deepStrictEqual(parsedTags, ['Vollkorn', 'Angebot']);
}

console.log('All templateService tests PASSED!');
