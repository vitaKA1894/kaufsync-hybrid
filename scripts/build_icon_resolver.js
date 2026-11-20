const fs = require('fs');
const path = require('path');

const publicIconsDir = path.join(__dirname, '..', 'frontend', 'public', 'icons');
const letterIconsDir = path.join(publicIconsDir, 'letters');

const files = fs.readdirSync(publicIconsDir).filter(f => f.endsWith('.svg'));
const letterFiles = fs.readdirSync(letterIconsDir).filter(f => f.endsWith('.svg'));

const content = `// Auto-generated Icon Resolver for KaufSync
// Provides instant synchronous resolution from item name/category to verified SVG path
// Eliminates 404 trial-and-error network cascades and image reloading flicker

import taxonomy from '../assets/taxonomy.json' with { type: 'json' };

// Static index of all verified SVG icons in /public/icons/
const AVAILABLE_ICONS = ${JSON.stringify(files, null, 2)};

const AVAILABLE_LETTERS = new Set(${JSON.stringify(letterFiles.map(f => f.replace('.svg', '').toLowerCase()))});

// Pre-indexed Map: lowercase & normalized icon name -> exact filename
const iconMap = new Map();
AVAILABLE_ICONS.forEach(file => {
  const base = file.replace('.svg', '');
  iconMap.set(base.toLowerCase(), file);
  const norm = normalizeUmlauts(base);
  if (!iconMap.has(norm)) {
    iconMap.set(norm, file);
  }
});

// Pre-indexed Map for taxonomy lookup (name and aliases)
const taxLookup = new Map();
taxonomy.forEach(entry => {
  if (entry.name) {
    taxLookup.set(entry.name.toLowerCase(), entry);
    const norm = normalizeUmlauts(entry.name);
    if (!taxLookup.has(norm)) taxLookup.set(norm, entry);
  }
  if (Array.isArray(entry.aliases)) {
    entry.aliases.forEach(alias => {
      taxLookup.set(alias.toLowerCase(), entry);
      const norm = normalizeUmlauts(alias);
      if (!taxLookup.has(norm)) taxLookup.set(norm, entry);
    });
  }
});

export function normalizeUmlauts(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/é/g, 'e').replace(/è/g, 'e');
}

// In-memory cache for ultra-fast repeated lookups
const resolveCache = new Map();

/**
 * Synchronously resolves any item name to a verified, guaranteed-to-exist SVG URL.
 * @param {string} name - Item name or query
 * @param {string} [category] - Optional category for fallback
 * @returns {string} - Absolute path to SVG (e.g. '/icons/Paprika.svg' or '/icons/letters/p.svg')
 */
export function resolveItemIcon(name, category = '') {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  const cacheKey = \`\${trimmed.toLowerCase()}|\${category ? category.toLowerCase() : ''}\`;
  if (resolveCache.has(cacheKey)) {
    return resolveCache.get(cacheKey);
  }

  const result = _doResolve(trimmed, category);
  resolveCache.set(cacheKey, result);
  return result;
}

function _doResolve(rawName, category) {
  const lower = rawName.toLowerCase();

  // 1. Exact match with available icon file
  if (iconMap.has(lower)) {
    return '/icons/' + iconMap.get(lower);
  }

  // 2. Normalized umlaut match
  const norm = normalizeUmlauts(rawName);
  if (iconMap.has(norm)) {
    return '/icons/' + iconMap.get(norm);
  }

  // 3. Taxonomy match by name or alias
  const taxEntry = taxLookup.get(lower) || taxLookup.get(norm);
  if (taxEntry) {
    if (taxEntry.icon) {
      const lowerIcon = taxEntry.icon.toLowerCase();
      if (iconMap.has(lowerIcon)) return '/icons/' + iconMap.get(lowerIcon);
      const normIcon = normalizeUmlauts(taxEntry.icon);
      if (iconMap.has(normIcon)) return '/icons/' + iconMap.get(normIcon);
    }
    if (taxEntry.name) {
      const lowerTaxName = taxEntry.name.toLowerCase();
      if (iconMap.has(lowerTaxName)) return '/icons/' + iconMap.get(lowerTaxName);
      const normTaxName = normalizeUmlauts(taxEntry.name);
      if (iconMap.has(normTaxName)) return '/icons/' + iconMap.get(normTaxName);
    }
  }

  // 4. Word-level match (e.g. 'Wasser Medium' -> 'Wasser', 'TK Erbsen' -> 'Erbsen')
  const words = lower.split(/[\\s,./-]+/);
  for (const w of words) {
    if (w.length >= 3 && iconMap.has(w)) {
      return '/icons/' + iconMap.get(w);
    }
    const nw = normalizeUmlauts(w);
    if (nw.length >= 3 && iconMap.has(nw)) {
      return '/icons/' + iconMap.get(nw);
    }
  }

  // 5. Prefix/substring match against known icons
  for (const [key, file] of iconMap.entries()) {
    if (key.length >= 4 && (lower.startsWith(key) || key.startsWith(lower))) {
      return '/icons/' + file;
    }
  }

  // 6. Letter fallback (/icons/letters/{letter}.svg)
  const firstChar = norm.charAt(0);
  if (AVAILABLE_LETTERS.has(firstChar)) {
    return '/icons/letters/' + firstChar + '.svg';
  }

  return '';
}

export function isLetterIcon(src) {
  return typeof src === 'string' && src.includes('/icons/letters/');
}
`;

const targetPath = path.join(__dirname, '..', 'frontend', 'src', 'utils', 'iconResolver.js');
fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully wrote to:', targetPath);
