/**
 * IndexedDB storage service for local-first data persistence
 * Stores user profile data and pending sync queue
 */

const DB_NAME = 'todoable';
const DB_VERSION = 1;

// Store names
const STORES = {
  PROFILE: 'profile',
  SYNC_QUEUE: 'sync_queue',
  SETTINGS: 'settings',
};

let db_instance = null;

/**
 * Open or create the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
async function open_db() {
  if (db_instance) {
    return db_instance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db_instance = request.result;
      resolve(db_instance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Profile store - stores current user's profile
      if (!db.objectStoreNames.contains(STORES.PROFILE)) {
        db.createObjectStore(STORES.PROFILE, { keyPath: 'id' });
      }

      // Sync queue - stores pending changes to sync with server
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const sync_store = db.createObjectStore(STORES.SYNC_QUEUE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        sync_store.createIndex('timestamp', 'timestamp', { unique: false });
        sync_store.createIndex('type', 'type', { unique: false });
      }

      // Settings store - stores app settings like theme
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Generic get from store
 * @param {string} store_name
 * @param {any} key
 * @returns {Promise<any>}
 */
async function get_from_store(store_name, key) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store_name, 'readonly');
    const store = transaction.objectStore(store_name);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic put to store
 * @param {string} store_name
 * @param {any} value
 * @returns {Promise<any>}
 */
async function put_to_store(store_name, value) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store_name, 'readwrite');
    const store = transaction.objectStore(store_name);
    const request = store.put(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic delete from store
 * @param {string} store_name
 * @param {any} key
 * @returns {Promise<void>}
 */
async function delete_from_store(store_name, key) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store_name, 'readwrite');
    const store = transaction.objectStore(store_name);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from store
 * @param {string} store_name
 * @returns {Promise<any[]>}
 */
async function get_all_from_store(store_name) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store_name, 'readonly');
    const store = transaction.objectStore(store_name);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all items from store
 * @param {string} store_name
 * @returns {Promise<void>}
 */
async function clear_store(store_name) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store_name, 'readwrite');
    const store = transaction.objectStore(store_name);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Profile operations
export const profile_storage = {
  /**
   * Save profile to local storage
   * @param {Object} profile
   */
  async save(profile) {
    await put_to_store(STORES.PROFILE, {
      ...profile,
      _updated_at: Date.now(),
    });
  },

  /**
   * Get profile from local storage
   * @param {string} id - User ID
   * @returns {Promise<Object|null>}
   */
  async get(id) {
    return get_from_store(STORES.PROFILE, id);
  },

  /**
   * Clear stored profile
   */
  async clear() {
    await clear_store(STORES.PROFILE);
  },
};

// Sync queue operations
export const sync_queue = {
  /**
   * Add item to sync queue
   * @param {Object} item
   * @param {string} item.type - Type of operation (e.g., 'profile_update')
   * @param {Object} item.data - Data to sync
   * @param {string} item.endpoint - API endpoint
   * @param {string} item.method - HTTP method
   */
  async add(item) {
    await put_to_store(STORES.SYNC_QUEUE, {
      ...item,
      timestamp: Date.now(),
      attempts: 0,
    });
  },

  /**
   * Get all pending items
   * @returns {Promise<Array>}
   */
  async get_all() {
    return get_all_from_store(STORES.SYNC_QUEUE);
  },

  /**
   * Remove item from queue
   * @param {number} id
   */
  async remove(id) {
    await delete_from_store(STORES.SYNC_QUEUE, id);
  },

  /**
   * Update item in queue (e.g., increment attempts)
   * @param {Object} item
   */
  async update(item) {
    await put_to_store(STORES.SYNC_QUEUE, item);
  },

  /**
   * Clear all pending items
   */
  async clear() {
    await clear_store(STORES.SYNC_QUEUE);
  },

  /**
   * Get count of pending items
   * @returns {Promise<number>}
   */
  async count() {
    const items = await get_all_from_store(STORES.SYNC_QUEUE);
    return items.length;
  },
};

// Settings operations
export const settings_storage = {
  /**
   * Save a setting
   * @param {string} key
   * @param {any} value
   */
  async set(key, value) {
    await put_to_store(STORES.SETTINGS, { key, value });
  },

  /**
   * Get a setting
   * @param {string} key
   * @param {any} default_value
   * @returns {Promise<any>}
   */
  async get(key, default_value = null) {
    const result = await get_from_store(STORES.SETTINGS, key);
    return result?.value ?? default_value;
  },

  /**
   * Remove a setting
   * @param {string} key
   */
  async remove(key) {
    await delete_from_store(STORES.SETTINGS, key);
  },
};

/**
 * Clear all data (on logout)
 */
export async function clear_all_storage() {
  await clear_store(STORES.PROFILE);
  await clear_store(STORES.SYNC_QUEUE);
  // Keep settings (theme preference, etc.)
}

/**
 * Initialize storage
 */
export async function init_storage() {
  try {
    await open_db();
    console.log('IndexedDB initialized');
    return true;
  } catch (err) {
    console.error('Failed to initialize IndexedDB:', err);
    return false;
  }
}
