import { createAuthClient, BetterAuthVanillaAdapter } from './auth-dev-sdk.js';

let initPromise = null;
let inMemoryCookieJwt = null;

/**
 * Resolves the Express backend API base URL for local dev or same-origin deployment.
 */
export function getApiBase() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `http://${window.location.hostname}:5000/api`;
    }
    return '/api';
}

function resolveApiUrl(urlOrPath) {
    if (/^https?:\/\//i.test(urlOrPath)) {
        return urlOrPath;
    }
    const clean = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
    return `${getApiBase()}${clean}`;
}

/**
 * Lazily initializes a singleton @neon/auth vanilla client configured ONLY from
 * NEON_AUTH_DEV_BASE_URL via /api/dev/neon-auth-config.
 */
export function initNeonAuth() {
    if (!initPromise) {
        initPromise = (async () => {
            const resp = await fetch(`${getApiBase()}/dev/neon-auth-config`);
            const cfg = await resp.json().catch(() => ({}));
            if (!resp.ok || !cfg.authBaseUrl) {
                initPromise = null;
                throw new Error(cfg.error || 'Neon auth-dev configuration unavailable.');
            }
            const authClient = createAuthClient(cfg.authBaseUrl, {
                adapter: BetterAuthVanillaAdapter({
                    fetchOptions: { credentials: 'include' }
                })
            });
            return {
                authClient,
                authBaseUrl: cfg.authBaseUrl,
                branch: cfg.branch || 'auth-dev'
            };
        })();
    }
    return initPromise;
}

/**
 * Retrieves an EdDSA access JWT strictly in memory (never saved in localStorage
 * or sessionStorage, never logged).
 */
export async function getInMemoryToken(authClient, authBaseUrl) {
    const sessionRes = await authClient.getSession();
    if (!sessionRes || sessionRes.error || !sessionRes.data || !sessionRes.data.session) {
        return null;
    }

    const sessionToken = sessionRes.data.session.token;
    if (typeof sessionToken === 'string' && sessionToken.split('.').length === 3) {
        return sessionToken;
    }

    try {
        if (typeof authClient.token === 'function') {
            const tokenRes = await authClient.token();
            const jwt = tokenRes && tokenRes.data && tokenRes.data.token;
            if (typeof jwt === 'string' && jwt.split('.').length === 3) {
                return jwt;
            }
        }
    } catch (_) {
        // Fall through to direct /token endpoint check
    }

    if (authBaseUrl) {
        const cleanBase = authBaseUrl.replace(/\/+$/, '');
        const resp = await fetch(`${cleanBase}/token`, { credentials: 'include' });
        if (resp.ok) {
            const data = await resp.json().catch(() => null);
            if (data && typeof data.token === 'string' && data.token.split('.').length === 3) {
                return data.token;
            }
        }
    }

    return null;
}

/**
 * Fetches server-resolved identity & role from Express /api/auth/me.
 */
export async function fetchAuthMe(token) {
    const resp = await fetch(`${getApiBase()}/auth/me`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
}

/**
 * Verifies whether the current browser holds an active Neon Auth Admin session
 * confirmed server-side by GET /api/auth/me.
 */
export async function verifyAdminSession() {
    try {
        const { authClient, authBaseUrl } = await initNeonAuth();
        const token = await getInMemoryToken(authClient, authBaseUrl);
        if (!token) {
            return { authenticated: false, isAdmin: false, role: null, reason: 'no_session', authClient, authBaseUrl };
        }

        const me = await fetchAuthMe(token);
        if (!me.ok || !me.data || !me.data.authenticated) {
            return {
                authenticated: false,
                isAdmin: false,
                role: null,
                reason: (me.data && me.data.error) || 'unauthenticated',
                authClient,
                authBaseUrl
            };
        }

        const isAdmin = me.data.role === 'admin';
        return {
            authenticated: true,
            isAdmin,
            role: me.data.role,
            userId: me.data.userId,
            profile: me.data.profile || null,
            authClient,
            authBaseUrl
        };
    } catch (err) {
        return {
            authenticated: false,
            isAdmin: false,
            role: null,
            reason: err && err.message ? err.message : 'verification_error'
        };
    }
}

/**
 * Generates a unique, cryptographically secure temporary password in memory
 * using Web Crypto (minimum 8 chars; never logged, displayed, or persisted).
 */
export function generateSecureTempPassword(length = 20) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%^&*_-+=';
    const all = upper + lower + digits + symbols;
    const targetLen = Math.max(16, length);

    const chars = [];
    const buf = new Uint32Array(targetLen);
    window.crypto.getRandomValues(buf);
    // Guarantee at least one character from each required class
    chars.push(upper[buf[0] % upper.length]);
    chars.push(lower[buf[1] % lower.length]);
    chars.push(digits[buf[2] % digits.length]);
    chars.push(symbols[buf[3] % symbols.length]);
    for (let i = 4; i < targetLen; i++) {
        chars.push(all[buf[i] % all.length]);
    }
    // Fisher-Yates shuffle using crypto random
    const shuffleBuf = new Uint32Array(chars.length);
    window.crypto.getRandomValues(shuffleBuf);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = shuffleBuf[i] % (i + 1);
        const tmp = chars[i];
        chars[i] = chars[j];
        chars[j] = tmp;
    }
    return chars.join('');
}

/**
 * Retrieves an in-memory EdDSA access JWT from the HttpOnly Neon cookie proxy
 * (/api/auth/session-token), never storing the token in localStorage/sessionStorage.
 */
export async function getCookieSessionToken() {
    const resp = await fetch(`${getApiBase()}/auth/session-token`, {
        method: 'GET',
        credentials: 'include'
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data || typeof data.token !== 'string' || data.token.split('.').length !== 3) {
        inMemoryCookieJwt = null;
        return {
            token: null,
            status: resp.status,
            error: (data && data.error) || 'No active authenticated session.'
        };
    }
    inMemoryCookieJwt = data.token;
    return { token: data.token, status: resp.status, error: null };
}

/**
 * Verifies the active cookie-backed Neon Auth session (Teacher / Student) server-side
 * through /api/auth/session-token and /api/auth/me without trusting sessionStorage.
 */
export async function verifyCookieBackedSession(options = {}) {
    const { expectedRole = null } = options || {};
    try {
        const tokRes = await getCookieSessionToken();
        if (!tokRes.token) {
            return {
                authenticated: false,
                authorized: false,
                status: tokRes.status || 401,
                role: null,
                userId: null,
                profile: null,
                error: tokRes.error
            };
        }

        const me = await fetchAuthMe(tokRes.token);
        if (!me.ok || !me.data || !me.data.authenticated) {
            inMemoryCookieJwt = null;
            return {
                authenticated: false,
                authorized: false,
                status: me.status || 401,
                role: null,
                userId: null,
                profile: null,
                error: (me.data && me.data.error) || 'Session verification failed.'
            };
        }

        const role = me.data.role || null;
        const authorized = expectedRole ? role === expectedRole : Boolean(me.data.linked);
        return {
            authenticated: true,
            authorized,
            status: authorized ? 200 : 403,
            role,
            linked: Boolean(me.data.linked),
            userId: me.data.userId || null,
            profile: me.data.profile || null,
            error: authorized ? null : 'Insufficient permissions for this dashboard.'
        };
    } catch (err) {
        inMemoryCookieJwt = null;
        return {
            authenticated: false,
            authorized: false,
            status: 503,
            role: null,
            userId: null,
            profile: null,
            error: (err && err.message) || 'Unable to verify authentication session.'
        };
    }
}

async function resolveBearerTokenForMode(authMode, forceRefresh = false) {
    if (authMode === 'admin') {
        const { authClient, authBaseUrl } = await initNeonAuth();
        return getInMemoryToken(authClient, authBaseUrl);
    }

    if (authMode === 'cookie') {
        if (!forceRefresh && inMemoryCookieJwt) {
            return inMemoryCookieJwt;
        }
        const res = await getCookieSessionToken();
        return res.token;
    }

    // 'auto' mode: try cookie token cache, then admin SDK, then cookie proxy
    if (!forceRefresh && inMemoryCookieJwt) {
        return inMemoryCookieJwt;
    }
    try {
        const { authClient, authBaseUrl } = await initNeonAuth();
        const adminTok = await getInMemoryToken(authClient, authBaseUrl);
        if (adminTok) return adminTok;
    } catch (_) {
        // Fall through to cookie-backed session token
    }
    const cookieRes = await getCookieSessionToken().catch(() => ({ token: null }));
    return cookieRes.token;
}

/**
 * Shared authenticated fetch wrapper that obtains an in-memory Neon Auth JWT
 * and attaches `Authorization: Bearer <token>` while preserving caller headers/body.
 */
export async function authFetch(urlOrPath, options = {}) {
    const { authMode = 'auto', headers: rawHeaders = {}, credentials, ...restOptions } = options || {};
    const targetUrl = resolveApiUrl(urlOrPath);

    let token = await resolveBearerTokenForMode(authMode, false);
    const buildHeaders = (tok) => {
        const merged = new Headers(rawHeaders);
        if (tok) {
            merged.set('Authorization', `Bearer ${tok}`);
        }
        return merged;
    };

    let response = await fetch(targetUrl, {
        ...restOptions,
        headers: buildHeaders(token),
        credentials: credentials || 'include'
    });

    if (response.status === 401) {
        const refreshed = await resolveBearerTokenForMode(authMode, true);
        if (refreshed && refreshed !== token) {
            response = await fetch(targetUrl, {
                ...restOptions,
                headers: buildHeaders(refreshed),
                credentials: credentials || 'include'
            });
        }
    }

    return response;
}

/**
 * Downloads a protected binary report via authFetch, creates a temporary Blob URL,
 * triggers browser download with the resolved filename, and revokes the URL afterwards.
 */
export async function downloadAuthenticatedFile(urlOrPath, fallbackFilename = 'download.xlsx', options = {}) {
    const resp = await authFetch(urlOrPath, {
        method: 'GET',
        authMode: options.authMode || 'cookie'
    });
    if (!resp.ok) {
        let errMessage = `Download failed (HTTP ${resp.status})`;
        try {
            const errJson = await resp.json();
            if (errJson && errJson.error) errMessage = errJson.error;
        } catch (_) {}
        throw new Error(errMessage);
    }

    const blob = await resp.blob();
    const disposition = resp.headers.get('content-disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
    const filename = (match && match[1]) ? decodeURIComponent(match[1].trim()) : fallbackFilename;

    const blobUrl = window.URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
    } finally {
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500);
    }
    return filename;
}

/**
 * Signs out of Neon Auth and clears local UI sessionStorage markers.
 */
export async function signOutNeonAuth() {
    inMemoryCookieJwt = null;
    try {
        const { authClient } = await initNeonAuth();
        await authClient.signOut();
    } catch (_) {
        // Ignore network failures during sign-out cleanup
    } finally {
        sessionStorage.clear();
    }
}
