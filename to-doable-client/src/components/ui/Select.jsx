/**
 * Select component
 * Simple native select styled to match design system
 */

import { forwardRef } from 'react';
import styles from './Select.module.css';

export const Select = forwardRef(function Select(
  { className = '', error, children, ...props },
  ref
) {
  const class_names = [
    styles.select,
    error && styles.error,
    className,
  ].filter(Boolean).join(' ');

  return (
    <select className={class_names} ref={ref} {...props}>
      {children}
    </select>
  );
});
