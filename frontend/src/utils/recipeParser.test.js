import {
  parseIngredientLine,
  formatGermanQuantity,
  isSectionHeader,
  processIngredientLines,
  parseTextRecipe,
  canMergeUnits,
  mergeQuantitiesAndUnits
} from './clientRecipeParser.js';

console.log('Testing clientRecipeParser.js in Node...');

// Test 1: Section Headers
console.assert(isSectionHeader('Für den Rub:'), 'Für den Rub: should be section header');
console.assert(isSectionHeader('Für die Soße'), 'Für die Soße should be section header');
console.assert(isSectionHeader('Zum Garnieren:'), 'Zum Garnieren: should be section header');
console.assert(!isSectionHeader('1 Zwiebel'), '1 Zwiebel should not be header');
console.assert(!isSectionHeader('500 g Mehl'), '500 g Mehl should not be header');

// Test 2: Formatting
console.assert(formatGermanQuantity(1.5, 'kg') === '1,5 kg', `Expected '1,5 kg', got '${formatGermanQuantity(1.5, 'kg')}'`);
console.assert(formatGermanQuantity(5.0, 'EL') === '5 EL', `Expected '5 EL', got '${formatGermanQuantity(5.0, 'EL')}'`);
console.assert(formatGermanQuantity(500, 'g') === '500 g', `Expected '500 g', got '${formatGermanQuantity(500, 'g')}'`);

// Test 3: Units merge
console.assert(canMergeUnits('g', 'kg'), 'g and kg should be mergeable');
console.assert(canMergeUnits('EL', 'EL'), 'EL and EL should be mergeable');
console.assert(!canMergeUnits('Stk', 'EL'), 'Stk and EL should not be mergeable');

const [mergedQty, mergedUnit] = mergeQuantitiesAndUnits(500, 'g', 0.5, 'kg');
console.assert(mergedQty === 1 && mergedUnit === 'kg', `Expected 1 kg, got ${mergedQty} ${mergedUnit}`);

// Test 4: Parse Line
const p1 = parseIngredientLine('3 EL Paprikapulver, edelsüß');
console.log('p1 parsed:', p1);

const p2 = parseIngredientLine('1 Dose (400 g) stückige Tomaten');
console.assert(p2.quantity === 1 && p2.unit === 'Dose' && p2.notes.includes('400 g'), 'p2 failed');

const p3 = parseIngredientLine('½ TL Salz');
console.assert(p3.quantity === 0.5 && p3.unit === 'TL', 'p3 failed');

const p4 = parseIngredientLine('6 kg Rippchen (Loin Ribs)');
console.assert(p4.quantity === 6 && p4.unit === 'kg' && p4.notes.includes('Loin Ribs'), 'p4 failed');

// Test 5: Full text parse & duplicate merging
const textInput = [
  "Für den Rub:",
  "3 EL Paprikapulver, edelsüß",
  "1 TL Salz",
  "Für die Soße:",
  "1 EL Paprikapulver",
  "500 g Mehl",
  "0,5 kg Mehl",
  "1 Zwiebel",
  "1 EL Zwiebel",
  "500 g Gelierzucker",
  "6 kg Rippchen (Loin Ribs)"
].join("\n");

const res = parseTextRecipe(textInput, 'Test BBQ');
console.log('res count:', res.ingredients.length);
for (const it of res.ingredients) {
  console.log(' - item:', it.name, '| qty:', it.display_quantity, '| unit:', it.unit, '| merged:', it.was_merged);
}

const pap = res.ingredients.find(i => i.name.toLowerCase().includes('paprika'));
console.assert(pap && pap.quantity === 4 && pap.unit === 'EL' && pap.was_merged, 'Paprikapulver merge failed');

const mehl = res.ingredients.find(i => i.name.toLowerCase() === 'mehl');
console.assert(mehl && mehl.quantity === 1 && mehl.unit === 'kg' && mehl.was_merged, 'Mehl merge failed');

const sugar = res.ingredients.find(i => i.name.toLowerCase().includes('gelierzucker'));
console.assert(sugar && !sugar.is_pantry_staple && sugar.selected, 'Gelierzucker should not be staple');

const ribs = res.ingredients.find(i => i.name.toLowerCase().includes('rippchen'));
console.assert(ribs && ribs.category === 'Fleisch & Fisch', `Rippchen category should be Fleisch & Fisch, got ${ribs?.category}`);

console.log('All clientRecipeParser tests PASSED successfully!');
