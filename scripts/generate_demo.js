const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('C:/Users/Vita/.gemini/antigravity/scratch/kaufsync-hybrid/all_icons_data.json', 'utf8'));

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KaufSync – Alle 355 Icons (Farbiges Glow-Design)</title>
  <style>
    :root {
      --ks-bg: #0b0f19;
      --ks-surface-card: #1e293b;
      --ks-border: rgba(255, 255, 255, 0.07);
      --ks-text: #f8fafc;
      --ks-text-muted: #94a3b8;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    body {
      background-color: var(--ks-bg);
      color: var(--ks-text);
      padding: 20px 16px 80px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .demo-header {
      width: 100%;
      max-width: 1200px;
      margin-bottom: 20px;
      text-align: center;
    }

    .badge-pill {
      display: inline-block;
      padding: 4px 14px;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.4);
      color: #60a5fa;
      border-radius: 9999px;
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 8px;
    }

    h1 {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 6px;
    }

    p.subtitle {
      color: var(--ks-text-muted);
      font-size: 14px;
      line-height: 1.5;
      max-width: 750px;
      margin: 0 auto;
    }

    /* Controls Bar */
    .controls-bar {
      width: 100%;
      max-width: 1200px;
      background: rgba(30, 41, 59, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid var(--ks-border);
      border-radius: 14px;
      padding: 12px 16px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      position: sticky;
      top: 12px;
      z-index: 50;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    }

    .search-input {
      background: #0f172a;
      border: 1px solid var(--ks-border);
      border-radius: 8px;
      color: #fff;
      padding: 8px 14px;
      font-size: 13.5px;
      width: 240px;
      outline: none;
      transition: border-color 0.15s;
    }

    .search-input:focus {
      border-color: #3b82f6;
    }

    .filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .btn-pill {
      background: #0f172a;
      border: 1px solid var(--ks-border);
      color: var(--ks-text-muted);
      padding: 6px 12px;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-pill:hover {
      color: #fff;
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-pill.active {
      background: #3b82f6;
      border-color: #3b82f6;
      color: #fff;
    }

    .view-toggles {
      display: flex;
      background: #0f172a;
      border-radius: 8px;
      padding: 3px;
    }

    .btn-toggle {
      background: transparent;
      border: none;
      color: var(--ks-text-muted);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-toggle.active {
      background: #1e293b;
      color: #fff;
    }

    /* Device Viewport Frame */
    .viewport-frame {
      width: 100%;
      max-width: 412px; /* Mobile Viewport */
      background: #0b0f19;
      border-radius: 28px;
      padding: 16px 12px 32px;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 20px 50px rgba(0, 0, 0, 0.6);
      transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .viewport-frame.wide-mode {
      max-width: 1200px;
      border-radius: 18px;
      padding: 24px 20px;
    }

    /* Category Group */
    .category-group {
      display: flex;
      position: relative;
      margin-bottom: 20px;
      border-radius: 12px;
      overflow: hidden;
      align-items: stretch;
      gap: 6px;
    }

    .category-lane {
      width: 22px;
      min-width: 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 0;
      border-radius: 4px;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      transform: rotate(180deg);
      background: transparent !important;
      color: var(--ks-text-muted) !important;
      position: relative;
    }

    .category-lane::before {
      content: '';
      position: absolute;
      right: 0;
      top: 6px;
      bottom: 6px;
      width: 3.5px;
      border-radius: 2px;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
    }

    .category-name {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: currentColor;
      white-space: nowrap;
    }

    .category-count {
      font-size: 9.5px;
      font-weight: 700;
      color: currentColor;
      margin-bottom: 6px;
      background: rgba(0,0,0,0.3);
      padding: 1px 5px;
      border-radius: 8px;
    }

    /* Grid */
    .ks-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 9px;
      width: 100%;
    }

    .viewport-frame.wide-mode .ks-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 12px;
    }

    /* Grid Card (Original Dimensions) */
    .grid-card {
      display: flex;
      flex-direction: column;
      border-radius: 1.1rem;
      padding: 10px 8px;
      cursor: pointer;
      text-align: center;
      position: relative;
      background: var(--ks-surface-card) !important;
      border: 1px solid var(--ks-border);
      min-height: 172px;
      height: 100%;
      overflow: hidden;
      justify-content: space-between;
      align-items: center;
      color: white !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      transition: transform 0.12s ease, border-color 0.2s ease;
    }

    .grid-card:hover {
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateY(-2px);
    }

    .card-ambient-glow {
      position: absolute;
      top: -16px;
      right: -16px;
      width: 5.5rem;
      height: 5.5rem;
      border-radius: 50%;
      filter: blur(20px);
      opacity: 0.15;
      pointer-events: none;
    }

    .item-icon-container {
      width: 100%;
      height: 68px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 2px;
      position: relative;
    }

    .icon-img {
      width: 66px;
      height: 66px;
      object-fit: contain;
      display: block;
      filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.15));
      transition: transform 0.15s ease;
    }

    .grid-card:hover .icon-img {
      transform: scale(1.08);
    }

    .card-text-area {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 38px;
      width: 100%;
      margin: 4px 0 6px;
      position: relative;
      overflow: hidden;
    }

    .item-name {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      width: 100%;
      padding: 0 4px;
      color: #f8fafc;
      display: block;
      text-align: center;
      text-overflow: ellipsis;
    }

    .item-regular-tags {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.2;
      width: 100%;
      padding: 0 4px;
      height: 14px;
      display: block;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .quantity-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      background: #0f172a;
      border-radius: 8px;
      padding: 3px;
      margin-top: auto;
    }

    .qty-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }

    .qty-btn-minus {
      background: #1e293b;
      color: #cbd5e1;
    }

    .qty-val {
      font-weight: 700;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 50px;
    }

    .qty-btn-plus {
      font-weight: 800;
      color: #0f172a;
    }
  </style>
</head>
<body>

<div class="demo-header">
  <div class="badge-pill">KaufSync Design System</div>
  <h1>✨ Alle 355 Icons im leuchtenden Outline & Glow Look</h1>
  <p class="subtitle">
    Jedes Icon besitzt seine <strong>authentischen Lebensmittelfarben</strong>, eine <strong>präzise Vektor-Outline</strong> und einen <strong>leuchtenden Glow</strong>. Das Steak wurde mit einer kreuzfreien, echten Fleisch-Silhouette überarbeitet.
  </p>
</div>

<!-- Controls -->
<div class="controls-bar">
  <input type="text" id="search" class="search-input" placeholder="🔍 Icon suchen (z.B. Steak, Apfel...)" oninput="filterItems()">
  
  <div class="filter-pills" id="category-pills">
    <button class="btn-pill active" onclick="setCategory('all')">Alle (355)</button>
    <button class="btn-pill" onclick="setCategory('Obst & Gemüse')">Obst & Gemüse</button>
    <button class="btn-pill" onclick="setCategory('Brot & Backwaren')">Brot & Backwaren</button>
    <button class="btn-pill" onclick="setCategory('Milchprodukte & Tiefkühlkost')">Milch & TK</button>
    <button class="btn-pill" onclick="setCategory('Fleisch & Fisch')">Fleisch & Fisch</button>
    <button class="btn-pill" onclick="setCategory('Vorratskammer')">Vorratskammer</button>
    <button class="btn-pill" onclick="setCategory('Getränke & Genussmittel')">Getränke</button>
    <button class="btn-pill" onclick="setCategory('Drogerie, Haushalt & Tierbedarf')">Drogerie</button>
  </div>

  <div class="view-toggles">
    <button class="btn-toggle active" id="btn-mobile" onclick="setViewport('mobile')">📱 Handy</button>
    <button class="btn-toggle" id="btn-wide" onclick="setViewport('wide')">💻 Desktop</button>
  </div>
</div>

<!-- Viewport -->
<div class="viewport-frame" id="viewport">
  <div id="grid-content"></div>
</div>

<script>
  const allItems = ${JSON.stringify(data)};
  let currentCategory = 'all';
  let searchTerm = '';

  const catColors = {
    'Obst & Gemüse': '#86efac',
    'Brot & Backwaren': '#fef08a',
    'Milchprodukte & Tiefkühlkost': '#93c5fd',
    'Fleisch & Fisch': '#fca5a5',
    'Vorratskammer': '#fdba74',
    'Getränke & Genussmittel': '#a5b4fc',
    'Drogerie, Haushalt & Tierbedarf': '#5eead4',
    'Sonstiges': '#d8b4fe'
  };

  function setCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('#category-pills .btn-pill').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    render();
  }

  function filterItems() {
    searchTerm = document.getElementById('search').value.toLowerCase().trim();
    render();
  }

  function setViewport(vp) {
    const frame = document.getElementById('viewport');
    document.getElementById('btn-mobile').classList.toggle('active', vp === 'mobile');
    document.getElementById('btn-wide').classList.toggle('active', vp === 'wide');
    if (vp === 'wide') frame.classList.add('wide-mode');
    else frame.classList.remove('wide-mode');
  }

  function renderCard(item) {
    return \`
      <div class="grid-card">
        <div class="card-ambient-glow" style="background-color: \${item.catColor};"></div>
        <div class="item-icon-container">
          <img class="icon-img" src="./icons/\${item.file}" alt="\${item.name}" loading="lazy">
        </div>
        <div class="card-text-area">
          <span class="item-name" title="\${item.name}">\${item.name}</span>
          <span class="item-regular-tags">\${item.tag}</span>
        </div>
        <div class="quantity-controls">
          <button class="qty-btn qty-btn-minus">-</button>
          <span class="qty-val" style="color: \${item.catColor};">1 Stk</span>
          <button class="qty-btn qty-btn-plus" style="background-color: \${item.catColor};">+</button>
        </div>
      </div>
    \`;
  }

  function render() {
    let filtered = allItems;
    if (currentCategory !== 'all') {
      filtered = filtered.filter(i => i.cat === currentCategory);
    }
    if (searchTerm) {
      filtered = filtered.filter(i => i.name.toLowerCase().includes(searchTerm) || i.cat.toLowerCase().includes(searchTerm));
    }

    // Group by category
    const groups = {};
    filtered.forEach(item => {
      if (!groups[item.cat]) groups[item.cat] = [];
      groups[item.cat].push(item);
    });

    const container = document.getElementById('grid-content');
    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--ks-text-muted);">Keine Icons gefunden.</div>';
      return;
    }

    container.innerHTML = Object.keys(groups).map(catName => {
      const items = groups[catName];
      const color = catColors[catName] || '#d8b4fe';
      return \`
        <div class="category-group">
          <div class="category-lane" style="color: \${color};">
            <div class="category-count">\${items.length}</div>
            <div class="category-name">\${catName}</div>
          </div>
          <div class="ks-grid">
            \${items.map(renderCard).join('')}
          </div>
        </div>
      \`;
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', render);
</script>
</body>
</html>
`;

fs.writeFileSync('C:/Users/Vita/.gemini/antigravity/scratch/kaufsync-hybrid/frontend/public/demo-icons.html', html, 'utf8');
console.log('Successfully generated demo-icons.html with all 355 icons!');
