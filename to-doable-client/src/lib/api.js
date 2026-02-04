/**
 * API client with retry logic
 * Uses fetch with exponential backoff and jitter
 */

const API_BASE = '/api';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt (0-indexed)
 * @returns {number} - Delay in milliseconds
 */
function calculate_delay(attempt) {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s
  const exponential_delay = BASE_DELAY_MS * Math.pow(2, attempt);

  // Cap at max delay
  const capped_delay = Math.min(exponential_delay, MAX_DELAY_MS);

  // Add jitter: ±25% of delay
  const jitter = capped_delay * 0.25 * (Math.random() * 2 - 1);

  return Math.round(capped_delay + jitter);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 * @param {Response|Error} error
 * @returns {boolean}
 */
function is_retryable(error) {
  // Network errors are retryable
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }

  // Server errors (5xx) are retryable
  if (error instanceof Response && error.status >= 500) {
    return true;
  }

  // Rate limit errors (429) are retryable
  if (error instanceof Response && error.status === 429) {
    return true;
  }

  return false;
}

/**
 * Get CSRF token from cookie
 * @returns {string|null}
 */
function get_csrf_token() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Generate idempotency key
 * @returns {string}
 */
export function generate_idempotency_key() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * API request with retry logic
 * @param {string} endpoint - API endpoint (without /api prefix)
 * @param {Object} options - Fetch options
 * @param {Object} config - Additional configuration
 * @param {string} config.idempotency_key - Idempotency key for POST/PATCH
 * @param {boolean} config.skip_retry - Skip retry logic
 * @returns {Promise<any>}
 */
export async function api_request(endpoint, options = {}, config = {}) {
  const url = `${API_BASE}${endpoint}`;
  const { idempotency_key, skip_retry = false } = config;

  // Prepare headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add CSRF token for non-GET requests
  if (options.method && options.method !== 'GET') {
    const csrf_token = get_csrf_token();
    if (csrf_token) {
      headers['X-CSRF-Token'] = csrf_token;
    }
  }

  // Add idempotency key if provided
  if (idempotency_key) {
    headers['Idempotency-Key'] = idempotency_key;
  }

  const fetch_options = {
    ...options,
    headers,
    credentials: 'include', // Include cookies
  };

  // Stringify body if it's an object
  if (options.body && typeof options.body === 'object') {
    fetch_options.body = JSON.stringify(options.body);
  }

  let last_error;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetch(url, fetch_options);

      // If not OK, check if retryable
      if (!response.ok) {
        if (!skip_retry && is_retryable(response) && attempt < MAX_RETRIES) {
          const delay = calculate_delay(attempt);
          console.log(`Request failed (${response.status}), retrying in ${delay}ms...`);
          await sleep(delay);
          attempt++;
          continue;
        }

        // Parse error response
        let error_data;
        try {
          error_data = await response.json();
        } catch {
          error_data = { error: response.statusText };
        }

        const error = new ApiError(
          error_data.error || 'Request failed',
          response.status,
          error_data
        );

        throw error;
      }

      // Parse successful response
      const content_type = response.headers.get('content-type');
      if (content_type?.includes('application/json')) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      last_error = error;

      // If it's already an ApiError, don't retry
      if (error instanceof ApiError) {
        throw error;
      }

      // Check if retryable
      if (!skip_retry && is_retryable(error) && attempt < MAX_RETRIES) {
        const delay = calculate_delay(attempt);
        console.log(`Request failed, retrying in ${delay}ms...`, error.message);
        await sleep(delay);
        attempt++;
        continue;
      }

      throw new ApiError(
        error.message || 'Network error',
        0,
        { original_error: error }
      );
    }
  }

  throw last_error || new ApiError('Max retries exceeded', 0);
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Convenience methods
export const api = {
  get: (endpoint, config) =>
    api_request(endpoint, { method: 'GET' }, config),

  post: (endpoint, body, config) =>
    api_request(endpoint, { method: 'POST', body }, config),

  patch: (endpoint, body, config) =>
    api_request(endpoint, { method: 'PATCH', body }, config),

  delete: (endpoint, config) =>
    api_request(endpoint, { method: 'DELETE' }, config),
};
