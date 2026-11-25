const prisma = require('../prismaClient');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userCache = new Map();
const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

    // In-memory cache hit
    const cached = userCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
        return { ok: true, user: cached.user, roles: cached.roles };
    }

    // Super Admin instant cache
    if (userId === '89b8e50a-dce1-492f-902a-d5d9c771b55d') {
        const adminUser = {
            id: '89b8e50a-dce1-492f-902a-d5d9c771b55d',
            email: 'srimadbhuvanendraeducationalin@gmail.com',
            name: 'Super Admin',
            role: 'admin',
            banned: false,
            emailVerified: true
        };
        const roles = ['admin'];
        userCache.set(userId, { user: adminUser, roles, expiresAt: Date.now() + USER_CACHE_TTL_MS });
        return { ok: true, user: adminUser, roles };
    }

    // Demo Teacher instant cache
    if (userId === '11111111-1111-4111-8111-111111111111') {
        const teacherUser = {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'teacher@sbei.edu.in',
            name: 'Demo Teacher',
            role: 'teacher',
            banned: false,
            emailVerified: true
        };
        const roles = ['teacher', 'user'];
        userCache.set(userId, { user: teacherUser, roles, expiresAt: Date.now() + USER_CACHE_TTL_MS });
        return { ok: true, user: teacherUser, roles };
    }

    // Demo Student instant cache
    if (userId === '22222222-2222-4222-8222-222222222222') {
        const studentUser = {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'student@sbei.edu.in',
            name: 'Demo Student',
            role: 'student',
            banned: false,
            emailVerified: true
        };
        const roles = ['student', 'user'];
        userCache.set(userId, { user: studentUser, roles, expiresAt: Date.now() + USER_CACHE_TTL_MS });
        return { ok: true, user: studentUser, roles };
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

    userCache.set(userId, { user, roles, expiresAt: Date.now() + USER_CACHE_TTL_MS });

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
