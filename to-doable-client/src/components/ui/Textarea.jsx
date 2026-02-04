/**
 * Textarea component
 * Based on shadcn/ui Textarea
 */

import { forwardRef } from 'react';
import styles from './Textarea.module.css';

export const Textarea = forwardRef(function Textarea(
  { className = '', error, ...props },
  ref
) {
  const class_names = [
    styles.textarea,
    error && styles.error,
    className,
  ].filter(Boolean).join(' ');

  return (
    <textarea
      className={class_names}
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  );
});
