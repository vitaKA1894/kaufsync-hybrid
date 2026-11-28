import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  partitionItemsOnCheckout,
  resolvePostCheckoutState
} from './checkoutCompletion.js';
import {
  createInitialRapidState,
  onRapidQueryInput,
  onRapidItemSelected,
  onRapidUndo
} from './rapidAddFlow.js';
import {
  readClipboardTextWithFeedback,
  CLIPBOARD_EMPTY_MESSAGE,
  CLIPBOARD_FALLBACK_MESSAGE
} from './clipboardReader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrcDir = path.resolve(__dirname, '..');

console.log('Testing UI refinements, checkout completion, rapid-add flow, and clipboard fallback...');

// 1. Checkout Completion: removes ONLY checked/completed, keeps Ausverkauft untouched
{
  const items = [
    { id: 'c1', name: 'Milch', status: 'completed', quantity: 2 },
    { id: 'c2', name: 'Brot', status: 'checked', quantity: 1 },
    { id: 'u1', name: 'Hefe', status: 'unavailable', quantity: 1 },
    { id: 'd1', name: 'Deleted', status: 'completed', is_deleted: true }
  ];

  const { clearedIds, remainingItems, preservedUnavailableCount } = partitionItemsOnCheckout(items);
  assert.deepStrictEqual(clearedIds, ['c1', 'c2'], 'Only non-deleted checked/completed items should be cleared');
  assert.strictEqual(preservedUnavailableCount, 1, 'Ausverkauft items must be preserved');
  assert.strictEqual(remainingItems.length, 1);
  assert.strictEqual(remainingItems[0].id, 'u1');

  // With saved loyalty card (online and offline)
  const withCard = resolvePostCheckoutState({ hasLoyaltyCard: true, isOnline: false, isSharedList: true, pushSuccess: false });
  assert.strictEqual(withCard.nextState, 'loyalty_card_prompt_visible');
  assert.strictEqual(withCard.showLoyaltyPrompt, true);
  assert.ok(withCard.offlineSharedNotice.length > 0, 'Offline shared notice must be present without blocking prompt');

  // Without loyalty card
  const withoutCard = resolvePostCheckoutState({ hasLoyaltyCard: false, isOnline: true, isSharedList: false, pushSuccess: true });
  assert.strictEqual(withoutCard.nextState, 'completed_empty');
  assert.strictEqual(withoutCard.showLoyaltyPrompt, false);
  assert.strictEqual(withoutCard.confirmationMessage, 'Einkauf beendet – erledigte Artikel wurden entfernt');
}

// 2. Continuous Rapid Add-Item Flow state transitions & Undo
{
  let state = createInitialRapidState();
  assert.strictEqual(state.mode, 'idle_empty');
  assert.strictEqual(state.addedCount, 0);

  // Typing query -> 'searching'
  state = onRapidQueryInput(state, 'Mi');
  assert.strictEqual(state.mode, 'searching');
  assert.strictEqual(state.query, 'Mi');

  // Backspace to empty -> 'idle_empty'
  state = onRapidQueryInput(state, '');
  assert.strictEqual(state.mode, 'idle_empty');

  // Select newly created item -> clears query & transitions to 'inline_details'
  state = onRapidQueryInput(state, 'Milch');
  state = onRapidItemSelected(state, { itemId: 'item-1', wasNewlyCreated: true, previousSnapshot: null });
  assert.strictEqual(state.mode, 'inline_details');
  assert.strictEqual(state.query, '');
  assert.strictEqual(state.activeItemId, 'item-1');
  assert.strictEqual(state.addedCount, 1);
  assert.strictEqual(state.actionKind, 'added');

  // Inline Undo deletes newly added item and returns to 'idle_empty'
  const undoNew = onRapidUndo(state);
  assert.deepStrictEqual(undoNew.undoAction, { type: 'delete', itemId: 'item-1' });
  assert.strictEqual(undoNew.nextState.mode, 'idle_empty');
  assert.strictEqual(undoNew.nextState.addedCount, 0);

  // Merge/increment existing item & undo restores snapshot
  state = onRapidItemSelected(undoNew.nextState, {
    itemId: 'existing-9',
    wasNewlyCreated: false,
    previousSnapshot: { id: 'existing-9', name: 'Eier', quantity: 1, unit: 'Pkg', tags: '[]' }
  });
  assert.strictEqual(state.mode, 'inline_details');
  assert.strictEqual(state.actionKind, 'updated');

  // Next keystroke in inline_details immediately transitions back to 'searching'
  const nextSearchState = onRapidQueryInput(state, 'B');
  assert.strictEqual(nextSearchState.mode, 'searching');
  assert.strictEqual(nextSearchState.query, 'B');

  // Undo before typing next restores snapshot cleanly
  const undoRestore = onRapidUndo(state);
  assert.strictEqual(undoRestore.undoAction.type, 'restore');
  assert.strictEqual(undoRestore.undoAction.snapshot.quantity, 1);
  assert.strictEqual(undoRestore.nextState.mode, 'idle_empty');
}

// 3. Android + Web Clipboard Reader Fallback Behavior
{
  const androidOk = await readClipboardTextWithFeedback({
    isNativeAndroid: true,
    nativeRead: async () => ({ text: 'https://www.chefkoch.de/rezepte/123' }),
    webReadText: null
  });
  assert.strictEqual(androidOk.ok, true);
  assert.strictEqual(androidOk.text, 'https://www.chefkoch.de/rezepte/123');

  const emptyClip = await readClipboardTextWithFeedback({
    isNativeAndroid: true,
    nativeRead: async () => ({ text: '   ' }),
    webReadText: async () => ''
  });
  assert.strictEqual(emptyClip.ok, false);
  assert.strictEqual(emptyClip.reason, 'empty');
  assert.strictEqual(emptyClip.message, CLIPBOARD_EMPTY_MESSAGE);

  const deniedClip = await readClipboardTextWithFeedback({
    isNativeAndroid: false,
    webReadText: async () => { throw new Error('NotAllowedError'); }
  });
  assert.strictEqual(deniedClip.ok, false);
  assert.strictEqual(deniedClip.reason, 'denied');
  assert.strictEqual(deniedClip.message, CLIPBOARD_FALLBACK_MESSAGE);
}

// 4. Static UI Copy & Consolidation Guardrails
{
  const recipeModalSrc = fs.readFileSync(path.join(frontendSrcDir, 'components/RecipeImportModal.vue'), 'utf-8');
  assert.strictEqual(/mealie/i.test(recipeModalSrc), false, 'RecipeImportModal.vue must not contain any mention of Mealie');
  assert.ok(recipeModalSrc.includes('Chefkoch, Allrecipes'), 'RecipeImportModal.vue must highlight mainstream recipe sites');

  const dashboardSrc = fs.readFileSync(path.join(frontendSrcDir, 'views/Dashboard.vue'), 'utf-8');
  assert.strictEqual(dashboardSrc.includes('ks-topbar-templates-btn'), false, 'Dashboard header must not contain Vorlagen button');
}

console.log('All uiRefinementsAndFlows tests PASSED!');
