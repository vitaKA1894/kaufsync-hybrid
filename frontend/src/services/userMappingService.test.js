import assert from 'node:assert';

// Mock localStorage BEFORE importing service
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (i) => Array.from(store.keys())[i] ?? null
};

const { isOnline } = await import('./syncService.js');
const {
  resolveArticleWithUserLayer,
  learnArticleMapping,
  learnBarcodeMapping,
  searchWithUserOverrides,
  deleteUserMapping,
  resetAllUserMappings,
  clearLocalUserMappings,
  ensureMappingsLoaded,
  userMappings
} = await import('./userMappingService.js');

console.log('Testing userMappingService.js...');

function setUser(id) {
  localStorage.setItem('cachedUser', JSON.stringify({ id }));
  ensureMappingsLoaded(true);
}

// Simulate offline mode to verify 100% offline-first operation
isOnline.value = false;
localStorage.clear();

// 1. Default taxonomy resolution (Layer 2)
setUser('user-a');
const defaultMilch = resolveArticleWithUserLayer('Milch');
assert.strictEqual(defaultMilch.source, 'taxonomy');
assert.strictEqual(defaultMilch.category, 'Milchprodukte & Tiefkühlkost');

// 2. Learn category override for User A
await learnArticleMapping({
  name: 'Milch',
  category: 'Getränke & Genussmittel',
  taxonomyId: defaultMilch.taxonomyId
});

const userAMilch = resolveArticleWithUserLayer('Milch');
assert.strictEqual(userAMilch.source, 'user_mapping');
assert.strictEqual(userAMilch.category, 'Getränke & Genussmittel');

// 3. Strict Per-User Isolation: User B still gets global taxonomy default!
setUser('user-b');
const userBMilch = resolveArticleWithUserLayer('Milch');
assert.strictEqual(userBMilch.source, 'taxonomy');
assert.strictEqual(userBMilch.category, 'Milchprodukte & Tiefkühlkost');

// 4. Offline Barcode Learning & Repeat Recognition for User A
setUser('user-a');
await learnBarcodeMapping({
  barcode: '4001234567899',
  name: 'Ja! Vollmilch 3,5%',
  category: 'Milchprodukte & Tiefkühlkost',
  taxonomyId: defaultMilch.taxonomyId
});

const offlineBarcodeHit = resolveArticleWithUserLayer('', '4001234567899');
assert.strictEqual(offlineBarcodeHit.source, 'user_mapping');
assert.strictEqual(offlineBarcodeHit.name, 'Ja! Vollmilch 3,5%');
assert.strictEqual(offlineBarcodeHit.category, 'Milchprodukte & Tiefkühlkost');

// User B does NOT see User A's scanned barcode
setUser('user-b');
const userBBarcode = resolveArticleWithUserLayer('', '4001234567899');
assert.strictEqual(userBBarcode.source, 'custom');

// 5. Custom free-text article outside taxonomy appears in search with learned category
setUser('user-a');
await learnArticleMapping({
  name: 'Kaffeefilter Größe 4',
  category: 'Drogerie, Haushalt & Tierbedarf'
});
const customSearch = searchWithUserOverrides('Kaffeefilter');
assert(
  customSearch.some(r => r.name === 'Kaffeefilter Größe 4' && r.category === 'Drogerie, Haushalt & Tierbedarf'),
  'Custom learned item must appear in search results with learned category'
);

// 6. Reverting back to original global taxonomy default removes redundant override automatically
await learnArticleMapping({
  name: 'Milch',
  category: 'Milchprodukte & Tiefkühlkost',
  taxonomyId: defaultMilch.taxonomyId
});
const revertedMilch = resolveArticleWithUserLayer('Milch');
assert.strictEqual(revertedMilch.source, 'taxonomy', 'Restoring global default category must clean up override');

// 7. Delete single & reset all
const firstId = userMappings.value[0].id;
await deleteUserMapping(firstId);
assert.strictEqual(userMappings.value.some(m => m.id === firstId), false);

await resetAllUserMappings();
assert.strictEqual(userMappings.value.length, 0);

// 8. Clear on logout/account delete
await learnArticleMapping({ name: 'Testartikel', category: 'Sonstiges' });
assert.strictEqual(userMappings.value.length, 1);
clearLocalUserMappings();
assert.strictEqual(userMappings.value.length, 0);

console.log('All userMappingService tests PASSED!');
