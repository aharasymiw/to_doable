/**
 * Badge component
 * Based on shadcn/ui Badge
 */

import styles from './Badge.module.css';

export function Badge({ variant = 'default', className = '', children, ...props }) {
  const class_names = [
    styles.badge,
    styles[variant],
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={class_names} {...props}>
      {children}
    </span>
  );
}
