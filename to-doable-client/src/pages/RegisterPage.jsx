/**
 * Registration page
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { Button, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/index.js';
import { validate_email, validate_username, validate_password, validate_passwords_match } from '../lib/validation.js';
import styles from './AuthPages.module.css';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { add_toast } = useToast();

  const [form_data, set_form_data] = useState({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [errors, set_errors] = useState({});
  const [loading, set_loading] = useState(false);
  const [server_error, set_server_error] = useState('');

  function handle_change(e) {
    const { name, value } = e.target;
    set_form_data((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear field error on change
    set_errors((prev) => ({
      ...prev,
      [name]: '',
    }));
    set_server_error('');
  }

  function validate_form() {
    const new_errors = {};

    const username_result = validate_username(form_data.username);
    if (!username_result.valid) {
      new_errors.username = username_result.error;
    }

    const email_result = validate_email(form_data.email);
    if (!email_result.valid) {
      new_errors.email = email_result.error;
    }

    const password_result = validate_password(form_data.password);
    if (!password_result.valid) {
      new_errors.password = password_result.error;
    }

    const match_result = validate_passwords_match(form_data.password, form_data.confirm_password);
    if (!match_result.valid) {
      new_errors.confirm_password = match_result.error;
    }

    set_errors(new_errors);
    return Object.keys(new_errors).length === 0;
  }

  async function handle_submit(e) {
    e.preventDefault();

    if (!validate_form()) {
      return;
    }

    set_loading(true);
    set_server_error('');

    try {
      await register({
        username: form_data.username,
        email: form_data.email,
        password: form_data.password,
      });

      add_toast({
        title: 'Account created!',
        description: 'Please check your email to verify your account.',
        variant: 'success',
      });

      navigate('/login');
    } catch (err) {
      set_server_error(err.message || 'Registration failed');

      if (err.status === 429) {
        set_server_error('Too many registration attempts. Please try again later.');
      }
    } finally {
      set_loading(false);
    }
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Get started with To-Doable
          </CardDescription>
        </CardHeader>

        <form onSubmit={handle_submit}>
          <CardContent className={styles.content}>
            {server_error && (
              <div className={styles.error} role="alert">
                {server_error}
              </div>
            )}

            <div className={styles.field}>
              <Label htmlFor="username" error={!!errors.username}>Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                value={form_data.username}
                onChange={handle_change}
                placeholder="Choose a username"
                autoComplete="username"
                required
                disabled={loading}
                error={!!errors.username}
              />
              {errors.username && (
                <span className={styles.field_error}>{errors.username}</span>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="email" error={!!errors.email}>Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={form_data.email}
                onChange={handle_change}
                placeholder="Enter your email"
                autoComplete="email"
                required
                disabled={loading}
                error={!!errors.email}
              />
              {errors.email && (
                <span className={styles.field_error}>{errors.email}</span>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="password" error={!!errors.password}>Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={form_data.password}
                onChange={handle_change}
                placeholder="Create a password (min 15 characters)"
                autoComplete="new-password"
                required
                disabled={loading}
                error={!!errors.password}
              />
              {errors.password && (
                <span className={styles.field_error}>{errors.password}</span>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="confirm_password" error={!!errors.confirm_password}>Confirm Password</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                value={form_data.confirm_password}
                onChange={handle_change}
                placeholder="Confirm your password"
                autoComplete="new-password"
                required
                disabled={loading}
                error={!!errors.confirm_password}
              />
              {errors.confirm_password && (
                <span className={styles.field_error}>{errors.confirm_password}</span>
              )}
            </div>
          </CardContent>

          <CardFooter className={styles.footer}>
            <Button type="submit" loading={loading} className={styles.submit_btn}>
              Create account
            </Button>
          </CardFooter>
        </form>

        <div className={styles.links}>
          <p>
            Already have an account?{' '}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
