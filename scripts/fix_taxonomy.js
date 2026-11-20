const fs = require('fs');
const path = require('path');

const filesToFix = [
  path.join(__dirname, '../backend/assets/taxonomy.json'),
  path.join(__dirname, '../frontend/src/assets/taxonomy.json')
];

// Specific replacements: Toast -> Er / er
function cleanString(str) {
  if (typeof str !== 'string') return str;

  // If the string is purely a legitimate toast item or alias, keep it!
  const legitimate = [
    'Toast',
    'Golden Toast',
    'Harry Toast',
    'Sandwichtoast',
    'Toastbrot',
    'Vollkorntoast',
    'Toastscheiben'
  ];
  if (legitimate.includes(str.trim())) {
    return str;
  }

  let cleaned = str;

  // Replacements
  cleaned = cleaned.replace(/Toastfrischungsgetränk/g, 'Erfrischungsgetränk');
  cleaned = cleaned.replace(/Toastfrischung/g, 'Erfrischung');
  cleaned = cleaned.replace(/Toastfrischend/g, 'Erfrischend');
  cleaned = cleaned.replace(/Toastdnusssauce/g, 'Erdnusssauce');
  cleaned = cleaned.replace(/Toastdnussmus/g, 'Erdnussmus');
  cleaned = cleaned.replace(/Toastdnuss/g, 'Erdnuss');
  cleaned = cleaned.replace(/Toastdbeere/g, 'Erdbeere');
  cleaned = cleaned.replace(/Toastdbeer/g, 'Erdbeer');
  cleaned = cleaned.replace(/Toastkältung/g, 'Erkältung');
  cleaned = cleaned.replace(/Veganer\s*-\s*Toastsatz/g, 'Veganer Ersatz');
  cleaned = cleaned.replace(/-\s*Toastsatz/g, 'Ersatz');
  cleaned = cleaned.replace(/Toastsatz/g, 'Ersatz');

  // Generic fallback if any other Toast[a-z...] remains that is not legitimate
  // Check if there are other corrupted Toast words:
  // e.g. Toast followed by lowercase German letter
  cleaned = cleaned.replace(/Toast([a-zäöü])/g, (match, p1) => {
    // If it's toastbrot or similar, keep
    if (['brot', 'scheibe', 'scheiben'].some(w => (p1 + cleaned.slice(5)).toLowerCase().startsWith(w))) {
      return match;
    }
    return 'Er' + p1;
  });

  return cleaned;
}

function processValue(val) {
  if (typeof val === 'string') {
    return cleanString(val);
  } else if (Array.isArray(val)) {
    return val.map(processValue);
  } else if (typeof val === 'object' && val !== null) {
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = processValue(v);
    }
    return result;
  }
  return val;
}

filesToFix.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }

  console.log('Processing:', filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const processed = processValue(data);

  fs.writeFileSync(filePath, JSON.stringify(processed, null, 2) + '\n', 'utf8');
  console.log('Successfully cleaned:', filePath);
});

// Also fix frontend/public/demo-icons.html
const demoHtmlPath = path.join(__dirname, '../frontend/public/demo-icons.html');
if (fs.existsSync(demoHtmlPath)) {
  let html = fs.readFileSync(demoHtmlPath, 'utf8');
  html = html.replace(/"tag":"Toastdbeer"/g, '"tag":"Erdbeer"');
  fs.writeFileSync(demoHtmlPath, html, 'utf8');
  console.log('Cleaned demo-icons.html Toastdbeer');
}
