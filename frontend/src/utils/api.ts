const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api/v1';

let refreshPromise: Promise<boolean> | null = null;

/**
 * Perform a concurrent-safe silent token refresh using the HttpOnly refresh cookie
 */
export async function attemptTokenRefresh(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function request<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' = 'GET',
  body?: any,
  isRetry = false
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Optional in-memory / fallback token
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers,
    credentials: 'include', // Send and receive HttpOnly cookies across origins
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  const text = await response.text();

  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`Server returned error (${response.status}): ${response.statusText || 'Invalid response'}`);
    }
    throw new Error('Invalid JSON format returned from server');
  }

  // Handle access token expiration via silent refresh
  if (response.status === 401) {
    const isAuthEndpoint =
      endpoint.startsWith('/auth/refresh') ||
      endpoint.startsWith('/auth/login') ||
      endpoint.startsWith('/auth/register');

    if (!isRetry && !isAuthEndpoint) {
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        return request<T>(endpoint, method, body, true);
      }
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('auth-error'));
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    throw new Error(json?.message || `Request failed with status ${response.status}`);
  }

  return json?.data;
}
