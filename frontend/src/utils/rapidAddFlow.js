/**
 * Pure state machine for the Continuous Rapid Add-Item Flow (`+ Artikel`).
 * States: 'idle_empty' | 'searching' | 'inline_details'
 */

export function createInitialRapidState() {
  return {
    mode: 'idle_empty',
    query: '',
    activeItemId: null,
    wasNewlyCreated: false,
    previousSnapshot: null,
    actionKind: 'added', // 'added' | 'updated'
    addedCount: 0
  };
}

/**
 * Transitions state whenever the bottom search input changes.
 * Typing any character immediately switches 'inline_details' -> 'searching'.
 */
export function onRapidQueryInput(state, nextQuery = '') {
  const q = String(nextQuery ?? '');
  if (q.trim().length > 0) {
    return {
      ...state,
      mode: 'searching',
      query: q
    };
  }

  // Empty query returns 'searching' back to 'idle_empty';
  // if in 'inline_details' cleanly keep unless explicitly cleared.
  if (state.mode === 'searching') {
    return {
      ...state,
      mode: 'idle_empty',
      query: ''
    };
  }

  return {
    ...state,
    query: ''
  };
}

/**
 * Transitions immediately into 'inline_details' upon tapping an article tile,
 * restock suggestion, barcode result, or natural-language Quick-Add card.
 * Clears query cleanly for rapid next-article entry.
 */
export function onRapidItemSelected(
  state,
  { itemId, wasNewlyCreated = true, previousSnapshot = null, actionKind = null }
) {
  return {
    ...state,
    mode: 'inline_details',
    query: '',
    activeItemId: itemId,
    wasNewlyCreated: Boolean(wasNewlyCreated),
    previousSnapshot: previousSnapshot ? { ...previousSnapshot } : null,
    actionKind: actionKind || (wasNewlyCreated ? 'added' : 'updated'),
    addedCount: (state.addedCount || 0) + 1
  };
}

/**
 * Executes 1-tap inline Undo from 'inline_details' and transitions back to 'idle_empty'.
 */
export function onRapidUndo(state) {
  if (state.mode !== 'inline_details' || !state.activeItemId) {
    return { nextState: state, undoAction: null };
  }

  const undoAction = state.wasNewlyCreated
    ? { type: 'delete', itemId: state.activeItemId }
    : { type: 'restore', itemId: state.activeItemId, snapshot: state.previousSnapshot };

  return {
    nextState: {
      ...state,
      mode: 'idle_empty',
      query: '',
      activeItemId: null,
      wasNewlyCreated: false,
      previousSnapshot: null,
      actionKind: 'added',
      addedCount: Math.max(0, (state.addedCount || 0) - 1)
    },
    undoAction
  };
}
