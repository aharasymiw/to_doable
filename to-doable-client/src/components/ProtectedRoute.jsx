/**
 * Protected route wrapper
 * Redirects unauthenticated users to login
 * Optionally requires admin role
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner } from './ui/index.js';

export function ProtectedRoute({ children, require_admin = false }) {
  const { is_authenticated, is_admin, loading, is_deleted } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh'
      }}>
        <Spinner size="lg" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!is_authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect deleted users to recovery page
  if (is_deleted && location.pathname !== '/account-recovery') {
    return <Navigate to="/account-recovery" replace />;
  }

  // Redirect non-admins trying to access admin routes
  if (require_admin && !is_admin) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}

export function PublicOnlyRoute({ children }) {
  const { is_authenticated, is_admin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh'
      }}>
        <Spinner size="lg" />
      </div>
    );
  }

  // Redirect authenticated users away from public-only routes (login, register)
  if (is_authenticated) {
    const from = location.state?.from?.pathname || (is_admin ? '/admin' : '/profile');
    return <Navigate to={from} replace />;
  }

  return children;
}
