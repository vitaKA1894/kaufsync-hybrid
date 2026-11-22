import assert from 'node:assert';
import {
  getArticleKey,
  getRememberedNotes,
  saveCustomNote,
  removeCustomNote,
  clearListNoteHistory,
  clearAllNoteHistories
} from './articleNoteHistory.js';

console.log('Testing articleNoteHistory.js...');

if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] || null
  };
}

clearAllNoteHistories();

// 1. Article key normalization
assert.strictEqual(getArticleKey('  Milch  '), 'milch');
assert.strictEqual(getArticleKey({ name: 'Paprika rot' }), 'paprika rot');

// 2. Empty by default
assert.deepStrictEqual(getRememberedNotes('list1', 'Milch'), []);

// 3. Saving custom note
saveCustomNote('list1', 'Milch', 'Bio 3.8%');
saveCustomNote('list1', 'Milch', 'Weihenstephan');
const notes = getRememberedNotes('list1', 'Milch');
assert.deepStrictEqual(notes, ['Weihenstephan', 'Bio 3.8%'], 'Should be ordered MRU');

// 4. Case-insensitive deduplication and reordering
saveCustomNote('list1', 'Milch', 'bio 3.8%');
assert.deepStrictEqual(getRememberedNotes('list1', 'Milch'), ['bio 3.8%', 'Weihenstephan']);

// 5. List Scoping (list2 does not see list1 notes)
assert.deepStrictEqual(getRememberedNotes('list2', 'Milch'), [], 'List 2 must be empty');

// 6. Removing a note
removeCustomNote('list1', 'Milch', 'Weihenstephan');
assert.deepStrictEqual(getRememberedNotes('list1', 'Milch'), ['bio 3.8%']);

// 7. Clear list notes
clearListNoteHistory('list1');
assert.deepStrictEqual(getRememberedNotes('list1', 'Milch'), []);

console.log('All articleNoteHistory tests PASSED!');
