/**
 * Sync status indicator
 * Shows offline status and pending sync items
 */

import styles from './SyncIndicator.module.css';

export function SyncIndicator({ status }) {
  const { online = true, syncing = false, pending = 0 } = status || {};

  // Don't show anything if online and nothing pending
  if (online && !syncing && pending === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      {!online && (
        <div className={styles.indicator} data-status="offline">
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.53 16.11a6 6 0 016.95 0M5.34 12.93a10 10 0 0113.32 0M2.15 9.76a14 14 0 0119.7 0M12 20h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 2L22 22"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Offline</span>
        </div>
      )}

      {syncing && (
        <div className={styles.indicator} data-status="syncing">
          <svg
            className={`${styles.icon} ${styles.spinning}`}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 4V9H4.58152M19.9381 11C19.446 7.05369 16.0796 4 12 4C8.64262 4 5.76829 6.06817 4.58152 9M4.58152 9H9M20 20V15H19.4185M19.4185 15C18.2317 17.9318 15.3574 20 12 20C7.92038 20 4.55399 16.9463 4.06189 13M19.4185 15H15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Syncing...</span>
        </div>
      )}

      {pending > 0 && !syncing && online && (
        <div className={styles.indicator} data-status="pending">
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{pending} pending</span>
        </div>
      )}

      {pending > 0 && !syncing && !online && (
        <div className={styles.indicator} data-status="pending-offline">
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{pending} pending (will sync when online)</span>
        </div>
      )}
    </div>
  );
}
