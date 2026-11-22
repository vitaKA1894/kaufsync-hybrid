import assert from 'node:assert';
import {
  isHapticFeedbackEnabled,
  setHapticFeedbackEnabled,
  triggerLightHaptic,
  triggerConfirmationHaptic,
  triggerSuccessHaptic
} from './hapticsService.js';

console.log('Testing hapticsService.js...');

// Mock localStorage if in node environment without it
if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
}

// 1. Defaults to true
localStorage.removeItem('ks_haptic_feedback_enabled');
assert.strictEqual(isHapticFeedbackEnabled(), true, 'Default must be true');

// 2. Can be disabled
setHapticFeedbackEnabled(false);
assert.strictEqual(isHapticFeedbackEnabled(), false, 'Must be false when set to false');
assert.strictEqual(localStorage.getItem('ks_haptic_feedback_enabled'), 'false');

// 3. Can be re-enabled
setHapticFeedbackEnabled(true);
assert.strictEqual(isHapticFeedbackEnabled(), true, 'Must be true when set to true');

// 4. Mock navigator.vibrate
let vibrateCallCount = 0;
let lastVibratePattern = null;
try {
  Object.defineProperty(navigator, 'vibrate', {
    value: (pattern) => {
      vibrateCallCount++;
      lastVibratePattern = pattern;
      return true;
    },
    configurable: true,
    writable: true
  });
} catch (e) {
  // fallback
}

// Test calls when enabled
await triggerLightHaptic();
assert.strictEqual(vibrateCallCount, 1, 'Light feedback should invoke vibrate');
assert.strictEqual(lastVibratePattern, 15);

await triggerConfirmationHaptic();
assert.strictEqual(vibrateCallCount, 2, 'Confirmation feedback should invoke vibrate');
assert.strictEqual(lastVibratePattern, 35);

await triggerSuccessHaptic();
assert.strictEqual(vibrateCallCount, 3, 'Success feedback should invoke vibrate');
assert.deepStrictEqual(lastVibratePattern, [30, 50, 40, 50, 60]);

// Test calls when disabled
setHapticFeedbackEnabled(false);
const prevCount = vibrateCallCount;
await triggerLightHaptic();
await triggerConfirmationHaptic();
await triggerSuccessHaptic();
assert.strictEqual(vibrateCallCount, prevCount, 'No vibrate call should fire when disabled');

// Restore setting
setHapticFeedbackEnabled(true);

console.log('All hapticsService tests PASSED!');
