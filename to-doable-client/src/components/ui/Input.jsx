/**
 * Input component
 * Based on shadcn/ui Input
 */

import { forwardRef } from 'react';
import styles from './Input.module.css';

export const Input = forwardRef(function Input(
  { className = '', type = 'text', error, ...props },
  ref
) {
  const class_names = [
    styles.input,
    error && styles.error,
    className,
  ].filter(Boolean).join(' ');

  return (
    <input
      type={type}
      className={class_names}
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  );
});
