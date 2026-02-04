/**
 * User profile routes
 * Handles profile viewing, editing, avatar upload
 */

import { Router } from 'express';
import { query } from '../db/pool.js';
import {
  validate_bio,
  validate_phone,
  validate_pronouns,
  validate_avatar_url,
  validate_avatar_file,
  sanitize_html,
} from '../utils/validation.js';
import { upload_avatar, delete_avatar } from '../services/s3.js';
import { require_auth, block_deleted_users } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { avatar_config } from '../config/index.js';

const router = Router();

// All profile routes require authentication
router.use(require_auth);

/**
 * GET /api/profile
 * Get current user's profile
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, avatar_url, bio, phone, pronouns, is_admin, is_verified, deleted_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PATCH /api/profile
 * Update profile fields (bio, phone, pronouns, avatar_url)
 * Username and email are not editable
 */
router.patch(
  '/',
  block_deleted_users,
  idempotency({ required: true }),
  async (req, res) => {
    try {
      const { bio, phone, pronouns, avatar_url } = req.body;
      const updates = [];
      const values = [];
      let param_count = 1;

      // Validate and add bio if provided
      if (bio !== undefined) {
        const bio_result = validate_bio(bio);
        if (!bio_result.valid) {
          return res.status(400).json({ error: bio_result.error });
        }
        updates.push(`bio = $${param_count++}`);
        values.push(bio_result.value ? sanitize_html(bio_result.value) : null);
      }

      // Validate and add phone if provided
      if (phone !== undefined) {
        const phone_result = validate_phone(phone);
        if (!phone_result.valid) {
          return res.status(400).json({ error: phone_result.error });
        }
        updates.push(`phone = $${param_count++}`);
        values.push(phone_result.value);
      }

      // Validate and add pronouns if provided
      if (pronouns !== undefined) {
        const pronouns_result = validate_pronouns(pronouns);
        if (!pronouns_result.valid) {
          return res.status(400).json({ error: pronouns_result.error });
        }
        updates.push(`pronouns = $${param_count++}`);
        values.push(pronouns_result.value ? sanitize_html(pronouns_result.value) : null);
      }

      // Validate and add avatar_url if provided
      if (avatar_url !== undefined) {
        const avatar_result = validate_avatar_url(avatar_url);
        if (!avatar_result.valid) {
          return res.status(400).json({ error: avatar_result.error });
        }
        updates.push(`avatar_url = $${param_count++}`);
        values.push(avatar_result.value);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      // Add user ID as last parameter
      values.push(req.user.id);

      const result = await query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${param_count}
         RETURNING id, username, email, avatar_url, bio, phone, pronouns, is_admin, is_verified, created_at, updated_at`,
        values
      );

      res.json({
        message: 'Profile updated',
        profile: result.rows[0],
      });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

/**
 * POST /api/profile/avatar
 * Upload avatar image
 * Expects multipart form data with 'avatar' file field
 */
router.post(
  '/avatar',
  block_deleted_users,
  async (req, res) => {
    try {
      // Check content type
      const content_type = req.headers['content-type'] || '';

      if (!content_type.includes('multipart/form-data')) {
        return res.status(400).json({
          error: 'Invalid content type',
          message: 'Expected multipart/form-data',
        });
      }

      // Parse multipart data manually (avoiding additional dependencies)
      const chunks = [];
      let total_size = 0;

      for await (const chunk of req) {
        total_size += chunk.length;

        // Check size limit
        if (total_size > avatar_config.max_file_size) {
          return res.status(413).json({
            error: 'File too large',
            message: `Maximum size is ${avatar_config.max_file_size / (1024 * 1024)}MB`,
          });
        }

        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      // Parse multipart boundary
      const boundary_match = content_type.match(/boundary=(?:"([^"]+)"|([^;]+))/);
      if (!boundary_match) {
        return res.status(400).json({ error: 'Invalid multipart data' });
      }

      const boundary = boundary_match[1] || boundary_match[2];
      const parsed = parse_multipart(buffer, boundary);

      if (!parsed.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Validate file
      const validation = validate_avatar_file({
        mimetype: parsed.content_type,
        size: parsed.file.length,
      });

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Upload to S3
      const upload_result = await upload_avatar(
        req.user.id,
        parsed.file,
        parsed.content_type
      );

      if (!upload_result.success) {
        return res.status(500).json({
          error: 'Upload failed',
          message: upload_result.error,
        });
      }

      // Update user's avatar_url
      await query(
        `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
        [upload_result.url, req.user.id]
      );

      res.json({
        message: 'Avatar uploaded',
        avatar_url: upload_result.url,
      });
    } catch (err) {
      console.error('Avatar upload error:', err);
      res.status(500).json({ error: 'Failed to upload avatar' });
    }
  }
);

/**
 * DELETE /api/profile/avatar
 * Remove avatar image
 */
router.delete('/avatar', block_deleted_users, async (req, res) => {
  try {
    // Get current avatar URL to check if it's an S3 URL
    const user_result = await query(
      `SELECT avatar_url FROM users WHERE id = $1`,
      [req.user.id]
    );

    const current_url = user_result.rows[0]?.avatar_url;

    // If it's an S3 URL, delete from S3
    if (current_url && current_url.includes('s3.')) {
      await delete_avatar(req.user.id);
    }

    // Clear avatar_url in database
    await query(
      `UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1`,
      [req.user.id]
    );

    res.json({ message: 'Avatar removed' });
  } catch (err) {
    console.error('Avatar delete error:', err);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

/**
 * Parse multipart form data
 * Simple parser for single file upload
 * @param {Buffer} buffer
 * @param {string} boundary
 * @returns {{file: Buffer|null, content_type: string|null, filename: string|null}}
 */
function parse_multipart(buffer, boundary) {
  const boundary_buffer = Buffer.from(`--${boundary}`);
  const result = { file: null, content_type: null, filename: null };

  // Find start of file content
  let pos = buffer.indexOf(boundary_buffer);
  if (pos === -1) return result;

  // Skip to end of headers
  const header_end = buffer.indexOf('\r\n\r\n', pos);
  if (header_end === -1) return result;

  // Parse headers
  const headers = buffer.slice(pos, header_end).toString();

  // Extract content type
  const content_type_match = headers.match(/Content-Type:\s*([^\r\n]+)/i);
  if (content_type_match) {
    result.content_type = content_type_match[1].trim();
  }

  // Extract filename
  const filename_match = headers.match(/filename="([^"]+)"/);
  if (filename_match) {
    result.filename = filename_match[1];
  }

  // Find end of content (next boundary or end)
  const content_start = header_end + 4;
  const end_boundary = buffer.indexOf(boundary_buffer, content_start);
  const content_end = end_boundary !== -1 ? end_boundary - 2 : buffer.length; // -2 for \r\n

  result.file = buffer.slice(content_start, content_end);

  return result;
}

export default router;
