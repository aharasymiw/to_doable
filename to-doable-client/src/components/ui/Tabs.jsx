/**
 * Tabs component
 * Based on shadcn/ui Tabs
 */

import { createContext, useContext, useState } from 'react';
import styles from './Tabs.module.css';

const TabsContext = createContext(null);

export function Tabs({ default_value, value, on_change, className = '', children, ...props }) {
  const [internal_value, set_internal_value] = useState(default_value);

  const current_value = value ?? internal_value;
  const set_value = on_change ?? set_internal_value;

  return (
    <TabsContext.Provider value={{ value: current_value, set_value }}>
      <div className={`${styles.tabs} ${className}`} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className = '', children, ...props }) {
  return (
    <div className={`${styles.list} ${className}`} role="tablist" {...props}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className = '', disabled, children, ...props }) {
  const context = useContext(TabsContext);
  const is_active = context.value === value;

  function handle_click() {
    if (!disabled) {
      context.set_value(value);
    }
  }

  const class_names = [
    styles.trigger,
    is_active && styles.active,
    disabled && styles.disabled,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="tab"
      aria-selected={is_active}
      className={class_names}
      onClick={handle_click}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className = '', children, ...props }) {
  const context = useContext(TabsContext);
  const is_active = context.value === value;

  if (!is_active) return null;

  return (
    <div
      role="tabpanel"
      className={`${styles.content} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
