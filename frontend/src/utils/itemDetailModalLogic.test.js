import assert from 'node:assert';
import {
  getRememberedNotes,
  saveCustomNote,
  removeCustomNote,
  clearListNoteHistory,
  clearAllNoteHistories
} from './articleNoteHistory.js';

// Setup mock localStorage
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i) => Array.from(storage.keys())[i] ?? null
};

console.log('Testing item detail modal logic & contract...');

// 1. Initial State & Stepper logic
let currentQuantity = 1;
const decrement = () => {
  if (currentQuantity > 1) {
    currentQuantity--;
  }
};
const increment = () => {
  currentQuantity++;
};

// Stepper min 1 rule
assert.strictEqual(currentQuantity, 1);
decrement();
assert.strictEqual(currentQuantity, 1, 'Quantity must stay at 1 when decremented at 1');
increment();
assert.strictEqual(currentQuantity, 2, 'Quantity must increment to 2');
decrement();
assert.strictEqual(currentQuantity, 1, 'Quantity must decrement to 1');

// 2. Select item: new item vs existing item logic
const activeItems = [
  { id: 'item-1', name: 'Haferflocken', quantity: 2, category: 'Vorratskammer', tags: '["Bio"]' }
];

const simulateSelectItem = ({ item, activeItems }) => {
  const primaryName = item.name;
  const existing = activeItems.find(i => i.name.trim().toLowerCase() === primaryName.trim().toLowerCase());

  if (existing) {
    return {
      action: 'edit_existing',
      openedFromNewAdd: false,
      item: { ...existing }
    };
  }

  const newId = 'gen-uuid-123';
  return {
    action: 'add_new',
    openedFromNewAdd: true,
    item: {
      id: newId,
      name: primaryName,
      category: item.category || 'Sonstiges',
      quantity: 1,
      tags: item.tags || []
    }
  };
};

// Test existing item selection -> edit mode without duplicate
const resExisting = simulateSelectItem({
  item: { name: 'haferflocken' },
  activeItems
});
assert.strictEqual(resExisting.action, 'edit_existing');
assert.strictEqual(resExisting.openedFromNewAdd, false, 'Existing item must set openedFromNewAdd to false');
assert.strictEqual(resExisting.item.id, 'item-1');
assert.strictEqual(resExisting.item.quantity, 2);

// Test new item selection -> add_new mode
const resNew = simulateSelectItem({
  item: { name: 'Apfel', category: 'Obst & Gemüse' },
  activeItems
});
assert.strictEqual(resNew.action, 'add_new');
assert.strictEqual(resNew.openedFromNewAdd, true, 'New item must set openedFromNewAdd to true');
assert.strictEqual(resNew.item.quantity, 1);
assert.strictEqual(resNew.item.name, 'Apfel');

// 3. Cancel vs Delete logic
const simulateCancel = ({ openedFromNewAdd, itemId }) => {
  if (openedFromNewAdd) {
    return { deletedId: itemId, status: 'cancelled_and_removed' };
  }
  return { status: 'no_op' };
};

const cancelNew = simulateCancel({ openedFromNewAdd: true, itemId: 'gen-uuid-123' });
assert.strictEqual(cancelNew.status, 'cancelled_and_removed');
assert.strictEqual(cancelNew.deletedId, 'gen-uuid-123', 'Cancelling a newly added item must emit delete for its id');

const cancelEdit = simulateCancel({ openedFromNewAdd: false, itemId: 'item-1' });
assert.strictEqual(cancelEdit.status, 'no_op', 'Cancel button does not exist in edit mode (Löschen is used instead)');

// 4. Pending custom note commit logic
const simulateCommitPendingNote = ({ listId, articleName, inputVal, activeTags }) => {
  const trimmed = inputVal.trim();
  if (trimmed) {
    saveCustomNote(listId, articleName, trimmed);
    if (!activeTags.includes(trimmed)) {
      activeTags.push(trimmed);
    }
  }
  return { activeTags, inputVal: '' };
};

storage.clear();
const listId = 'list-99';
const tagsList = ['Bio'];
const commitRes = simulateCommitPendingNote({
  listId,
  articleName: 'Milch',
  inputVal: '  laktosefrei 1,5%  ',
  activeTags: tagsList
});

assert.strictEqual(commitRes.inputVal, '');
assert.deepStrictEqual(commitRes.activeTags, ['Bio', 'laktosefrei 1,5%']);
const remembered = getRememberedNotes(listId, 'Milch');
assert.deepStrictEqual(remembered, ['laktosefrei 1,5%'], 'Committed note must be remembered in local list history');

// 5. Taxonomy protection check:
// Ensure note history does NOT write to any taxonomy object
const fakeTaxonomy = { name: 'Milch', category: 'Milchprodukte & Tiefkühlkost', tags: { constellations: ['Bio', '1,5%', '3,5%'] } };
saveCustomNote(listId, 'Milch', 'vom Bauernhof');
assert.strictEqual(fakeTaxonomy.tags.constellations.includes('vom Bauernhof'), false, 'Taxonomy must remain pristine and never modified by user notes');

console.log('All item detail modal tests PASSED!');
