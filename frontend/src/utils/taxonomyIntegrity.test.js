import assert from 'node:assert';
import taxonomy from '../assets/taxonomy.json' with { type: 'json' };

console.log('Testing Schema v2 taxonomyIntegrity...');

const validCategories = new Set([
  'Obst & Gemüse',
  'Brot & Backwaren',
  'Fleisch & Fisch',
  'Milchprodukte & Tiefkühlkost',
  'Vorratskammer',
  'Getränke & Genussmittel',
  'Drogerie, Haushalt & Tierbedarf',
  'Sonstiges'
]);

const validStorage = new Set(['ambient', 'chilled', 'frozen']);
const seenIds = new Set();
const seenNames = new Set();
const aliasOwners = new Map();

for (const item of taxonomy) {
  assert(item.id && !seenIds.has(item.id), `Duplicate or missing id: ${item.id}`);
  seenIds.add(item.id);

  const lowerName = (item.name || '').trim().toLowerCase();
  assert(lowerName && !seenNames.has(lowerName), `Duplicate or missing name: ${item.name}`);
  seenNames.add(lowerName);

  assert(validCategories.has(item.category), `Invalid category on ${item.name}: ${item.category}`);
  assert(validStorage.has(item.storage), `Invalid storage on ${item.name}: ${item.storage}`);
  assert(item.defaultUnit && Array.isArray(item.allowedUnits) && item.allowedUnits.includes(item.defaultUnit), `Invalid unit setup on ${item.name}`);
  assert(!('tags' in item), `Legacy tags field should be migrated away on ${item.name}`);

  for (const a of item.aliases || []) {
    const al = a.trim().toLowerCase();
    assert(al && al !== lowerName, `Invalid/self alias '${a}' on ${item.name}`);
    assert(!aliasOwners.has(al), `Alias collision '${a}' between ${aliasOwners.get(al)} and ${item.name}`);
    aliasOwners.set(al, item.name);
  }
}

for (const item of taxonomy) {
  for (const a of item.aliases || []) {
    assert(!seenNames.has(a.trim().toLowerCase()), `Alias '${a}' on ${item.name} matches another item name`);
  }
}

console.log(`All Schema v2 taxonomyIntegrity checks PASSED (${taxonomy.length} items)!`);
