/**
 * Spinner loading component
 */

import styles from './Spinner.module.css';

export function Spinner({ size = 'default', className = '' }) {
  const class_names = [
    styles.spinner,
    styles[`size_${size}`],
    className,
  ].filter(Boolean).join(' ');

  return (
    <svg
      className={class_names}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Loading"
    >
      <circle
        className={styles.track}
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className={styles.path}
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
