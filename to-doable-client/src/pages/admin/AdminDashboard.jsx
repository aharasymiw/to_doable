/**
 * Admin dashboard - user management
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast.jsx';
import { api, generate_idempotency_key } from '../../lib/api.js';
import {
  Button, Input, Select, Card, CardHeader, CardTitle,
  CardContent, Badge, Avatar, AvatarImage, AvatarFallback,
  get_initials, Spinner, Dialog, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter
} from '../../components/ui/index.js';
import styles from './AdminDashboard.module.css';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { add_toast } = useToast();

  const [users, set_users] = useState([]);
  const [loading, set_loading] = useState(true);
  const [pagination, set_pagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });

  // Filters
  const [search, set_search] = useState('');
  const [status_filter, set_status_filter] = useState('');
  const [debounced_search, set_debounced_search] = useState('');

  // Delete dialog
  const [delete_dialog, set_delete_dialog] = useState({ open: false, user: null });
  const [deleting, set_deleting] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      set_debounced_search(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch users
  const fetch_users = useCallback(async () => {
    set_loading(true);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (debounced_search) {
        params.set('search', debounced_search);
      }

      if (status_filter) {
        params.set('status', status_filter);
      }

      const response = await api.get(`/admin/users?${params}`);
      set_users(response.users);
      set_pagination((prev) => ({
        ...prev,
        ...response.pagination,
      }));
    } catch (err) {
      add_toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'error',
      });
    } finally {
      set_loading(false);
    }
  }, [pagination.page, pagination.limit, debounced_search, status_filter, add_toast]);

  useEffect(() => {
    fetch_users();
  }, [fetch_users]);

  async function handle_delete(user) {
    set_deleting(true);

    try {
      await api.delete(`/admin/users/${user.id}`);

      add_toast({
        title: 'User deleted',
        description: `${user.username} has been deleted.`,
        variant: 'success',
      });

      set_delete_dialog({ open: false, user: null });
      fetch_users();
    } catch (err) {
      add_toast({
        title: 'Delete failed',
        description: err.message,
        variant: 'error',
      });
    } finally {
      set_deleting(false);
    }
  }

  async function handle_impersonate(user) {
    try {
      const response = await api.post(`/admin/impersonate/${user.id}`);

      // Open new tab with impersonation token
      const impersonation_url = `${window.location.origin}/impersonate?token=${response.impersonation_token}`;

      add_toast({
        title: 'Impersonation started',
        description: `Now impersonating ${user.username}. Opening new tab...`,
        variant: 'success',
      });

      window.open(impersonation_url, '_blank');
    } catch (err) {
      add_toast({
        title: 'Impersonation failed',
        description: err.message,
        variant: 'error',
      });
    }
  }

  async function handle_unblock(user) {
    try {
      await api.post(`/admin/users/${user.id}/unblock`);

      add_toast({
        title: 'User unblocked',
        description: `${user.username} has been unblocked.`,
        variant: 'success',
      });

      fetch_users();
    } catch (err) {
      add_toast({
        title: 'Unblock failed',
        description: err.message,
        variant: 'error',
      });
    }
  }

  function get_user_status(user) {
    if (user.deleted_at && user.deleted_by_admin) return 'admin-deleted';
    if (user.deleted_at) return 'deleted';
    if (!user.is_verified) return 'unverified';
    return 'verified';
  }

  function get_status_badge(status) {
    const variants = {
      'verified': { variant: 'success', label: 'Verified' },
      'unverified': { variant: 'warning', label: 'Unverified' },
      'deleted': { variant: 'secondary', label: 'Deleted' },
      'admin-deleted': { variant: 'destructive', label: 'Admin Deleted' },
    };
    return variants[status] || { variant: 'secondary', label: status };
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>User Management</h1>
          <p className={styles.subtitle}>Manage all user accounts</p>
        </div>
        <Button onClick={() => navigate('/admin/users/new')}>
          Add User
        </Button>
      </div>

      {/* Filters */}
      <Card className={styles.filters}>
        <CardContent className={styles.filters_content}>
          <Input
            placeholder="Search by username or email..."
            value={search}
            onChange={(e) => set_search(e.target.value)}
            className={styles.search_input}
          />

          <Select
            value={status_filter}
            onChange={(e) => {
              set_status_filter(e.target.value);
              set_pagination((prev) => ({ ...prev, page: 1 }));
            }}
          >
            <option value="">All statuses</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="deleted">Deleted</option>
            <option value="admin-deleted">Admin Deleted</option>
            <option value="blocked">Blocked</option>
          </Select>

          <Select
            value={pagination.limit.toString()}
            onChange={(e) => set_pagination((prev) => ({
              ...prev,
              limit: parseInt(e.target.value, 10),
              page: 1,
            }))}
          >
            <option value="20">20 per page</option>
            <option value="50">50 per page</option>
            <option value="75">75 per page</option>
            <option value="100">100 per page</option>
            <option value="200">200 per page</option>
            <option value="500">500 per page</option>
            <option value="1000">1000 per page</option>
            <option value="-1">All</option>
          </Select>
        </CardContent>
      </Card>

      {/* User list */}
      {loading ? (
        <div className={styles.loading}>
          <Spinner size="lg" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className={styles.empty}>
            <p>No users found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className={styles.user_list}>
            {users.map((user) => {
              const status = get_user_status(user);
              const status_badge = get_status_badge(status);

              return (
                <Card key={user.id} className={styles.user_card}>
                  <CardContent className={styles.user_content}>
                    <div className={styles.user_info}>
                      <Avatar size="lg">
                        <AvatarImage src={user.avatar_url} alt={user.username} />
                        <AvatarFallback>{get_initials(user.username)}</AvatarFallback>
                      </Avatar>
                      <div className={styles.user_details}>
                        <div className={styles.user_name}>
                          <span>{user.username}</span>
                          {user.is_admin && <Badge>Admin</Badge>}
                          <Badge variant={status_badge.variant}>{status_badge.label}</Badge>
                        </div>
                        <span className={styles.user_email}>{user.email}</span>
                        <span className={styles.user_date}>
                          Joined {new Date(user.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className={styles.user_actions}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/users/${user.id}`)}
                      >
                        View
                      </Button>
                      {!user.is_admin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handle_impersonate(user)}
                          >
                            Impersonate
                          </Button>
                          {!user.deleted_at && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => set_delete_dialog({ open: true, user })}
                            >
                              Delete
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className={styles.pagination}>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => set_pagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </Button>
              <span className={styles.page_info}>
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => set_pagination((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={delete_dialog.open}
        on_close={() => set_delete_dialog({ open: false, user: null })}
      >
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {delete_dialog.user?.username}?
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className={styles.delete_warning}>
            The user's account will be soft-deleted. They will not be able to recover it,
            and it will be permanently deleted after 30 days.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => set_delete_dialog({ open: false, user: null })}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handle_delete(delete_dialog.user)}
            loading={deleting}
          >
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
