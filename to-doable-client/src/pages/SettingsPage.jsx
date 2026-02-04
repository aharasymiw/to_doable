/**
 * Settings page
 * Password change, theme settings, account deletion
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { api } from '../lib/api.js';
import {
  Button, Input, Label, Card, CardHeader, CardTitle,
  CardDescription, CardContent, CardFooter,
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter, Tabs, TabsList, TabsTrigger, TabsContent
} from '../components/ui/index.js';
import { validate_password, validate_passwords_match } from '../lib/validation.js';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const navigate = useNavigate();
  const { change_password, logout } = useAuth();
  const { theme, set_theme } = useTheme();
  const { add_toast } = useToast();

  // Password change state
  const [password_form, set_password_form] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [password_errors, set_password_errors] = useState({});
  const [password_loading, set_password_loading] = useState(false);

  // Delete account state
  const [show_delete_dialog, set_show_delete_dialog] = useState(false);
  const [delete_password, set_delete_password] = useState('');
  const [delete_error, set_delete_error] = useState('');
  const [delete_loading, set_delete_loading] = useState(false);

  function handle_password_change(e) {
    const { name, value } = e.target;
    set_password_form((prev) => ({ ...prev, [name]: value }));
    set_password_errors((prev) => ({ ...prev, [name]: '' }));
  }

  async function handle_password_submit(e) {
    e.preventDefault();

    // Validate
    const errors = {};

    if (!password_form.current_password) {
      errors.current_password = 'Current password is required';
    }

    const new_result = validate_password(password_form.new_password);
    if (!new_result.valid) {
      errors.new_password = new_result.error;
    }

    const match_result = validate_passwords_match(
      password_form.new_password,
      password_form.confirm_password
    );
    if (!match_result.valid) {
      errors.confirm_password = match_result.error;
    }

    if (Object.keys(errors).length > 0) {
      set_password_errors(errors);
      return;
    }

    set_password_loading(true);

    try {
      await change_password({
        current_password: password_form.current_password,
        new_password: password_form.new_password,
      });

      add_toast({
        title: 'Password changed',
        description: 'Please log in with your new password.',
        variant: 'success',
      });

      navigate('/login');
    } catch (err) {
      set_password_errors({
        current_password: err.message || 'Failed to change password',
      });
    } finally {
      set_password_loading(false);
    }
  }

  async function handle_delete_account() {
    if (!delete_password) {
      set_delete_error('Password is required');
      return;
    }

    set_delete_loading(true);
    set_delete_error('');

    try {
      await api.post('/account/delete', {
        password: delete_password,
      });

      add_toast({
        title: 'Account deactivated',
        description: 'You can recover your account within 30 days.',
      });

      await logout();
      navigate('/');
    } catch (err) {
      set_delete_error(err.message || 'Failed to delete account');
    } finally {
      set_delete_loading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Settings</h1>
        <p className={styles.subtitle}>Manage your account settings and preferences</p>
      </div>

      <Tabs default_value="security">
        <TabsList>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <form onSubmit={handle_password_submit}>
              <CardContent className={styles.form}>
                <div className={styles.field}>
                  <Label htmlFor="current_password">Current Password</Label>
                  <Input
                    id="current_password"
                    name="current_password"
                    type="password"
                    value={password_form.current_password}
                    onChange={handle_password_change}
                    autoComplete="current-password"
                    error={!!password_errors.current_password}
                  />
                  {password_errors.current_password && (
                    <span className={styles.field_error}>{password_errors.current_password}</span>
                  )}
                </div>

                <div className={styles.field}>
                  <Label htmlFor="new_password">New Password</Label>
                  <Input
                    id="new_password"
                    name="new_password"
                    type="password"
                    value={password_form.new_password}
                    onChange={handle_password_change}
                    placeholder="Minimum 15 characters"
                    autoComplete="new-password"
                    error={!!password_errors.new_password}
                  />
                  {password_errors.new_password && (
                    <span className={styles.field_error}>{password_errors.new_password}</span>
                  )}
                </div>

                <div className={styles.field}>
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <Input
                    id="confirm_password"
                    name="confirm_password"
                    type="password"
                    value={password_form.confirm_password}
                    onChange={handle_password_change}
                    autoComplete="new-password"
                    error={!!password_errors.confirm_password}
                  />
                  {password_errors.confirm_password && (
                    <span className={styles.field_error}>{password_errors.confirm_password}</span>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" loading={password_loading}>
                  Change password
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>
                Choose your preferred color scheme
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={styles.theme_options}>
                <button
                  className={`${styles.theme_option} ${theme === 'light' ? styles.active : ''}`}
                  onClick={() => set_theme('light')}
                >
                  <div className={styles.theme_preview} data-theme="light">
                    <div className={styles.preview_header} />
                    <div className={styles.preview_content}>
                      <div className={styles.preview_line} />
                      <div className={styles.preview_line} />
                    </div>
                  </div>
                  <span>Light</span>
                </button>

                <button
                  className={`${styles.theme_option} ${theme === 'dark' ? styles.active : ''}`}
                  onClick={() => set_theme('dark')}
                >
                  <div className={styles.theme_preview} data-theme="dark">
                    <div className={styles.preview_header} />
                    <div className={styles.preview_content}>
                      <div className={styles.preview_line} />
                      <div className={styles.preview_line} />
                    </div>
                  </div>
                  <span>Dark</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone Tab */}
        <TabsContent value="danger">
          <Card className={styles.danger_card}>
            <CardHeader>
              <CardTitle>Delete Account</CardTitle>
              <CardDescription>
                Permanently delete your account and all associated data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.danger_text}>
                Once you delete your account, you have 30 days to recover it.
                After that, all your data will be permanently deleted.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="destructive" onClick={() => set_show_delete_dialog(true)}>
                Delete account
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={show_delete_dialog} on_close={() => set_show_delete_dialog(false)}>
        <DialogHeader>
          <DialogTitle>Delete Account</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete your account?
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className={styles.dialog_content}>
            <p>
              You'll have 30 days to recover your account. After that,
              all your data will be permanently deleted.
            </p>

            {delete_error && (
              <div className={styles.error}>{delete_error}</div>
            )}

            <div className={styles.field}>
              <Label htmlFor="delete_password">Password</Label>
              <Input
                id="delete_password"
                type="password"
                value={delete_password}
                onChange={(e) => {
                  set_delete_password(e.target.value);
                  set_delete_error('');
                }}
                placeholder="Enter your password to confirm"
                autoComplete="current-password"
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              set_show_delete_dialog(false);
              set_delete_password('');
              set_delete_error('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handle_delete_account}
            loading={delete_loading}
          >
            Delete account
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
