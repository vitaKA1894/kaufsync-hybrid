import Dexie from 'dexie';

export const db = new Dexie('KaufSyncDB');

// Define database schema
db.version(1).stores({
  lists: 'id, name, created_by, share_code, updated_at',
  items: 'id, list_id, name, category, status, updated_at, is_deleted',
  syncQueue: '++id, list_id, item_id, action, status, timestamp',
  metadata: 'key'
});

export default db;
