// Debounce function
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Levenshtein distance algorithm
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

import taxonomy from '../assets/taxonomy.json' with { type: 'json' };
import Fuse from 'fuse.js';

/**
 * Normalizes German umlauts, diacritics, and case for forgiving search matching
 * (e.g. "Kaese" <-> "Käse", "Broetchen" <-> "Brötchen", "Creme" <-> "Crème").
 */
export function normalizeSearchText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[éèê]/g, 'e')
    .replace(/[áàâ]/g, 'a')
    .replace(/[óòô]/g, 'o')
    .replace(/[úùû]/g, 'u');
}

const byId = new Map();
const byLowerName = new Map();
const byNormName = new Map();
const byLowerAlias = new Map();
const byNormAlias = new Map();

const indexedTaxonomy = taxonomy.map(item => {
  const name = item.name || '';
  const lowerName = name.toLowerCase().trim();
  const normName = normalizeSearchText(name);
  const aliases = Array.isArray(item.aliases) ? item.aliases.filter(Boolean) : [];
  const normAliases = aliases.map(a => normalizeSearchText(a));

  if (item.id) byId.set(item.id, item);
  if (lowerName) byLowerName.set(lowerName, item);
  if (normName && !byNormName.has(normName)) byNormName.set(normName, item);

  aliases.forEach((alias, idx) => {
    const la = alias.toLowerCase().trim();
    const na = normAliases[idx];
    if (la && !byLowerAlias.has(la)) byLowerAlias.set(la, { item, alias });
    if (na && !byNormAlias.has(na)) byNormAlias.set(na, { item, alias });
  });

  return {
    item,
    name,
    _normName: normName,
    aliases,
    _normAliases: normAliases
  };
});

const fuseOptions = {
  keys: [
    { name: 'name', weight: 0.45 },
    { name: '_normName', weight: 0.3 },
    { name: 'aliases', weight: 0.15 },
    { name: '_normAliases', weight: 0.1 }
  ],
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
  includeScore: true
};

const fuse = new Fuse(indexedTaxonomy, fuseOptions);

/**
 * Direct O(1) lookup for a taxonomy item by id, exact name, normalized name, or alias.
 * Returns the original item (with optional matchedAlias when resolved via alias) or null.
 */
export function findTaxonomyItem(nameOrId) {
  if (!nameOrId || typeof nameOrId !== 'string') return null;
  const trimmed = nameOrId.trim();
  if (!trimmed) return null;

  if (byId.has(trimmed)) return byId.get(trimmed);

  const lower = trimmed.toLowerCase();
  if (byLowerName.has(lower)) return byLowerName.get(lower);

  const norm = normalizeSearchText(trimmed);
  if (byNormName.has(norm)) return byNormName.get(norm);

  if (byLowerAlias.has(lower)) {
    const { item, alias } = byLowerAlias.get(lower);
    return { ...item, matchedAlias: alias };
  }
  if (byNormAlias.has(norm)) {
    const { item, alias } = byNormAlias.get(norm);
    return { ...item, matchedAlias: alias };
  }

  return null;
}

export function searchTaxonomy(query, limit = 12) {
  if (!query || typeof query !== 'string') return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const lower = trimmed.toLowerCase();
  const norm = normalizeSearchText(trimmed);
  // Ignore pure punctuation queries (preserve existing behavior)
  if (!/[a-z0-9äöüß]/i.test(lower)) return [];

  // key -> { item, tier, score, matchedAlias }
  const ranked = new Map();

  const upsert = (item, tier, score, matchedAlias = null) => {
    const key = item.id || item.name;
    const prev = ranked.get(key);
    if (!prev || tier < prev.tier || (tier === prev.tier && score < prev.score)) {
      ranked.set(key, {
        item,
        tier,
        score,
        matchedAlias: tier <= 2 ? null : matchedAlias
      });
    } else if (tier <= 2 && prev.matchedAlias !== null) {
      // Name-based match takes precedence over alias tag injection
      prev.matchedAlias = null;
    }
  };

  // 1. Deterministic Exact, Prefix, and Word-Prefix matches on name & aliases
  for (const entry of indexedTaxonomy) {
    const { item, name, _normName, aliases, _normAliases } = entry;
    const lowerName = name.toLowerCase();

    if (lowerName === lower || _normName === norm) {
      upsert(item, 0, 0, null);
      continue;
    }

    if (lowerName.startsWith(lower) || _normName.startsWith(norm)) {
      upsert(item, 1, lowerName.length - lower.length, null);
      continue;
    }

    const nameWords = lowerName.split(/[\s\-\/]+/);
    const normWords = _normName.split(/[\s\-\/]+/);
    if (nameWords.some(w => w.startsWith(lower)) || normWords.some(w => w.startsWith(norm))) {
      upsert(item, 2, lowerName.length, null);
      continue;
    }

    for (let i = 0; i < aliases.length; i++) {
      const alias = aliases[i];
      const la = alias.toLowerCase();
      const na = _normAliases[i];
      if (la === lower || na === norm) {
        upsert(item, 3, 0, alias);
        break;
      }
      if (la.startsWith(lower) || na.startsWith(norm)) {
        upsert(item, 4, la.length - lower.length, alias);
        break;
      }
    }
  }

  // 2. Fuzzy / substring fallback via Fuse.js (searches both raw and umlaut-normalized query)
  const fuseHits = [...fuse.search(trimmed)];
  if (norm !== lower) {
    fuseHits.push(...fuse.search(norm));
  }

  for (const hit of fuseHits) {
    const { item, aliases } = hit.item;
    const matches = hit.matches || [];
    const matchedOnName = matches.some(m => m.key === 'name' || m.key === '_normName');

    let matchedAlias = null;
    if (!matchedOnName) {
      const aliasMatch = matches.find(m => m.key === 'aliases' || m.key === '_normAliases');
      if (aliasMatch) {
        if (aliasMatch.key === '_normAliases' && typeof aliasMatch.refIndex === 'number') {
          matchedAlias = aliases[aliasMatch.refIndex] || null;
        } else {
          matchedAlias = aliasMatch.value || null;
        }
      }
    }

    upsert(item, 5, hit.score ?? 0.5, matchedAlias);
  }

  return Array.from(ranked.values())
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (Math.abs(a.score - b.score) > 1e-6) return a.score - b.score;
      const lenDiff = (a.item.name?.length || 0) - (b.item.name?.length || 0);
      if (lenDiff !== 0) return lenDiff;
      return (a.item.name || '').localeCompare(b.item.name || '', 'de');
    })
    .slice(0, limit)
    .map(entry => ({ ...entry.item, matchedAlias: entry.matchedAlias }));
}
