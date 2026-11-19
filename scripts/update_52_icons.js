const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '../frontend/public/icons');

const revised52 = {
  // 1. Paprika
  'Paprika': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-paprika" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Bell pepper body with 3 distinct lobes and indented top -->
  <path d="M7 6.5 C4 6.5 3 9.5 3 13.5 C3 18.5 5.5 21 8.5 21 C10 21 11 20 12 20 C13 20 14 21 15.5 21 C18.5 21 21 18.5 21 13.5 C21 9.5 20 6.5 17 6.5 C15 6.5 13.5 7.5 12 7.5 C10.5 7.5 9 6.5 7 6.5 Z" fill="#EF4444" fill-opacity="0.14"/>
  <path d="M7 6.5 C4 6.5 3 9.5 3 13.5 C3 18.5 5.5 21 8.5 21 C10 21 11 20 12 20 C13 20 14 21 15.5 21 C18.5 21 21 18.5 21 13.5 C21 9.5 20 6.5 17 6.5 C15 6.5 13.5 7.5 12 7.5 C10.5 7.5 9 6.5 7 6.5 Z" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-paprika)"/>
  <!-- Lobe contour lines -->
  <path d="M8.5 7 C8 11 8 16.5 8.5 21 M15.5 7 C16 11 16 16.5 15.5 21" fill="none" stroke="#F87171" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Green 5-pointed calyx crown -->
  <path d="M9 7 C10 5.5 11 6.5 12 6 C13 6.5 14 5.5 15 7 C14 7.5 13 7.5 12 7.5 C11 7.5 10 7.5 9 7 Z" fill="#22C55E" fill-opacity="0.4" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Curved green stem -->
  <path d="M12 6 C12 3.5 13.5 2.5 15 2" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round"/>
</svg>`,

  // 2. Oliven
  'Oliven': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-oliven" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#65A30D" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Olive twig branch with leaves and two plump olives -->
  <path d="M3 4 C7 6.5 12 7.5 18 6" fill="none" stroke="#78350F" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Slender pointed olive leaves -->
  <path d="M7 6 C10 4 14 4.5 16 2.5 C14.5 5 11 7 7 6 Z" fill="#84CC16" fill-opacity="0.25" stroke="#84CC16" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 7 C16 7.5 19 9.5 21.5 8.5 C19 11.5 15 11 12 7 Z" fill="#84CC16" fill-opacity="0.25" stroke="#84CC16" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Left olive hanging on stem -->
  <path d="M8.5 7 L8 10" fill="none" stroke="#78350F" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="7.5" cy="15" rx="4.5" ry="5.5" transform="rotate(-15 7.5 15)" fill="#65A30D" fill-opacity="0.18"/>
  <ellipse cx="7.5" cy="15" rx="4.5" ry="5.5" transform="rotate(-15 7.5 15)" fill="none" stroke="#65A30D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-oliven)"/>
  <path d="M6 13 C6 14.5 6.5 16 7.5 17" fill="none" stroke="#A3E635" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Right olive in front -->
  <path d="M14 7 L15 10.5" fill="none" stroke="#78350F" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="15.5" cy="16" rx="4.5" ry="5.5" transform="rotate(15 15.5 16)" fill="#65A30D" fill-opacity="0.25"/>
  <ellipse cx="15.5" cy="16" rx="4.5" ry="5.5" transform="rotate(15 15.5 16)" fill="none" stroke="#65A30D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-oliven)"/>
  <circle cx="16.5" cy="17" r="1.2" fill="#D97706" stroke="#D97706" stroke-width="0.5"/>
</svg>`,

  // 3. Petersilie
  'Petersilie': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-petersilie" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#22C55E" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Main stem branching off -->
  <path d="M12 22 C12 17 12 11 12 6" fill="none" stroke="#16A34A" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 15 C9 13 6 12 4.5 10" fill="none" stroke="#16A34A" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M12 13 C15 11 18 10 19.5 8" fill="none" stroke="#16A34A" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Top 3-lobed serrated parsley leaf -->
  <path d="M12 6 C10 4.5 8.5 2.5 10 1.5 C11.5 1.5 12 3 12 3 C12 3 12.5 1.5 14 1.5 C15.5 2.5 14 4.5 12 6 Z" fill="#22C55E" fill-opacity="0.2" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-petersilie)"/>
  <!-- Left serrated leaflet -->
  <path d="M4.5 10 C3 8 2 5.5 4 4.5 C5.5 5 5.5 6.5 6 6.5 C6.5 5.5 7.5 5 8.5 6.5 C8 8 6 9 4.5 10 Z" fill="#22C55E" fill-opacity="0.2" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-petersilie)"/>
  <!-- Right serrated leaflet -->
  <path d="M19.5 8 C21 6 22 3.5 20 2.5 C18.5 3 18.5 4.5 18 4.5 C17.5 3.5 16.5 3 15.5 4.5 C16 6 18 7 19.5 8 Z" fill="#22C55E" fill-opacity="0.2" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-petersilie)"/>
</svg>`,

  // 4. Pfefferminze
  'Pfefferminze': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-pfefferminze" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#10B981" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Mint stem -->
  <path d="M12 22 L12 4" fill="none" stroke="#059669" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Young top budding leaf pair -->
  <path d="M12 4 C10.5 2 11.5 1 12 1 C12.5 1 13.5 2 12 4 Z" fill="#34D399" fill-opacity="0.3" stroke="#34D399" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Upper pair of serrated mint leaves -->
  <path d="M12 8 C8 6.5 5 7 4 8.5 C5.5 11 9 10.5 12 9.5 Z" fill="#10B981" fill-opacity="0.18" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-pfefferminze)"/>
  <path d="M12 8 C16 6.5 19 7 20 8.5 C18.5 11 15 10.5 12 9.5 Z" fill="#10B981" fill-opacity="0.18" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-pfefferminze)"/>
  <!-- Lower pair of larger serrated mint leaves -->
  <path d="M12 14 C7 12 3 13 2 15 C4 18 8.5 17.5 12 15.5 Z" fill="#10B981" fill-opacity="0.18" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-pfefferminze)"/>
  <path d="M12 14 C17 12 21 13 22 15 C20 18 15.5 17.5 12 15.5 Z" fill="#10B981" fill-opacity="0.18" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-pfefferminze)"/>
  <!-- Serration notches & central veins -->
  <path d="M6 8 L10 9 M18 8 L14 9 M5 14.5 L9.5 15 M19 14.5 L14.5 15" fill="none" stroke="#34D399" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,

  // 5. Rhabarber
  'Rhabarber': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-rhabarber" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#F43F5E" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Realistic rhubarb stalks with flared bases and ruffled green leaf tops -->
  <!-- Left stalk -->
  <path d="M6 21 C8 21.5 9 20 9 20 L12 6 L9 6 L6 20 C5.5 20.5 5.5 21 6 21 Z" fill="#F43F5E" fill-opacity="0.18"/>
  <path d="M6 21 C8 21.5 9 20 9 20 L12 6 L9 6 L6 20 C5.5 20.5 5.5 21 6 21 Z" fill="none" stroke="#F43F5E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-rhabarber)"/>
  <path d="M7.5 20.5 L10.5 6" fill="none" stroke="#FDA4AF" stroke-width="1.3" stroke-linecap="round"/>
  <!-- Right overlapping stalk -->
  <path d="M11 21 C13.5 21.5 14.5 20 14.5 20 L17.5 5 L14.5 5 L11 20 C10.5 20.5 10.5 21 11 21 Z" fill="#F43F5E" fill-opacity="0.22"/>
  <path d="M11 21 C13.5 21.5 14.5 20 14.5 20 L17.5 5 L14.5 5 L11 20 C10.5 20.5 10.5 21 11 21 Z" fill="none" stroke="#F43F5E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-rhabarber)"/>
  <path d="M12.8 20.5 L16 5" fill="none" stroke="#FDA4AF" stroke-width="1.3" stroke-linecap="round"/>
  <!-- Green leaf crinkles at top of cut stalks -->
  <path d="M9 6 C8 4 10 2.5 11.5 3.5 C12.5 2 14.5 2.5 14 4.5" fill="none" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14.5 5 C15.5 3 17 2.5 18.5 3.5 C19.5 2.5 21 4 19.5 5.5" fill="none" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  // 6. Römersalat
  'Roemersalat': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-roemersalat" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#22C55E" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Upright Romaine lettuce head with thick white crunchy rib and wavy outer leaves -->
  <!-- Outer leaf body tapering to flat cut base -->
  <path d="M9 22 C7 18 5.5 12 6.5 7 C7.5 4 10 2 12 2 C14 2 16.5 4 17.5 7 C18.5 12 17 18 15 22 Z" fill="#22C55E" fill-opacity="0.15"/>
  <path d="M9 22 C7 18 5.5 12 6.5 7 C7.5 4 10 2 12 2 C14 2 16.5 4 17.5 7 C18.5 12 17 18 15 22 Z" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-roemersalat)"/>
  <!-- Wavy leaf apex frills -->
  <path d="M6.5 7 C8 8.5 10 6.5 12 7 C14 6.5 16 8.5 17.5 7" fill="none" stroke="#4ADE80" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Central thick crunchy rib (white/light-green) -->
  <path d="M12 22 L12 8" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Diagonal leaf rib veins -->
  <path d="M12 17 C9.5 15.5 8 14 7 13.5 M12 17 C14.5 15.5 16 14 17 13.5" fill="none" stroke="#86EFAC" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12 13 C10 11.5 8.5 10 7.5 9.5 M12 13 C14 11.5 15.5 10 16.5 9.5" fill="none" stroke="#86EFAC" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 7. Rosmarin
  'Rosmarin': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-rosmarin" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#16A34A" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Rosemary sprig: central woody stem with dense upward-pointing needle leaves -->
  <path d="M12 22 C12 16 12.5 9 12 2" fill="none" stroke="#78350F" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Tier 1 (bottom needles) -->
  <path d="M12 19 L6.5 16 M12 19 L17.5 16" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" filter="url(#glow-rosmarin)"/>
  <!-- Tier 2 -->
  <path d="M12 15.5 L5.5 12 M12 15.5 L18.5 12" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" filter="url(#glow-rosmarin)"/>
  <!-- Tier 3 -->
  <path d="M12 12 L6.5 8.5 M12 12 L17.5 8.5" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" filter="url(#glow-rosmarin)"/>
  <!-- Tier 4 -->
  <path d="M12 8.5 L7.5 5 M12 8.5 L16.5 5" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round"/>
  <!-- Top needle shoot -->
  <path d="M12 5 L9.5 2 M12 5 L14.5 2 M12 3 L12 1.5" fill="none" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round"/>
</svg>`,

  // 8. Rucola
  'Rucola': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-rucola" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#16A34A" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Iconic lobed arugula / rocket leaf with deep sinuses and rounded top -->
  <path d="M12 22 L12 17 C9.5 16.5 7 15 7.5 13.5 C9 13.5 10.5 14 11.5 13 C8.5 12 6 10.5 6.5 9 C8.5 9 10 10 11.5 9 C8.5 8 8 6 9 5 C10.5 5 11 6.5 12 6 C11.5 4 11 2 12 2 C13 2 12.5 4 12 6 C13 6.5 13.5 5 15 5 C16 6 15.5 8 12.5 9 C14 10 15.5 9 17.5 9 C18 10.5 15.5 12 12.5 13 C13.5 14 15 13.5 16.5 13.5 C17 15 14.5 16.5 12 17 Z" fill="#16A34A" fill-opacity="0.18"/>
  <path d="M12 22 L12 17 C9.5 16.5 7 15 7.5 13.5 C9 13.5 10.5 14 11.5 13 C8.5 12 6 10.5 6.5 9 C8.5 9 10 10 11.5 9 C8.5 8 8 6 9 5 C10.5 5 11 6.5 12 6 C11.5 4 11 2 12 2 C13 2 12.5 4 12 6 C13 6.5 13.5 5 15 5 C16 6 15.5 8 12.5 9 C14 10 15.5 9 17.5 9 C18 10.5 15.5 12 12.5 13 C13.5 14 15 13.5 16.5 13.5 C17 15 14.5 16.5 12 17 Z" fill="none" stroke="#16A34A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-rucola)"/>
  <!-- Central vein running from stem to tip -->
  <path d="M12 17 L12 4" fill="none" stroke="#86EFAC" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 9. Salbei
  'Salbei': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-salbei" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#4ADE80" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Oblong, velvety tongue-shaped sage leaves spray -->
  <!-- Stem -->
  <path d="M12 22 C12 17 12 14 12 12" fill="none" stroke="#16A34A" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Central main sage leaf -->
  <path d="M12 12 C9 9.5 8 5 10.5 2.5 C11.5 2 12.5 2 13.5 2.5 C16 5 15 9.5 12 12 Z" fill="#4ADE80" fill-opacity="0.2"/>
  <path d="M12 12 C9 9.5 8 5 10.5 2.5 C11.5 2 12.5 2 13.5 2.5 C16 5 15 9.5 12 12 Z" fill="none" stroke="#4ADE80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-salbei)"/>
  <path d="M12 11 L12 4" fill="none" stroke="#86EFAC" stroke-width="1.4" stroke-linecap="round"/>
  <!-- Left leaf -->
  <path d="M11 14 C7.5 13.5 4 12 3 9 C4.5 7.5 7 8 10 11 Z" fill="#4ADE80" fill-opacity="0.18" stroke="#4ADE80" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-salbei)"/>
  <!-- Right leaf -->
  <path d="M13 14 C16.5 13.5 20 12 21 9 C19.5 7.5 17 8 14 11 Z" fill="#4ADE80" fill-opacity="0.18" stroke="#4ADE80" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-salbei)"/>
</svg>`,

  // 10. Spargel
  'Spargel': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-spargel" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#86EFAC" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Bundle of 3 asparagus stalks with tiered scaled spear heads & tying band -->
  <!-- Center stalk -->
  <path d="M10 22 L10 6 C10 4 12 1.5 12 1.5 C12 1.5 14 4 14 6 L14 22 Z" fill="#86EFAC" fill-opacity="0.16"/>
  <path d="M10 22 L10 6 C10 4 12 1.5 12 1.5 C12 1.5 14 4 14 6 L14 22 Z" fill="none" stroke="#86EFAC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-spargel)"/>
  <!-- Center scales -->
  <path d="M10.5 4.5 C11.5 5.5 12.5 5.5 13.5 4.5 M11 3 C12 3.8 13 3.8 13 3" fill="none" stroke="#22C55E" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Left stalk -->
  <path d="M5.5 22 L5.5 9 C5.5 7 7.5 4.5 7.5 4.5 C7.5 4.5 9.5 7 9.5 9 L9.5 22" fill="none" stroke="#86EFAC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-spargel)"/>
  <path d="M6 7.5 C7 8.5 8 8.5 9 7.5" fill="none" stroke="#22C55E" stroke-width="1.4" stroke-linecap="round"/>
  <!-- Right stalk -->
  <path d="M14.5 22 L14.5 9 C14.5 7 16.5 4.5 16.5 4.5 C16.5 4.5 18.5 7 18.5 9 L18.5 22" fill="none" stroke="#86EFAC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-spargel)"/>
  <path d="M15 7.5 C16 8.5 17 8.5 18 7.5" fill="none" stroke="#22C55E" stroke-width="1.4" stroke-linecap="round"/>
  <!-- Traditional tying band around the bundle -->
  <path d="M4.5 14.5 C11 16 13 16 19.5 14.5 L19.5 17 C13 18.5 11 18.5 4.5 17 Z" fill="#3B82F6" fill-opacity="0.3" stroke="#3B82F6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  // 11. Spinat
  'Spinat': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-spinat" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#16A34A" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Tender baby spinach leaf duo: oval-pointed succulent leaves with gentle curves -->
  <!-- Rear leaf -->
  <path d="M8 15 C5 14 3.5 10 5 6 C6.5 3.5 10 4 12 7 C11 11 9.5 14 8 15 Z" fill="#22C55E" fill-opacity="0.18" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Main foreground spinach leaf -->
  <path d="M12 22 C12 17 12 14 12 13 C8 12 6 8 8 4 C10 1.5 14 1.5 16 4 C18 8 16 12 12 13 Z" fill="#16A34A" fill-opacity="0.2"/>
  <path d="M12 22 C12 17 12 14 12 13 C8 12 6 8 8 4 C10 1.5 14 1.5 16 4 C18 8 16 12 12 13 Z" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-spinat)"/>
  <!-- Center vein & gentle side arches -->
  <path d="M12 13 L12 4" fill="none" stroke="#86EFAC" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M12 10 C10.5 8.5 9 8.5 8 9 M12 10 C13.5 8.5 15 8.5 16 9" fill="none" stroke="#86EFAC" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M12 7 C10.8 5.8 9.5 5.8 9 6.2 M12 7 C13.2 5.8 14.5 5.8 15 6.2" fill="none" stroke="#86EFAC" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,

  // 12. Champagner
  'Champagner': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-champagner" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#F59E0B" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Champagne bottle with gold foil neck, popping mushroom cork and effervescent bubbles -->
  <path d="M8 22 L16 22 C16 16 16.5 13 15 10 L15 6 L9 6 L9 10 C7.5 13 8 16 8 22 Z" fill="#15803D" fill-opacity="0.2"/>
  <path d="M8 22 L16 22 C16 16 16.5 13 15 10 L15 6 L9 6 L9 10 C7.5 13 8 16 8 22 Z" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-champagner)"/>
  <!-- Gold foil collar wrap on bottle neck -->
  <path d="M9 10 L15 10 M9 7 L15 7" fill="none" stroke="#FDE047" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Popping mushroom cork flying above bottle -->
  <path d="M10 3.5 C10 1.5 14 1.5 14 3.5 C13.5 4.5 10.5 4.5 10 3.5 Z" fill="#B45309" fill-opacity="0.3" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Effervescent sparkling champagne bubbles -->
  <circle cx="12" cy="1" r="0.8" fill="#FDE047"/>
  <circle cx="7.5" cy="3" r="0.8" fill="#FDE047"/>
  <circle cx="16.5" cy="2" r="0.8" fill="#FDE047"/>
  <circle cx="6" cy="6" r="0.6" fill="#FDE047"/>
  <circle cx="18" cy="5" r="0.6" fill="#FDE047"/>
</svg>`,

  // 13. Mineralwasser
  'Mineralwasser': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-mineralwasser" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#38BDF8" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Ergonomic water bottle with screw cap, grip ridges and crystal effervescent bubbles (NO text) -->
  <!-- Screw cap -->
  <rect x="10" y="2" width="4" height="2.5" rx="0.5" fill="#38BDF8" fill-opacity="0.4" stroke="#38BDF8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Bottle body with waist grip contour -->
  <path d="M10.5 4.5 L10.5 6 C9 7.5 7 9 7 12 L7.5 15 C7 17 7 19 7 21 C7 21.5 8 22 12 22 C16 22 17 21.5 17 21 C17 19 17 17 16.5 15 L17 12 C17 9 15 7.5 13.5 6 L13.5 4.5 Z" fill="#38BDF8" fill-opacity="0.14"/>
  <path d="M10.5 4.5 L10.5 6 C9 7.5 7 9 7 12 L7.5 15 C7 17 7 19 7 21 C7 21.5 8 22 12 22 C16 22 17 21.5 17 21 C17 19 17 17 16.5 15 L17 12 C17 9 15 7.5 13.5 6 L13.5 4.5 Z" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-mineralwasser)"/>
  <!-- Grip rib grooves -->
  <path d="M7.5 14 C10 14.5 14 14.5 16.5 14 M7.2 16.5 C10 17 14 17 16.8 16.5" fill="none" stroke="#0284C7" stroke-width="1.4" stroke-linecap="round"/>
  <!-- Effervescent water bubbles inside -->
  <circle cx="12" cy="18.5" r="0.9" fill="#F8FAFC"/>
  <circle cx="10" cy="15" r="0.7" fill="#F8FAFC"/>
  <circle cx="14" cy="12" r="0.8" fill="#F8FAFC"/>
  <circle cx="11.5" cy="9.5" r="0.6" fill="#F8FAFC"/>
</svg>`,

  // 14. Schnaps
  'Schnaps': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-schnaps" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#A5B4FC" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Heavy-bottom shot glass with drink level and fresh lemon wedge on rim -->
  <path d="M6 5 L18 5 L16 19 C16 20.5 15 21 13.5 21 L10.5 21 C9 21 8 20.5 8 19 Z" fill="#A5B4FC" fill-opacity="0.14"/>
  <path d="M6 5 L18 5 L16 19 C16 20.5 15 21 13.5 21 L10.5 21 C9 21 8 20.5 8 19 Z" fill="none" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-schnaps)"/>
  <!-- Solid thick glass bottom -->
  <path d="M8.5 17 L15.5 17" fill="none" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round"/>
  <!-- Liquid level -->
  <path d="M7 9 C10 10 14 10 17 9" fill="none" stroke="#60A5FA" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Fresh lemon wedge resting on glass rim -->
  <path d="M4 3.5 C5.5 1.5 8 2 8 4.5 C6.5 5 4.5 4.5 4 3.5 Z" fill="#FDE047" fill-opacity="0.4" stroke="#FACC15" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  // 15. Schokolade
  'Schokolade': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-schokolade" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#92400E" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Chocolate bar: peeled back foil exposing 4 beveled chocolate squares -->
  <rect x="5" y="3" width="14" height="18" rx="2" fill="#78350F" fill-opacity="0.2"/>
  <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="#92400E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-schokolade)"/>
  <!-- 4 Glossy chocolate snap-squares -->
  <rect x="6.5" y="4.5" width="4.8" height="3.8" rx="0.8" fill="#451A03" fill-opacity="0.4" stroke="#B45309" stroke-width="1.4"/>
  <rect x="12.7" y="4.5" width="4.8" height="3.8" rx="0.8" fill="#451A03" fill-opacity="0.4" stroke="#B45309" stroke-width="1.4"/>
  <rect x="6.5" y="9.5" width="4.8" height="3" rx="0.8" fill="#451A03" fill-opacity="0.4" stroke="#B45309" stroke-width="1.4"/>
  <rect x="12.7" y="9.5" width="4.8" height="3" rx="0.8" fill="#451A03" fill-opacity="0.4" stroke="#B45309" stroke-width="1.4"/>
  <!-- Peeled zigzag foil line -->
  <path d="M5 13 L8 14.5 L12 13 L16 15 L19 13.5" fill="none" stroke="#F8FAFC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Paper wrapper banderole stripe at bottom -->
  <path d="M5 18 L19 18" fill="none" stroke="#F59E0B" stroke-width="1.6" stroke-linecap="round"/>
</svg>`,

  // 16. Sirup
  'Sirup': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-sirup" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#D97706" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Sleek syrup bottle with pour spout cap and slow viscous drop -->
  <rect x="10.5" y="2" width="3" height="2.5" rx="0.5" fill="#D97706" fill-opacity="0.4" stroke="#D97706" stroke-width="1.6"/>
  <path d="M13.5 3 L15.5 3.5" fill="none" stroke="#D97706" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Bottle body with slender neck -->
  <path d="M10.5 4.5 L10.5 7 L8 10 L8 21 C8 21.5 8.5 22 9.5 22 L14.5 22 C15.5 22 16 21.5 16 21 L16 10 L13.5 7 L13.5 4.5 Z" fill="#D97706" fill-opacity="0.16"/>
  <path d="M10.5 4.5 L10.5 7 L8 10 L8 21 C8 21.5 8.5 22 9.5 22 L14.5 22 C15.5 22 16 21.5 16 21 L16 10 L13.5 7 L13.5 4.5 Z" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-sirup)"/>
  <!-- Viscous drop running from spout -->
  <path d="M16 5 C17 6 17 7.5 16 8.5 C15 7.5 15 6 16 5 Z" fill="#F59E0B" stroke="#F59E0B" stroke-width="1"/>
  <!-- Viscous syrup fluid surface -->
  <path d="M8 15 C10 14 14 16 16 15" fill="none" stroke="#F59E0B" stroke-width="1.6" stroke-linecap="round"/>
</svg>`,

  // 17. Blumen
  'Blumen': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-blumen" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EC4899" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Graceful blooming tulip flower with stem and slender leaves -->
  <!-- Flower cup petals -->
  <path d="M12 12 C8 12 6 8 8 3 C10 5.5 11 8 12 12 Z" fill="#EC4899" fill-opacity="0.25" stroke="#EC4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-blumen)"/>
  <path d="M12 12 C16 12 18 8 16 3 C14 5.5 13 8 12 12 Z" fill="#EC4899" fill-opacity="0.25" stroke="#EC4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-blumen)"/>
  <path d="M10 4 C11 2 13 2 14 4" fill="none" stroke="#F472B6" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Stem -->
  <path d="M12 12 L12 22" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round"/>
  <!-- Graceful tulip leaves -->
  <path d="M12 18 C8.5 17 6 14 7 10 C8.5 13 10.5 15.5 12 16" fill="#22C55E" fill-opacity="0.2" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 19 C15.5 18 18 15 17 12 C15.5 15 13.5 17 12 18" fill="#22C55E" fill-opacity="0.2" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  // 18. Blumenerde
  'Blumenerde': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-blumenerde" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#78350F" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Soil sack with garden trowel and tender green sprout (NO text) -->
  <!-- Soil sack body -->
  <path d="M6 8 L18 8 L19 21 L5 21 Z" fill="#78350F" fill-opacity="0.2"/>
  <path d="M6 8 L18 8 L19 21 L5 21 Z" fill="none" stroke="#78350F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-blumenerde)"/>
  <!-- Sack top fold & handle -->
  <path d="M7 5 L17 5 L18 8 L6 8 Z" fill="#92400E" fill-opacity="0.3" stroke="#92400E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="10" y="6" width="4" height="1" rx="0.5" fill="#F8FAFC"/>
  <!-- Fresh young two-leaf seedling sprout on front of bag -->
  <path d="M12 17 L12 12" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 12 C10 10.5 8 11.5 9 13.5 C10.5 13.5 11.5 12.5 12 12 Z" fill="#22C55E" fill-opacity="0.4" stroke="#22C55E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 12 C14 10.5 16 11.5 15 13.5 C13.5 13.5 12.5 12.5 12 12 Z" fill="#22C55E" fill-opacity="0.4" stroke="#22C55E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  // 19. Gemüse
  'Gemuese': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-gemuese" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#22C55E" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Harmonious trio: crisp carrot with green fronds, ripe tomato with star calyx, and broccoli floret -->
  <!-- Top: Broccoli floret -->
  <path d="M10 7 C8.5 7 8 5.5 9 4.5 C9 3.5 10.5 3 11.5 3.5 C12.5 2.5 14 2.5 15 3.5 C16 3.5 16.5 4.5 16 5.5 C17 6.5 16 7.5 14.5 7.5 Z" fill="#10B981" fill-opacity="0.3" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M11.5 7.5 L11.5 9.5 L13.5 9.5 L13.5 7.5" fill="none" stroke="#059669" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Left: Carrot pointing down -->
  <path d="M4 14 L11 21 C11 21 11.5 20.5 12 19.5 L6 13 Z" fill="#FF6B00" fill-opacity="0.25" stroke="#FF6B00" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4 14 C3 12 2 11 1 11 M4 14 C4.5 12 5.5 11 6 10" fill="none" stroke="#22C55E" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Right: Plump tomato with star calyx -->
  <circle cx="16" cy="16" r="4.5" fill="#FF3B30" fill-opacity="0.25" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 11.5 L15 10.5 M16 11.5 L17 10.5 M16 11.5 L16 9.5" fill="none" stroke="#22C55E" stroke-width="1.6" stroke-linecap="round"/>
</svg>`,

  // 20. Geschenkpapier
  'Geschenkpapier': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-geschenkpapier" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EC4899" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Slender wrapping paper roll unrolling with star pattern and curling ribbon -->
  <!-- Cylinder roll -->
  <ellipse cx="6" cy="5" rx="3" ry="1.5" fill="#EC4899" fill-opacity="0.3" stroke="#EC4899" stroke-width="1.8"/>
  <ellipse cx="6" cy="5" rx="1.2" ry="0.6" fill="#F8FAFC"/>
  <path d="M3 5 L3 19 C3 20 4.5 20.5 6 20.5 C7.5 20.5 9 20 9 19 L9 5" fill="none" stroke="#EC4899" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Unrolling festive paper sheet to the right -->
  <path d="M9 12 C13 11 16 13 21 11 L21 19 C16 21 13 19 9 20" fill="#EC4899" fill-opacity="0.15"/>
  <path d="M9 12 C13 11 16 13 21 11 L21 19 C16 21 13 19 9 20" fill="none" stroke="#EC4899" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-geschenkpapier)"/>
  <!-- Decorative star motif on unrolled sheet -->
  <path d="M15 15 L16 13 L17 15 L19 16 L17 17 L16 19 L15 17 L13 16 Z" fill="#FACC15" stroke="#FACC15" stroke-width="0.8"/>
</svg>`,

  // 21. Gießkanne
  'Giesskanne': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-giesskanne" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#06B6D4" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Garden watering can with rounded body, overhead arched handle, long angled spout & shower head -->
  <!-- Body -->
  <path d="M7 11 L15 11 C15.5 11 16 11.5 16 12 L15 20 C15 20.5 14.5 21 14 21 L8 21 C7.5 21 7 20.5 7 20 L6 12 C6 11.5 6.5 11 7 11 Z" fill="#06B6D4" fill-opacity="0.16"/>
  <path d="M7 11 L15 11 C15.5 11 16 11.5 16 12 L15 20 C15 20.5 14.5 21 14 21 L8 21 C7.5 21 7 20.5 7 20 L6 12 C6 11.5 6.5 11 7 11 Z" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-giesskanne)"/>
  <!-- Overhead carry handle -->
  <path d="M8 11 C8 5.5 14 5.5 14 11" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round"/>
  <!-- Rear pour handle -->
  <path d="M15.5 13 C17.5 13 18.5 15 17.5 18" fill="none" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Long angled spout -->
  <path d="M7 17 L2 9.5" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round"/>
  <!-- Rose shower head with sprinkler face -->
  <path d="M1 8 L3.5 11" fill="none" stroke="#22D3EE" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Delicate water drops -->
  <circle cx="1" cy="13" r="0.6" fill="#38BDF8"/>
  <circle cx="2" cy="15" r="0.6" fill="#38BDF8"/>
</svg>`,

  // 22. Nagel
  'Naegel': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-naegel" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#94A3B8" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Sharp steel nails: flat striking head, grip ribbed neck, cylindrical shaft & sharp point -->
  <!-- Primary diagonal nail -->
  <path d="M5 6 L8.5 2.5 L10 4 L6.5 7.5 Z" fill="#94A3B8" stroke="#94A3B8" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M7.5 5.5 L19 17" fill="none" stroke="#F8FAFC" stroke-width="2.2" stroke-linecap="round" filter="url(#glow-naegel)"/>
  <!-- Grip grooves under head -->
  <path d="M9 8 L10.5 6.5 M10.5 9.5 L12 8" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Tapered sharp nail tip -->
  <path d="M19 17 L22 20 L18 19 Z" fill="#F8FAFC" stroke="#F8FAFC" stroke-width="1"/>
  <!-- Secondary smaller nail crossing in background -->
  <path d="M15 3 L18.5 6.5" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
  <path d="M16.5 5 L8 13.5 L5 15" fill="none" stroke="#64748B" stroke-width="1.8" stroke-linecap="round"/>
</svg>`,

  // 23. Nutella
  'Nutella': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-nutella" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#78350F" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Unmistakable Nutella jar: white screw lid, flared glass shoulders, cocoa hazelnut cream & label -->
  <!-- White screw lid with vertical ridges -->
  <rect x="8" y="2.5" width="8" height="4" rx="1" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M10.5 3.5 L10.5 5.5 M13.5 3.5 L13.5 5.5" fill="none" stroke="#CBD5E1" stroke-width="1.2" stroke-linecap="round"/>
  <!-- Flared glass jar body -->
  <path d="M8 6.5 L6 9.5 C5 12 5 19 6.5 21 C7.5 21.5 16.5 21.5 17.5 21 C19 19 19 12 18 9.5 L16 6.5 Z" fill="#451A03" fill-opacity="0.25"/>
  <path d="M8 6.5 L6 9.5 C5 12 5 19 6.5 21 C7.5 21.5 16.5 21.5 17.5 21 C19 19 19 12 18 9.5 L16 6.5 Z" fill="none" stroke="#78350F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-nutella)"/>
  <!-- Classic white label -->
  <rect x="7" y="11" width="10" height="7" rx="1.5" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>
  <!-- Hazelnut icon on label -->
  <circle cx="12" cy="14.5" r="1.8" fill="#D97706"/>
  <path d="M10.5 14 C11.5 13 12.5 13 13.5 14" fill="none" stroke="#78350F" stroke-width="0.8"/>
</svg>`,

  // 24. fleisch_allgemein
  'fleisch_allgemein': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-fleisch-allgemein" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Juicy butcher's cutlet with bone marrow circle and marbling -->
  <path d="M5 9 C5 5.5 9 4.5 14 5 C19 5.5 20 9.5 20 14 C20 18 16 20 11 20 C6 20 5 16 5 12 Z" fill="#EF4444" fill-opacity="0.18"/>
  <path d="M5 9 C5 5.5 9 4.5 14 5 C19 5.5 20 9.5 20 14 C20 18 16 20 11 20 C6 20 5 16 5 12 Z" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-fleisch-allgemein)"/>
  <!-- White fat cap rim -->
  <path d="M5 9 C5 5.5 9 4.5 14 5 C17 5.5 18.5 7 19.5 9" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Bone marrow circle -->
  <circle cx="9" cy="11" r="2.2" fill="#F8FAFC" stroke="#F8FAFC" stroke-width="1.5"/>
  <circle cx="9" cy="11" r="1" fill="#FCA5A5"/>
  <!-- Meat marbling grains -->
  <path d="M13 9 C15 10 16 13 15 16 M11 15 C13 16.5 15 16.5 17 15" fill="none" stroke="#FCA5A5" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 25. Haarspray
  'Haarspray': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-haarspray" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#C084FC" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Sleek aerosol spray can with actuator button and expanding fine mist spray (NO text) -->
  <rect x="8" y="9" width="8" height="13" rx="1.5" fill="#C084FC" fill-opacity="0.16"/>
  <rect x="8" y="9" width="8" height="13" rx="1.5" fill="none" stroke="#C084FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-haarspray)"/>
  <!-- Domed shoulder & actuator push button -->
  <path d="M8 9 C8 7.5 10 6.5 12 6.5 C14 6.5 16 7.5 16 9" fill="none" stroke="#C084FC" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="10.5" y="4" width="3" height="2.5" rx="0.5" fill="#F8FAFC" stroke="#F8FAFC" stroke-width="1.2"/>
  <!-- Expanding conical fine mist spray to the left -->
  <path d="M9.5 4.8 L4 2 M9.5 5.2 L3 5.2 M9.5 5.6 L4 8.5" fill="none" stroke="#38BDF8" stroke-width="1.4" stroke-linecap="round"/>
  <circle cx="5" cy="3.5" r="0.6" fill="#38BDF8"/>
  <circle cx="2" cy="5.2" r="0.7" fill="#38BDF8"/>
  <circle cx="5" cy="7" r="0.6" fill="#38BDF8"/>
</svg>`,

  // 26. Waschmittel
  'Waschmittel': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-waschmittel" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#0EA5E9" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Heavy-duty laundry detergent jug with ergonomic integrated handle & measuring cap -->
  <path d="M7 8 L10 4 L14 4 L14 7 L17 9 C19 10.5 19.5 13 19.5 16 C19.5 19.5 18 22 14 22 L8 22 C5 22 4.5 19.5 4.5 16 C4.5 12.5 5.5 10 7 8 Z" fill="#0EA5E9" fill-opacity="0.16"/>
  <path d="M7 8 L10 4 L14 4 L14 7 L17 9 C19 10.5 19.5 13 19.5 16 C19.5 19.5 18 22 14 22 L8 22 C5 22 4.5 19.5 4.5 16 C4.5 12.5 5.5 10 7 8 Z" fill="none" stroke="#0EA5E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-waschmittel)"/>
  <!-- Ergonomic handle cutout hole -->
  <path d="M14 11 C15.5 12 16 13.5 16 15.5 C16 17.5 15.5 18.5 14 19 Z" fill="#0B0F19" stroke="#0EA5E9" stroke-width="1.8" stroke-linejoin="round"/>
  <!-- Dosing measuring cap on spout -->
  <rect x="9.5" y="2" width="5" height="3" rx="0.8" fill="#F59E0B" fill-opacity="0.4" stroke="#F59E0B" stroke-width="1.6"/>
  <!-- Fresh clean bubbles -->
  <circle cx="8" cy="14" r="1.2" fill="#F8FAFC"/>
  <circle cx="10" cy="12" r="0.8" fill="#F8FAFC"/>
</svg>`,

  // 27. Wattepads
  'Wattepads': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-wattepads" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#38BDF8" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Stack of round cosmetic cotton pads with quilted border & soft volume -->
  <!-- Top pad -->
  <ellipse cx="12" cy="8.5" rx="8" ry="4.5" fill="#F8FAFC" fill-opacity="0.2"/>
  <ellipse cx="12" cy="8.5" rx="8" ry="4.5" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-wattepads)"/>
  <!-- Quilted stitched border edge -->
  <ellipse cx="12" cy="8.5" rx="6.5" ry="3.5" fill="none" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 1.5"/>
  <!-- Layer 2 -->
  <path d="M4 11.5 C4 14 7.5 15.5 12 15.5 C16.5 15.5 20 14 20 11.5" fill="none" stroke="#F8FAFC" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Layer 3 (bottom) -->
  <path d="M4 14.5 C4 17 7.5 18.5 12 18.5 C16.5 18.5 20 17 20 14.5" fill="none" stroke="#F8FAFC" stroke-width="1.8" stroke-linecap="round"/>
</svg>`,

  // 28. Zahnpasta
  'Zahnpasta': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-zahnpasta" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#06B6D4" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Standing toothpaste tube with crimped end, cap, and fresh two-tone toothpaste swirl -->
  <!-- Crimped end -->
  <path d="M7 21 L17 21" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round"/>
  <!-- Tapered tube body -->
  <path d="M7 21 L8.5 9 C8.5 7.5 10 6.5 12 6.5 C14 6.5 15.5 7.5 15.5 9 L17 21 Z" fill="#06B6D4" fill-opacity="0.16"/>
  <path d="M7 21 L8.5 9 C8.5 7.5 10 6.5 12 6.5 C14 6.5 15.5 7.5 15.5 9 L17 21 Z" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-zahnpasta)"/>
  <!-- Screw cap -->
  <rect x="10.5" y="3.5" width="3" height="3" rx="0.6" fill="#F8FAFC" stroke="#F8FAFC" stroke-width="1.4"/>
  <!-- Iconic dynamic toothpaste wave/swirl -->
  <path d="M15 14 C17 13 21 12 20 9 C19 7 16 8.5 15 10.5" fill="none" stroke="#38BDF8" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M16 13 C18 12.2 20 11.5 19.5 9.8" fill="none" stroke="#F8FAFC" stroke-width="1.2" stroke-linecap="round"/>
  <!-- Sparkle clean star -->
  <path d="M19 3 L19.5 4.5 L21 5 L19.5 5.5 L19 7 L18.5 5.5 L17 5 L18.5 4.5 Z" fill="#F8FAFC"/>
</svg>`,

  // 29. Bratensauce
  'Bratensauce': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-bratensauce" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#D97706" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Elegant gravy boat (Sauciere) on pedestal foot with pouring spout and looping handle -->
  <!-- Pedestal foot -->
  <path d="M9 19 L8 21 L16 21 L15 19 Z" fill="#92400E" fill-opacity="0.3" stroke="#D97706" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Sauciere body & spout -->
  <path d="M3 10 C3 16 8 18 12 18 C16 18 20 16 20 11 L19 9 L12 10 L5 9 Z" fill="#78350F" fill-opacity="0.25"/>
  <path d="M3 10 C3 16 8 18 12 18 C16 18 20 16 20 11 L19 9 L12 10 L5 9 Z" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-bratensauce)"/>
  <!-- Graceful looping handle -->
  <path d="M19 9 C22 9 23 14 18 15" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round"/>
  <!-- Rich dark roast gravy pouring lip -->
  <path d="M4 10 C2.5 8.5 3 7 5 8.5" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M6 10 C9 11.5 15 11.5 18 10" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 30. Butter
  'Butter': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-butter" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FACC15" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Beautiful isometric butter block with butter curl on butter dish plate -->
  <!-- Plate rim -->
  <path d="M2 17 L12 22 L22 17" fill="none" stroke="#CBD5E1" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Butter block: Top face -->
  <path d="M4 10 L12 6 L20 10 L12 14 Z" fill="#FDE047" fill-opacity="0.35" stroke="#FACC15" stroke-width="1.8" stroke-linejoin="round" filter="url(#glow-butter)"/>
  <!-- Left face -->
  <path d="M4 10 L4 16 L12 20 L12 14 Z" fill="#EAB308" fill-opacity="0.25" stroke="#FACC15" stroke-width="1.8" stroke-linejoin="round"/>
  <!-- Right face -->
  <path d="M20 10 L20 16 L12 20 L12 14 Z" fill="#CA8A04" fill-opacity="0.2" stroke="#FACC15" stroke-width="1.8" stroke-linejoin="round"/>
  <!-- Butter curl on top -->
  <path d="M10 9 C11 8 13 8 14 9 C14.5 9.5 13.5 10.5 12 10" fill="none" stroke="#F8FAFC" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 31. Mais
  'Mais': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-mais" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FACC15" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Conical ear of corn with distinct kernel grid and peeling green husks -->
  <!-- Corn cob core -->
  <path d="M8.5 16 C7 11 8 4.5 12 2 C16 4.5 17 11 15.5 16 Z" fill="#FACC15" fill-opacity="0.22"/>
  <path d="M8.5 16 C7 11 8 4.5 12 2 C16 4.5 17 11 15.5 16 Z" fill="none" stroke="#FACC15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-mais)"/>
  <!-- Kernel tiers and vertical dividers -->
  <path d="M9 6 C10.5 7 13.5 7 15 6 M8.5 9.5 C10.5 10.5 13.5 10.5 15.5 9.5 M8.5 13 C10.5 14 13.5 14 15.5 13" fill="none" stroke="#EAB308" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M12 2 L12 16 M10.2 6 L10.2 15 M13.8 6 L13.8 15" fill="none" stroke="#EAB308" stroke-width="1.2" stroke-linecap="round"/>
  <!-- Peeling green husks wrapping from stem -->
  <path d="M12 22 C10 19 6 17 5 12 C5 9 6.5 8 7 11 C8 15 10 18 12 22" fill="#22C55E" fill-opacity="0.2" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 22 C14 19 18 17 19 12 C19 9 17.5 8 17 11 C16 15 14 18 12 22" fill="#22C55E" fill-opacity="0.2" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  // 32. Nougatcreme
  'Nougatcreme': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-nougatcreme" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#78350F" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Rounded glass jar of hazelnut chocolate nougat with lid and hazelnut -->
  <rect x="7" y="4" width="10" height="3" rx="0.8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.8"/>
  <rect x="6" y="7" width="12" height="14" rx="3" fill="#451A03" fill-opacity="0.22"/>
  <rect x="6" y="7" width="12" height="14" rx="3" fill="none" stroke="#78350F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-nougatcreme)"/>
  <!-- Glass reflection & cream swirl inside -->
  <path d="M8.5 9 L15.5 9" fill="none" stroke="#A16207" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M8 13 C10 12 14 14 16 13" fill="none" stroke="#D97706" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Whole hazelnut with leafy cap -->
  <circle cx="12" cy="16.5" r="2" fill="#D97706" stroke="#B45309" stroke-width="1"/>
  <path d="M10.5 15.5 C11.5 14.5 12.5 14.5 13.5 15.5" fill="none" stroke="#78350F" stroke-width="1" stroke-linecap="round"/>
</svg>`,

  // 33. Nudeln
  'Nudeln': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-nudeln" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FACC15" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- European pasta: pinched Farfalle bow-tie and helical Fusilli spiral -->
  <!-- Farfalle (bow-tie pasta) on left -->
  <path d="M4 6 C5 7.5 5 9.5 4 11 C5 12.5 5 14.5 4 16 C7 15 9 13.5 10 11 C9 8.5 7 7 4 6 Z" fill="#FACC15" fill-opacity="0.25" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-nudeln)"/>
  <path d="M16 6 C15 7.5 15 9.5 16 11 C15 12.5 15 14.5 16 16 C13 15 11 13.5 10 11 C11 8.5 13 7 16 6 Z" fill="#FACC15" fill-opacity="0.25" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-nudeln)"/>
  <path d="M9.5 9 L10.5 13" fill="none" stroke="#D97706" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Fusilli (spiral pasta) on right -->
  <path d="M18 4 C20 5 21 7 19 8 C17 9 16 11 18 12 C20 13 21 15 19 16 C17 17 16 19 18 20" fill="none" stroke="#FACC15" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-nudeln)"/>
  <path d="M19 6 C17.5 7 17.5 8.5 19 10 C20.5 11.5 17 13.5 18 14.5" fill="none" stroke="#EAB308" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,

  // 34. Nüsse
  'Nuesse': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-nuesse" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#B45309" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Half-cracked walnut shell with brain-like kernel beside a hazelnut -->
  <!-- Walnut shell & kernel -->
  <path d="M4 14 C3 9 7 5 11 6 C15 7 16 12 15 17 C14 20 8 20 4 14 Z" fill="#78350F" fill-opacity="0.2"/>
  <path d="M4 14 C3 9 7 5 11 6 C15 7 16 12 15 17 C14 20 8 20 4 14 Z" fill="none" stroke="#B45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-nuesse)"/>
  <path d="M10.5 6 C10 11 10 15 11 19" fill="none" stroke="#78350F" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Walnut kernel folds -->
  <path d="M7 9 C8 8 9.5 8.5 9.5 10 C9.5 11.5 8 12 7 11 M7.5 13 C8.5 14 10 13.5 10 12 M7 16 C8 17 10 16 10.5 15" fill="none" stroke="#D97706" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Smooth hazelnut on right with cap -->
  <path d="M15 13 C14 10 17 8 19 9 C21 10 22 13 21 16 C20 18.5 18 19 16.5 17.5 Z" fill="#D97706" fill-opacity="0.25" stroke="#B45309" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 9.5 C17 8 19 8 21 9" fill="none" stroke="#78350F" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 35. Penne
  'Penne': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-penne" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FACC15" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Trio of Penne Rigate with 45° diagonal cut ends and parallel ridged grooves -->
  <!-- Penne 1 (diagonal across center) -->
  <path d="M6 6 L16 16 M8 4 L18 14" fill="none" stroke="#FACC15" stroke-width="2" stroke-linecap="round" filter="url(#glow-penne)"/>
  <!-- 45° cut ends -->
  <ellipse cx="7" cy="5" rx="1.5" ry="2.2" transform="rotate(45 7 5)" fill="#EAB308" fill-opacity="0.4" stroke="#FACC15" stroke-width="1.8"/>
  <ellipse cx="17" cy="15" rx="1.5" ry="2.2" transform="rotate(45 17 15)" fill="#EAB308" fill-opacity="0.4" stroke="#FACC15" stroke-width="1.8"/>
  <!-- Longitudinal ridges (Rigate) -->
  <path d="M7.5 7 L16.5 16 M9 5.5 L17.5 14" fill="none" stroke="#EAB308" stroke-width="1.2" stroke-linecap="round"/>
  <!-- Penne 2 (upper right) -->
  <path d="M12 3 L19 10 M14 1.5 L21 8.5" fill="none" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Penne 3 (lower left) -->
  <path d="M3 15 L10 22 M5 13.5 L12 20.5" fill="none" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round"/>
</svg>`,

  // 36. Soyasauce
  'Soyasauce': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-soyasauce" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Iconic Japanese dispenser bottle with red twin-spout cap & dark soy sauce (NO text) -->
  <!-- Iconic red twin pour spout cap -->
  <path d="M9 5 C9 3.5 15 3.5 15 5 L15 7 L9 7 Z" fill="#EF4444" stroke="#EF4444" stroke-width="1.5" stroke-linejoin="round" filter="url(#glow-soyasauce)"/>
  <path d="M9 6 L6 5 L6.5 7 L9 7 M15 6 L18 5 L17.5 7 L15 7" fill="#EF4444" stroke="#EF4444" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Teardrop glass bottle body -->
  <path d="M9.5 7 L9.5 9 C7 11 5 15 5 18 C5 20.5 7.5 22 12 22 C16.5 22 19 20.5 19 18 C19 15 17 11 14.5 9 L14.5 7 Z" fill="#451A03" fill-opacity="0.3"/>
  <path d="M9.5 7 L9.5 9 C7 11 5 15 5 18 C5 20.5 7.5 22 12 22 C16.5 22 19 20.5 19 18 C19 15 17 11 14.5 9 L14.5 7 Z" fill="none" stroke="#78350F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Dark fermented soy sauce fill level -->
  <path d="M6 16 C8.5 15 15.5 15 18 16" fill="none" stroke="#EF4444" stroke-width="1.6" stroke-linecap="round"/>
</svg>`,

  // 37. Spaghetti
  'Spaghetti': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-spaghetti" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FACC15" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Fork lifting twirled, wavy strands of pasta with graceful hanging spaghetti ribbons -->
  <!-- Fork handle & tines -->
  <path d="M12 2 L12 7" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/>
  <path d="M9 7 C9 9 15 9 15 7" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/>
  <path d="M9.5 7 L9.5 10 M11 7 L11 10 M13 7 L13 10 M14.5 7 L14.5 10" fill="none" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round"/>
  <!-- Swirling pasta loops twirled around tines -->
  <path d="M7 10 C5 11 7 13 10 13 C14 13 17 11 15 10 C13 9 9 9 7 10 Z" fill="#FACC15" fill-opacity="0.25" stroke="#FACC15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-spaghetti)"/>
  <path d="M6 12 C5 14 9 15 12 15 C15.5 15 18 14 17 12" fill="none" stroke="#FACC15" stroke-width="2" stroke-linecap="round" filter="url(#glow-spaghetti)"/>
  <!-- Cascading dangling spaghetti strands -->
  <path d="M8 14 C7.5 17 10 19 9 22" fill="none" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M11 15 C11 18 12.5 19 12 22" fill="none" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M14 14.5 C14.5 17 13 19 14.5 22" fill="none" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round"/>
</svg>`,

  // 38. Bratwurst
  'Bratwurst': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-bratwurst" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Evenly curved grilled sausage with rounded ends and diagonal score marks -->
  <path d="M4 15 C3 10 6 6 11 6 C16 6 20 9 21 14 C21 16.5 19 18 17.5 17 C16 16 15 12 12 11.5 C9 11 7 13 6 16 C5 17.5 3.5 17 4 15 Z" fill="#EF4444" fill-opacity="0.18"/>
  <path d="M4 15 C3 10 6 6 11 6 C16 6 20 9 21 14 C21 16.5 19 18 17.5 17 C16 16 15 12 12 11.5 C9 11 7 13 6 16 C5 17.5 3.5 17 4 15 Z" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-bratwurst)"/>
  <!-- Classic diagonal grill score cuts -->
  <path d="M7 9 L8.5 11.5 M10 7.5 L11.5 10 M13 7.5 L14.5 10 M16 9 L17.5 11.5" fill="none" stroke="#78350F" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Sizzling steam wisps -->
  <path d="M10 3 C10.5 4 10 5 10.5 5.5 M14 2.5 C14.5 3.5 14 4.5 14.5 5.5" fill="none" stroke="#FCA5A5" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,

  // 39. Chicken Wings
  'Chicken Wings': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-chicken-wings" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#F59E0B" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Two crispy golden-brown drumettes/wings with clean white knuckle bones -->
  <!-- Background wing -->
  <path d="M10 5 C13 3 17 4 19 7 C20 9 19 12 17 13" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round"/>
  <path d="M18 11 L21 13" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Foreground crispy wing -->
  <path d="M6 10 C4 6 8 3 13 5 C16 6.5 17 11 15 14 C13 16 9 16 6 10 Z" fill="#F59E0B" fill-opacity="0.22"/>
  <path d="M6 10 C4 6 8 3 13 5 C16 6.5 17 11 15 14 C13 16 9 16 6 10 Z" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-chicken-wings)"/>
  <!-- Protruding white knuckle bone -->
  <path d="M14 13 L18 17" fill="none" stroke="#F8FAFC" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="18" cy="18" r="1.3" fill="#F8FAFC"/>
  <!-- Crispy skin sear texture -->
  <path d="M8.5 8 C10.5 9.5 13 9.5 14 8.5" fill="none" stroke="#B45309" stroke-width="1.6" stroke-linecap="round"/>
</svg>`,

  // 40. Fischstäbchen
  'Fischstaebchen': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-fischstaebchen" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#F59E0B" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Golden crumbed fish fingers with rounded edges and fresh lemon wedge -->
  <!-- Top fish finger -->
  <rect x="3" y="10" width="15" height="4" rx="2" fill="#F59E0B" fill-opacity="0.25"/>
  <rect x="3" y="10" width="15" height="4" rx="2" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-fischstaebchen)"/>
  <!-- Middle fish finger offset -->
  <rect x="5" y="14" width="15" height="4" rx="2" fill="#F59E0B" fill-opacity="0.25" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-fischstaebchen)"/>
  <!-- Bottom fish finger -->
  <rect x="4" y="18" width="15" height="3.5" rx="1.8" fill="#F59E0B" fill-opacity="0.25" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-fischstaebchen)"/>
  <!-- Crispy breadcrumb texture dots -->
  <circle cx="7" cy="12" r="0.6" fill="#D97706"/>
  <circle cx="12" cy="12" r="0.6" fill="#D97706"/>
  <circle cx="9" cy="16" r="0.6" fill="#D97706"/>
  <!-- Fresh lemon wedge on top right -->
  <path d="M16 4 C19 4 21 6 21 9 L16 9 Z" fill="#FDE047" fill-opacity="0.4" stroke="#FACC15" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,

  // 41. Fleisch
  'Fleisch': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-fleisch" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Butcher's roast/cutlet with bone marrow circle and marbling -->
  <path d="M5 9 C5 5.5 9 4.5 14 5 C19 5.5 20 9.5 20 14 C20 18 16 20 11 20 C6 20 5 16 5 12 Z" fill="#EF4444" fill-opacity="0.18"/>
  <path d="M5 9 C5 5.5 9 4.5 14 5 C19 5.5 20 9.5 20 14 C20 18 16 20 11 20 C6 20 5 16 5 12 Z" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-fleisch)"/>
  <!-- White fat cap rim -->
  <path d="M5 9 C5 5.5 9 4.5 14 5 C17 5.5 18.5 7 19.5 9" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Bone marrow circle -->
  <circle cx="9" cy="11" r="2.2" fill="#F8FAFC" stroke="#F8FAFC" stroke-width="1.5"/>
  <circle cx="9" cy="11" r="1" fill="#FCA5A5"/>
  <!-- Meat marbling grains -->
  <path d="M13 9 C15 10 16 13 15 16 M11 15 C13 16.5 15 16.5 17 15" fill="none" stroke="#FCA5A5" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 42. Frankfurter
  'Frankfurter': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-frankfurter" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FB7185" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Pair of slender curved Frankfurter / Wiener sausages linked at top -->
  <!-- Natural casing link twist at top -->
  <path d="M12 3 C11 2 13 2 12 3" fill="none" stroke="#F43F5E" stroke-width="2" stroke-linecap="round"/>
  <!-- Left sausage -->
  <path d="M11 3.5 C8 5.5 6 9.5 6 14.5 C6 19 8 21 10 20.5 C11 20 10 17.5 9.5 14.5 C9 10.5 10 5.5 11 3.5 Z" fill="#FB7185" fill-opacity="0.22"/>
  <path d="M11 3.5 C8 5.5 6 9.5 6 14.5 C6 19 8 21 10 20.5 C11 20 10 17.5 9.5 14.5 C9 10.5 10 5.5 11 3.5 Z" fill="none" stroke="#FB7185" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-frankfurter)"/>
  <!-- Right sausage -->
  <path d="M13 3.5 C14 5.5 16 9.5 16 14.5 C16 19 14 21 12 20.5 C11 20 12 17.5 12.5 14.5 C13 10.5 12 5.5 13 3.5 Z" fill="#FB7185" fill-opacity="0.22"/>
  <path d="M13 3.5 C14 5.5 16 9.5 16 14.5 C16 19 14 21 12 20.5 C11 20 12 17.5 12.5 14.5 C13 10.5 12 5.5 13 3.5 Z" fill="none" stroke="#FB7185" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-frankfurter)"/>
  <!-- Bottom casing knotted tips -->
  <path d="M9.5 20.5 L9.5 22 M12.5 20.5 L12.5 22" fill="none" stroke="#F43F5E" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 43. Hähnchen
  'Haehnchen': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-haehnchen" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#F59E0B" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Whole golden roasted chicken with plump breast and drumsticks -->
  <path d="M6 14 C5 9 8 6 12 6 C16 6 19 9 18 14 C17 19 15 21 12 21 C9 21 7 19 6 14 Z" fill="#F59E0B" fill-opacity="0.2"/>
  <path d="M6 14 C5 9 8 6 12 6 C16 6 19 9 18 14 C17 19 15 21 12 21 C9 21 7 19 6 14 Z" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-haehnchen)"/>
  <!-- Left drumstick folded up -->
  <path d="M6 13 C3.5 13 3 16 5 18 C7 19.5 8.5 18 8.5 15 C8.5 13 7.5 13 6 13 Z" fill="#D97706" fill-opacity="0.3" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4 18 L2.5 20.5" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Right drumstick folded up -->
  <path d="M18 13 C20.5 13 21 16 19 18 C17 19.5 15.5 18 15.5 15 C15.5 13 16.5 13 18 13 Z" fill="#D97706" fill-opacity="0.3" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 18 L21.5 20.5" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Roast skin score marks -->
  <path d="M12 7 L12 14 M9.5 10 C11 11 13 11 14.5 10" fill="none" stroke="#B45309" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 44. Lachs
  'Lachs': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-lachs" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FB7185" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Horseshoe-shaped salmon steak tranche with spine bone and white fat striations -->
  <path d="M6 20 C3 16 3 8 7 4 C11 1.5 13 1.5 17 4 C21 8 21 16 18 20 C16 20 15 18 14 15 C13 12 11 12 10 15 C9 18 8 20 6 20 Z" fill="#FB7185" fill-opacity="0.22"/>
  <path d="M6 20 C3 16 3 8 7 4 C11 1.5 13 1.5 17 4 C21 8 21 16 18 20 C16 20 15 18 14 15 C13 12 11 12 10 15 C9 18 8 20 6 20 Z" fill="none" stroke="#FB7185" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-lachs)"/>
  <!-- Spine bone in center -->
  <circle cx="12" cy="9" r="1.5" fill="#F8FAFC" stroke="#F8FAFC" stroke-width="1"/>
  <!-- Intramuscular white fat lines radiating through salmon flesh -->
  <path d="M6.5 10 C8.5 10 10.5 8.5 11 7 M6 14 C8 13.5 10 12 11 10" fill="none" stroke="#F8FAFC" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M17.5 10 C15.5 10 13.5 8.5 13 7 M18 14 C16 13.5 14 12 13 10" fill="none" stroke="#F8FAFC" stroke-width="1.6" stroke-linecap="round"/>
</svg>`,

  // 45. Lamm
  'Lamm': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-lamm" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Tender lamb cutlet chop with round eye of meat and long slender rib bone -->
  <!-- Meat eye -->
  <path d="M6 13 C4 10.5 5 7 9 7 C13 7 15 10 14 14 C13 17 8 18 6 13 Z" fill="#EF4444" fill-opacity="0.22"/>
  <path d="M6 13 C4 10.5 5 7 9 7 C13 7 15 10 14 14 C13 17 8 18 6 13 Z" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-lamm)"/>
  <!-- Fat ribbon border -->
  <path d="M5 9 C7 6.5 11 6.5 13.5 8" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
  <!-- Long slender arched rib bone -->
  <path d="M12 9 C14 7 17 5 21 3" fill="none" stroke="#F8FAFC" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Meat marbling -->
  <path d="M8 10 C10 11 11 13 11 15" fill="none" stroke="#FCA5A5" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 46. Rindergeschnetzeltes
  'Rindergeschnetzeltes': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-rindergeschnetzeltes" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Sizzling skillet with tender beef strips and mushroom slice -->
  <!-- Cast iron skillet pan -->
  <ellipse cx="10.5" cy="13" rx="7.5" ry="6" fill="#1E293B" stroke="#64748B" stroke-width="2"/>
  <path d="M18 13 L22 13" fill="none" stroke="#64748B" stroke-width="2.5" stroke-linecap="round"/>
  <!-- Seared beef strips inside skillet -->
  <path d="M6 12 C7 10.5 10 10.5 11 12 C10 13.5 8 13.5 6 12 Z" fill="#DC2626" fill-opacity="0.5" stroke="#EF4444" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-rindergeschnetzeltes)"/>
  <path d="M9 14.5 C11 13.5 14 14.5 15 16 C13 17 11 16.5 9 14.5 Z" fill="#DC2626" fill-opacity="0.5" stroke="#EF4444" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-rindergeschnetzeltes)"/>
  <!-- Sliced mushroom in sauce -->
  <path d="M12 9 C12 8 13.5 8 13.5 9 L13.5 10.5 L12 10.5 Z" fill="#FDE047" stroke="#FACC15" stroke-width="1"/>
  <!-- Sizzling steam wisp -->
  <path d="M9 4.5 C9.5 3.5 9 2.5 9.5 2 M12 5 C12.5 4 12 3 12.5 2" fill="none" stroke="#FCA5A5" stroke-width="1.3" stroke-linecap="round"/>
</svg>`,

  // 47. Brezeln
  'Brezeln': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-brezeln" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#B45309" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Authentic Bavarian pretzel with plump belly cut, intertwined arms & salt crystals -->
  <path d="M12 21 C7 21 3 18 3 13 C3 9 6.5 7 9.5 10 L14.5 15.5 C16 17 18 16.5 19.5 15 C21 13 20 9 17 8 L12.5 13" fill="none" stroke="#B45309" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-brezeln)"/>
  <path d="M12 21 C17 21 21 18 21 13 C21 9 17.5 7 14.5 10 L9.5 15.5 C8 17 6 16.5 4.5 15 C3 13 4 9 7 8 L11.5 13" fill="none" stroke="#B45309" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-brezeln)"/>
  <!-- Characteristic Bavarian belly score cut -->
  <path d="M8.5 19.5 C10.5 20.2 13.5 20.2 15.5 19.5" fill="none" stroke="#FDE047" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Coarse sea salt crystals -->
  <rect x="6" y="16" width="1" height="1" rx="0.3" fill="#F8FAFC"/>
  <rect x="14" y="18" width="1" height="1" rx="0.3" fill="#F8FAFC"/>
  <rect x="17.5" y="14" width="1" height="1" rx="0.3" fill="#F8FAFC"/>
</svg>`,

  // 48. Brötchen
  'Broetchen': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-broetchen" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#F59E0B" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Traditional Kaiser roll with 5 curved spiral cuts meeting at center -->
  <circle cx="12" cy="12" r="9" fill="#F59E0B" fill-opacity="0.2"/>
  <circle cx="12" cy="12" r="9" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-broetchen)"/>
  <!-- 5 Curved spiral cuts meeting at center (12, 12) -->
  <path d="M12 12 C12 8 13 5 12 3" fill="none" stroke="#FDE047" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 12 C15 10 18 9 20.5 9" fill="none" stroke="#FDE047" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 12 C15 14 17 18 17.5 20" fill="none" stroke="#FDE047" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 12 C10 15 8 18 6.5 20" fill="none" stroke="#FDE047" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 12 C9 10 5 10 3.5 9" fill="none" stroke="#FDE047" stroke-width="1.8" stroke-linecap="round"/>
</svg>`,

  // 49. Kekse
  'Kekse': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-kekse" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#F59E0B" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Round chocolate chip cookie with fun scalloped bite mark taken out -->
  <path d="M15 3 C10 2 4 6 3 12 C2 18 7 22 13 22 C18 22 22 18 22 13 C20.5 13 19.5 12 19.5 10.5 C19.5 9 20.5 8 20 6.5 C19 5 17 5 16 3 Z" fill="#F59E0B" fill-opacity="0.22"/>
  <path d="M15 3 C10 2 4 6 3 12 C2 18 7 22 13 22 C18 22 22 18 22 13 C20.5 13 19.5 12 19.5 10.5 C19.5 9 20.5 8 20 6.5 C19 5 17 5 16 3 Z" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-kekse)"/>
  <!-- Chunky dark chocolate chips -->
  <rect x="7" y="8" width="2.5" height="2" rx="0.8" fill="#451A03" stroke="#78350F" stroke-width="0.5"/>
  <rect x="12" y="11" width="3" height="2.5" rx="0.8" fill="#451A03" stroke="#78350F" stroke-width="0.5"/>
  <rect x="8" y="15" width="2.5" height="2" rx="0.8" fill="#451A03" stroke="#78350F" stroke-width="0.5"/>
  <rect x="15" y="15.5" width="2.5" height="2" rx="0.8" fill="#451A03" stroke="#78350F" stroke-width="0.5"/>
  <!-- Little cookie crumbs floating off the bite -->
  <circle cx="21" cy="4" r="0.6" fill="#F59E0B"/>
  <circle cx="18" cy="2" r="0.5" fill="#F59E0B"/>
</svg>`,

  // 50. Toast
  'Toast': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-toast" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#D97706" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Toast slice with curved top, waist indentation and melting pat of butter -->
  <path d="M5 9 C4 6 7 4 12 4 C17 4 20 6 19 9 C18 12 19 14 19 19 C19 20 18 21 17 21 L7 21 C6 21 5 20 5 19 C5 14 6 12 5 9 Z" fill="#D97706" fill-opacity="0.18"/>
  <path d="M5 9 C4 6 7 4 12 4 C17 4 20 6 19 9 C18 12 19 14 19 19 C19 20 18 21 17 21 L7 21 C6 21 5 20 5 19 C5 14 6 12 5 9 Z" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-toast)"/>
  <!-- Melting pat of butter in center -->
  <rect x="10" y="10" width="4" height="3" rx="0.8" fill="#FDE047" stroke="#FACC15" stroke-width="1.2"/>
  <path d="M9.5 13 C10.5 14.5 13.5 14.5 14.5 13" fill="none" stroke="#FDE047" stroke-width="1.2" stroke-linecap="round"/>
  <!-- Toasted golden-brown crust lines -->
  <path d="M7 8 C10 9 14 9 17 8 M8 16 C11 17 13 17 16 16" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,

  // 51. Kräuterbutter
  'Kraeuterbutter': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-kraeuterbutter" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#FACC15" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Herb butter foil roll with twisted ends & fresh sliced coin showing green herb flecks -->
  <!-- Cylinder roll in foil -->
  <path d="M6 7 L17 7 C18 7 18.5 8 18.5 11 C18.5 14 18 15 17 15 L6 15" fill="#FDE047" fill-opacity="0.2" stroke="#94A3B8" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Foil twisted ends -->
  <path d="M6 11 L3 8 L3 14 Z M18.5 11 L21.5 8 L21.5 14 Z" fill="#94A3B8" stroke="#94A3B8" stroke-width="1.2" stroke-linejoin="round"/>
  <!-- Sliced coin / disc in foreground -->
  <ellipse cx="9" cy="15" rx="5" ry="4" fill="#FDE047" fill-opacity="0.35"/>
  <ellipse cx="9" cy="15" rx="5" ry="4" fill="none" stroke="#FACC15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-kraeuterbutter)"/>
  <!-- Scattered green herb flecks on coin -->
  <rect x="7" y="13.5" width="1.2" height="0.8" rx="0.3" fill="#15803D"/>
  <rect x="10" y="14" width="1.4" height="0.9" rx="0.3" fill="#15803D"/>
  <rect x="8.5" y="16" width="1.2" height="0.8" rx="0.3" fill="#15803D"/>
</svg>`,

  // 52. Wurst
  'Wurst': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <filter id="glow-wurst" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.75" flood-color="#EF4444" flood-opacity="0.75"/>
    </filter>
  </defs>
  <!-- Traditional ring sausage (Kranzdarm / Ringwurst) with natural tied butcher twine -->
  <!-- Outer horseshoe ring -->
  <path d="M8 18 C4 14 4 8 9 5 C14 2 19 5 20 10 C21 15 17 18 14 18" fill="none" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-wurst)"/>
  <!-- Inner horseshoe curve -->
  <path d="M9 15 C6.5 12 6.5 8.5 10 7 C13.5 5.5 16.5 7 17.5 10.5 C18 13.5 16 15 13 15" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-wurst)"/>
  <!-- Soft savory meat fill between contours -->
  <path d="M8 18 C4 14 4 8 9 5 C14 2 19 5 20 10 C21 15 17 18 14 18 L13 15 C16 15 18 13.5 17.5 10.5 C16.5 7 13.5 5.5 10 7 C6.5 8.5 6.5 12 9 15 Z" fill="#EF4444" fill-opacity="0.18"/>
  <!-- Tied string connecting both ends -->
  <path d="M8.5 18 L13.5 18" fill="none" stroke="#F8FAFC" stroke-width="1.8" stroke-linecap="round"/>
  <!-- Dangling butcher twine knot -->
  <path d="M11 18 L11 21 M10 21 C11 22 12 22 12 20.5" fill="none" stroke="#F8FAFC" stroke-width="1.5" stroke-linecap="round"/>
</svg>`
};

if (require.main === module) {
  console.log(`Writing ${Object.keys(revised52).length} revised SVGs...`);
  for (const [name, svg] of Object.entries(revised52)) {
    const filePath = path.join(iconsDir, `${name}.svg`);
    fs.writeFileSync(filePath, svg, 'utf8');
  }
  console.log('Successfully updated all 52 SVGs!');
}

module.exports = { revised52 };

