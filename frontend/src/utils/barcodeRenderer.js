import bwipjs from 'bwip-js/browser';

/**
 * Checks whether a format is 2D (matrix code).
 * 2D codes use square aspect ratio (1:1), while 1D barcodes use wide rectangular ratio.
 */
export function is2DFormat(format) {
  const f = String(format || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return f.includes('QR') || f.includes('AZTEC') || f.includes('DATAMATRIX') || f.includes('PDF417');
}

/**
 * Returns strictly 'QR-Code' or 'Barcode' for user-facing labels.
 * NEVER returns technical format names like Aztec, DataMatrix, EAN-13, etc.
 */
export function getFriendlyFormatLabel(format) {
  return is2DFormat(format) ? 'QR-Code' : 'Barcode';
}

/**
 * Maps canonical format names to bwip-js bcid.
 */
export function mapFormatToBcid(format, codeValue = '') {
  const f = String(format || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (f.includes('AZTEC')) return 'azteccode';
  if (f.includes('QR')) return 'qrcode';
  if (f.includes('DATAMATRIX')) return 'datamatrix';
  if (f.includes('PDF417')) return 'pdf417';
  if (f.includes('EAN13')) return 'ean13';
  if (f.includes('EAN8')) return 'ean8';
  if (f.includes('UPCA')) return 'upca';
  if (f.includes('UPCE')) return 'upce';
  if (f.includes('CODE39')) return 'code39';
  if (f.includes('ITF') || f.includes('I25')) return 'interleaved2of5';
  if (f.includes('CODABAR')) return 'rationalizedCodabar';
  if (f.includes('CODE128')) return 'code128';

  // Heuristic if unknown
  const clean = String(codeValue || '').trim();
  if (clean.startsWith('REWEDTP#') || clean.includes('privileges:') || clean.startsWith('PENNY#')) {
    return 'azteccode';
  }
  if (/^https?:\/\//i.test(clean) || clean.length > 40 || /[#:?=&/]/.test(clean)) {
    return 'qrcode';
  }
  if (/^\d{13}$/.test(clean)) {
    return 'ean13';
  }
  if (/^\d{8}$/.test(clean)) {
    return 'ean8';
  }
  return 'code128';
}

/**
 * Generates pure vector SVG string offline for any supported 1D or 2D barcode.
 * 
 * @param {Object} options
 * @param {string} options.code Code payload
 * @param {string} options.format Canonical format (AZTEC, QR_CODE, EAN_13, etc.)
 * @param {boolean} [options.compact=false] Whether rendering in a compact container (e.g. preview)
 * @returns {{ success: boolean, svg?: string, is2D: boolean, error?: string }}
 */
export function renderBarcodeSvg({ code, format, compact = false }) {
  if (!code || !String(code).trim()) {
    return { success: false, is2D: false, error: 'Kein Code angegeben' };
  }

  const cleanText = String(code).trim();
  let bcid = mapFormatToBcid(format, cleanText);
  const is2D = is2DFormat(format) || bcid === 'azteccode' || bcid === 'qrcode' || bcid === 'datamatrix' || bcid === 'pdf417';

  // Sizing and scale configuration
  const scale = compact ? (is2D ? 2 : 2) : (is2D ? 3 : 3);
  const bwipOptions = {
    bcid,
    text: cleanText,
    scale,
    includetext: false,
    backgroundcolor: 'ffffff',
    paddingwidth: 4,
    paddingheight: 4
  };

  if (!is2D) {
    bwipOptions.height = compact ? 12 : 18;
  }

  try {
    const svg = bwipjs.toSVG(bwipOptions);
    return { success: true, svg, is2D };
  } catch (err) {
    console.warn(`bwipjs.toSVG failed with bcid "${bcid}", trying fallback:`, err);
    
    // Fallback 1: For 1D barcodes that failed checksum (e.g. EAN-13 with typo), fall back to code128
    if (!is2D && bcid !== 'code128') {
      try {
        bwipOptions.bcid = 'code128';
        const svg = bwipjs.toSVG(bwipOptions);
        return { success: true, svg, is2D: false };
      } catch (e2) {
        console.warn('Fallback to code128 also failed:', e2);
      }
    }

    // Fallback 2: For 2D codes, fallback to qrcode
    if (is2D && bcid !== 'qrcode') {
      try {
        bwipOptions.bcid = 'qrcode';
        const svg = bwipjs.toSVG(bwipOptions);
        return { success: true, svg, is2D: true };
      } catch (e3) {
        console.warn('Fallback to qrcode also failed:', e3);
      }
    }

    return {
      success: false,
      is2D,
      error: 'Code konnte nicht grafisch dargestellt werden'
    };
  }
}
