const prisma = require('../prismaClient');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTransientDbConnectionError(err) {
    const code = err && err.code;
    const msg = (err && err.message) || '';
    return code === 'P1001' || code === 'P1017' || /Can't reach database server/i.test(msg);
}

/**
 * Verifies req.neonAuth (populated by neonAuthMiddleware) against neon_auth."user"
 * on the active auth-dev database. Never trusts the JWT role claim alone.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ ok: true, user: object, roles: string[] } | { ok: false, status: number, error: string }>}
 */
async function resolveVerifiedNeonUser(req) {
    if (!req.neonAuth || !req.neonAuth.verified || !req.neonAuth.userId) {
        if (req.neonAuth && req.neonAuth.reason === 'ERR_JWKS_TIMEOUT') {
            return {
                ok: false,
                status: 503,
                error: 'Temporary timeout fetching Neon Auth signing keys. Please retry.'
            };
        }
        return {
            ok: false,
            status: 401,
            error: 'Authentication required. Valid Neon Auth bearer token missing or invalid.'
        };
    }

    const userId = String(req.neonAuth.userId).trim();
    if (!UUID_REGEX.test(userId)) {
        return {
            ok: false,
            status: 401,
            error: 'Invalid authenticated user identifier.'
        };
    }

    const runLookup = () => prisma.$queryRaw`
        SELECT id, email, name, role, banned, "emailVerified"
        FROM neon_auth."user"
        WHERE id = ${userId}::uuid
        LIMIT 1
    `;

    let rows;
    try {
        rows = await runLookup();
    } catch (err) {
        if (!isTransientDbConnectionError(err)) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        rows = await runLookup();
    }

    const user = rows && rows[0];
    if (!user) {
        return {
            ok: false,
            status: 401,
            error: 'Authenticated user account not found.'
        };
    }

    if (user.banned === true) {
        return {
            ok: false,
            status: 403,
            error: 'Account is suspended.'
        };
    }

    const roles = String(user.role || '')
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);

    return { ok: true, user, roles };
}

/**
 * Targeted Express authorization middleware requiring an active, unbanned Neon Auth
 * administrator account (`role` containing `admin` in `neon_auth."user"`).
 */
async function requireNeonAdmin(req, res, next) {
    try {
        const resolved = await resolveVerifiedNeonUser(req);
        if (!resolved.ok) {
            return res.status(resolved.status).json({ error: resolved.error });
        }

        const { user, roles } = resolved;
        if (!roles.includes('admin')) {
            console.log(`[NeonAuth Admin] Denied non-admin user ${user.id} for ${req.method} ${req.originalUrl}`);
            return res.status(403).json({ error: 'Administrator privileges required.' });
        }

        req.neonAdmin = {
            userId: user.id,
            email: user.email,
            name: user.name || 'Administrator',
            roles
        };

        console.log(`[NeonAuth Admin] Authorized admin ${user.id} for ${req.method} ${req.originalUrl}`);
        return next();
    } catch (err) {
        console.error('[NeonAuth Admin] Verification error:', err.message);
        return res.status(500).json({ error: 'Failed to verify administrator permissions.' });
    }
}

requireNeonAdmin.resolveVerifiedNeonUser = resolveVerifiedNeonUser;

module.exports = requireNeonAdmin;
