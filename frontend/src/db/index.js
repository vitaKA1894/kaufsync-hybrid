import Dexie from 'dexie';

export const db = new Dexie('KaufSyncDB');

// Define database schema
db.version(1).stores({
  lists: 'id, name, created_by, share_code, updated_at',
  items: 'id, list_id, name, category, status, updated_at, is_deleted',
  syncQueue: '++id, list_id, item_id, action, status, timestamp',
  metadata: 'key'
});

db.version(2).stores({
  loyaltyCards: 'id, list_id, user_id, updated_at'
});

export async function clearAllLocalData() {
  try {
    await Promise.all([
      db.lists.clear(),
      db.items.clear(),
      db.syncQueue.clear(),
      db.metadata.clear(),
      db.loyaltyCards.clear()
    ]);
  } catch (e) {
    console.error('Error clearing Dexie tables:', e);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
}

export default db;
