/**
 * Email verification banner
 * Shows when user email is not verified
 */

import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from './ui/Toast.jsx';
import { Button } from './ui/index.js';
import styles from './VerificationBanner.module.css';

export function VerificationBanner() {
  const { user, is_verified, resend_verification } = useAuth();
  const { add_toast } = useToast();

  const [sending, set_sending] = useState(false);
  const [dismissed, set_dismissed] = useState(false);

  if (is_verified || dismissed) {
    return null;
  }

  async function handle_resend() {
    set_sending(true);

    try {
      await resend_verification();
      add_toast({
        title: 'Email sent',
        description: 'Verification email has been sent. Please check your inbox.',
        variant: 'success',
      });
    } catch (err) {
      if (err.status === 429) {
        add_toast({
          title: 'Please wait',
          description: err.data?.error || 'Please wait before requesting another email.',
          variant: 'warning',
        });
      } else {
        add_toast({
          title: 'Failed to send email',
          description: err.message,
          variant: 'error',
        });
      }
    } finally {
      set_sending(false);
    }
  }

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.content}>
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p>
          Please verify your email address.
          {user?.email && <span className={styles.email}> ({user.email})</span>}
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="outline"
          onClick={handle_resend}
          loading={sending}
        >
          Resend email
        </Button>
        <button
          className={styles.dismiss}
          onClick={() => set_dismissed(true)}
          aria-label="Dismiss"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
