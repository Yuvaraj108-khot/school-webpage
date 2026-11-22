const crypto = require('crypto');

const NEON_SESSION_COOKIE_NAME = 'sbs_neon_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

function hasSessionCookieSecret() {
    const raw = process.env.NEON_SESSION_COOKIE_SECRET;
    return typeof raw === 'string' && raw.trim().length > 0;
}

function getSealingKey() {
    const secret = (process.env.NEON_SESSION_COOKIE_SECRET || '').trim();
    if (!secret) {
        throw new Error('Missing required environment variable: NEON_SESSION_COOKIE_SECRET');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

function sealValue(plaintext) {
    const key = getSealingKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function unsealValue(sealed) {
    if (typeof sealed !== 'string') return null;
    const parts = sealed.split('.');
    if (parts.length !== 3) return null;
    try {
        const key = getSealingKey();
        const iv = Buffer.from(parts[0], 'base64url');
        const tag = Buffer.from(parts[1], 'base64url');
        const ciphertext = Buffer.from(parts[2], 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (_) {
        return null;
    }
}

/**
 * Parses the Cookie request header into a plain key -> value object.
 */
function parseCookies(req) {
    const header = (req && req.headers && req.headers.cookie) || '';
    const out = {};
    if (!header) return out;
    for (const pair of header.split(';')) {
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        const name = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        if (!name) continue;
        try {
            out[name] = decodeURIComponent(val);
        } catch (_) {
            out[name] = val;
        }
    }
    return out;
}

function isSecureRequest(req) {
    const forwardedProto = req && req.headers && req.headers['x-forwarded-proto'];
    return Boolean(
        (req && req.secure) ||
        forwardedProto === 'https' ||
        process.env.VERCEL ||
        process.env.NODE_ENV === 'production'
    );
}

/**
 * Stores the Neon Auth session Cookie header encrypted inside a first-party HttpOnly cookie.
 */
function setNeonSessionCookie(req, res, neonCookieHeader) {
    if (!neonCookieHeader || typeof res.cookie !== 'function') return;
    const sealed = sealValue(neonCookieHeader);
    res.cookie(NEON_SESSION_COOKIE_NAME, sealed, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureRequest(req),
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS * 1000
    });
}

/**
 * Clears the first-party encrypted Neon Auth HttpOnly session cookie.
 */
function clearNeonSessionCookie(req, res) {
    if (typeof res.clearCookie === 'function') {
        res.clearCookie(NEON_SESSION_COOKIE_NAME, {
            httpOnly: true,
            sameSite: 'lax',
            secure: isSecureRequest(req),
            path: '/'
        });
    }
}

/**
 * Retrieves and decrypts the stored Neon Auth Cookie header from req, or null if invalid/missing.
 */
function getNeonSessionCookie(req) {
    const cookies = parseCookies(req);
    const raw = cookies[NEON_SESSION_COOKIE_NAME];
    if (!raw) return null;
    return unsealValue(raw);
}

module.exports = {
    NEON_SESSION_COOKIE_NAME,
    hasSessionCookieSecret,
    parseCookies,
    setNeonSessionCookie,
    clearNeonSessionCookie,
    getNeonSessionCookie
};
