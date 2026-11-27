import assert from 'node:assert';
import {
  normalizeItemStatus,
  isItemOpenOnly,
  isItemUnavailable,
  isItemVisibleActive,
  isItemCompleted,
  toWidgetStatus,
  applyTransferOptimistically
} from './itemTransfer.js';

console.log('Testing itemTransfer.js...');

// 1. Status normalization
assert.strictEqual(normalizeItemStatus('open'), 'active');
assert.strictEqual(normalizeItemStatus('active'), 'active');
assert.strictEqual(normalizeItemStatus('checked'), 'completed');
assert.strictEqual(normalizeItemStatus('completed'), 'completed');
assert.strictEqual(normalizeItemStatus('unavailable'), 'unavailable');

assert.strictEqual(isItemOpenOnly({ status: 'open' }), true);
assert.strictEqual(isItemUnavailable({ status: 'unavailable' }), true);
assert.strictEqual(isItemVisibleActive({ status: 'unavailable' }), true);
assert.strictEqual(isItemOpenOnly({ status: 'unavailable' }), false);
assert.strictEqual(isItemCompleted({ status: 'unavailable' }), false);
assert.strictEqual(toWidgetStatus('unavailable'), 'unavailable');
assert.strictEqual(toWidgetStatus('completed'), 'checked');
assert.strictEqual(toWidgetStatus('active'), 'open');

// 2. Cleanup logic simulation preserves unavailable items
{
  const items = [
    { id: '1', name: 'Brot', status: 'completed' },
    { id: '2', name: 'Milch', status: 'unavailable' },
    { id: '3', name: 'Äpfel', status: 'active' }
  ];
  const afterCleanup = items.filter(i => !isItemCompleted(i));
  assert.strictEqual(afterCleanup.length, 2);
  assert.ok(afterCleanup.some(i => i.id === '2' && i.status === 'unavailable'));
}

// 3. Single transfer merges compatible open item on destination list and resets status to open
{
  const sourceItems = [
    { id: 's1', name: 'Milch', quantity: 2, category: 'Milchprodukte & Tiefkühlkost', status: 'unavailable', tags: JSON.stringify(['Dringend']), note: 'Kalt' },
    { id: 's2', name: 'Eier', quantity: 1, category: 'Milchprodukte & Tiefkühlkost', status: 'completed', tags: '[]' }
  ];
  const targetItems = [
    { id: 't1', name: 'Milch', quantity: 1, category: 'Milchprodukte & Tiefkühlkost', status: 'active', tags: JSON.stringify(['Bio']) }
  ];

  const res = applyTransferOptimistically({
    sourceListId: 'lidl',
    targetListId: 'netto',
    sourceItems,
    targetItems,
    itemIdsToMove: ['s1', 's2']
  });

  // s2 (completed) was skipped gracefully, s1 removed from source
  assert.strictEqual(res.updatedSourceItems.length, 1);
  assert.strictEqual(res.updatedSourceItems[0].id, 's2');
  assert.deepStrictEqual(res.skippedIds, ['s2']);

  // Target Milch merged: qty = 3, status active, has Bio + Dringend
  assert.strictEqual(res.updatedTargetItems.length, 1);
  assert.strictEqual(res.updatedTargetItems[0].quantity, 3);
  assert.strictEqual(res.updatedTargetItems[0].status, 'active');
  const mergedTags = JSON.parse(res.updatedTargetItems[0].tags);
  assert.ok(mergedTags.includes('Bio') && mergedTags.includes('Dringend'));
  assert.strictEqual(res.movedRecords[0].mergedTargetId, 't1');
}

// 4. Bulk transfer of multiple unavailable items without duplicates
{
  const sourceItems = [
    { id: 's1', name: 'Butter', quantity: 1, category: 'Milchprodukte & Tiefkühlkost', status: 'unavailable', tags: '[]' },
    { id: 's2', name: 'Kaffee', quantity: 2, category: 'Vorratskammer', status: 'unavailable', tags: JSON.stringify(['Ganze Bohne']) }
  ];
  const res = applyTransferOptimistically({
    sourceListId: 'aldi',
    targetListId: 'rewe',
    sourceItems,
    targetItems: [],
    itemIdsToMove: ['s1', 's2']
  });
  assert.strictEqual(res.updatedSourceItems.length, 0);
  assert.strictEqual(res.updatedTargetItems.length, 2);
  assert.ok(res.updatedTargetItems.every(it => it.status === 'active'));
}

console.log('All itemTransfer tests PASSED!');
