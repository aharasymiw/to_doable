/**
 * Email service using AWS SES
 * Handles sending verification emails and other notifications
 * Plain text emails only per requirements
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ses_config, server_config } from '../config/index.js';

// Initialize SES client
const ses_client = new SESClient({
  region: ses_config.region,
  credentials: {
    accessKeyId: ses_config.credentials.access_key_id,
    secretAccessKey: ses_config.credentials.secret_access_key,
  },
});

/**
 * Send an email using AWS SES
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Plain text email body
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function send_email({ to, subject, body }) {
  try {
    const command = new SendEmailCommand({
      Source: ses_config.from_email,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: body,
            Charset: 'UTF-8',
          },
        },
      },
    });

    await ses_client.send(command);
    return { success: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send email verification link
 * @param {string} to - Recipient email
 * @param {string} username - User's username
 * @param {string} token - Verification token
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function send_verification_email(to, username, token) {
  const verification_url = `${server_config.client_url}/verify-email?token=${token}`;

  const subject = 'Verify your To-Doable account';

  const body = `Hi ${username},

Thanks for signing up for To-Doable!

Please verify your email address by clicking the link below:

${verification_url}

This link will expire in 24 hours.

If you didn't create an account with To-Doable, you can safely ignore this email.

Best,
The To-Doable Team`;

  return send_email({ to, subject, body });
}

/**
 * Send password change confirmation
 * @param {string} to - Recipient email
 * @param {string} username - User's username
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function send_password_changed_email(to, username) {
  const subject = 'Your To-Doable password was changed';

  const body = `Hi ${username},

Your To-Doable password was just changed.

If you made this change, you can safely ignore this email.

If you didn't change your password, please contact support immediately.

Best,
The To-Doable Team`;

  return send_email({ to, subject, body });
}

/**
 * Send account deleted notification
 * @param {string} to - Recipient email
 * @param {string} username - User's username
 * @param {boolean} can_recover - Whether user can recover account
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function send_account_deleted_email(to, username, can_recover) {
  const subject = can_recover
    ? 'Your To-Doable account has been deactivated'
    : 'Your To-Doable account has been deleted';

  const recovery_text = can_recover
    ? `\nYou can recover your account within the next 30 days by logging in and selecting "Recover Account".\n\nAfter 30 days, your account and all data will be permanently deleted.`
    : '';

  const body = `Hi ${username},

Your To-Doable account has been ${can_recover ? 'deactivated' : 'deleted'}.
${recovery_text}

If you didn't request this, please contact support immediately.

Best,
The To-Doable Team`;

  return send_email({ to, subject, body });
}

/**
 * Send account recovered notification
 * @param {string} to - Recipient email
 * @param {string} username - User's username
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function send_account_recovered_email(to, username) {
  const subject = 'Your To-Doable account has been recovered';

  const body = `Hi ${username},

Good news! Your To-Doable account has been successfully recovered.

You can now log in and continue using To-Doable as normal.

Best,
The To-Doable Team`;

  return send_email({ to, subject, body });
}
