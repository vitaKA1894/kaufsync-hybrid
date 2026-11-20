import { db } from '../db/index.js';
import { apiUrl } from '../config/api.js';
import { isOnline } from './syncService.js';
import { maskCardCode, validateEan13 } from '../utils/barcodeValidation.js';

export { maskCardCode, validateEan13 };

/**
 * Service for offline-first loyalty cards (1:1 per user & list).
 */

export function detectCodeFormat(code) {
  const clean = String(code).trim();
  if (!clean) return 'CODE_128';
  if (/^\d{13}$/.test(clean) && validateEan13(clean)) {
    return 'EAN_13';
  }
  if (/^\d{8}$/.test(clean)) {
    return 'EAN_8';
  }
  if (/^\d{12}$/.test(clean)) {
    return 'UPC_A';
  }
  if (clean.length > 50 || clean.startsWith('http://') || clean.startsWith('https://')) {
    return 'QR_CODE';
  }
  return 'CODE_128';
}

/**
 * Read loyalty card for a specific list (0 ms latency from Dexie, 100% offline).
 */
export async function getCardForList(listId) {
  if (!listId) return null;
  try {
    const card = await db.loyaltyCards.where('list_id').equals(listId).first();
    return card || null;
  } catch (err) {
    console.warn('Error reading loyalty card from Dexie:', err);
    return null;
  }
}

/**
 * Get all loyalty cards for the current user (Dexie + background sync if online).
 */
export async function getAllCards(token) {
  let localCards = [];
  try {
    localCards = await db.loyaltyCards.toArray();
  } catch (err) {
    console.warn('Error reading cards from Dexie:', err);
  }

  if (isOnline.value && token) {
    try {
      const res = await fetch(apiUrl('/api/loyalty-cards'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const serverCards = await res.json();
        // Update Dexie
        await db.transaction('rw', db.loyaltyCards, async () => {
          await db.loyaltyCards.clear();
          for (const c of serverCards) {
            await db.loyaltyCards.put(c);
          }
        });
        return serverCards;
      }
    } catch (netErr) {
      console.warn('Background sync for loyalty cards failed:', netErr);
    }
  }

  return localCards;
}

/**
 * Save or replace loyalty card for a list.
 */
export async function saveCard(listId, codeValue, codeFormat, token) {
  if (!listId) throw new Error('listId fehlt');
  if (!codeValue || !codeValue.trim()) throw new Error('Code darf nicht leer sein');

  const format = (codeFormat || detectCodeFormat(codeValue)).toUpperCase();
  const trimmedCode = codeValue.trim();

  // If online, save to server
  let savedCard = null;
  if (isOnline.value && token) {
    const res = await fetch(apiUrl(`/api/lists/${listId}/loyalty-card`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        code_value: trimmedCode,
        code_format: format
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Fehler beim Speichern der Bonuskarte');
    }
    savedCard = await res.json();
  } else {
    // Local offline record
    const existing = await getCardForList(listId);
    savedCard = {
      id: existing?.id || `local_${Date.now()}`,
      list_id: listId,
      user_id: 'current_user',
      code_value: trimmedCode,
      code_format: format,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  // Put in Dexie
  await db.loyaltyCards.put(savedCard);
  return savedCard;
}

/**
 * Delete loyalty card for a list.
 */
export async function deleteCard(listId, token) {
  if (!listId) return;

  if (isOnline.value && token) {
    const res = await fetch(apiUrl(`/api/lists/${listId}/loyalty-card`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Fehler beim Löschen der Bonuskarte');
    }
  }

  // Delete from Dexie
  await db.loyaltyCards.where('list_id').equals(listId).delete();
}
