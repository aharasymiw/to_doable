/**
 * S3 service for avatar storage
 * Handles uploading, retrieving, and deleting avatar images
 * Uses sharp for image processing (resize, crop)
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { s3_config, avatar_config } from '../config/index.js';

// Initialize S3 client
const s3_client = new S3Client({
  region: s3_config.region,
  credentials: {
    accessKeyId: s3_config.credentials.access_key_id,
    secretAccessKey: s3_config.credentials.secret_access_key,
  },
});

/**
 * Process avatar image - resize and crop to square
 * @param {Buffer} image_buffer - Raw image data
 * @returns {Promise<Buffer>} - Processed image as WebP
 */
async function process_avatar(image_buffer) {
  const { width, height } = avatar_config.resize_dimensions;

  // Use sharp to resize and crop to square
  // cover: maintains aspect ratio, crops to fill
  return sharp(image_buffer)
    .resize(width, height, {
      fit: 'cover', // Crop to fill dimensions
      position: 'centre', // Crop from center
    })
    .webp({ quality: 85 }) // Convert to WebP for smaller size
    .toBuffer();
}

/**
 * Upload avatar to S3
 * @param {string} user_id - User's UUID
 * @param {Buffer} image_buffer - Raw image data
 * @param {string} content_type - Original MIME type
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function upload_avatar(user_id, image_buffer, content_type) {
  try {
    // Process image (resize, crop, convert to WebP)
    const processed_image = await process_avatar(image_buffer);

    // Generate unique key for the avatar
    const key = `avatars/${user_id}.webp`;

    const command = new PutObjectCommand({
      Bucket: s3_config.bucket,
      Key: key,
      Body: processed_image,
      ContentType: 'image/webp',
      // Public read for avatars
      ACL: 'public-read',
      // Cache for 1 year (immutable since we use new keys on update)
      CacheControl: 'public, max-age=31536000',
    });

    await s3_client.send(command);

    // Construct public URL
    const url = `https://${s3_config.bucket}.s3.${s3_config.region}.amazonaws.com/${key}`;

    return { success: true, url };
  } catch (err) {
    console.error('Avatar upload failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Delete avatar from S3
 * @param {string} user_id - User's UUID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function delete_avatar(user_id) {
  try {
    const key = `avatars/${user_id}.webp`;

    const command = new DeleteObjectCommand({
      Bucket: s3_config.bucket,
      Key: key,
    });

    await s3_client.send(command);

    return { success: true };
  } catch (err) {
    // Don't fail if avatar doesn't exist
    if (err.name === 'NoSuchKey') {
      return { success: true };
    }

    console.error('Avatar delete failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate a presigned URL for direct upload from client
 * Alternative approach for large files to avoid server memory
 * @param {string} user_id - User's UUID
 * @param {string} content_type - File MIME type
 * @returns {Promise<{success: boolean, upload_url?: string, final_url?: string, error?: string}>}
 */
export async function get_presigned_upload_url(user_id, content_type) {
  try {
    const key = `avatars/temp/${user_id}-${Date.now()}.${get_extension(content_type)}`;

    const command = new PutObjectCommand({
      Bucket: s3_config.bucket,
      Key: key,
      ContentType: content_type,
    });

    const upload_url = await getSignedUrl(s3_client, command, {
      expiresIn: 300, // 5 minutes
    });

    return {
      success: true,
      upload_url,
      key,
    };
  } catch (err) {
    console.error('Presigned URL generation failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get file extension from MIME type
 * @param {string} mime_type
 * @returns {string}
 */
function get_extension(mime_type) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return extensions[mime_type] || 'jpg';
}
