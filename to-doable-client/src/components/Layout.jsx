/**
 * Main layout component with navigation
 */

import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import {
  Button, Avatar, AvatarImage, AvatarFallback, get_initials,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, Badge
} from './ui/index.js';
import styles from './Layout.module.css';

export function Layout({ children }) {
  const navigate = useNavigate();
  const { user, is_authenticated, is_admin, logout, impersonation } = useAuth();
  const { theme, toggle_theme } = useTheme();

  async function handle_logout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.header_content}>
          <Link to="/" className={styles.logo}>
            To-Doable
          </Link>

          <nav className={styles.nav}>
            {is_authenticated ? (
              <>
                {impersonation?.is_impersonating && (
                  <Badge variant="warning" className={styles.impersonation_badge}>
                    Impersonating
                  </Badge>
                )}

                {is_admin && !impersonation?.is_impersonating && (
                  <Link to="/admin" className={styles.nav_link}>
                    Admin
                  </Link>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={styles.avatar_btn}>
                      <Avatar size="sm">
                        <AvatarImage src={user?.avatar_url} alt={user?.username} />
                        <AvatarFallback>{get_initials(user?.username)}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>
                      {user?.username}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/profile')}>
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/settings')}>
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={toggle_theme}>
                      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handle_logout} destructive>
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <button
                  className={styles.theme_btn}
                  onClick={toggle_theme}
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5"/>
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                    </svg>
                  )}
                </button>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Sign up</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        {children}
      </main>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} To-Doable. All rights reserved.</p>
      </footer>
    </div>
  );
}
