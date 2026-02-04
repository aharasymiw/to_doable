/**
 * Sync service for local-first data synchronization
 * Handles syncing queued changes when online
 * Uses last-write-wins conflict resolution
 */

import { api, generate_idempotency_key, ApiError } from './api.js';
import { sync_queue, profile_storage } from './storage.js';

const MAX_SYNC_ATTEMPTS = 5;
let is_syncing = false;
let sync_listeners = new Set();

/**
 * Check if browser is online
 * @returns {boolean}
 */
export function is_online() {
  return navigator.onLine;
}

/**
 * Add listener for sync status changes
 * @param {Function} listener
 * @returns {Function} Unsubscribe function
 */
export function on_sync_change(listener) {
  sync_listeners.add(listener);
  return () => sync_listeners.delete(listener);
}

/**
 * Notify listeners of sync status change
 * @param {Object} status
 */
function notify_listeners(status) {
  sync_listeners.forEach((listener) => {
    try {
      listener(status);
    } catch (err) {
      console.error('Sync listener error:', err);
    }
  });
}

/**
 * Process all pending items in sync queue
 * @returns {Promise<{success: number, failed: number}>}
 */
export async function process_sync_queue() {
  if (is_syncing) {
    return { success: 0, failed: 0, skipped: true };
  }

  if (!is_online()) {
    return { success: 0, failed: 0, offline: true };
  }

  is_syncing = true;
  notify_listeners({ syncing: true });

  const items = await sync_queue.get_all();
  let success = 0;
  let failed = 0;

  // Sort by timestamp (oldest first)
  items.sort((a, b) => a.timestamp - b.timestamp);

  for (const item of items) {
    try {
      // Generate idempotency key if not present
      const idempotency_key = item.idempotency_key || generate_idempotency_key();

      // Make API request
      const response = await api[item.method.toLowerCase()](
        item.endpoint,
        item.data,
        { idempotency_key }
      );

      // Success - remove from queue
      await sync_queue.remove(item.id);
      success++;

      // If it's a profile update, update local storage with server response
      if (item.type === 'profile_update' && response.profile) {
        await profile_storage.save(response.profile);
      }
    } catch (err) {
      // Increment attempts
      item.attempts = (item.attempts || 0) + 1;
      item.last_error = err.message;

      if (item.attempts >= MAX_SYNC_ATTEMPTS) {
        // Too many failures - remove from queue and notify
        await sync_queue.remove(item.id);
        failed++;
        console.error(`Sync item failed after ${MAX_SYNC_ATTEMPTS} attempts:`, item);
      } else {
        // Update queue with new attempt count
        await sync_queue.update(item);
      }
    }
  }

  is_syncing = false;
  const pending = await sync_queue.count();
  notify_listeners({ syncing: false, pending, success, failed });

  return { success, failed };
}

/**
 * Add profile update to sync queue
 * @param {Object} changes - Changed fields
 * @param {string} user_id - User ID
 */
export async function queue_profile_update(changes, user_id) {
  // Save to local storage immediately (optimistic update)
  const current = await profile_storage.get(user_id);
  if (current) {
    await profile_storage.save({
      ...current,
      ...changes,
      updated_at: new Date().toISOString(),
    });
  }

  // Add to sync queue
  await sync_queue.add({
    type: 'profile_update',
    endpoint: '/profile',
    method: 'PATCH',
    data: changes,
    idempotency_key: generate_idempotency_key(),
  });

  // Try to sync immediately if online
  if (is_online()) {
    process_sync_queue().catch(console.error);
  }

  notify_listeners({ pending: await sync_queue.count() });
}

/**
 * Fetch profile from server and update local storage
 * @param {string} user_id
 * @returns {Promise<Object>}
 */
export async function fetch_and_cache_profile(user_id) {
  try {
    const response = await api.get('/profile');
    const profile = response.profile;

    // Get local version
    const local = await profile_storage.get(user_id);

    // Last-write-wins: use server version if newer
    if (!local || new Date(profile.updated_at) >= new Date(local.updated_at || 0)) {
      await profile_storage.save(profile);
      return profile;
    }

    // Local is newer - keep local and add to sync queue if not already queued
    return local;
  } catch (err) {
    console.error('Failed to fetch profile:', err);

    // If offline, return cached version
    if (!is_online()) {
      return profile_storage.get(user_id);
    }

    throw err;
  }
}

/**
 * Start automatic sync on online/offline changes
 */
export function start_auto_sync() {
  // Sync when coming online
  window.addEventListener('online', () => {
    console.log('Back online, starting sync...');
    notify_listeners({ online: true });
    process_sync_queue().catch(console.error);
  });

  // Notify when going offline
  window.addEventListener('offline', () => {
    console.log('Gone offline');
    notify_listeners({ online: false });
  });

  // Initial sync if online
  if (is_online()) {
    process_sync_queue().catch(console.error);
  }
}

/**
 * Get current sync status
 * @returns {Promise<Object>}
 */
export async function get_sync_status() {
  const pending = await sync_queue.count();
  return {
    online: is_online(),
    syncing: is_syncing,
    pending,
  };
}
