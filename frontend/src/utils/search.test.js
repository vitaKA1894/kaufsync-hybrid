import { levenshteinDistance, searchTaxonomy, findTaxonomyItem, debounce } from './search.js';

// Setup mock for taxonomy.json since we use it directly in search.js
// We don't actually need to mock it if we are using ES modules in test, but
// we will just run this with basic node testing or vitest.

function runTests() {
    console.log("Running Levenshtein distance tests...");

    const assertEqual = (actual, expected, msg) => {
        if (actual !== expected) {
            throw new Error(`Test failed: ${msg}. Expected ${expected}, got ${actual}`);
        }
    }

    // Exact matches
    assertEqual(levenshteinDistance("test", "test"), 0, "Exact match");
    assertEqual(levenshteinDistance("", ""), 0, "Empty strings");

    // Substitutions
    assertEqual(levenshteinDistance("tomate", "tomta"), 2, "Substitution");
    assertEqual(levenshteinDistance("milch", "milhc"), 2, "Transposition");

    // Additions/Deletions
    assertEqual(levenshteinDistance("apfel", "apfe"), 1, "Deletion");
    assertEqual(levenshteinDistance("brot", "brott"), 1, "Addition");

    console.log("Levenshtein tests passed!");

    console.log("Running search algorithm tests...");

    // Threshold check (must be >= 3 chars)
    assertEqual(searchTaxonomy("").length, 0, "Query length < 1 should return 0 results");

    // Prefix match
    const milchResults = searchTaxonomy("Mil");
    if (milchResults.length === 0 || !milchResults.some(r => r.name.toLowerCase().includes("milch"))) {
         throw new Error("Search failed for prefix 'Mil'");
    }



    // Edge Cases
    assertEqual(searchTaxonomy(null).length, 0, "Null query should return 0 results");
    assertEqual(searchTaxonomy(undefined).length, 0, "Undefined query should return 0 results");
    assertEqual(searchTaxonomy("").length, 0, "Empty string query should return 0 results");



    // Case insensitivity
    const upperCaseResults = searchTaxonomy("MILCH");
    if (upperCaseResults.length === 0 || !upperCaseResults[0].name.toLowerCase().includes("milch")) {
         throw new Error("Case insensitivity search failed for 'MILCH'");
    }

    // Special characters
    assertEqual(searchTaxonomy("!!!").length, 0, "Special characters only query should return 0 results");

    // Exact alias match
    const aliasResults = searchTaxonomy("Frischhaltefolie");
    if (aliasResults.length === 0 || !(aliasResults.some(r => r.name === "Frischhaltefolie" || r.aliases.includes("Frischhaltefolie")))) {
         throw new Error("Exact alias search failed for 'Frischhaltefolie'");
    }

    // matchedAlias property injection test (only when resolved via alias)
    const matchedAliasTest = searchTaxonomy("Ültje Erdnussbutter");
    if (matchedAliasTest.length === 0 || matchedAliasTest[0].matchedAlias !== "Ültje Erdnussbutter") {
         throw new Error("matchedAlias property missing or incorrect. Expected 'Ültje Erdnussbutter', got '" + (matchedAliasTest[0] ? matchedAliasTest[0].matchedAlias : 'undefined') + "'");
    }

    // Exact/prefix name match must rank #1 and must NOT inject a random alias as tag
    const milchTop = searchTaxonomy("Milch");
    if (milchTop.length === 0 || milchTop[0].name !== "Milch" || milchTop[0].matchedAlias !== null) {
         throw new Error("Expected 'Milch' as top hit with matchedAlias=null, got: " + JSON.stringify(milchTop[0]));
    }

    // Short prefix "Ei" must rank "Eier" first instead of substring matches like Milchreis
    const eiResults = searchTaxonomy("Ei");
    if (eiResults.length === 0 || eiResults[0].name !== "Eier") {
         throw new Error("Expected 'Eier' first for query 'Ei', got: " + JSON.stringify(eiResults.map(r => r.name)));
    }

    // Umlaut-normalized ASCII queries must find umlaut articles cleanly
    const kaeseResults = searchTaxonomy("Kaese");
    if (kaeseResults.length === 0 || kaeseResults[0].name !== "Käse") {
         throw new Error("Expected 'Käse' first for ASCII query 'Kaese', got: " + JSON.stringify(kaeseResults.map(r => r.name)));
    }

    // Plant milk alias must resolve cleanly to Pflanzliche Milch without collision
    const haferResults = searchTaxonomy("Hafermilch");
    if (haferResults.length === 0 || haferResults[0].name !== "Pflanzliche Milch") {
         throw new Error("Expected 'Pflanzliche Milch' for 'Hafermilch', got: " + JSON.stringify(haferResults.map(r => r.name)));
    }

    // Direct O(1) lookup via findTaxonomyItem
    const directSpuel = findTaxonomyItem("Spülmaschinensalz");
    if (!directSpuel || directSpuel.category !== "Drogerie, Haushalt & Tierbedarf") {
         throw new Error("Expected Spülmaschinensalz in Drogerie, Haushalt & Tierbedarf");
    }
    const directAscii = findTaxonomyItem("Broetchen");
    if (!directAscii || directAscii.name !== "Brötchen") {
         throw new Error("Expected findTaxonomyItem('Broetchen') to resolve to 'Brötchen'");
    }

    console.log("Search tests passed!");

    // Basic debounce test (synchronous check is hard without proper test runner,
    // but we just verify it returns a function)
    const dbFunc = debounce(() => {}, 250);
    assertEqual(typeof dbFunc, "function", "Debounce should return a function");

    console.log("All tests passed!");
}

runTests();
