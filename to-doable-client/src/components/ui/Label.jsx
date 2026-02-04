/**
 * Label component
 * Based on shadcn/ui Label
 */

import styles from './Label.module.css';

export function Label({ className = '', required, error, children, ...props }) {
  const class_names = [
    styles.label,
    error && styles.error,
    className,
  ].filter(Boolean).join(' ');

  return (
    <label className={class_names} {...props}>
      {children}
      {required && <span className={styles.required} aria-hidden="true">*</span>}
    </label>
  );
}
