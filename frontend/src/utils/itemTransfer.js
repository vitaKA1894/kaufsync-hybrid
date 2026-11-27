import { findMergeCandidate, buildMergedItemUpdate } from './itemMerge.js';

export function normalizeItemStatus(status) {
  const s = String(status || 'active').trim().toLowerCase();
  if (s === 'open' || s === 'active') return 'active';
  if (s === 'checked' || s === 'completed') return 'completed';
  if (s === 'unavailable') return 'unavailable';
  return 'active';
}

export function isItemOpenOnly(item) {
  const s = normalizeItemStatus(item?.status);
  return s === 'active';
}

export function isItemUnavailable(item) {
  return normalizeItemStatus(item?.status) === 'unavailable';
}

export function isItemVisibleActive(item) {
  const s = normalizeItemStatus(item?.status);
  return s === 'active' || s === 'unavailable';
}

export function isItemCompleted(item) {
  return normalizeItemStatus(item?.status) === 'completed';
}

export function toWidgetStatus(status) {
  const norm = normalizeItemStatus(status);
  if (norm === 'completed') return 'checked';
  if (norm === 'unavailable') return 'unavailable';
  return 'open';
}

/**
 * Pure optimistic transfer of 1 or more items from sourceItems to targetItems.
 * Resets transferred item status to targetStatus ('active' by default) and applies
 * Smart Duplicate Merge rules onto targetItems.
 */
export function applyTransferOptimistically({
  sourceListId,
  targetListId,
  sourceItems = [],
  targetItems = [],
  itemIdsToMove = [],
  targetStatus = 'active'
}) {
  if (!sourceListId || !targetListId || sourceListId === targetListId) {
    return {
      updatedSourceItems: [...sourceItems],
      updatedTargetItems: [...targetItems],
      movedRecords: [],
      skippedIds: [...itemIdsToMove]
    };
  }

  const moveSet = new Set((itemIdsToMove || []).map(String));
  const nextSource = [];
  const nextTarget = (targetItems || []).map(it => ({ ...it }));
  const movedRecords = [];
  const skippedIds = [];
  const nowIso = new Date().toISOString();
  const normalizedTargetStatus = normalizeItemStatus(targetStatus);

  for (const srcItem of (sourceItems || [])) {
    if (!moveSet.has(String(srcItem.id))) {
      nextSource.push(srcItem);
      continue;
    }
    if (isItemCompleted(srcItem)) {
      // Concurrently completed items are kept in place and skipped gracefully
      nextSource.push(srcItem);
      skippedIds.push(srcItem.id);
      continue;
    }

    const openTargetCandidates = nextTarget.filter(t => isItemVisibleActive(t) && !t.is_deleted);
    const mergeCandidate = findMergeCandidate(openTargetCandidates, {
      name: srcItem.name,
      tags: srcItem.tags,
      taxonomy_id: srcItem.taxonomy_id || null
    });

    if (mergeCandidate) {
      const mergedPatch = buildMergedItemUpdate(mergeCandidate, {
        quantity: srcItem.quantity || 1,
        tags: srcItem.tags,
        note: srcItem.note
      });
      const idx = nextTarget.findIndex(t => t.id === mergeCandidate.id);
      const prevQty = mergeCandidate.quantity || 1;
      const prevTags = mergeCandidate.tags || '';
      const prevNote = mergeCandidate.note || '';
      if (idx !== -1) {
        nextTarget[idx] = {
          ...nextTarget[idx],
          ...mergedPatch,
          status: normalizedTargetStatus === 'unavailable' ? 'unavailable' : nextTarget[idx].status,
          updated_at: nowIso
        };
      }
      movedRecords.push({
        sourceItem: { ...srcItem },
        createdItemId: null,
        mergedTargetId: mergeCandidate.id,
        mergedPrevQuantity: prevQty,
        mergedPrevTags: prevTags,
        mergedPrevNote: prevNote
      });
    } else {
      const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `xfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const created = {
        ...srcItem,
        id: newId,
        list_id: targetListId,
        status: normalizedTargetStatus,
        created_at: nowIso,
        updated_at: nowIso,
        is_deleted: false
      };
      nextTarget.push(created);
      movedRecords.push({
        sourceItem: { ...srcItem },
        createdItemId: newId,
        mergedTargetId: null
      });
    }
  }

  return {
    updatedSourceItems: nextSource,
    updatedTargetItems: nextTarget,
    movedRecords,
    skippedIds
  };
}
