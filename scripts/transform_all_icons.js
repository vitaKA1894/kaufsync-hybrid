const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '../frontend/public/icons');

// Comprehensive color database for all 355 icons
const iconColorMap = {
  // === ROTE FRÜCHTE & GEMÜSE ===
  'Aepfel': { main: '#FF334B', glow: '#FF334B', leaf: '#22C55E', stem: '#B45309' },
  'Tomaten': { main: '#FF3B30', glow: '#FF3B30', leaf: '#22C55E', stem: '#22C55E' },
  'Cherrytomaten': { main: '#FF3B30', glow: '#FF3B30', leaf: '#22C55E', stem: '#22C55E' },
  'getrocknete Tomaten': { main: '#DC2626', glow: '#DC2626', leaf: '#22C55E' },
  'Dosentomaten': { main: '#EF4444', glow: '#EF4444', accent: '#F8FAFC' },
  'Tomatenmark': { main: '#EF4444', glow: '#EF4444', accent: '#F8FAFC' },
  'Tomatensauce': { main: '#EF4444', glow: '#EF4444', accent: '#F8FAFC' },
  'Ketchup': { main: '#EF4444', glow: '#EF4444', accent: '#F8FAFC' },
  'Chili': { main: '#EF4444', glow: '#EF4444', leaf: '#22C55E' },
  'Erdbeeren': { main: '#FF334B', glow: '#FF334B', leaf: '#22C55E', dots: '#FDE047' },
  'Himbeeren': { main: '#F43F5E', glow: '#F43F5E', leaf: '#22C55E' },
  'Kirschen': { main: '#E11D48', glow: '#E11D48', stem: '#15803D' },
  'Radieschen': { main: '#F43F5E', glow: '#F43F5E', leaf: '#22C55E' },
  'Rote Bete': { main: '#BE123C', glow: '#BE123C', leaf: '#22C55E' },
  'Paprika': { main: '#EF4444', glow: '#EF4444', leaf: '#22C55E' },
  'Paprikapulver': { main: '#EF4444', glow: '#EF4444', accent: '#F59E0B' },
  'Preiselbeer Sauce': { main: '#BE123C', glow: '#BE123C', accent: '#F8FAFC' },
  'Rhabarber': { main: '#F43F5E', glow: '#F43F5E', leaf: '#22C55E' },
  'Granatapfel': { main: '#E11D48', glow: '#E11D48', leaf: '#22C55E' },

  // === ORANGE / ZITRUS / KÜRBIS ===
  'Karotten': { main: '#FF6B00', glow: '#FF6B00', leaf: '#22C55E' },
  'Orange': { main: '#FB923C', glow: '#FB923C', leaf: '#22C55E' },
  'Orangensaft': { main: '#FB923C', glow: '#FB923C', accent: '#FDE047' },
  'Mandarinen': { main: '#FB923C', glow: '#FB923C', leaf: '#22C55E' },
  'Grapefruit': { main: '#F43F5E', glow: '#F43F5E', leaf: '#22C55E' },
  'Kaki': { main: '#FB923C', glow: '#FB923C', leaf: '#22C55E' },
  'Aprikosen': { main: '#FB923C', glow: '#FB923C', pit: '#78350F' },
  'Pfirsich': { main: '#FB923C', glow: '#FB923C', leaf: '#22C55E' },
  'Nektarine': { main: '#F97316', glow: '#F97316', leaf: '#22C55E' },
  'Mango': { main: '#F59E0B', glow: '#F59E0B', leaf: '#22C55E' },
  'Kuerbis': { main: '#F97316', glow: '#F97316', stem: '#65A30D' },
  'Suesskartoffeln': { main: '#EA580C', glow: '#EA580C' },
  'Melone': { main: '#F59E0B', glow: '#F59E0B', leaf: '#22C55E' },
  'Wassermelone': { main: '#EF4444', glow: '#EF4444', rind: '#22C55E', seeds: '#000000' },
  'Passionsfrucht': { main: '#A855F7', glow: '#A855F7', seed: '#F59E0B' },

  // === GELBE FRÜCHTE & MAIS ===
  'Bananen': { main: '#FACC15', glow: '#FACC15', tip: '#A16207', crown: '#84CC16' },
  'Zitrone': { main: '#FACC15', glow: '#FACC15', leaf: '#22C55E' },
  'Ananas': { main: '#FACC15', glow: '#FACC15', crown: '#22C55E' },
  'Mais': { main: '#FACC15', glow: '#FACC15', husk: '#22C55E' },
  'Birnen': { main: '#A3E635', glow: '#A3E635', stem: '#78350F', leaf: '#22C55E' },

  // === GRÜNES GEMÜSE, KRÄUTER & SALAT ===
  'Brokkoli': { main: '#10B981', glow: '#10B981', stalk: '#34D399' },
  'Gurke': { main: '#22C55E', glow: '#22C55E' },
  'Zucchini': { main: '#16A34A', glow: '#16A34A', stem: '#86EFAC' },
  'Avocado': { main: '#22C55E', glow: '#22C55E', pit: '#D97706', rim: '#84CC16' },
  'Salat': { main: '#22C55E', glow: '#22C55E' },
  'Roemersalat': { main: '#22C55E', glow: '#22C55E' },
  'Rucola': { main: '#16A34A', glow: '#16A34A' },
  'Spinat': { main: '#16A34A', glow: '#16A34A' },
  'Spargel': { main: '#86EFAC', glow: '#86EFAC', tip: '#22C55E' },
  'Sellerie': { main: '#22C55E', glow: '#22C55E' },
  'Kohl': { main: '#22C55E', glow: '#22C55E' },
  'Kohlrabi': { main: '#4ADE80', glow: '#4ADE80', leaf: '#22C55E' },
  'Fenchel': { main: '#86EFAC', glow: '#86EFAC', greens: '#22C55E' },
  'Erbsen': { main: '#22C55E', glow: '#22C55E' },
  'Bohnen': { main: '#22C55E', glow: '#22C55E' },
  'Artischocken': { main: '#15803D', glow: '#15803D' },
  'Blumenkohl': { main: '#F8FAFC', glow: '#34D399', leaves: '#22C55E' },
  'Lauch': { main: '#22C55E', glow: '#22C55E', root: '#F8FAFC' },
  'Fruehlingszwiebeln': { main: '#22C55E', glow: '#22C55E', bulb: '#F8FAFC' },
  'Kiwi': { main: '#84CC16', glow: '#84CC16', skin: '#78350F' },
  'Limette': { main: '#84CC16', glow: '#84CC16' },
  'Oliven': { main: '#65A30D', glow: '#65A30D' },
  'Olivenoel': { main: '#84CC16', glow: '#84CC16', bottle: '#F8FAFC' },
  'Basilikum': { main: '#22C55E', glow: '#22C55E' },
  'Petersilie': { main: '#22C55E', glow: '#22C55E' },
  'Schnittlauch': { main: '#22C55E', glow: '#22C55E' },
  'Koriander': { main: '#22C55E', glow: '#22C55E' },
  'Rosmarin': { main: '#16A34A', glow: '#16A34A', stem: '#78350F' },
  'Thymian': { main: '#16A34A', glow: '#16A34A' },
  'Salbei': { main: '#4ADE80', glow: '#4ADE80' },
  'Pfefferminze': { main: '#10B981', glow: '#10B981' },
  'Oregano': { main: '#22C55E', glow: '#22C55E' },
  'Kraeuter': { main: '#22C55E', glow: '#22C55E' },
  'Kraeuterbutter': { main: '#FDE047', glow: '#FDE047', specks: '#22C55E' },
  'Pflanzen': { main: '#22C55E', glow: '#22C55E', pot: '#D97706' },
  'Blumen': { main: '#EC4899', glow: '#EC4899', stem: '#22C55E' },
  'Blumenerde': { main: '#78350F', glow: '#78350F', leaf: '#22C55E' },
  'Duenger': { main: '#10B981', glow: '#10B981' },
  'Samen': { main: '#F59E0B', glow: '#F59E0B', sprout: '#22C55E' },
  'Giesskanne': { main: '#06B6D4', glow: '#06B6D4' },
  'Rasenmaeher': { main: '#10B981', glow: '#10B981', wheel: '#F8FAFC' },

  // === DUNKLE FRÜCHTE & BEEREN ===
  'Brombeeren': { main: '#A855F7', glow: '#A855F7', leaf: '#22C55E' },
  'Heidelbeeren': { main: '#6366F1', glow: '#6366F1', leaf: '#22C55E' },
  'Beeren': { main: '#EC4899', glow: '#EC4899', berry2: '#6366F1' },
  'Trauben': { main: '#A855F7', glow: '#A855F7', stem: '#65A30D' },
  'Pflaumen': { main: '#8B5CF6', glow: '#8B5CF6', leaf: '#22C55E' },
  'Feigen': { main: '#A855F7', glow: '#A855F7', leaf: '#22C55E' },
  'Aubergine': { main: '#9333EA', glow: '#9333EA', calyx: '#22C55E' },
  'Datteln': { main: '#92400E', glow: '#92400E' },
  'Trockenobst': { main: '#D97706', glow: '#D97706' },
  'Balsamico': { main: '#6B21A8', glow: '#6B21A8', label: '#F8FAFC' },
  'Gelee': { main: '#F43F5E', glow: '#F43F5E', lid: '#F8FAFC' },
  'Marmelade': { main: '#EF4444', glow: '#EF4444', lid: '#F8FAFC' },

  // === KARTOFFELN, ZWIEBELN, KNOBLAUCH, PILZE ===
  'Kartoffeln': { main: '#D97706', glow: '#D97706' },
  'Kartoffelpueree': { main: '#FDE047', glow: '#FDE047', butter: '#F59E0B' },
  'Gnocchi': { main: '#FBBF24', glow: '#FBBF24' },
  'Knoedel': { main: '#FBBF24', glow: '#FBBF24' },
  'Zwiebeln': { main: '#D97706', glow: '#D97706', tip: '#22C55E' },
  'Silberzwiebeln': { main: '#F8FAFC', glow: '#38BDF8' },
  'Knoblauch': { main: '#F8FAFC', glow: '#F59E0B', cloves: '#FDE68A' },
  'Ingwer': { main: '#D97706', glow: '#D97706' },
  'Champignons': { main: '#F8FAFC', glow: '#F59E0B', stem: '#E2E8F0' },
  'Pilze': { main: '#D97706', glow: '#D97706', cap: '#B45309' },

  // === BROT & BACKWAREN ===
  'Brot': { main: '#F59E0B', glow: '#F59E0B', cuts: '#FDE68A' },
  'Baguette': { main: '#F59E0B', glow: '#F59E0B', cuts: '#FDE68A' },
  'Broetchen': { main: '#F59E0B', glow: '#F59E0B', cuts: '#FDE68A' },
  'Brezeln': { main: '#D97706', glow: '#D97706', salt: '#F8FAFC' },
  'Croissant': { main: '#F59E0B', glow: '#F59E0B', folds: '#FDE047' },
  'Toast': { main: '#FBBF24', glow: '#FBBF24', crust: '#D97706' },
  'Knaeckebrot': { main: '#D97706', glow: '#D97706', holes: '#F59E0B' },
  'Blaetterteig': { main: '#FDE68A', glow: '#F59E0B' },
  'Pizzateig': { main: '#FBBF24', glow: '#FBBF24', pin: '#D97706' },
  'Hefe': { main: '#FDE68A', glow: '#F59E0B' },
  'Backpulver': { main: '#F8FAFC', glow: '#F59E0B', sachet: '#F59E0B' },
  'Backpapier': { main: '#F59E0B', glow: '#F59E0B', roll: '#E2E8F0' },
  'Kuchen': { main: '#F59E0B', glow: '#F59E0B', icing: '#EC4899' },
  'Torte': { main: '#EC4899', glow: '#EC4899', candle: '#FACC15' },
  'Muffins': { main: '#F59E0B', glow: '#F59E0B', cup: '#60A5FA' },
  'Waffeln': { main: '#F59E0B', glow: '#F59E0B', grid: '#D97706' },
  'Kekse': { main: '#D97706', glow: '#D97706', chips: '#78350F' },
  'Lebkuchen': { main: '#78350F', glow: '#D97706', icing: '#F8FAFC' },

  // === FLEISCH & GEFLÜGEL ===
  'Steak': { main: '#FF334B', glow: '#FF334B', bone: '#F8FAFC', lines: '#FCA5A5' },
  'Fleisch': { main: '#EF4444', glow: '#EF4444', cleaver: '#F8FAFC' },
  'fleisch_allgemein': { main: '#EF4444', glow: '#EF4444', cleaver: '#F8FAFC' },
  'Rindfleisch': { main: '#EF4444', glow: '#EF4444', badge: '#B91C1C' },
  'Kalbfleisch': { main: '#F43F5E', glow: '#F43F5E', badge: '#E11D48' },
  'Schweinefleisch': { main: '#FB7185', glow: '#FB7185', snout: '#F43F5E' },
  'Lamm': { main: '#EF4444', glow: '#EF4444', bone: '#F8FAFC' },
  'Hackfleisch': { main: '#EF4444', glow: '#EF4444' },
  'Rindergeschnetzeltes': { main: '#EF4444', glow: '#EF4444', pan: '#94A3B8' },
  'Schnitzel': { main: '#F59E0B', glow: '#F59E0B', lemon: '#FACC15' },
  'Bratwurst': { main: '#EA580C', glow: '#EA580C', grill: '#F97316' },
  'Frankfurter': { main: '#F97316', glow: '#F97316' },
  'Wurst': { main: '#EA580C', glow: '#EA580C' },
  'Salami': { main: '#DC2626', glow: '#DC2626', specks: '#F8FAFC' },
  'Schinken': { main: '#FB7185', glow: '#FB7185', border: '#F43F5E' },
  'Rohschinken': { main: '#BE123C', glow: '#BE123C', bone: '#F8FAFC' },
  'Speck': { main: '#EF4444', glow: '#EF4444', fat: '#FEE2E2' },
  'Aufschnitt': { main: '#F43F5E', glow: '#F43F5E' },
  'Mettigel': { main: '#EF4444', glow: '#EF4444', onion: '#F8FAFC' },
  'Haehnchen': { main: '#F59E0B', glow: '#F59E0B', bone: '#F8FAFC' },
  'Haehnchenbrust': { main: '#FB923C', glow: '#FB923C' },
  'Chicken Wings': { main: '#F59E0B', glow: '#F59E0B', bone: '#F8FAFC' },

  // === FISCH & MEERESFRÜCHTE ===
  'Fisch': { main: '#38BDF8', glow: '#38BDF8', eye: '#F8FAFC' },
  'Lachs': { main: '#FB7185', glow: '#FB7185', bone: '#F8FAFC', stripes: '#F43F5E' },
  'Thunfisch': { main: '#38BDF8', glow: '#38BDF8', can: '#94A3B8' },
  'Garnelen': { main: '#FB7185', glow: '#FB7185', tail: '#F43F5E' },
  'Muscheln': { main: '#38BDF8', glow: '#38BDF8', shell: '#60A5FA' },
  'Sardellen': { main: '#60A5FA', glow: '#60A5FA' },
  'Fischstaebchen': { main: '#F59E0B', glow: '#F59E0B' },

  // === MILCHPRODUKTE & KÄSE ===
  'Milch': { main: '#38BDF8', glow: '#38BDF8', carton: '#F8FAFC' },
  'Butter': { main: '#FDE047', glow: '#FDE047', curl: '#FACC15' },
  'Margarine': { main: '#FACC15', glow: '#FACC15', tub: '#F8FAFC' },
  'Sahne': { main: '#F8FAFC', glow: '#38BDF8', swirl: '#38BDF8' },
  'Saure Sahne': { main: '#F8FAFC', glow: '#38BDF8' },
  'Creme fraiche': { main: '#F8FAFC', glow: '#38BDF8' },
  'Joghurt': { main: '#F8FAFC', glow: '#EC4899', spoon: '#94A3B8' },
  'Quark': { main: '#F8FAFC', glow: '#38BDF8' },
  'Mascarpone': { main: '#F8FAFC', glow: '#F59E0B' },
  'Ricotta': { main: '#F8FAFC', glow: '#38BDF8' },
  'Frischkaese': { main: '#F8FAFC', glow: '#22C55E' },
  'Huettenkaese': { main: '#F8FAFC', glow: '#38BDF8' },
  'Soya Milch': { main: '#86EFAC', glow: '#86EFAC', carton: '#F8FAFC' },
  'Kokosmilch': { main: '#F8FAFC', glow: '#84CC16', coconut: '#78350F' },
  'Kaese': { main: '#FBBF24', glow: '#FBBF24', holes: '#F59E0B' },
  'Reibkaese': { main: '#FBBF24', glow: '#FBBF24' },
  'Blauschimmelkaese': { main: '#FBBF24', glow: '#38BDF8', mold: '#38BDF8' },
  'Burrata': { main: '#F8FAFC', glow: '#22C55E', tie: '#16A34A' },
  'Mozzarella': { main: '#F8FAFC', glow: '#22C55E', basil: '#22C55E' },
  'Parmesan': { main: '#FBBF24', glow: '#FBBF24' },
  'Feta': { main: '#F8FAFC', glow: '#22C55E', olive: '#65A30D' },
  'Gorgonzola': { main: '#FBBF24', glow: '#38BDF8', veins: '#38BDF8' },
  'Raclette': { main: '#FBBF24', glow: '#FBBF24', pan: '#94A3B8' },
  'Fondue': { main: '#FBBF24', glow: '#FBBF24', caquelon: '#EF4444' },
  'Eier': { main: '#FB923C', glow: '#FB923C', egg2: '#FDBA74' },

  // === GETRÄNKE & GENUSSMITTEL ===
  'Kaffee': { main: '#F59E0B', glow: '#F59E0B', cup: '#F8FAFC', bean: '#78350F' },
  'Kakao': { main: '#78350F', glow: '#F59E0B', cup: '#F8FAFC', steam: '#FDE047' },
  'Tee': { main: '#10B981', glow: '#10B981', tag: '#FACC15', steam: '#34D399' },
  'Eistee': { main: '#F59E0B', glow: '#F59E0B', lemon: '#FACC15', straw: '#EF4444' },
  'Wasser': { main: '#38BDF8', glow: '#38BDF8', drop: '#60A5FA' },
  'Mineralwasser': { main: '#38BDF8', glow: '#38BDF8', bubbles: '#93C5FD' },
  'Bier': { main: '#FBBF24', glow: '#FBBF24', foam: '#FFFFFF' },
  'Rotwein': { main: '#E11D48', glow: '#E11D48', bottle: '#991B1B' },
  'Weisswein': { main: '#FDE047', glow: '#FDE047', glass: '#F8FAFC' },
  'Prosecco': { main: '#FACC15', glow: '#FACC15', bubbles: '#FFFFFF' },
  'Champagner': { main: '#FACC15', glow: '#FACC15', bubbles: '#FFFFFF', cork: '#D97706' },
  'Cola': { main: '#EF4444', glow: '#EF4444', can: '#DC2626' },
  'Cola Light': { main: '#94A3B8', glow: '#94A3B8', red: '#EF4444' },
  'Limonade': { main: '#FACC15', glow: '#FACC15', glass: '#F8FAFC' },
  'Light Limonade': { main: '#FACC15', glow: '#38BDF8' },
  'Tonic Water': { main: '#38BDF8', glow: '#38BDF8', bottle: '#F8FAFC' },
  'Energy Drink': { main: '#38BDF8', glow: '#38BDF8', bolt: '#FACC15' },
  'Sportgetraenk': { main: '#06B6D4', glow: '#06B6D4' },
  'Smoothie': { main: '#EC4899', glow: '#EC4899', straw: '#22C55E' },
  'Fruchtsaft': { main: '#F97316', glow: '#F97316' },
  'Apfelmus': { main: '#F59E0B', glow: '#F59E0B', apple: '#FF334B' },
  'Apfelsaft': { main: '#F59E0B', glow: '#F59E0B', apple: '#FF334B' },
  'Sirup': { main: '#F43F5E', glow: '#F43F5E' },
  'Ahornsirup': { main: '#B45309', glow: '#F59E0B', leaf: '#EA580C' },
  'Schnaps': { main: '#F8FAFC', glow: '#38BDF8', bottle: '#94A3B8' },
  'Vodka': { main: '#F8FAFC', glow: '#38BDF8', bottle: '#60A5FA' },
  'Gin': { main: '#38BDF8', glow: '#38BDF8', bottle: '#22C55E' },
  'Rum': { main: '#B45309', glow: '#F59E0B', bottle: '#D97706' },
  'Whisky': { main: '#D97706', glow: '#F59E0B', glass: '#F8FAFC' },
  'Zigaretten': { main: '#F59E0B', glow: '#EF4444', tip: '#EF4444' },

  // === VORRATSKAMMER & TEIGWAREN ===
  'Salatsauce': { main: '#84CC16', glow: '#84CC16', bottle: '#F8FAFC' },
  'Nudeln': { main: '#FBBF24', glow: '#FBBF24' },
  'Spaghetti': { main: '#FBBF24', glow: '#FBBF24' },
  'Penne': { main: '#FBBF24', glow: '#FBBF24' },
  'Lasagne': { main: '#FBBF24', glow: '#FBBF24', sauce: '#EF4444' },
  'Reis': { main: '#F8FAFC', glow: '#F59E0B', bowl: '#D97706' },
  'Basmatireis': { main: '#F8FAFC', glow: '#F59E0B', sack: '#D97706' },
  'Risottoreis': { main: '#F8FAFC', glow: '#F59E0B' },
  'Couscous': { main: '#FBBF24', glow: '#FBBF24' },
  'Griess': { main: '#FBBF24', glow: '#FBBF24' },
  'Mehl': { main: '#F8FAFC', glow: '#F59E0B', sack: '#F59E0B' },
  'Zucker': { main: '#F8FAFC', glow: '#38BDF8', crystals: '#38BDF8' },
  'Puderzucker': { main: '#F8FAFC', glow: '#38BDF8' },
  'Salz': { main: '#F8FAFC', glow: '#38BDF8', shaker: '#94A3B8' },
  'Paniermehl': { main: '#F59E0B', glow: '#F59E0B' },
  'Speisestaerke': { main: '#F8FAFC', glow: '#F59E0B' },
  'Oel': { main: '#FACC15', glow: '#FACC15', bottle: '#F8FAFC' },
  'Essig': { main: '#F59E0B', glow: '#F59E0B' },
  'Senf': { main: '#FACC15', glow: '#FACC15', jar: '#F8FAFC' },
  'Mayonnaise': { main: '#FEF08A', glow: '#FEF08A', jar: '#F8FAFC' },
  'BBQ Sauce': { main: '#B91C1C', glow: '#B91C1C', label: '#F59E0B' },
  'Pasta Sauce': { main: '#EF4444', glow: '#EF4444', jar: '#F8FAFC' },
  'Bratensauce': { main: '#78350F', glow: '#F59E0B' },
  'Dip': { main: '#F59E0B', glow: '#F59E0B', bowl: '#F8FAFC' },
  'Bouillon': { main: '#F59E0B', glow: '#F59E0B', steam: '#FDE047' },
  'Kichererbsen': { main: '#F59E0B', glow: '#F59E0B' },
  'Linsen': { main: '#EA580C', glow: '#EA580C' },
  'Nuesse': { main: '#D97706', glow: '#D97706' },
  'Walnuesse': { main: '#B45309', glow: '#B45309' },
  'Haselnuesse': { main: '#D97706', glow: '#D97706' },
  'Mandeln': { main: '#D97706', glow: '#D97706' },
  'Mandelmus': { main: '#D97706', glow: '#D97706' },
  'Erdnuesse': { main: '#D97706', glow: '#D97706' },
  'Pinienkerne': { main: '#FDE68A', glow: '#F59E0B' },
  'Muesli': { main: '#FBBF24', glow: '#FBBF24', fruit: '#EF4444' },
  'Corn Flakes': { main: '#FACC15', glow: '#FACC15' },
  'Haferflocken': { main: '#FDE68A', glow: '#F59E0B' },
  'Getreideriegel': { main: '#F59E0B', glow: '#F59E0B', choco: '#78350F' },
  'Gewuerzgurken': { main: '#15803D', glow: '#15803D', jar: '#F8FAFC' },
  'Pfefferkoerner': { main: '#94A3B8', glow: '#CBD5E1', mill: '#78350F' },
  'Zimt': { main: '#B45309', glow: '#B45309' },
  'Vanille Sauce': { main: '#FEF08A', glow: '#FDE047' },
  'Vanillezucker': { main: '#F8FAFC', glow: '#FEF08A' },
  'Honig': { main: '#F59E0B', glow: '#F59E0B', bee: '#FACC15' },
  'Tofu': { main: '#FDE68A', glow: '#FDE68A' },
  'Suppe': { main: '#F59E0B', glow: '#F59E0B', bowl: '#F8FAFC', steam: '#FDE047' },
  'Soyasauce': { main: '#451A03', glow: '#F59E0B', label: '#EF4444' },

  // === SÜSSIGKEITEN & SNACKS ===
  'Schokolade': { main: '#92400E', glow: '#D97706', wrapper: '#F8FAFC' },
  'Nutella': { main: '#78350F', glow: '#D97706', lid: '#F8FAFC' },
  'Nougatcreme': { main: '#78350F', glow: '#D97706' },
  'Suessigkeiten': { main: '#EC4899', glow: '#EC4899', wrap: '#FACC15' },
  'Kaugummi': { main: '#EC4899', glow: '#EC4899' },
  'Eis': { main: '#38BDF8', glow: '#38BDF8', cone: '#F59E0B' },
  'Dessert': { main: '#EC4899', glow: '#EC4899', cherry: '#EF4444' },
  'Pudding': { main: '#FDE047', glow: '#FDE047', cherry: '#EF4444' },
  'Pommes Chips': { main: '#FACC15', glow: '#FACC15' },
  'Pommes Frites': { main: '#FACC15', glow: '#FACC15', pack: '#EF4444' },
  'Tortilla Chips': { main: '#FACC15', glow: '#FACC15' },
  'Pop Corn': { main: '#FDE047', glow: '#FDE047', box: '#EF4444' },
  'Salzstangen': { main: '#D97706', glow: '#D97706', salt: '#F8FAFC' },
  'Snacks': { main: '#FACC15', glow: '#FACC15' },
  'snacks_allgemein': { main: '#FACC15', glow: '#FACC15' },
  'Pizza': { main: '#F59E0B', glow: '#F59E0B', cheese: '#FACC15', topping: '#EF4444' },

  // === TO GO / RESTAURANT ===
  'Thai To Go': { main: '#F59E0B', glow: '#F59E0B', box: '#F8FAFC' },
  'Chinese To Go': { main: '#EF4444', glow: '#EF4444', sticks: '#F59E0B', box: '#F8FAFC' },
  'Indian To Go': { main: '#F97316', glow: '#F97316', box: '#F8FAFC' },
  'Italian To Go': { main: '#22C55E', glow: '#EF4444', box: '#F8FAFC' },

  // === DROGERIE & KÖRPERPFLEGE ===
  'Shampoo': { main: '#06B6D4', glow: '#06B6D4', cap: '#38BDF8' },
  'Duschmittel': { main: '#06B6D4', glow: '#06B6D4' },
  'Seife': { main: '#14B8A6', glow: '#14B8A6', bubbles: '#99F6E4' },
  'Conditioner': { main: '#06B6D4', glow: '#06B6D4' },
  'Bodylotion': { main: '#38BDF8', glow: '#38BDF8', pump: '#F8FAFC' },
  'Handcreme': { main: '#38BDF8', glow: '#38BDF8' },
  'Gesichtscreme': { main: '#EC4899', glow: '#EC4899', jar: '#F8FAFC' },
  'Zahnpasta': { main: '#14B8A6', glow: '#14B8A6', stripe: '#F8FAFC' },
  'Zahnbuersten': { main: '#14B8A6', glow: '#14B8A6', bristles: '#F8FAFC' },
  'Mundspuelung': { main: '#06B6D4', glow: '#06B6D4' },
  'Zahnseide': { main: '#38BDF8', glow: '#38BDF8', floss: '#F8FAFC' },
  'Zahnstocher': { main: '#F59E0B', glow: '#F59E0B' },
  'Deo': { main: '#8B5CF6', glow: '#8B5CF6' },
  'Lippenbalsam': { main: '#FB7185', glow: '#FB7185' },
  'Nagellack': { main: '#F43F5E', glow: '#F43F5E', brush: '#000000' },
  'Nagellackentferner': { main: '#F43F5E', glow: '#F43F5E' },
  'Makeup Entferner': { main: '#F43F5E', glow: '#F43F5E' },
  'Sonnencreme': { main: '#F59E0B', glow: '#F59E0B', sun: '#FACC15' },
  'Sonnenschirm': { main: '#FACC15', glow: '#FACC15', stripes: '#F97316' },
  'Rasierer': { main: '#38BDF8', glow: '#38BDF8', blade: '#F8FAFC' },
  'Rasierklingen': { main: '#94A3B8', glow: '#38BDF8' },
  'Rasierschaum': { main: '#38BDF8', glow: '#38BDF8', foam: '#F8FAFC' },
  'Haargel': { main: '#8B5CF6', glow: '#8B5CF6' },
  'Haarspray': { main: '#8B5CF6', glow: '#8B5CF6' },
  'Taschentuecher': { main: '#F8FAFC', glow: '#38BDF8' },
  'Kosmetiktuecher': { main: '#F8FAFC', glow: '#EC4899' },
  'Wattepads': { main: '#F8FAFC', glow: '#38BDF8' },
  'Wattestaebchen': { main: '#F8FAFC', glow: '#38BDF8', tips: '#FFFFFF' },
  'Feuchttuecher': { main: '#38BDF8', glow: '#38BDF8' },
  'Tampons': { main: '#FB7185', glow: '#FB7185' },
  'Binden': { main: '#FB7185', glow: '#FB7185' },
  'Windeln': { main: '#60A5FA', glow: '#60A5FA' },
  'Babynahrung': { main: '#F59E0B', glow: '#F59E0B', bottle: '#F8FAFC' },
  'Kondome': { main: '#EC4899', glow: '#EC4899' },
  'Pflaster': { main: '#F59E0B', glow: '#F59E0B', cross: '#EF4444' },
  'Schmerzmittel': { main: '#EF4444', glow: '#EF4444', blister: '#F8FAFC', cross: '#EF4444' },
  'Vitamine': { main: '#F97316', glow: '#F97316', pill: '#FACC15' },
  'Linsenmittel': { main: '#06B6D4', glow: '#06B6D4' },

  // === HAUSHALT & REINIGUNG ===
  'Spuelmittel': { main: '#06B6D4', glow: '#06B6D4', bubbles: '#67E8F9' },
  'Geschirrtabs': { main: '#06B6D4', glow: '#06B6D4', redDot: '#EF4444' },
  'Geschirrglanz': { main: '#38BDF8', glow: '#38BDF8' },
  'Geschirrsalz': { main: '#38BDF8', glow: '#38BDF8' },
  'Waschmittel': { main: '#6366F1', glow: '#6366F1', bottle: '#38BDF8' },
  'Weichspueler': { main: '#A855F7', glow: '#A855F7', flower: '#EC4899' },
  'Putzmittel': { main: '#06B6D4', glow: '#06B6D4' },
  'Badreiniger': { main: '#06B6D4', glow: '#06B6D4', sparkle: '#38BDF8' },
  'Glasreiniger': { main: '#38BDF8', glow: '#38BDF8', spray: '#06B6D4' },
  'WC Reiniger': { main: '#06B6D4', glow: '#06B6D4' },
  'Schwamm': { main: '#FACC15', glow: '#FACC15', scrub: '#16A34A' },
  'Pinsel': { main: '#F59E0B', glow: '#F59E0B', tip: '#38BDF8' },
  'Muellbeutel': { main: '#94A3B8', glow: '#64748B', tie: '#EF4444' },
  'Alufolie': { main: '#CBD5E1', glow: '#E2E8F0', foil: '#F8FAFC' },
  'Frischhaltefolie': { main: '#38BDF8', glow: '#38BDF8', roll: '#F8FAFC' },
  'Servietten': { main: '#F8FAFC', glow: '#F59E0B' },
  'Haushaltspapier': { main: '#F8FAFC', glow: '#38BDF8' },
  'Streichhoelzer': { main: '#F59E0B', glow: '#EF4444', head: '#EF4444', flame: '#F97316' },
  'Kerzen': { main: '#FACC15', glow: '#F97316', wax: '#F8FAFC', flame: '#F97316' },
  'Batterien': { main: '#FACC15', glow: '#FACC15', top: '#22C55E' },
  'Gluehbirne': { main: '#FACC15', glow: '#FACC15', screw: '#94A3B8' },
  'Schrauben': { main: '#94A3B8', glow: '#CBD5E1' },
  'Naegel': { main: '#94A3B8', glow: '#CBD5E1' },
  'Gartenwerkzeug': { main: '#10B981', glow: '#10B981', metal: '#94A3B8' },
  'Holzkohle': { main: '#F97316', glow: '#F97316', coal: '#334155' },
  'Grill': { main: '#F97316', glow: '#F97316', grates: '#94A3B8' },
  'Propangas': { main: '#EF4444', glow: '#EF4444', valve: '#94A3B8' },
  'Briefmarken': { main: '#EC4899', glow: '#EC4899', posthorn: '#FACC15' },
  'Geschenk': { main: '#EC4899', glow: '#EC4899', ribbon: '#FACC15' },
  'Geschenkpapier': { main: '#EC4899', glow: '#EC4899' },
  'Toepfe': { main: '#E2E8F0', glow: '#94A3B8', handle: '#334155' },
  'Strohhalme': { main: '#EC4899', glow: '#38BDF8', stripes: '#FACC15' },
  'Insektenschutzmittel': { main: '#EF4444', glow: '#EF4444', bug: '#1E293B' },

  // === TIERBEDARF ===
  'Katzenfutter': { main: '#F97316', glow: '#F97316', fish: '#38BDF8' },
  'Katzensnack': { main: '#F97316', glow: '#F97316', paw: '#FB923C' },
  'Katzenstreu': { main: '#F97316', glow: '#F97316' },
  'Hundefutter': { main: '#D97706', glow: '#D97706', bone: '#F8FAFC' },
  'Hundesnack': { main: '#D97706', glow: '#D97706', bone: '#F8FAFC' },
  'Vogelfutter': { main: '#FACC15', glow: '#FACC15', bird: '#38BDF8' },
  'Fischfutter': { main: '#38BDF8', glow: '#38BDF8', fish: '#FB7185' },

  // === ALLGEMEINE FALLBACKS ===
  'Allgemein': { main: '#60A5FA', glow: '#60A5FA' },
  'Fruechte': { main: '#FF334B', glow: '#FF334B', leaf: '#22C55E' },
  'Gemuese': { main: '#22C55E', glow: '#22C55E' },
  'Gemuese gefroren': { main: '#38BDF8', glow: '#38BDF8', veg: '#22C55E' },
  'Getraenke': { main: '#38BDF8', glow: '#38BDF8' },
  'Getraenke_allgemein': { main: '#38BDF8', glow: '#38BDF8' },
  'Obst': { main: '#FF334B', glow: '#FF334B', leaf: '#22C55E' }
};

// Handcrafted, perfected SVGs that replace flawed geometry
let revised52 = {};
try {
  revised52 = require('./update_52_icons.js').revised52 || {};
} catch(e) {}

const customSVGs = {
  ...revised52,
  'Steak': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-steak" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FF334B" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Authentic juicy ribeye / beef steak cut without crucifix cross -->
  <!-- Outer meat body with glowing red contour -->
  <path d="M4 11c0-4 4-7 11-7 4 0 6 2 6 5.5s-2 8.5-8 8.5c-5 0-9-3-9-7z" fill="#FF334B" fill-opacity="0.14"/>
  <path d="M4 11c0-4 4-7 11-7 4 0 6 2 6 5.5s-2 8.5-8 8.5c-5 0-9-3-9-7z" fill="none" stroke="#FF334B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-steak)"/>
  <!-- Top fat cap / outer rim edge -->
  <path d="M5 9.5c.5-2.5 3.5-4.5 9.5-4.5 3 0 4.5 1 4.5 3" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Classic diagonal grill sear marks / marbled meat grains -->
  <path d="M7 13.5c1.5-1.5 4.5-1.5 6.5 0 M10 10c1.5-1.5 4.5-1.5 6 0" fill="none" stroke="#FCA5A5" stroke-width="1.6" stroke-linecap="round"/>
</svg>`
};

// Transform an SVG file to Glowing Vector Outline style
function transformSvg(filename, svgContent) {
  const name = filename.replace('.svg', '');
  if (customSVGs[name]) {
    return customSVGs[name];
  }

  const conf = iconColorMap[name] || { main: '#60A5FA', glow: '#60A5FA' };
  const filterId = 'glow-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Strip any old defs/filters if present
  let cleanSvg = svgContent.replace(/<defs>[\s\S]*?<\/defs>/gi, '').trim();

  // Ensure svg opening tag
  const svgOpenMatch = cleanSvg.match(/<svg[^>]*>/i);
  if (!svgOpenMatch) return svgContent;

  const svgOpen = svgOpenMatch[0];
  let body = cleanSvg.substring(svgOpen.length).replace(/<\/svg>$/i, '').trim();

  // Create Glow Filter Definition
  const defs = `  <defs>\n    <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">\n      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="${conf.glow}" flood-opacity="0.75"/>\n    </filter>\n  </defs>`;

  // Smart color replacement in body
  // 1. Replace soft fills (fill="currentColor" fill-opacity="...")
  body = body.replace(/fill="currentColor"\s+fill-opacity="([^"]+)"/g, (m, op) => {
    // Keep subtle opacity (0.12 - 0.16) for modern translucent dark-mode depth
    let numOp = parseFloat(op);
    if (isNaN(numOp) || numOp > 0.2) numOp = 0.14;
    if (numOp < 0.1) numOp = 0.12;
    return `fill="${conf.main}" fill-opacity="${numOp}"`;
  });

  // 2. Identify and color leaf/greens/calyx accents if present
  if (conf.leaf) {
    body = body.replace(/(<!--\s*(?:Leaf|Calyx|Greens|Kraut)[\s\S]*?-->[\s\S]*?<path[^>]*?)(stroke="currentColor")([^>]*>)/gi, `$1stroke="${conf.leaf}"$3`);
    body = body.replace(/(<!--\s*(?:Leaf|Calyx|Greens|Kraut)[\s\S]*?-->[\s\S]*?<path[^>]*?)(fill="currentColor")([^>]*>)/gi, `$1fill="${conf.leaf}" fill-opacity="0.3"$3`);
  }

  // 3. Identify and color stem/wood accents if present
  if (conf.stem) {
    body = body.replace(/(<!--\s*(?:Stem|Stiel)[\s\S]*?-->[\s\S]*?<path[^>]*?)(stroke="currentColor")([^>]*>)/gi, `$1stroke="${conf.stem}"$3`);
  }

  // 4. Identify foam/white accents
  if (conf.foam) {
    body = body.replace(/(<!--\s*(?:Foam|Schaum)[\s\S]*?-->[\s\S]*?<path[^>]*?)(fill="currentColor")([^>]*>)/gi, `$1fill="${conf.foam}"$3`);
  }

  // 5. Replace remaining stroke="currentColor" with mainColor
  let appliedGlow = false;
  body = body.replace(/stroke="currentColor"/g, () => {
    if (!appliedGlow) {
      appliedGlow = true;
      return `stroke="${conf.main}" filter="url(#${filterId})"`;
    }
    return `stroke="${conf.main}"`;
  });

  // 6. Replace remaining fill="currentColor"
  body = body.replace(/fill="currentColor"/g, `fill="${conf.main}" fill-opacity="0.35"`);

  // Ensure svg has defs
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">\n${defs}\n${body}\n</svg>`;
}

// Process all files
const files = fs.readdirSync(iconsDir).filter(f => f.endsWith('.svg'));
console.log(`Processing ${files.length} icons...`);

let processedCount = 0;
files.forEach(file => {
  const filePath = path.join(iconsDir, file);
  const oldContent = fs.readFileSync(filePath, 'utf8');
  const newContent = transformSvg(file, oldContent);
  fs.writeFileSync(filePath, newContent, 'utf8');
  processedCount++;
});

console.log(`Successfully transformed all ${processedCount} icons into Glowing Outline style!`);
