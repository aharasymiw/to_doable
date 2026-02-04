/**
 * Button component
 * Based on shadcn/ui Button
 * Supports multiple variants and sizes
 */

import styles from './Button.module.css';

/**
 * @param {Object} props
 * @param {'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'} props.variant
 * @param {'default' | 'sm' | 'lg' | 'icon'} props.size
 * @param {boolean} props.disabled
 * @param {boolean} props.loading
 * @param {string} props.className
 * @param {React.ReactNode} props.children
 */
export function Button({
  variant = 'default',
  size = 'default',
  disabled = false,
  loading = false,
  className = '',
  children,
  ...props
}) {
  const class_names = [
    styles.button,
    styles[variant],
    styles[`size_${size}`],
    loading && styles.loading,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={class_names}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className={styles.spinner} aria-hidden="true">
          <svg
            className={styles.spinner_icon}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className={styles.spinner_track}
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className={styles.spinner_path}
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <span className={loading ? styles.content_hidden : undefined}>
        {children}
      </span>
    </button>
  );
}
