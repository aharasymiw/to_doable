/**
 * Home page
 * Landing page for unauthenticated users
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '../components/ui/index.js';
import styles from './HomePage.module.css';

export function HomePage() {
  const { is_authenticated, is_admin } = useAuth();

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.title}>
          Welcome to <span className={styles.brand}>To-Doable</span>
        </h1>
        <p className={styles.subtitle}>
          A local-first, mobile-first task management app.
          Your data stays with you, even offline.
        </p>

        <div className={styles.cta}>
          {is_authenticated ? (
            <Link to={is_admin ? '/admin' : '/profile'}>
              <Button size="lg">Go to Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/register">
                <Button size="lg">Get Started</Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="lg">Sign In</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className={styles.features}>
        <div className={styles.feature}>
          <div className={styles.feature_icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
          <h3>Local-First</h3>
          <p>Your data is stored locally and syncs when you're online.</p>
        </div>

        <div className={styles.feature}>
          <div className={styles.feature_icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <h3>Mobile-First</h3>
          <p>Designed for mobile devices with a responsive layout.</p>
        </div>

        <div className={styles.feature}>
          <div className={styles.feature_icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h3>Secure</h3>
          <p>Your data is encrypted and protected with modern security.</p>
        </div>
      </div>
    </div>
  );
}
