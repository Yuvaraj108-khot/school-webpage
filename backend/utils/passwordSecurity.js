const crypto = require('crypto');

/**
 * Secure password hashing using Node.js crypto.scrypt with individual cryptographic salts.
 */
function hashPassword(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password.normalize('NFKC'), salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Secure, timing-safe password verification supporting scrypt hashed passwords
 * with graceful legacy fallback.
 */
function verifyPassword(password, storedHash) {
    if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
        return false;
    }

    // Modern scrypt format: <salt_hex>:<hash_hex>
    const parts = storedHash.split(':');
    if (parts.length === 2 && parts[0].length === 32 && parts[1].length === 128) {
        const [salt, expectedHashHex] = parts;
        try {
            const actualBuffer = crypto.scryptSync(password.normalize('NFKC'), salt, 64);
            const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
            return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
        } catch (_) {
            return false;
        }
    }

    // Fallback: Constant-time comparison for legacy plaintext strings during migration
    try {
        const a = Buffer.from(password);
        const b = Buffer.from(storedHash);
        if (a.length !== b.length) {
            // Still perform comparison to prevent timing leak on length
            crypto.timingSafeEqual(a, a);
            return false;
        }
        return crypto.timingSafeEqual(a, b);
    } catch (_) {
        return false;
    }
}

/**
 * Checks if a stored password string is in modern scrypt hashed format.
 */
function isHashed(stored) {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split(':');
    return parts.length === 2 && parts[0].length === 32 && parts[1].length === 128;
}

module.exports = {
    hashPassword,
    verifyPassword,
    isHashed
};
