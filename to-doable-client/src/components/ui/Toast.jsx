/**
 * Toast notification component
 * Based on shadcn/ui Toast
 */

import { createContext, useContext, useState, useCallback } from 'react';
import styles from './Toast.module.css';

const ToastContext = createContext(null);

/**
 * Toast provider - wrap your app with this
 */
export function ToastProvider({ children }) {
  const [toasts, set_toasts] = useState([]);

  const add_toast = useCallback(({ title, description, variant = 'default', duration = 5000 }) => {
    const id = Date.now() + Math.random();

    set_toasts((prev) => [...prev, { id, title, description, variant }]);

    if (duration > 0) {
      setTimeout(() => {
        set_toasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const remove_toast = useCallback((id) => {
    set_toasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ add_toast, remove_toast }}>
      {children}
      <ToastContainer toasts={toasts} on_dismiss={remove_toast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook to use toast notifications
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Toast container - renders all active toasts
 */
function ToastContainer({ toasts, on_dismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} on_dismiss={() => on_dismiss(toast.id)} />
      ))}
    </div>
  );
}

/**
 * Individual toast component
 */
function Toast({ title, description, variant = 'default', on_dismiss }) {
  const class_names = [styles.toast, styles[variant]].join(' ');

  return (
    <div className={class_names} role="alert">
      <div className={styles.content}>
        {title && <div className={styles.title}>{title}</div>}
        {description && <div className={styles.description}>{description}</div>}
      </div>
      <button
        className={styles.close}
        onClick={on_dismiss}
        aria-label="Dismiss notification"
      >
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
      </button>
    </div>
  );
}
