/**
 * Account recovery page
 * Shown when a deleted user logs in
 * Allows recovery, permanent deletion, or logout
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { api } from '../lib/api.js';
import {
  Button, Input, Label, Card, CardHeader, CardTitle,
  CardDescription, CardContent, CardFooter,
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter
} from '../components/ui/index.js';
import styles from './AccountRecoveryPage.module.css';

export function AccountRecoveryPage() {
  const navigate = useNavigate();
  const { user, logout, refresh_auth } = useAuth();
  const { add_toast } = useToast();

  const [loading, set_loading] = useState(false);
  const [show_delete_dialog, set_show_delete_dialog] = useState(false);
  const [delete_password, set_delete_password] = useState('');
  const [delete_error, set_delete_error] = useState('');

  async function handle_recover() {
    set_loading(true);

    try {
      await api.post('/account/recover');

      add_toast({
        title: 'Account recovered!',
        description: 'Welcome back to To-Doable.',
        variant: 'success',
      });

      await refresh_auth();
      navigate('/profile');
    } catch (err) {
      add_toast({
        title: 'Recovery failed',
        description: err.message,
        variant: 'error',
      });
    } finally {
      set_loading(false);
    }
  }

  async function handle_permanent_delete() {
    if (!delete_password) {
      set_delete_error('Password is required');
      return;
    }

    set_loading(true);
    set_delete_error('');

    try {
      await api.post('/account/permanent-delete', {
        password: delete_password,
      });

      add_toast({
        title: 'Account deleted',
        description: 'Your account has been permanently deleted.',
      });

      await logout();
      navigate('/');
    } catch (err) {
      set_delete_error(err.message || 'Failed to delete account');
    } finally {
      set_loading(false);
    }
  }

  async function handle_logout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Account Deactivated</CardTitle>
          <CardDescription>
            Your account was deactivated. You can recover it or permanently delete your data.
          </CardDescription>
        </CardHeader>

        <CardContent className={styles.content}>
          <div className={styles.info}>
            <p>
              <strong>Username:</strong> {user?.username}
            </p>
            <p className={styles.warning}>
              You have 30 days from deactivation to recover your account.
              After that, your data will be permanently deleted.
            </p>
          </div>

          <div className={styles.actions}>
            <Button onClick={handle_recover} loading={loading} className={styles.recover_btn}>
              Recover my account
            </Button>

            <Button
              variant="outline"
              onClick={() => set_show_delete_dialog(true)}
              disabled={loading}
            >
              Permanently delete
            </Button>

            <Button variant="ghost" onClick={handle_logout} disabled={loading}>
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog open={show_delete_dialog} on_close={() => set_show_delete_dialog(false)}>
        <DialogHeader>
          <DialogTitle>Permanently Delete Account</DialogTitle>
          <DialogDescription>
            This action cannot be undone. All your data will be permanently deleted.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className={styles.dialog_content}>
            <p className={styles.warning}>
              Please enter your password to confirm permanent deletion.
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
                placeholder="Enter your password"
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
            onClick={handle_permanent_delete}
            loading={loading}
          >
            Delete permanently
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
