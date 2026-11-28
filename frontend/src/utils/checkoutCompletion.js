import { isItemCompleted, isItemUnavailable } from './itemTransfer.js';

/**
 * Separates permanently cleared checked-off items from preserved items
 * (including any 'unavailable' / Ausverkauft items) during checkout completion.
 */
export function partitionItemsOnCheckout(items = []) {
  const clearedIds = [];
  const remainingItems = [];
  let preservedUnavailableCount = 0;

  for (const item of (items || [])) {
    if (!item || item.is_deleted) continue;
    if (isItemCompleted(item)) {
      clearedIds.push(item.id);
    } else {
      remainingItems.push(item);
      if (isItemUnavailable(item)) {
        preservedUnavailableCount++;
      }
    }
  }

  return {
    clearedIds,
    remainingItems,
    preservedUnavailableCount
  };
}

/**
 * Computes post-completion UI state and messaging based on loyalty card presence
 * and network / shared-list state.
 */
export function resolvePostCheckoutState({
  hasLoyaltyCard = false,
  isOnline = true,
  isSharedList = false,
  pushSuccess = true
} = {}) {
  const showLoyaltyPrompt = Boolean(hasLoyaltyCard);
  let offlineSharedNotice = '';
  if (!isOnline && isSharedList) {
    offlineSharedNotice = 'Offline: Gruppen-Benachrichtigung konnte nicht gesendet werden.';
  } else if (isOnline && isSharedList && !pushSuccess) {
    offlineSharedNotice = 'Gruppen-Benachrichtigung konnte nicht gesendet werden.';
  }

  const confirmationMessage = showLoyaltyPrompt
    ? 'Einkauf abgeschlossen!'
    : 'Einkauf beendet – erledigte Artikel wurden entfernt';

  return {
    nextState: showLoyaltyPrompt ? 'loyalty_card_prompt_visible' : 'completed_empty',
    showLoyaltyPrompt,
    confirmationMessage,
    offlineSharedNotice
  };
}
