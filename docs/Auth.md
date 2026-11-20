# Authentication Architecture: Dual-Token (Access + Refresh Rotation)

## Flow Diagram

```
                      +-------------------------------------------------------------+
                      |                      FRONTEND CLIENT                        |
                      +-------------------------------------------------------------+
                                     |                                 ^
                                     | Normal API Call                 | 401 Unauthorized
                                     | (with 15m Access Cookie)        | (Access Token Expired)
                                     v                                 |
                      +-------------------------------------------------------------+
                      |                     EXPRESS BACKEND                         |
                      |                 authMiddleware (15m JWT)                    |
                      +-------------------------------------------------------------+
                                     |
                                     | On 401, Client Silently Triggers:
                                     | POST /api/v1/auth/refresh
                                     v (with 7d HttpOnly Refresh Cookie scoped to /api/v1/auth)
                      +-------------------------------------------------------------+
                      |                    ROTATE REFRESH TOKEN                     |
                      | 1. Verify Refresh Token signature (JWT_REFRESH_SECRET)      |
                      | 2. Check whitelist in Redis / Cache (Reuse Detection)       |
                      | 3. Invalidate consumed tokenId in Redis                     |
                      | 4. Issue NEW Access Token (15m) + NEW Refresh Token (7d)    |
                      | 5. Store new tokenId in Redis                               |
                      | 6. Set new rotated HttpOnly cookies                         |
                      +-------------------------------------------------------------+
                                     |
                                     v
                      +-------------------------------------------------------------+
                      | Original Request Automatically Retried & Succeeds (Zero UI Glitch) |
                      +-------------------------------------------------------------+
```

---

## 1. Token & Cookie Specifications

| Attribute | Access Token (`accessToken`) | Refresh Token (`refreshToken`) |
|---|---|---|
| **Lifespan** | **15 Minutes** (`15m`) | **7 Days** (`7d`) |
| **Storage Location** | `HttpOnly` Cookie | `HttpOnly` Cookie |
| **Cookie Path** | `/` (sent to all API requests) | `/api/v1/auth` (restricted to auth endpoints only) |
| **Security Flags** | `httpOnly: true`, `secure: isProd`, `sameSite: isProd ? 'none' : 'lax'` | `httpOnly: true`, `secure: isProd`, `sameSite: isProd ? 'none' : 'lax'` |
| **Payload** | `{ id: adminId }` | `{ id: adminId, tokenId: UUID }` |
| **Signing Secret** | `JWT_SECRET` | `JWT_REFRESH_SECRET` |

---

## 2. Key Security Mechanisms

- **Zero JavaScript Access (XSS Immunity):** Neither token is stored in `localStorage` or `sessionStorage`. Malicious client-side scripts cannot access or exfiltrate tokens.
- **Single-Use Refresh Token Rotation:** Every time `/api/v1/auth/refresh` is called, the old `refreshToken` is permanently deleted from Redis/Cache and a new one is issued.
- **Theft / Reuse Detection:** If an already-rotated or revoked refresh token is presented, the system treats it as token theft and **revokes all active sessions** for that user.
- **Path-Scoped Refresh Token:** The refresh cookie path is locked to `/api/v1/auth`. It is never transmitted during normal CRUD operations (`/milk`, `/customer`, `/billing`), reducing network overhead and attack surface.
- **Redis Whitelist with In-Memory Fallback:** Whitelist is tracked in Redis (`auth:refresh:<adminId>:<tokenId>`). If Redis is temporarily offline in local dev, an in-memory TTL store ensures zero crashes.

---

## 3. Client-Side Lifecycle (Silent Auto-Refresh)

1. **Seamless Execution:** When the 15-minute access token expires, API requests receive a `401 Unauthorized`.
2. **Concurrent Request Queue (`attemptTokenRefresh`):** If multiple requests fail simultaneously, only a single `/auth/refresh` call is made. All pending requests wait on the same promise.
3. **Transparent Retry:** Once refreshed, the original failed request is automatically retried with `isRetry = true`. The user experiences zero interruption.
4. **Hard Expiry Handling:** If the 7-day refresh token also expires or is revoked, the app clears in-memory state, fires the `auth-error` event, and redirects to the login screen.

---

## 4. Auth API Endpoints

- `POST /api/v1/auth/login` — Verifies password, sets both cookies, returns admin profile.
- `POST /api/v1/auth/register` — Creates admin, sets both cookies.
- `POST /api/v1/auth/refresh` — Validates & rotates refresh token, updates both cookies.
- `POST /api/v1/auth/logout` — Revokes refresh token in Redis and clears both cookies.
- `GET /api/v1/auth/me` — Authenticates session via access cookie, returns current admin user.
