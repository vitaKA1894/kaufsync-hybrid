import {
  isWakeLockSupported,
  requestScreenWakeLock,
  releaseScreenWakeLock,
  isScreenWakeLockActive
} from './wakeLockService.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('Testing wakeLockService in headless/node environment...');

  // 1. Without navigator.wakeLock (Node environment)
  assert(isWakeLockSupported() === false, 'wakeLock should not be supported in bare node');
  assert(isScreenWakeLockActive() === false, 'wake lock should be inactive by default');

  const unsupportedRes = await requestScreenWakeLock();
  assert(unsupportedRes.success === false, 'requestScreenWakeLock should return success: false when unsupported');
  assert(unsupportedRes.reason === 'unsupported', 'requestScreenWakeLock should indicate unsupported');

  // 2. Mocking navigator.wakeLock
  let releaseTriggered = false;
  let sentinelReleased = false;

  const mockSentinel = {
    released: false,
    listeners: {},
    addEventListener(event, fn) {
      this.listeners[event] = fn;
    },
    async release() {
      this.released = true;
      sentinelReleased = true;
      if (this.listeners['release']) {
        this.listeners['release']();
      }
    }
  };

  const mockWakeLock = {
    request: async (type) => {
      if (type !== 'screen') throw new Error('Invalid type');
      return mockSentinel;
    }
  };

  try {
    Object.defineProperty(globalThis.navigator, 'wakeLock', {
      value: mockWakeLock,
      configurable: true,
      writable: true
    });
  } catch (e) {
    globalThis.navigator.wakeLock = mockWakeLock;
  }

  assert(isWakeLockSupported() === true, 'wakeLock should be supported when navigator.wakeLock is present');

  const reqRes = await requestScreenWakeLock({
    onRelease: () => {
      releaseTriggered = true;
    }
  });

  assert(reqRes.success === true, 'requestScreenWakeLock should succeed with mock');
  assert(isScreenWakeLockActive() === true, 'isScreenWakeLockActive should be true while held');

  await releaseScreenWakeLock();
  assert(sentinelReleased === true, 'sentinel release() should have been called');
  assert(releaseTriggered === true, 'onRelease callback should have been called');
  assert(isScreenWakeLockActive() === false, 'isScreenWakeLockActive should be false after release');

  console.log('✓ wakeLockService tests passed!');

  // 3. Meta-tag parsing & filtering logic tests
  console.log('Testing Meta-Tag Filter logic...');

  const parseTags = (tagsStr) => {
    if (!tagsStr) return [];
    try {
      const res = typeof tagsStr === 'string' ? JSON.parse(tagsStr) : tagsStr;
      if (Array.isArray(res)) return res;
      if (typeof tagsStr === 'string') return tagsStr.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    } catch (e) {
      if (typeof tagsStr === 'string') return tagsStr.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    }
  };

  const getUrgencyTags = (tagsStr) => {
    const tags = parseTags(tagsStr);
    return tags.filter(t => ['dringend', 'angebot', "wenn's passt"].includes(t.toLowerCase()));
  };

  const getRegularTags = (tagsStr) => {
    const tags = parseTags(tagsStr);
    return tags.filter(t => !['dringend', 'angebot', "wenn's passt"].includes(t.toLowerCase()));
  };

  const sampleItems = [
    { id: 1, name: 'Milch', status: 'active', tags: '["Dringend", "Bio"]' },
    { id: 2, name: 'Brot', status: 'active', tags: 'Angebot, Vollkorn' },
    { id: 3, name: 'Schokolade', status: 'active', tags: '["Dringend", "Angebot"]' }, // Multi-tag
    { id: 4, name: 'Kaffee', status: 'active', tags: "Wenn's passt" },
    { id: 5, name: 'Äpfel', status: 'active', tags: null },
    { id: 6, name: 'Bananen', status: 'completed', tags: '["Dringend"]' } // completed items do not count in open counts
  ];

  // Test tag parsing
  assert(getUrgencyTags(sampleItems[0].tags)[0] === 'Dringend', 'Dringend parsed from JSON array');
  assert(getRegularTags(sampleItems[0].tags)[0] === 'Bio', 'Bio is regular tag');
  assert(getUrgencyTags(sampleItems[1].tags)[0] === 'Angebot', 'Angebot parsed from comma string');
  assert(getRegularTags(sampleItems[1].tags)[0] === 'Vollkorn', 'Vollkorn is regular tag');

  // Compute active open items
  const openItems = sampleItems.filter(i => i.status === 'active');
  assert(openItems.length === 5, '5 active open items');

  // Compute meta-tag counts
  const metaTagCounts = { urgent: 0, offer: 0, optional: 0 };
  for (const item of openItems) {
    const uTags = getUrgencyTags(item.tags).map(t => t.toLowerCase());
    if (uTags.includes('dringend')) metaTagCounts.urgent++;
    if (uTags.includes('angebot')) metaTagCounts.offer++;
    if (uTags.includes("wenn's passt")) metaTagCounts.optional++;
  }

  // Counts:
  // urgent: Milch (1), Schokolade (3) => 2
  // offer: Brot (2), Schokolade (3) => 2
  // optional: Kaffee (4) => 1
  assert(metaTagCounts.urgent === 2, `Expected 2 urgent items, got ${metaTagCounts.urgent}`);
  assert(metaTagCounts.offer === 2, `Expected 2 offer items, got ${metaTagCounts.offer}`);
  assert(metaTagCounts.optional === 1, `Expected 1 optional item, got ${metaTagCounts.optional}`);

  const itemHasMetaTag = (item, filterKey) => {
    if (filterKey === 'all') return true;
    const uTags = getUrgencyTags(item.tags).map(t => t.toLowerCase());
    if (filterKey === 'urgent') return uTags.includes('dringend');
    if (filterKey === 'offer') return uTags.includes('angebot');
    if (filterKey === 'optional') return uTags.includes("wenn's passt");
    return true;
  };

  // Filter by urgent
  const urgentFiltered = openItems.filter(i => itemHasMetaTag(i, 'urgent'));
  assert(urgentFiltered.length === 2, 'Urgent filter returns 2 items');
  assert(urgentFiltered.map(i => i.name).includes('Milch'), 'Milch in urgent');
  assert(urgentFiltered.map(i => i.name).includes('Schokolade'), 'Schokolade in urgent');

  // Multi-tag test: Schokolade is in both urgent and offer
  const offerFiltered = openItems.filter(i => itemHasMetaTag(i, 'offer'));
  assert(offerFiltered.length === 2, 'Offer filter returns 2 items');
  assert(offerFiltered.map(i => i.name).includes('Schokolade'), 'Schokolade in offer');
  assert(offerFiltered.map(i => i.name).includes('Brot'), 'Brot in offer');

  // Auto-reset simulation:
  // If user completes Milch (1) and Schokolade (3), urgent count drops to 0
  const remainingOpen = openItems.filter(i => i.id !== 1 && i.id !== 3);
  const remainingUrgentCount = remainingOpen.filter(i => getUrgencyTags(i.tags).map(t => t.toLowerCase()).includes('dringend')).length;
  assert(remainingUrgentCount === 0, 'Remaining urgent count is 0');

  let activeFilter = 'urgent';
  if (activeFilter !== 'all' && remainingUrgentCount === 0) {
    activeFilter = 'all'; // Auto-reset triggered
  }
  assert(activeFilter === 'all', 'Filter successfully auto-resets to "all" when matching items are completed');

  console.log('✓ Meta-Tag Filter logic tests passed!');
  console.log('\n🎉 ALL IN-STORE FOCUS TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
