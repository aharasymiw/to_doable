/**
 * Authentication context
 * Manages user authentication state and provides auth methods
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, generate_idempotency_key } from '../lib/api.js';
import { clear_all_storage, profile_storage, init_storage } from '../lib/storage.js';
import { start_auto_sync } from '../lib/sync.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, set_user] = useState(null);
  const [loading, set_loading] = useState(true);
  const [impersonation, set_impersonation] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    async function check_auth() {
      try {
        await init_storage();
        const response = await api.get('/auth/me');
        set_user(response.user);
        set_impersonation(response.impersonation);

        // Save profile to local storage
        if (response.user && !response.user.is_admin) {
          await profile_storage.save(response.user);
        }

        // Start auto sync for non-admin users
        if (response.user && !response.user.is_admin) {
          start_auto_sync();
        }
      } catch (err) {
        // Not authenticated - that's fine
        set_user(null);
      } finally {
        set_loading(false);
      }
    }

    check_auth();
  }, []);

  /**
   * Register a new user
   */
  const register = useCallback(async ({ username, email, password }) => {
    const idempotency_key = generate_idempotency_key();
    const response = await api.post(
      '/auth/register',
      { username, email, password },
      { idempotency_key }
    );
    return response;
  }, []);

  /**
   * Log in with username/email and password
   */
  const login = useCallback(async ({ username, password, stay_logged_in = false }) => {
    const response = await api.post('/auth/login', {
      username,
      password,
      stay_logged_in,
    });

    // Check if account is deleted (recovery flow)
    if (response.code === 'ACCOUNT_DELETED') {
      set_user(response.user);
      return response;
    }

    set_user(response.user);

    // Save profile and start sync for non-admin users
    if (response.user && !response.user.is_admin) {
      await profile_storage.save(response.user);
      start_auto_sync();
    }

    return response;
  }, []);

  /**
   * Log out
   */
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Ignore errors - still clear local state
      console.error('Logout error:', err);
    }

    set_user(null);
    set_impersonation(null);
    await clear_all_storage();
  }, []);

  /**
   * Refresh authentication state
   */
  const refresh_auth = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      set_user(response.user);
      set_impersonation(response.impersonation);
      return response.user;
    } catch (err) {
      set_user(null);
      set_impersonation(null);
      throw err;
    }
  }, []);

  /**
   * Change password
   */
  const change_password = useCallback(async ({ current_password, new_password }) => {
    await api.post('/auth/change-password', {
      current_password,
      new_password,
    });

    // User will be logged out by server
    set_user(null);
    await clear_all_storage();
  }, []);

  /**
   * Resend verification email
   */
  const resend_verification = useCallback(async () => {
    return api.post('/auth/resend-verification');
  }, []);

  const value = {
    user,
    loading,
    impersonation,
    is_authenticated: !!user,
    is_admin: user?.is_admin || false,
    is_verified: user?.is_verified || false,
    is_deleted: !!user?.deleted_at,
    register,
    login,
    logout,
    refresh_auth,
    change_password,
    resend_verification,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
