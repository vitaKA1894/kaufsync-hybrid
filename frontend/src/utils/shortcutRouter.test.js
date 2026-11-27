import assert from 'node:assert';
import {
  parseShortcutIntent,
  resolveShortcutRoute
} from './shortcutRouter.js';

console.log('Testing shortcutRouter.js...');

// 1. Parse query & kaufsync:// URLs & native objects
assert.deepStrictEqual(parseShortcutIntent('/?shortcut=add'), { action: 'add', listId: null });
assert.deepStrictEqual(parseShortcutIntent('kaufsync://shortcut?action=scan&list_id=abc'), { action: 'scan', listId: 'abc' });
assert.deepStrictEqual(parseShortcutIntent('kaufsync://list/l1?action=add'), { action: 'add', listId: 'l1' });
assert.deepStrictEqual(parseShortcutIntent('kaufsync://list/l1'), { action: 'open_list', listId: 'l1' });
assert.deepStrictEqual(parseShortcutIntent({ action: 'recipe' }), { action: 'recipe', listId: null });
assert.strictEqual(parseShortcutIntent('kaufsync://shortcut?action=unknown'), null);

// 2. Resolve routes using explicit listId, fallback lastListId, fallback first list, or empty state
const lists = [{ id: 'lidl', name: 'Lidl' }, { id: 'rewe', name: 'REWE' }];

assert.deepStrictEqual(
  resolveShortcutRoute({ action: 'add', lists, lastListId: 'rewe' }),
  { path: '/list/rewe', query: { shortcut: 'add' } }
);
assert.deepStrictEqual(
  resolveShortcutRoute({ action: 'scan', listId: 'lidl', lists, lastListId: 'rewe' }),
  { path: '/list/lidl', query: { shortcut: 'scan' } }
);
assert.deepStrictEqual(
  resolveShortcutRoute({ action: 'add', lists, lastListId: 'deleted-list' }),
  { path: '/list/lidl', query: { shortcut: 'add' } }
);
assert.deepStrictEqual(
  resolveShortcutRoute({ action: 'add', lists: [] }),
  {
    path: '/',
    query: { shortcutNotice: 'Erstelle zuerst eine Einkaufsliste, um Artikel hinzuzufügen.' }
  }
);
assert.deepStrictEqual(
  resolveShortcutRoute({ action: 'recipe', lists }),
  { path: '/', query: { shortcut: 'recipe' } }
);

console.log('All shortcutRouter tests PASSED!');
