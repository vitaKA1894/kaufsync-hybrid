import { ref } from 'vue';

/**
 * Composable for swipe-down-to-dismiss behavior on bottom sheets.
 * Allows smooth dragging via touch events on the grabber handle or sheet header.
 * If dragged down more than thresholdPx (default 90px), onDismiss is called.
 */
export function useBottomSheetDrag(onDismiss, thresholdPx = 90) {
  const sheetRef = ref(null);
  const sheetStyle = ref({});
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    sheetStyle.value = { transition: 'none' };
  };

  const onTouchMove = (e) => {
    if (!isDragging || !e.touches || e.touches.length === 0) return;
    const y = e.touches[0].clientY;
    currentY = y;
    const delta = Math.max(0, y - startY); // Only allow pulling down
    if (delta > 0) {
      if (e.cancelable) {
        e.preventDefault();
      }
      sheetStyle.value = { transform: `translateY(${delta}px)`, transition: 'none' };
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    const delta = currentY - startY;
    if (delta > thresholdPx) {
      // Animate smoothly downwards off-screen from current dragged position
      sheetStyle.value = {
        transform: 'translateY(100%)',
        transition: 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)'
      };
      setTimeout(() => {
        if (typeof onDismiss === 'function') {
          onDismiss();
        }
        sheetStyle.value = {};
      }, 200);
    } else {
      // Snap back smoothly
      sheetStyle.value = {
        transform: 'translateY(0)',
        transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)'
      };
    }
  };

  const resetDrag = () => {
    sheetStyle.value = {};
    isDragging = false;
    startY = 0;
    currentY = 0;
  };

  return {
    sheetRef,
    sheetStyle,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    resetDrag
  };
}
