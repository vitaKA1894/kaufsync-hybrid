import assert from 'node:assert';
import { findMergeCandidate, buildMergedItemUpdate } from './itemMerge.js';

console.log('Testing itemMerge.js...');

// 1. Plain open item merges cleanly with enriched incoming item
const openPlain = [
  { id: 'item-1', name: 'Milch', category: 'Milchprodukte & Tiefkühlkost', quantity: 1, unit: 'Stk', tags: '[]', status: 'active' }
];
const incomingEnriched = {
  name: 'Milch',
  category: 'Milchprodukte & Tiefkühlkost',
  quantity: 2,
  tags: JSON.stringify(['Bio', 'Dringend'])
};
const cand1 = findMergeCandidate(openPlain, incomingEnriched);
assert(cand1 && cand1.id === 'item-1', 'Plain open item should merge with enriched incoming item');
const merged1 = buildMergedItemUpdate(cand1, incomingEnriched);
assert.strictEqual(merged1.quantity, 3);
assert(merged1.tags.includes('Bio') && merged1.tags.includes('Dringend'));
assert(merged1.toastMessage.includes('3×'), `Unexpected toast: ${merged1.toastMessage}`);

// 2. Explicitly distinct variants must stay separate!
const openWithVariant = [
  { id: 'item-2', name: 'Milch', category: 'Milchprodukte & Tiefkühlkost', quantity: 1, unit: 'Stk', tags: JSON.stringify(['Haferdrink']), status: 'active' }
];
const incomingDifferentVariant = {
  name: 'Milch',
  category: 'Milchprodukte & Tiefkühlkost',
  quantity: 1,
  tags: JSON.stringify(['3,5%'])
};
const cand2 = findMergeCandidate(openWithVariant, incomingDifferentVariant);
assert.strictEqual(cand2, null, 'Distinct explicit variants (Haferdrink vs 3,5%) must stay separate');

// 3. Matching variant pill sets DO merge
const incomingSameVariant = {
  name: 'Milch',
  category: 'Milchprodukte & Tiefkühlkost',
  quantity: 2,
  tags: JSON.stringify(['Haferdrink', 'Angebot'])
};
const cand3 = findMergeCandidate(openWithVariant, incomingSameVariant);
assert(cand3 && cand3.id === 'item-2', 'Identical variant pill sets must merge even with new meta tags');
const merged3 = buildMergedItemUpdate(cand3, incomingSameVariant);
assert.strictEqual(merged3.quantity, 3);
assert(merged3.tags.includes('Haferdrink') && merged3.tags.includes('Angebot'));

// 4. Canonical alias resolution merges Karotten + Möhren seamlessly
const openAlias = [
  { id: 'item-4', name: 'Karotten', category: 'Obst & Gemüse', quantity: 2, unit: 'Stk', tags: '[]', status: 'active' }
];
const incomingAlias = {
  name: 'Möhren',
  category: 'Obst & Gemüse',
  quantity: 3,
  tags: '[]'
};
const cand4 = findMergeCandidate(openAlias, incomingAlias);
assert(cand4 && cand4.id === 'item-4', 'Canonical taxonomy alias (Karotten <-> Möhren) should merge');
const merged4 = buildMergedItemUpdate(cand4, incomingAlias);
assert.strictEqual(merged4.quantity, 5);

// 5. Completed items are never merged into
const completedOnly = [
  { id: 'item-5', name: 'Brot', category: 'Brot & Backwaren', quantity: 1, unit: 'Stk', tags: '[]', status: 'completed' }
];
assert.strictEqual(findMergeCandidate(completedOnly, { name: 'Brot', quantity: 1, tags: '[]' }), null);

console.log('All itemMerge tests PASSED!');
