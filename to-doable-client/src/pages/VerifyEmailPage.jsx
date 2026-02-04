/**
 * Email verification page
 * Handles verification token from URL
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Spinner, Button } from '../components/ui/index.js';
import styles from './VerifyEmailPage.module.css';

export function VerifyEmailPage() {
  const [search_params] = useSearchParams();
  const token = search_params.get('token');

  const [status, set_status] = useState('verifying'); // verifying, success, error
  const [error, set_error] = useState('');

  useEffect(() => {
    if (!token) {
      set_status('error');
      set_error('Verification token is missing');
      return;
    }

    async function verify() {
      try {
        await api.get(`/auth/verify-email?token=${token}`);
        set_status('success');
      } catch (err) {
        set_status('error');
        set_error(err.message || 'Verification failed');
      }
    }

    verify();
  }, [token]);

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        {status === 'verifying' && (
          <>
            <CardHeader>
              <CardTitle>Verifying your email...</CardTitle>
            </CardHeader>
            <CardContent className={styles.content}>
              <Spinner size="lg" />
            </CardContent>
          </>
        )}

        {status === 'success' && (
          <>
            <CardHeader>
              <CardTitle>Email Verified!</CardTitle>
              <CardDescription>
                Your email has been successfully verified.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.content}>
              <div className={styles.success_icon}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.85999"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M22 4L12 14.01L9 11.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <Link to="/login">
                <Button>Go to login</Button>
              </Link>
            </CardContent>
          </>
        )}

        {status === 'error' && (
          <>
            <CardHeader>
              <CardTitle>Verification Failed</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent className={styles.content}>
              <div className={styles.error_icon}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M15 9L9 15M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className={styles.error_text}>
                The verification link may have expired or is invalid.
                Please try logging in and requesting a new verification email.
              </p>
              <Link to="/login">
                <Button variant="outline">Go to login</Button>
              </Link>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
