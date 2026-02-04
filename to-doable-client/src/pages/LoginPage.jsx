/**
 * Login page
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/index.js';
import styles from './AuthPages.module.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { add_toast } = useToast();

  const [form_data, set_form_data] = useState({
    username: '',
    password: '',
    stay_logged_in: false,
  });
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');

  function handle_change(e) {
    const { name, value, type, checked } = e.target;
    set_form_data((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    set_error('');
  }

  async function handle_submit(e) {
    e.preventDefault();
    set_loading(true);
    set_error('');

    try {
      const response = await login(form_data);

      // Check for account recovery flow
      if (response.code === 'ACCOUNT_DELETED') {
        navigate('/account-recovery');
        return;
      }

      add_toast({
        title: 'Welcome back!',
        description: `Logged in as ${response.user.username}`,
        variant: 'success',
      });

      // Navigate based on user role
      if (response.user.is_admin) {
        navigate('/admin');
      } else {
        navigate('/profile');
      }
    } catch (err) {
      set_error(err.message || 'Login failed');

      if (err.status === 429) {
        set_error('Too many login attempts. Please try again later.');
      }
    } finally {
      set_loading(false);
    }
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Sign in to your To-Doable account
          </CardDescription>
        </CardHeader>

        <form onSubmit={handle_submit}>
          <CardContent className={styles.content}>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <div className={styles.field}>
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="username"
                name="username"
                type="text"
                value={form_data.username}
                onChange={handle_change}
                placeholder="Enter your username or email"
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={form_data.password}
                onChange={handle_change}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            <div className={styles.checkbox_field}>
              <input
                type="checkbox"
                id="stay_logged_in"
                name="stay_logged_in"
                checked={form_data.stay_logged_in}
                onChange={handle_change}
                disabled={loading}
              />
              <Label htmlFor="stay_logged_in">Stay logged in</Label>
            </div>
          </CardContent>

          <CardFooter className={styles.footer}>
            <Button type="submit" loading={loading} className={styles.submit_btn}>
              Sign in
            </Button>
          </CardFooter>
        </form>

        <div className={styles.links}>
          <p>
            Don't have an account?{' '}
            <Link to="/register">Create one</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
