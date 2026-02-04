/**
 * Profile page
 * Displays and allows editing of user profile
 * Supports offline mode with local-first updates
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import {
  Button, Input, Label, Textarea, Card, CardHeader, CardTitle,
  CardContent, CardFooter, Avatar, AvatarImage, AvatarFallback,
  get_initials, Tabs, TabsList, TabsTrigger, TabsContent, Badge, Spinner
} from '../components/ui/index.js';
import { api, generate_idempotency_key } from '../lib/api.js';
import { profile_storage } from '../lib/storage.js';
import { queue_profile_update, is_online, get_sync_status, on_sync_change } from '../lib/sync.js';
import { validate_bio, validate_phone, validate_pronouns, validate_avatar_url, validate_avatar_file } from '../lib/validation.js';
import { VerificationBanner } from '../components/VerificationBanner.jsx';
import { SyncIndicator } from '../components/SyncIndicator.jsx';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { user, refresh_auth } = useAuth();
  const { add_toast } = useToast();

  const [profile, set_profile] = useState(null);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [uploading, set_uploading] = useState(false);
  const [errors, set_errors] = useState({});
  const [sync_status, set_sync_status] = useState({ online: true, pending: 0 });

  const file_input_ref = useRef(null);

  // Load profile
  useEffect(() => {
    async function load_profile() {
      try {
        // Try to get from server first if online
        if (is_online()) {
          const response = await api.get('/profile');
          set_profile(response.profile);
          await profile_storage.save(response.profile);
        } else {
          // Offline - load from local storage
          const cached = await profile_storage.get(user.id);
          if (cached) {
            set_profile(cached);
          }
        }
      } catch (err) {
        // Try local storage on error
        const cached = await profile_storage.get(user.id);
        if (cached) {
          set_profile(cached);
        } else {
          add_toast({
            title: 'Error',
            description: 'Failed to load profile',
            variant: 'error',
          });
        }
      } finally {
        set_loading(false);
      }
    }

    load_profile();
  }, [user.id, add_toast]);

  // Listen for sync status changes
  useEffect(() => {
    const unsubscribe = on_sync_change((status) => {
      set_sync_status(status);
    });

    // Get initial status
    get_sync_status().then(set_sync_status);

    return unsubscribe;
  }, []);

  function handle_change(e) {
    const { name, value } = e.target;
    set_profile((prev) => ({
      ...prev,
      [name]: value,
    }));
    set_errors((prev) => ({ ...prev, [name]: '' }));
  }

  async function handle_save() {
    // Validate fields
    const new_errors = {};

    const bio_result = validate_bio(profile.bio);
    if (!bio_result.valid) new_errors.bio = bio_result.error;

    const phone_result = validate_phone(profile.phone);
    if (!phone_result.valid) new_errors.phone = phone_result.error;

    const pronouns_result = validate_pronouns(profile.pronouns);
    if (!pronouns_result.valid) new_errors.pronouns = pronouns_result.error;

    if (Object.keys(new_errors).length > 0) {
      set_errors(new_errors);
      return;
    }

    set_saving(true);

    try {
      const changes = {
        bio: profile.bio || null,
        phone: profile.phone || null,
        pronouns: profile.pronouns || null,
      };

      // If online, save directly; otherwise queue for sync
      if (is_online()) {
        const response = await api.patch('/profile', changes, {
          idempotency_key: generate_idempotency_key(),
        });
        set_profile(response.profile);
        await profile_storage.save(response.profile);
      } else {
        // Queue for later sync
        await queue_profile_update(changes, user.id);
      }

      add_toast({
        title: 'Profile saved',
        description: is_online() ? 'Your changes have been saved.' : 'Changes will sync when back online.',
        variant: 'success',
      });
    } catch (err) {
      // On error, queue for sync
      const changes = {
        bio: profile.bio || null,
        phone: profile.phone || null,
        pronouns: profile.pronouns || null,
      };
      await queue_profile_update(changes, user.id);

      add_toast({
        title: 'Saved locally',
        description: 'Changes will sync when connection is restored.',
        variant: 'warning',
      });
    } finally {
      set_saving(false);
    }
  }

  async function handle_avatar_upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validate_avatar_file(file);
    if (!validation.valid) {
      add_toast({
        title: 'Invalid file',
        description: validation.error,
        variant: 'error',
      });
      return;
    }

    set_uploading(true);

    try {
      const form_data = new FormData();
      form_data.append('avatar', file);

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: form_data,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();

      set_profile((prev) => ({
        ...prev,
        avatar_url: data.avatar_url,
      }));

      add_toast({
        title: 'Avatar updated',
        variant: 'success',
      });
    } catch (err) {
      add_toast({
        title: 'Upload failed',
        description: err.message,
        variant: 'error',
      });
    } finally {
      set_uploading(false);
      if (file_input_ref.current) {
        file_input_ref.current.value = '';
      }
    }
  }

  async function handle_remove_avatar() {
    set_uploading(true);

    try {
      await api.delete('/profile/avatar');

      set_profile((prev) => ({
        ...prev,
        avatar_url: null,
      }));

      add_toast({
        title: 'Avatar removed',
        variant: 'success',
      });
    } catch (err) {
      add_toast({
        title: 'Failed to remove avatar',
        description: err.message,
        variant: 'error',
      });
    } finally {
      set_uploading(false);
    }
  }

  async function handle_avatar_url_save() {
    const validation = validate_avatar_url(profile.avatar_url);
    if (!validation.valid) {
      set_errors({ avatar_url: validation.error });
      return;
    }

    set_saving(true);

    try {
      const response = await api.patch('/profile', {
        avatar_url: profile.avatar_url || null,
      }, {
        idempotency_key: generate_idempotency_key(),
      });

      set_profile(response.profile);

      add_toast({
        title: 'Avatar updated',
        variant: 'success',
      });
    } catch (err) {
      add_toast({
        title: 'Failed to update avatar',
        description: err.message,
        variant: 'error',
      });
    } finally {
      set_saving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.error_container}>
        <p>Failed to load profile</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <VerificationBanner />
      <SyncIndicator status={sync_status} />

      <div className={styles.header}>
        <h1>Profile</h1>
        <p className={styles.subtitle}>Manage your account settings</p>
      </div>

      <div className={styles.content}>
        {/* Avatar Section */}
        <Card className={styles.avatar_card}>
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
          </CardHeader>
          <CardContent className={styles.avatar_content}>
            <Avatar size="xl">
              <AvatarImage src={profile.avatar_url} alt={profile.username} />
              <AvatarFallback>{get_initials(profile.username)}</AvatarFallback>
            </Avatar>

            <Tabs default_value="upload">
              <TabsList>
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
              </TabsList>

              <TabsContent value="upload">
                <div className={styles.avatar_actions}>
                  <input
                    type="file"
                    ref={file_input_ref}
                    onChange={handle_avatar_upload}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className={styles.file_input}
                  />
                  <Button
                    variant="outline"
                    onClick={() => file_input_ref.current?.click()}
                    disabled={uploading}
                    loading={uploading}
                  >
                    Upload image
                  </Button>
                  {profile.avatar_url && (
                    <Button
                      variant="ghost"
                      onClick={handle_remove_avatar}
                      disabled={uploading}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="url">
                <div className={styles.url_form}>
                  <Input
                    type="url"
                    name="avatar_url"
                    value={profile.avatar_url || ''}
                    onChange={handle_change}
                    placeholder="https://example.com/avatar.jpg"
                    error={!!errors.avatar_url}
                  />
                  {errors.avatar_url && (
                    <span className={styles.field_error}>{errors.avatar_url}</span>
                  )}
                  <Button onClick={handle_avatar_url_save} disabled={saving}>
                    Save URL
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Profile Info Section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className={styles.form}>
            <div className={styles.field}>
              <Label>Username</Label>
              <Input value={profile.username} disabled />
              <span className={styles.field_hint}>Username cannot be changed</span>
            </div>

            <div className={styles.field}>
              <Label>Email</Label>
              <div className={styles.email_field}>
                <Input value={profile.email} disabled />
                {profile.is_verified ? (
                  <Badge variant="success">Verified</Badge>
                ) : (
                  <Badge variant="warning">Unverified</Badge>
                )}
              </div>
              <span className={styles.field_hint}>Email cannot be changed</span>
            </div>

            <div className={styles.field}>
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                name="pronouns"
                value={profile.pronouns || ''}
                onChange={handle_change}
                placeholder="e.g., they/them, she/her, he/him"
                error={!!errors.pronouns}
              />
              {errors.pronouns && (
                <span className={styles.field_error}>{errors.pronouns}</span>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={profile.phone || ''}
                onChange={handle_change}
                placeholder="+1234567890 (E.164 format)"
                error={!!errors.phone}
              />
              {errors.phone && (
                <span className={styles.field_error}>{errors.phone}</span>
              )}
            </div>

            <div className={styles.field}>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                value={profile.bio || ''}
                onChange={handle_change}
                placeholder="Tell us about yourself..."
                rows={4}
                error={!!errors.bio}
              />
              {errors.bio && (
                <span className={styles.field_error}>{errors.bio}</span>
              )}
              <span className={styles.field_hint}>
                {(profile.bio?.length || 0)}/500 characters
              </span>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handle_save} loading={saving}>
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
