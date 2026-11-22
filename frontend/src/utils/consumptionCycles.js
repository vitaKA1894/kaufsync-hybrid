import taxonomy from '../assets/taxonomy.json' with { type: 'json' };

/**
 * Normalizes an article name and finds its canonical taxonomy entry if available.
 * If matched in taxonomy (by exact name or alias), returns the taxonomy item's ID as articleKey.
 * Otherwise returns normalized lowercase name as articleKey.
 */
export function getCanonicalArticle(name, fallbackCategory = 'Sonstiges') {
  if (!name || typeof name !== 'string') {
    return {
      articleKey: '',
      displayName: '',
      category: fallbackCategory,
      icon: null
    };
  }

  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct match on taxonomy name
  const nameMatch = taxonomy.find(
    item => item.name && item.name.toLowerCase() === lower
  );
  if (nameMatch) {
    return {
      articleKey: nameMatch.id,
      displayName: nameMatch.name,
      category: nameMatch.category || fallbackCategory,
      icon: nameMatch.icon || null
    };
  }

  // 2. Match on taxonomy aliases
  const aliasMatch = taxonomy.find(
    item => Array.isArray(item.aliases) && item.aliases.some(a => a && a.toLowerCase() === lower)
  );
  if (aliasMatch) {
    return {
      articleKey: aliasMatch.id,
      displayName: aliasMatch.name,
      category: aliasMatch.category || fallbackCategory,
      icon: aliasMatch.icon || null
    };
  }

  // 3. Fallback for custom user articles not in taxonomy
  return {
    articleKey: lower,
    displayName: trimmed,
    category: fallbackCategory,
    icon: null
  };
}

/**
 * Calculates the median of an array of numbers.
 */
export function calculateMedian(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Formats a cadence interval into human-friendly German copy.
 */
export function formatCadence(medianDays) {
  const m = Math.round(medianDays);
  if (m <= 1) return 'Täglich';
  if (m < 6) return `Alle ~${m} Tage`;
  if (m >= 6 && m <= 8) return 'Wöchentlich';
  if (m >= 12 && m <= 16) return 'Meist alle 2 Wochen';
  if (m >= 19 && m <= 23) return 'Meist alle 3 Wochen';
  if (m >= 27 && m <= 35) return 'Meist monatlich';
  if (m > 35 && m % 7 <= 2) return `Alle ~${Math.round(m / 7)} Wochen`;
  return `Alle ~${m} Tage`;
}

/**
 * Computes snooze duration in days: max(round(median_cycle_days * 0.5), 3 days).
 */
export function computeSnoozeDays(medianCycleDays) {
  const half = Math.round((medianCycleDays || 1) * 0.5);
  return Math.max(half, 3);
}

/**
 * Normalizes a Date or date string to 'YYYY-MM-DD'.
 */
export function toDateString(d) {
  if (!d) return '';
  if (typeof d === 'string') {
    return d.slice(0, 10);
  }
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
}

/**
 * Calculates interval statistical properties for an article's distinct purchase dates.
 * Returns null if thresholds or filters are not met.
 */
export function calculateArticleCycle(distinctDates, todayStr) {
  if (!Array.isArray(distinctDates)) return null;

  // Deduplicate and sort ascending
  const uniqueDates = Array.from(new Set(distinctDates.map(toDateString).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  // Minimum History Threshold: at least 3 distinct calendar days
  if (uniqueDates.length < 3) {
    return null;
  }

  // Consider up to the last 12 distinct purchase dates
  const recentDates = uniqueDates.slice(-12);

  // Compute intervals between consecutive dates
  const intervals = [];
  for (let i = 0; i < recentDates.length - 1; i++) {
    const d1 = new Date(recentDates[i] + 'T00:00:00');
    const d2 = new Date(recentDates[i + 1] + 'T00:00:00');
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    // Filter unrealistic intervals (< 1) and extreme outliers (> 180)
    if (diffDays >= 1 && diffDays <= 180) {
      intervals.push(diffDays);
    }
  }

  // Need at least 2 valid intervals
  if (intervals.length < 2) {
    return null;
  }

  const rawMedian = calculateMedian(intervals);
  const medianCycleDays = Math.max(1, rawMedian);

  const lastPurchaseDateStr = recentDates[recentDates.length - 1];
  const lastPurchaseDate = new Date(lastPurchaseDateStr + 'T00:00:00');
  const todayDate = new Date(todayStr + 'T00:00:00');

  const daysSinceLastPurchase = Math.floor((todayDate - lastPurchaseDate) / (1000 * 60 * 60 * 24));

  // Minimum lead threshold: at least 1 day since last purchase
  if (daysSinceLastPurchase < 1) {
    return null;
  }

  // Due Window: days_since_last_purchase >= median_cycle_days * 0.85
  const isDue = daysSinceLastPurchase >= medianCycleDays * 0.85;
  if (!isDue) {
    return null;
  }

  // Staleness / Seasonal Cutoff: days_since_last_purchase > max(median_cycle_days * 3, 60 days)
  const maxStaleDays = Math.max(medianCycleDays * 3, 60);
  if (daysSinceLastPurchase > maxStaleDays) {
    return null;
  }

  const urgencyScore = daysSinceLastPurchase / medianCycleDays;

  return {
    median_cycle_days: medianCycleDays,
    days_since_last_purchase: daysSinceLastPurchase,
    urgency_score: urgencyScore,
    last_purchased_at: lastPurchaseDateStr,
    cadence_text: formatCadence(medianCycleDays)
  };
}

/**
 * Computes sorted DueSuggestions for a list.
 *
 * @param {Object} options
 * @param {Array} options.purchaseEvents - Array of PurchaseEvent objects ({ article_key, display_name, category, icon, purchased_date, source_item_id })
 * @param {Array} [options.snoozes] - Array of SuggestionSnooze objects ({ article_key, snoozed_until })
 * @param {Array} [options.activeItems] - Array of active items on list ({ name, status })
 * @param {Date|string} [options.today] - Current date
 * @param {number} [options.limit] - Max suggestions to return (default 10)
 * @returns {Array} List of DueSuggestion objects sorted descending by urgency_score
 */
export function computeDueSuggestions({
  purchaseEvents = [],
  snoozes = [],
  activeItems = [],
  today = new Date(),
  limit = 10
} = {}) {
  const todayStr = toDateString(today);
  const nowMs = typeof today === 'string' ? new Date(today).getTime() : today.getTime();

  // Active items exclusion set: both canonical article_keys and lowercased names
  const activeKeysSet = new Set();
  for (const item of activeItems) {
    if (item && item.status !== 'completed') {
      const name = item.name || '';
      activeKeysSet.add(name.trim().toLowerCase());
      const canon = getCanonicalArticle(name);
      if (canon.articleKey) {
        activeKeysSet.add(canon.articleKey);
      }
    }
  }

  // Snoozed items map: article_key -> snoozed_until ms
  const activeSnoozeKeys = new Set();
  for (const snooze of snoozes) {
    if (snooze && snooze.article_key) {
      const untilMs = typeof snooze.snoozed_until === 'number'
        ? snooze.snoozed_until
        : new Date(snooze.snoozed_until).getTime();
      if (untilMs > nowMs) {
        activeSnoozeKeys.add(snooze.article_key);
      }
    }
  }

  // Group purchase events by article_key
  const grouped = new Map();
  for (const ev of purchaseEvents) {
    if (!ev) continue;
    let articleKey = ev.article_key;
    let displayName = ev.display_name || ev.item_name || '';
    let category = ev.category || 'Sonstiges';
    let icon = ev.icon || null;

    if (!articleKey && displayName) {
      const canon = getCanonicalArticle(displayName, category);
      articleKey = canon.articleKey;
      displayName = canon.displayName;
      category = canon.category;
      icon = canon.icon;
    }

    if (!articleKey) continue;

    if (!grouped.has(articleKey)) {
      grouped.set(articleKey, {
        articleKey,
        displayName: displayName || articleKey,
        category,
        icon,
        dates: []
      });
    }

    const group = grouped.get(articleKey);
    const dateStr = toDateString(ev.purchased_date || ev.created_at);
    if (dateStr) {
      group.dates.push(dateStr);
    }
    // Update most recent metadata
    if (displayName) group.displayName = displayName;
    if (category && category !== 'Sonstiges') group.category = category;
    if (icon) group.icon = icon;
  }

  const suggestions = [];

  for (const [articleKey, data] of grouped.entries()) {
    // 1. Exclude if currently open on active list
    if (activeKeysSet.has(articleKey) || activeKeysSet.has(data.displayName.toLowerCase())) {
      continue;
    }

    // 2. Exclude if snoozed
    if (activeSnoozeKeys.has(articleKey) || activeSnoozeKeys.has(data.displayName.toLowerCase())) {
      continue;
    }

    // 3. Compute cycle
    const cycle = calculateArticleCycle(data.dates, todayStr);
    if (!cycle) {
      continue;
    }

    suggestions.push({
      article_key: articleKey,
      display_name: data.displayName,
      category: data.category,
      icon: data.icon,
      median_cycle_days: cycle.median_cycle_days,
      days_since_last_purchase: cycle.days_since_last_purchase,
      urgency_score: cycle.urgency_score,
      last_purchased_at: cycle.last_purchased_at,
      cadence_text: cycle.cadence_text
    });
  }

  // Sort by urgency_score descending
  suggestions.sort((a, b) => b.urgency_score - a.urgency_score);

  return suggestions.slice(0, limit);
}
