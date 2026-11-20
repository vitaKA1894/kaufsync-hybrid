// Auto-generated Icon Resolver for KaufSync
// Provides instant synchronous resolution from item name/category to verified SVG path
// Eliminates 404 trial-and-error network cascades and image reloading flicker

import taxonomy from '../assets/taxonomy.json' with { type: 'json' };

// Static index of all verified SVG icons in /public/icons/
const AVAILABLE_ICONS = [
  "Aepfel.svg",
  "Ahornsirup.svg",
  "Allgemein.svg",
  "Alufolie.svg",
  "Ananas.svg",
  "Apfelmus.svg",
  "Apfelsaft.svg",
  "Aprikosen.svg",
  "Artischocken.svg",
  "Aubergine.svg",
  "Aufschnitt.svg",
  "Avocado.svg",
  "Babynahrung.svg",
  "Backpapier.svg",
  "Backpulver.svg",
  "Badreiniger.svg",
  "Baguette.svg",
  "Balsamico.svg",
  "Bananen.svg",
  "Basilikum.svg",
  "Basmatireis.svg",
  "Batterien.svg",
  "BBQ Sauce.svg",
  "Beeren.svg",
  "Bier.svg",
  "Binden.svg",
  "Birnen.svg",
  "Blaetterteig.svg",
  "Blauschimmelkaese.svg",
  "Blumen.svg",
  "Blumenerde.svg",
  "Blumenkohl.svg",
  "Bodylotion.svg",
  "Bohnen.svg",
  "Bouillon.svg",
  "Bratensauce.svg",
  "Bratwurst.svg",
  "Brezeln.svg",
  "Briefmarken.svg",
  "Broetchen.svg",
  "Brokkoli.svg",
  "Brombeeren.svg",
  "Brot.svg",
  "Burrata.svg",
  "Butter.svg",
  "Champagner.svg",
  "Champignons.svg",
  "Cherrytomaten.svg",
  "Chicken Wings.svg",
  "Chili.svg",
  "Chinese To Go.svg",
  "Cola Light.svg",
  "Cola.svg",
  "Conditioner.svg",
  "Corn Flakes.svg",
  "Couscous.svg",
  "Creme fraiche.svg",
  "Croissant.svg",
  "Datteln.svg",
  "Deo.svg",
  "Dessert.svg",
  "Dip.svg",
  "Dosentomaten.svg",
  "Duenger.svg",
  "Duschmittel.svg",
  "Eier.svg",
  "Eis.svg",
  "Eistee.svg",
  "Energy Drink.svg",
  "Erbsen.svg",
  "Erdbeeren.svg",
  "Erdnuesse.svg",
  "Essig.svg",
  "Feigen.svg",
  "Fenchel.svg",
  "Feta.svg",
  "Feuchttuecher.svg",
  "Fisch.svg",
  "Fischfutter.svg",
  "Fischstaebchen.svg",
  "Fleisch.svg",
  "fleisch_allgemein.svg",
  "Fondue.svg",
  "Frankfurter.svg",
  "Frischhaltefolie.svg",
  "Frischkaese.svg",
  "Fruchtsaft.svg",
  "Fruechte.svg",
  "Fruehlingszwiebeln.svg",
  "Garnelen.svg",
  "Gartenwerkzeug.svg",
  "Gelee.svg",
  "Gemuese gefroren.svg",
  "Gemuese.svg",
  "Geschenk.svg",
  "Geschenkpapier.svg",
  "Geschirrglanz.svg",
  "Geschirrsalz.svg",
  "Geschirrtabs.svg",
  "Gesichtscreme.svg",
  "Getraenke.svg",
  "Getraenke_allgemein.svg",
  "Getreideriegel.svg",
  "getrocknete Tomaten.svg",
  "Gewuerzgurken.svg",
  "Giesskanne.svg",
  "Gin.svg",
  "Glasreiniger.svg",
  "Gluehbirne.svg",
  "Gnocchi.svg",
  "Gorgonzola.svg",
  "Grapefruit.svg",
  "Griess.svg",
  "Grill.svg",
  "Gurke.svg",
  "Haargel.svg",
  "Haarspray.svg",
  "Hackfleisch.svg",
  "Haehnchen.svg",
  "Haehnchenbrust.svg",
  "Haferflocken.svg",
  "Handcreme.svg",
  "Haselnuesse.svg",
  "Haushaltspapier.svg",
  "Hefe.svg",
  "Heidelbeeren.svg",
  "Himbeeren.svg",
  "Holzkohle.svg",
  "Honig.svg",
  "Huettenkaese.svg",
  "Hundefutter.svg",
  "Hundesnack.svg",
  "Indian To Go.svg",
  "Ingwer.svg",
  "Insektenschutzmittel.svg",
  "Italian To Go.svg",
  "Joghurt.svg",
  "Kaese.svg",
  "Kaffee.svg",
  "Kakao.svg",
  "Kaki.svg",
  "Kalbfleisch.svg",
  "Karotten.svg",
  "Kartoffeln.svg",
  "Kartoffelpueree.svg",
  "Katzenfutter.svg",
  "Katzensnack.svg",
  "Katzenstreu.svg",
  "Kaugummi.svg",
  "Kekse.svg",
  "Kerzen.svg",
  "Ketchup.svg",
  "Kichererbsen.svg",
  "Kirschen.svg",
  "Kiwi.svg",
  "Knaeckebrot.svg",
  "Knoblauch.svg",
  "Knoedel.svg",
  "Kohl.svg",
  "Kohlrabi.svg",
  "Kokosmilch.svg",
  "Kondome.svg",
  "Koriander.svg",
  "Kosmetiktuecher.svg",
  "Kraeuter.svg",
  "Kraeuterbutter.svg",
  "Kuchen.svg",
  "Kuerbis.svg",
  "Lachs.svg",
  "Lamm.svg",
  "Lasagne.svg",
  "Lauch.svg",
  "Lebkuchen.svg",
  "Light Limonade.svg",
  "Limette.svg",
  "Limonade.svg",
  "Linsen.svg",
  "Linsenmittel.svg",
  "Lippenbalsam.svg",
  "Mais.svg",
  "Makeup Entferner.svg",
  "Mandarinen.svg",
  "Mandelmus.svg",
  "Mandeln.svg",
  "Mango.svg",
  "Margarine.svg",
  "Marmelade.svg",
  "Mascarpone.svg",
  "Mayonnaise.svg",
  "Mehl.svg",
  "Melone.svg",
  "Mettigel.svg",
  "Milch.svg",
  "Mineralwasser.svg",
  "Mozzarella.svg",
  "Muellbeutel.svg",
  "Muesli.svg",
  "Muffins.svg",
  "Mundspuelung.svg",
  "Muscheln.svg",
  "Naegel.svg",
  "Nagellack.svg",
  "Nagellackentferner.svg",
  "Nektarine.svg",
  "Nougatcreme.svg",
  "Nudeln.svg",
  "Nuesse.svg",
  "Nutella.svg",
  "Obst.svg",
  "Oel.svg",
  "Oliven.svg",
  "Olivenoel.svg",
  "Orange.svg",
  "Orangensaft.svg",
  "Oregano.svg",
  "Paniermehl.svg",
  "Paprika.svg",
  "Paprikapulver.svg",
  "Parmesan.svg",
  "Passionsfrucht.svg",
  "Pasta Sauce.svg",
  "Penne.svg",
  "Petersilie.svg",
  "Pfefferkoerner.svg",
  "Pfefferminze.svg",
  "Pfirsich.svg",
  "Pflanzen.svg",
  "Pflaster.svg",
  "Pflaumen.svg",
  "Pilze.svg",
  "Pinienkerne.svg",
  "Pinsel.svg",
  "Pizza.svg",
  "Pizzateig.svg",
  "Pommes Chips.svg",
  "Pommes Frites.svg",
  "Pop Corn.svg",
  "Preiselbeer Sauce.svg",
  "Propangas.svg",
  "Prosecco.svg",
  "Pudding.svg",
  "Puderzucker.svg",
  "Putzmittel.svg",
  "Quark.svg",
  "Raclette.svg",
  "Radieschen.svg",
  "Rasenmaeher.svg",
  "Rasierer.svg",
  "Rasierklingen.svg",
  "Rasierschaum.svg",
  "Reibkaese.svg",
  "Reis.svg",
  "Rhabarber.svg",
  "Ricotta.svg",
  "Rindergeschnetzeltes.svg",
  "Rindfleisch.svg",
  "Risottoreis.svg",
  "Roemersalat.svg",
  "Rohschinken.svg",
  "Rosmarin.svg",
  "Rote Bete.svg",
  "Rotwein.svg",
  "Rucola.svg",
  "Rum.svg",
  "Sahne.svg",
  "Salami.svg",
  "Salat.svg",
  "Salatsauce.svg",
  "Salbei.svg",
  "Salz.svg",
  "Salzstangen.svg",
  "Samen.svg",
  "Sardellen.svg",
  "Saure Sahne.svg",
  "Schinken.svg",
  "Schmerzmittel.svg",
  "Schnaps.svg",
  "Schnittlauch.svg",
  "Schnitzel.svg",
  "Schokolade.svg",
  "Schrauben.svg",
  "Schwamm.svg",
  "Schweinefleisch.svg",
  "Seife.svg",
  "Sellerie.svg",
  "Senf.svg",
  "Servietten.svg",
  "Shampoo.svg",
  "Silberzwiebeln.svg",
  "Sirup.svg",
  "Smoothie.svg",
  "Snacks.svg",
  "snacks_allgemein.svg",
  "Sonnencreme.svg",
  "Sonnenschirm.svg",
  "Soya Milch.svg",
  "Soyasauce.svg",
  "Spaghetti.svg",
  "Spargel.svg",
  "Speck.svg",
  "Speisestaerke.svg",
  "Spinat.svg",
  "Sportgetraenk.svg",
  "Spuelmittel.svg",
  "Steak.svg",
  "Streichhoelzer.svg",
  "Strohhalme.svg",
  "Suessigkeiten.svg",
  "Suesskartoffeln.svg",
  "Suppe.svg",
  "Tampons.svg",
  "Taschentuecher.svg",
  "Tee.svg",
  "Thai To Go.svg",
  "Thunfisch.svg",
  "Thymian.svg",
  "Toast.svg",
  "Toepfe.svg",
  "Tofu.svg",
  "Tomaten.svg",
  "Tomatenmark.svg",
  "Tomatensauce.svg",
  "Tonic Water.svg",
  "Torte.svg",
  "Tortilla Chips.svg",
  "Trauben.svg",
  "Trockenobst.svg",
  "Vanille Sauce.svg",
  "Vanillezucker.svg",
  "Vitamine.svg",
  "Vodka.svg",
  "Vogelfutter.svg",
  "Waffeln.svg",
  "Walnuesse.svg",
  "Waschmittel.svg",
  "Wasser.svg",
  "Wassermelone.svg",
  "Wattepads.svg",
  "Wattestaebchen.svg",
  "WC Reiniger.svg",
  "Weichspueler.svg",
  "Weisswein.svg",
  "Whisky.svg",
  "Windeln.svg",
  "Wurst.svg",
  "Zahnbuersten.svg",
  "Zahnpasta.svg",
  "Zahnseide.svg",
  "Zahnstocher.svg",
  "Zigaretten.svg",
  "Zimt.svg",
  "Zitrone.svg",
  "Zucchini.svg",
  "Zucker.svg",
  "Zwiebeln.svg"
];

const AVAILABLE_LETTERS = new Set(["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"]);

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

  const cacheKey = `${trimmed.toLowerCase()}|${category ? category.toLowerCase() : ''}`;
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
  const words = lower.split(/[\s,./-]+/);
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
