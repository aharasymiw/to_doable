/**
 * DropdownMenu component
 * Based on shadcn/ui DropdownMenu
 */

import { createContext, useContext, useState, useRef, useEffect } from 'react';
import styles from './DropdownMenu.module.css';

const DropdownContext = createContext(null);

export function DropdownMenu({ children }) {
  const [open, set_open] = useState(false);
  const container_ref = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    function handle_click(e) {
      if (container_ref.current && !container_ref.current.contains(e.target)) {
        set_open(false);
      }
    }

    document.addEventListener('mousedown', handle_click);
    return () => document.removeEventListener('mousedown', handle_click);
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;

    function handle_keydown(e) {
      if (e.key === 'Escape') {
        set_open(false);
      }
    }

    document.addEventListener('keydown', handle_keydown);
    return () => document.removeEventListener('keydown', handle_keydown);
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, set_open }}>
      <div className={styles.container} ref={container_ref}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({ asChild, children, ...props }) {
  const { open, set_open } = useContext(DropdownContext);

  function handle_click() {
    set_open(!open);
  }

  if (asChild) {
    // Clone child and add props
    const child = children;
    return (
      <span onClick={handle_click} {...props}>
        {child}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={styles.trigger}
      onClick={handle_click}
      aria-expanded={open}
      aria-haspopup="menu"
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({ align = 'end', className = '', children, ...props }) {
  const { open, set_open } = useContext(DropdownContext);

  if (!open) return null;

  const class_names = [
    styles.content,
    styles[`align_${align}`],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={class_names} role="menu" {...props}>
      {children}
    </div>
  );
}

export function DropdownMenuItem({ className = '', destructive, disabled, onClick, children, ...props }) {
  const { set_open } = useContext(DropdownContext);

  function handle_click(e) {
    if (disabled) return;
    onClick?.(e);
    set_open(false);
  }

  const class_names = [
    styles.item,
    destructive && styles.destructive,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={class_names}
      onClick={handle_click}
      disabled={disabled}
      role="menuitem"
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className = '', ...props }) {
  return <div className={`${styles.separator} ${className}`} {...props} />;
}

export function DropdownMenuLabel({ className = '', children, ...props }) {
  return (
    <div className={`${styles.label} ${className}`} {...props}>
      {children}
    </div>
  );
}
