/**
 * Theme context
 * Manages dark/light mode with persistence
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settings_storage } from '../lib/storage.js';

const THEME_KEY = 'theme';
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, set_theme_state] = useState('light');
  const [loading, set_loading] = useState(true);

  // Load theme from storage on mount
  useEffect(() => {
    async function load_theme() {
      try {
        const saved_theme = await settings_storage.get(THEME_KEY);

        if (saved_theme) {
          set_theme_state(saved_theme);
          apply_theme(saved_theme);
        } else {
          // Check system preference
          const prefers_dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const default_theme = prefers_dark ? 'dark' : 'light';
          set_theme_state(default_theme);
          apply_theme(default_theme);
        }
      } catch (err) {
        console.error('Failed to load theme:', err);
      } finally {
        set_loading(false);
      }
    }

    load_theme();
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const media_query = window.matchMedia('(prefers-color-scheme: dark)');

    function handle_change(e) {
      // Only apply if no saved preference
      settings_storage.get(THEME_KEY).then((saved) => {
        if (!saved) {
          const new_theme = e.matches ? 'dark' : 'light';
          set_theme_state(new_theme);
          apply_theme(new_theme);
        }
      });
    }

    media_query.addEventListener('change', handle_change);
    return () => media_query.removeEventListener('change', handle_change);
  }, []);

  /**
   * Apply theme to document
   * @param {string} theme_name
   */
  function apply_theme(theme_name) {
    if (theme_name === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  /**
   * Set and persist theme
   */
  const set_theme = useCallback(async (new_theme) => {
    set_theme_state(new_theme);
    apply_theme(new_theme);
    await settings_storage.set(THEME_KEY, new_theme);
  }, []);

  /**
   * Toggle between light and dark
   */
  const toggle_theme = useCallback(async () => {
    const new_theme = theme === 'dark' ? 'light' : 'dark';
    await set_theme(new_theme);
  }, [theme, set_theme]);

  const value = {
    theme,
    is_dark: theme === 'dark',
    set_theme,
    toggle_theme,
    loading,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to use theme context
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
