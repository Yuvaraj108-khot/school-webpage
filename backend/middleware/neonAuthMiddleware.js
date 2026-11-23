const { createRemoteJWKSet, jwtVerify } = require('jose');

// Configure exclusively using NEON_AUTH_DEV_BASE_URL (never production)
const devAuthUrl = (process.env.NEON_AUTH_DEV_BASE_URL || '').trim();

let jwks = null;
let expectedOrigin = null;

if (devAuthUrl) {
    try {
        const parsed = new URL(devAuthUrl);
        expectedOrigin = parsed.origin;
        // Derive JWKS endpoint: <AUTH_BASE_URL>/.well-known/jwks.json
        const jwksUrl = new URL(`${devAuthUrl.replace(/\/+$/, '')}/.well-known/jwks.json`);
        // createRemoteJWKSet caches keys in memory and re-fetches only on unknown kid
        jwks = createRemoteJWKSet(jwksUrl, {
            timeoutDuration: 15000,
            cacheMaxAge: 3600000,
            cooldownDuration: 30000
        });
    } catch (err) {
        console.error('[NeonAuth Middleware] Initialization failed:', err.message);
    }
}

const PUBLIC_API_ROUTES = new Set([
    'GET /health',
    'GET /dev/neon-auth-config',
    'POST /auth/login',
    'POST /auth/logout',
    'POST /auth/neon/request-reset-otp',
    'POST /auth/neon/verify-reset-otp',
    'POST /auth/neon/reset-password',
    'GET /teachers',
    'GET /gallery',
    'GET /notices',
    'GET /events',
    'GET /alumni',
    'POST /alumni'
]);

// Authenticated exclusively inside the handler via encrypted HttpOnly session cookie (never public data)
const COOKIE_BOOTSTRAP_ROUTES = new Set([
    'GET /auth/session-token'
]);

// Retired legacy endpoints returning HTTP 410 Gone
const RETIRED_API_ROUTES = new Set([
    'POST /auth/send-otp',
    'POST /auth/verify-otp',
    'POST /auth/reset-password'
]);

function isExcludedFromBearerRequirement(req) {
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') return true;
    const normalizedPath = String(req.path || '/').replace(/\/+$/, '') || '/';
    const key = `${method} ${normalizedPath}`;
    return (
        PUBLIC_API_ROUTES.has(key) ||
        COOKIE_BOOTSTRAP_ROUTES.has(key) ||
        RETIRED_API_ROUTES.has(key)
    );
}

/**
 * Neon Auth JWT Verification Middleware.
 *
 * Supports:
 * - `log-only`: logs verification state and attaches `req.neonAuth` without blocking.
 * - `enforce` / `strict`: fails closed with HTTP 401/503 on non-public `/api` routes
 *   when a verified EdDSA bearer JWT is missing or invalid.
 * - Never prints raw JWT tokens, API keys, or secrets to logs.
 */
async function neonAuthMiddleware(req, res, next) {
    const auditMode = (process.env.NEON_AUTH_AUDIT_MODE || 'enforce').trim().toLowerCase();
    const isStrict = auditMode === 'enforce' || auditMode === 'strict';
    const authHeader = req.headers.authorization || '';

    // Initialize default safe audit state
    req.neonAuth = {
        verified: false,
        status: 'unauthenticated',
        userId: null,
        email: null,
        name: null,
        reason: null,
        auditMode
    };

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    // Direct support for encrypted HttpOnly admin session or sealed admin token
    try {
        const { unsealValue, getNeonSessionCookie } = require('../utils/neonSessionCookie');
        let unsealedAdmin = null;
        if (token) {
            unsealedAdmin = unsealValue(token);
        }
        if (!unsealedAdmin) {
            const rawCookieVal = getNeonSessionCookie(req);
            if (rawCookieVal && rawCookieVal.startsWith('admin:')) {
                unsealedAdmin = unsealValue(rawCookieVal.slice(6));
            }
        }
        if (unsealedAdmin && unsealedAdmin.startsWith('admin:89b8e50a-dce1-492f-902a-d5d9c771b55d')) {
            req.neonAuth = {
                verified: true,
                status: 'authenticated',
                userId: '89b8e50a-dce1-492f-902a-d5d9c771b55d',
                email: 'srimadbhuvanendraeducationalin@gmail.com',
                name: 'Super Admin',
                claims: {
                    iss: 'sbs-admin-local',
                    aud: 'sbs-admin-local',
                    sub: '89b8e50a-dce1-492f-902a-d5d9c771b55d'
                },
                auditMode
            };
            return next();
        }
    } catch (_) {}

    // If Authorization header is absent or not Bearer format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.neonAuth.reason = 'missing_token';
        if (req.path === '/dev/auth-audit' || req.originalUrl === '/api/dev/auth-audit') {
            console.log(`[NeonAuth Audit] ${req.method} ${req.originalUrl} | Status: unauthenticated (missing_token)`);
        }
        if (isStrict && !isExcludedFromBearerRequirement(req)) {
            return res.status(401).json({
                error: 'Authentication required. Valid Neon Auth bearer token missing or invalid.'
            });
        }
        return next();
    }

    if (!token) {
        req.neonAuth.reason = 'empty_token';
        if (isStrict && !isExcludedFromBearerRequirement(req)) {
            return res.status(401).json({
                error: 'Authentication required. Valid Neon Auth bearer token missing or invalid.'
            });
        }
        return next();
    }

    if (!jwks || !expectedOrigin) {
        req.neonAuth.reason = 'jwks_uninitialized';
        console.warn('[NeonAuth Middleware] NEON_AUTH_DEV_BASE_URL not configured or JWKS uninitialized');
        if (isStrict && !isExcludedFromBearerRequirement(req)) {
            return res.status(503).json({
                error: 'Authentication verification service temporarily unavailable. Please retry.'
            });
        }
        return next();
    }

    try {
        // Verify JWT signature using jose:
        // - Algorithm: EdDSA
        // - Issuer: origin of auth-dev Auth URL
        // - Audience: origin of auth-dev Auth URL
        // - Expiration validated automatically by jose
        const { payload } = await jwtVerify(token, jwks, {
            algorithms: ['EdDSA'],
            issuer: expectedOrigin,
            audience: expectedOrigin
        });

        // Valid JWT: attach safe user info to req.neonAuth
        // Note: req.neonAuth.status is resolved authoritatively per-route against neon_auth."user" + school tables.
        req.neonAuth = {
            verified: true,
            status: 'authenticated_unlinked',
            userId: payload.sub,
            email: payload.email || null,
            name: payload.name || null,
            claims: {
                iss: payload.iss,
                aud: payload.aud,
                exp: payload.exp,
                iat: payload.iat
            },
            auditMode
        };

        console.log(`[NeonAuth Audit] ${req.method} ${req.originalUrl} | Status: VERIFIED | User ID: ${payload.sub}`);
    } catch (err) {
        req.neonAuth = {
            verified: false,
            status: 'invalid_token',
            userId: null,
            email: null,
            name: null,
            reason: err.code || err.name || 'verification_failed',
            auditMode
        };

        console.log(`[NeonAuth Audit] ${req.method} ${req.originalUrl} | Status: INVALID (${req.neonAuth.reason})`);

        if (isStrict && !isExcludedFromBearerRequirement(req)) {
            if (req.neonAuth.reason === 'ERR_JWKS_TIMEOUT') {
                return res.status(503).json({
                    error: 'Temporary timeout fetching Neon Auth signing keys. Please retry.'
                });
            }
            return res.status(401).json({
                error: 'Authentication required. Valid Neon Auth bearer token missing or invalid.'
            });
        }
    }

    return next();
}

neonAuthMiddleware.PUBLIC_API_ROUTES = PUBLIC_API_ROUTES;
neonAuthMiddleware.COOKIE_BOOTSTRAP_ROUTES = COOKIE_BOOTSTRAP_ROUTES;
neonAuthMiddleware.RETIRED_API_ROUTES = RETIRED_API_ROUTES;
neonAuthMiddleware.isExcludedFromBearerRequirement = isExcludedFromBearerRequirement;
neonAuthMiddleware.isPublicApiRoute = isExcludedFromBearerRequirement;

module.exports = neonAuthMiddleware;
