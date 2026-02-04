/**
 * Avatar component
 * Based on shadcn/ui Avatar
 */

import { useState } from 'react';
import styles from './Avatar.module.css';

export function Avatar({ className = '', size = 'default', children, ...props }) {
  const class_names = [
    styles.avatar,
    styles[`size_${size}`],
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={class_names} {...props}>
      {children}
    </span>
  );
}

export function AvatarImage({ src, alt = '', className = '', ...props }) {
  const [has_error, set_has_error] = useState(false);

  if (!src || has_error) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${styles.image} ${className}`}
      onError={() => set_has_error(true)}
      {...props}
    />
  );
}

export function AvatarFallback({ className = '', children, ...props }) {
  return (
    <span className={`${styles.fallback} ${className}`} {...props}>
      {children}
    </span>
  );
}

/**
 * Get initials from a name
 * @param {string} name
 * @returns {string}
 */
export function get_initials(name) {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
