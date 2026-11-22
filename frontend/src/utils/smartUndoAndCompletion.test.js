import assert from 'node:assert';

console.log('Testing smartUndoAndCompletion logic...');

// Helper simulation class for ListView check-off, undo, and completion prompt logic
class ShoppingListSession {
  constructor(initialItems, membersCount = 1) {
    this.items = JSON.parse(JSON.stringify(initialItems));
    this.membersCount = membersCount;
    this.activeMetaFilter = 'all';

    // Ephemeral Undo Snackbar State
    this.undoSnackbar = {
      visible: false,
      itemSnapshot: null,
      timer: null
    };

    // Ephemeral Completion Prompt State
    this.showCompletionPrompt = false;
    this.completionPromptDismissed = false;
  }

  get openActiveItems() {
    return this.items.filter(i => i.status === 'active');
  }

  get isSharedList() {
    return this.membersCount > 1;
  }

  checkOff(itemId) {
    const previousOpenCount = this.openActiveItems.length;
    const item = this.items.find(i => i.id === itemId);
    if (!item || item.status !== 'active') return;

    item.status = 'completed';

    // 1. Smart Undo Snapshot
    if (this.undoSnackbar.timer) {
      clearTimeout(this.undoSnackbar.timer);
    }
    this.undoSnackbar = {
      visible: true,
      itemSnapshot: {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        subtitle: item.subtitle,
        note: item.note,
        meta_tags: item.meta_tags ? [...item.meta_tags] : [],
        tags: item.tags ? [...item.tags] : [],
        position: item.position
      },
      timer: setTimeout(() => {
        this.undoSnackbar.visible = false;
        this.undoSnackbar.itemSnapshot = null;
        this.undoSnackbar.timer = null;
      }, 4000)
    };

    // 2. Completion Prompt Check
    const currentOpenCount = this.openActiveItems.length;
    if (previousOpenCount > 0 && currentOpenCount === 0 && !this.completionPromptDismissed) {
      this.showCompletionPrompt = true;
    }
  }

  executeUndo() {
    if (!this.undoSnackbar.visible || !this.undoSnackbar.itemSnapshot) return false;

    if (this.undoSnackbar.timer) {
      clearTimeout(this.undoSnackbar.timer);
      this.undoSnackbar.timer = null;
    }

    const snapshot = this.undoSnackbar.itemSnapshot;
    const item = this.items.find(i => i.id === snapshot.id);
    if (item) {
      item.status = 'active';
      item.quantity = snapshot.quantity;
      item.unit = snapshot.unit;
      item.category = snapshot.category;
      item.subtitle = snapshot.subtitle;
      item.note = snapshot.note;
      item.meta_tags = [...snapshot.meta_tags];
      item.tags = [...snapshot.tags];
      item.position = snapshot.position;
    }

    this.showCompletionPrompt = false;
    this.undoSnackbar.visible = false;
    this.undoSnackbar.itemSnapshot = null;
    return true;
  }

  dismissCompletionPrompt() {
    this.completionPromptDismissed = true;
    this.showCompletionPrompt = false;
  }
}

// TEST 1: Single item check-off shows Undo Snackbar & exact restoration
{
  const session = new ShoppingListSession([
    { id: '1', name: 'Paprikaschoten', quantity: 3, unit: 'Stk', category: 'Obst & Gemüse', meta_tags: ['dringend'], note: 'Rot', status: 'active' },
    { id: '2', name: 'Milch', quantity: 2, unit: 'l', category: 'Milchprodukte', meta_tags: [], status: 'active' }
  ]);

  session.checkOff('1');
  assert.strictEqual(session.undoSnackbar.visible, true);
  assert.strictEqual(session.undoSnackbar.itemSnapshot.name, 'Paprikaschoten');
  assert.strictEqual(session.undoSnackbar.itemSnapshot.quantity, 3);
  assert.deepStrictEqual(session.undoSnackbar.itemSnapshot.meta_tags, ['dringend']);
  assert.strictEqual(session.undoSnackbar.itemSnapshot.note, 'Rot');
  assert.strictEqual(session.showCompletionPrompt, false, 'Still 1 open item left -> no completion prompt');

  // Execute Undo
  const undone = session.executeUndo();
  assert.strictEqual(undone, true);
  assert.strictEqual(session.undoSnackbar.visible, false);
  const restored = session.items.find(i => i.id === '1');
  assert.strictEqual(restored.status, 'active');
  assert.strictEqual(restored.quantity, 3);
  assert.deepStrictEqual(restored.meta_tags, ['dringend']);
}

// TEST 2: Rapid consecutive check-offs do not stack and update to newest item
{
  const session = new ShoppingListSession([
    { id: '1', name: 'Brot', quantity: 1, status: 'active' },
    { id: '2', name: 'Butter', quantity: 1, status: 'active' },
    { id: '3', name: 'Käse', quantity: 1, status: 'active' }
  ]);

  session.checkOff('1');
  assert.strictEqual(session.undoSnackbar.itemSnapshot.name, 'Brot');

  // Immediately check off Butter
  session.checkOff('2');
  assert.strictEqual(session.undoSnackbar.visible, true);
  assert.strictEqual(session.undoSnackbar.itemSnapshot.name, 'Butter', 'Should update to newest item');

  // Undo should restore only Butter (most recent)
  session.executeUndo();
  assert.strictEqual(session.items.find(i => i.id === '2').status, 'active');
  assert.strictEqual(session.items.find(i => i.id === '1').status, 'completed', 'Earlier intentional check-off remains completed');
}

// TEST 3: Final item check-off triggers Completion Prompt
{
  const session = new ShoppingListSession([
    { id: '1', name: 'Brot', status: 'active' }
  ], 2); // Shared list (2 members)

  assert.strictEqual(session.isSharedList, true);
  assert.strictEqual(session.showCompletionPrompt, false, 'Not shown when open items exist');

  session.checkOff('1');
  assert.strictEqual(session.showCompletionPrompt, true, 'Prompt shown when last item checked off');
  assert.strictEqual(session.undoSnackbar.visible, true, 'Undo snackbar is simultaneously visible!');

  // Tapping Undo cancels completion prompt immediately
  session.executeUndo();
  assert.strictEqual(session.showCompletionPrompt, false, 'Completion prompt dismissed upon undo');
  assert.strictEqual(session.openActiveItems.length, 1);
}

// TEST 4: Opening an already empty list does NOT trigger Completion Prompt
{
  const session = new ShoppingListSession([
    { id: '1', name: 'Brot', status: 'completed' }
  ]);
  assert.strictEqual(session.openActiveItems.length, 0);
  assert.strictEqual(session.showCompletionPrompt, false, 'Empty list must never display completion prompt');
}

// TEST 5: Meta-tag filter check-off doesn't trigger prompt if other items open
{
  const session = new ShoppingListSession([
    { id: '1', name: 'Apfel', meta_tags: ['dringend'], status: 'active' },
    { id: '2', name: 'Birne', meta_tags: [], status: 'active' }
  ]);

  session.activeMetaFilter = 'urgent';
  // Check off the only urgent item
  session.checkOff('1');
  assert.strictEqual(session.openActiveItems.length, 1, 'Birne is still active');
  assert.strictEqual(session.showCompletionPrompt, false, 'Should NOT trigger completion prompt');
}

// TEST 6: "Später" dismisses prompt for current visit
{
  const session = new ShoppingListSession([
    { id: '1', name: 'Wasser', status: 'active' }
  ]);
  session.checkOff('1');
  assert.strictEqual(session.showCompletionPrompt, true);
  session.dismissCompletionPrompt();
  assert.strictEqual(session.showCompletionPrompt, false);
  assert.strictEqual(session.completionPromptDismissed, true);
}

console.log('All smartUndoAndCompletion tests PASSED!');
