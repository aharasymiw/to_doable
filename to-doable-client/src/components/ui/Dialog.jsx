/**
 * Dialog/Modal component
 * Based on shadcn/ui Dialog
 */

import { createContext, useContext, useEffect, useRef } from 'react';
import styles from './Dialog.module.css';

const DialogContext = createContext(null);

export function Dialog({ open, on_close, children }) {
  const overlay_ref = useRef(null);

  // Close on escape key
  useEffect(() => {
    if (!open) return;

    function handle_keydown(e) {
      if (e.key === 'Escape') {
        on_close();
      }
    }

    document.addEventListener('keydown', handle_keydown);
    return () => document.removeEventListener('keydown', handle_keydown);
  }, [open, on_close]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Close on overlay click
  function handle_overlay_click(e) {
    if (e.target === overlay_ref.current) {
      on_close();
    }
  }

  if (!open) return null;

  return (
    <DialogContext.Provider value={{ on_close }}>
      <div
        className={styles.overlay}
        ref={overlay_ref}
        onClick={handle_overlay_click}
        aria-modal="true"
        role="dialog"
      >
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

export function DialogHeader({ className = '', children, ...props }) {
  return (
    <div className={`${styles.header} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DialogTitle({ className = '', children, ...props }) {
  return (
    <h2 className={`${styles.title} ${className}`} {...props}>
      {children}
    </h2>
  );
}

export function DialogDescription({ className = '', children, ...props }) {
  return (
    <p className={`${styles.description} ${className}`} {...props}>
      {children}
    </p>
  );
}

export function DialogBody({ className = '', children, ...props }) {
  return (
    <div className={`${styles.body} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DialogFooter({ className = '', children, ...props }) {
  return (
    <div className={`${styles.footer} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DialogClose({ children }) {
  const context = useContext(DialogContext);

  return (
    <button
      type="button"
      className={styles.close}
      onClick={context?.on_close}
      aria-label="Close dialog"
    >
      {children || (
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}
