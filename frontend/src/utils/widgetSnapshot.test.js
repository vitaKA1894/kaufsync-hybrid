import assert from 'node:assert';
import {
  buildWidgetSnapshot,
  reconcilePendingWidgetCheckoffs,
  sortItemsByAisleOrder,
  inferStoreKey
} from './widgetSnapshot.js';

console.log('Testing widgetSnapshot.js...');

// 1. Store inference & aisle sorting (dm prioritizes Drogerie before Obst & Gemüse)
assert.strictEqual(inferStoreKey('Lidl'), 'lidl');
assert.strictEqual(inferStoreKey('dm Drogerie'), 'dm');

const unsorted = [
  { id: '1', name: 'Bananen', category: 'Obst & Gemüse', status: 'active' },
  { id: '2', name: 'Zahnpasta', category: 'Drogerie, Haushalt & Tierbedarf', status: 'unavailable', tags: JSON.stringify(['Dringend']) }
];
const dmSorted = sortItemsByAisleOrder(unsorted, ['Drogerie, Haushalt & Tierbedarf', 'Obst & Gemüse']);
assert.strictEqual(dmSorted[0].id, '2');
assert.strictEqual(dmSorted[1].id, '1');

// 2. Build widget snapshot excludes completed items, respects pending checkoffs, preserves unavailable & urgent
{
  const snap = buildWidgetSnapshot({
    isAuthenticated: true,
    authToken: 'tok123',
    apiBaseUrl: 'https://api.example.com',
    lists: [
      {
        id: 'lidl-1',
        name: 'Lidl',
        items: [
          { id: 'i1', name: 'Milch', quantity: 2, category: 'Milchprodukte & Tiefkühlkost', status: 'active', tags: JSON.stringify(['Dringend']) },
          { id: 'i2', name: 'Butter', quantity: 1, category: 'Milchprodukte & Tiefkühlkost', status: 'unavailable', tags: '[]' },
          { id: 'i3', name: 'Brot', quantity: 1, category: 'Brot & Backwaren', status: 'completed', tags: '[]' }
        ]
      }
    ],
    selectedListId: 'deleted-id',
    pendingCheckoffItemIds: new Set(['i1'])
  });

  assert.strictEqual(snap.selected_list_id, 'lidl-1', 'Falls back to first available list if selected list deleted');
  assert.strictEqual(snap.lists_summary[0].open_count, 1);
  assert.strictEqual(snap.items_by_list['lidl-1'].length, 1);
  assert.strictEqual(snap.items_by_list['lidl-1'][0].status, 'unavailable');
}

// 3. Logout / unauthenticated snapshot wipes all private data
{
  const cleared = buildWidgetSnapshot({ isAuthenticated: false, lists: [{ id: 'x', name: 'X', items: [] }] });
  assert.strictEqual(cleared.is_authenticated, false);
  assert.strictEqual(cleared.lists_summary.length, 0);
  assert.deepStrictEqual(cleared.items_by_list, {});
}

// 4. Idempotent reconciliation of rapid duplicate widget checkoffs
{
  const pendingOps = [
    { op_id: 'op-1', list_id: 'l1', item_id: 'i1', checked_at: '2026-11-27T10:00:00Z' },
    { op_id: 'op-2', list_id: 'l1', item_id: 'i1', checked_at: '2026-11-27T10:00:01Z' },
    { op_id: 'op-3', list_id: 'l1', item_id: 'i2', checked_at: '2026-11-27T10:00:02Z' }
  ];
  const currentItemsByList = {
    l1: [
      { id: 'i1', name: 'Milch', status: 'active' },
      { id: 'i2', name: 'Brot', status: 'completed' }
    ]
  };
  const res = reconcilePendingWidgetCheckoffs(pendingOps, currentItemsByList);
  assert.strictEqual(res.toApply.length, 1, 'Duplicate & already-completed ops are idempotently ignored');
  assert.strictEqual(res.toApply[0].item.id, 'i1');
  assert.deepStrictEqual(res.ackedOpIds, ['op-1', 'op-2', 'op-3']);
}

console.log('All widgetSnapshot tests PASSED!');
