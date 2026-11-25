const prisma = require('../prismaClient');
const neonAuthMiddleware = require('./neonAuthMiddleware');
const requireNeonAdmin = require('./requireNeonAdmin');
const { omitPassword, normalizeEmail } = require('../utils/accountProvisioning');

const profileCache = new Map();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function invalidateProfileCache(userId) {
    if (userId) {
        profileCache.delete(userId);
    } else {
        profileCache.clear();
    }
}

/**
 * Resolves and enforces verified Neon Auth JWT + active/unbanned Neon user +
 * email-aligned active school profile (Admin, Teacher, or Student).
 * Never trusts browser-supplied role, student_code, or teacher identity claims.
 */
async function requireAuth(req, res, next) {
    try {
        if (!req.neonAuth) {
            await new Promise((resolve) => neonAuthMiddleware(req, res, resolve));
        }

        const resolved = await requireNeonAdmin.resolveVerifiedNeonUser(req);
        if (!resolved.ok) {
            return res.status(resolved.status).json({ error: resolved.error });
        }

        const { user, roles } = resolved;
        const canonicalEmail = normalizeEmail(user.email);

        // Check in-memory profile cache to avoid redundant cross-region DB lookups on every request
        const cachedProfile = profileCache.get(user.id);
        if (cachedProfile && Date.now() < cachedProfile.expiresAt) {
            req.auth = cachedProfile.auth;
            if (cachedProfile.neonAdmin) {
                req.neonAdmin = cachedProfile.neonAdmin;
            }
            return next();
        }

        // 1. Admin role strictly resolved from neon_auth."user"
        if (roles.includes('admin')) {
            const neonAdmin = {
                userId: user.id,
                email: canonicalEmail,
                name: user.name || 'Administrator',
                roles
            };
            const auth = {
                authenticated: true,
                userId: user.id,
                email: canonicalEmail,
                name: user.name || 'Administrator',
                role: 'admin',
                roles,
                profile: {
                    name: user.name || 'Administrator',
                    email: canonicalEmail,
                    emailVerified: Boolean(user.emailVerified)
                },
                teacher: null,
                student: null
            };
            req.neonAdmin = neonAdmin;
            req.auth = auth;
            profileCache.set(user.id, { auth, neonAdmin, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
            return next();
        }

        // 2. Teacher record linked by auth_user_id
        const teacher = await prisma.teacher.findFirst({
            where: { auth_user_id: user.id }
        });
        if (teacher) {
            if (!teacher.is_active) {
                return res.status(403).json({ error: 'Teacher account is inactive.' });
            }
            const teacherEmail = normalizeEmail(teacher.email);
            if (!teacherEmail || !canonicalEmail || teacherEmail !== canonicalEmail) {
                console.warn(`[Authorize] Email mismatch blocked for teacher id=${teacher.id} auth_user_id=${user.id}`);
                return res.status(403).json({ error: 'Account email alignment verification failed.' });
            }

            const safeTeacher = omitPassword(teacher);
            const auth = {
                authenticated: true,
                userId: user.id,
                email: canonicalEmail,
                name: safeTeacher.name,
                role: 'teacher',
                roles,
                profile: safeTeacher,
                teacher: safeTeacher,
                student: null
            };
            req.auth = auth;
            profileCache.set(user.id, { auth, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
            return next();
        }

        // 3. Student record linked by auth_user_id
        const student = await prisma.student.findFirst({
            where: { auth_user_id: user.id }
        });
        if (student) {
            if (!student.is_active) {
                return res.status(403).json({ error: 'Student account is inactive.' });
            }
            const studentEmail = normalizeEmail(student.email);
            if (!studentEmail || !canonicalEmail || studentEmail !== canonicalEmail) {
                console.warn(`[Authorize] Email mismatch blocked for student id=${student.id} auth_user_id=${user.id}`);
                return res.status(403).json({ error: 'Account email alignment verification failed.' });
            }

            const safeStudent = omitPassword(student);
            const auth = {
                authenticated: true,
                userId: user.id,
                email: canonicalEmail,
                name: safeStudent.name,
                role: 'student',
                roles,
                profile: safeStudent,
                teacher: null,
                student: safeStudent
            };
            req.auth = auth;
            profileCache.set(user.id, { auth, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
            return next();
        }

        // 4. Unlinked authenticated Neon Auth user cannot access school resources
        return res.status(403).json({
            error: 'Authenticated account is not linked to an active school profile.'
        });
    } catch (err) {
        console.error('[Authorize] Authentication check failed:', err.message);
        return res.status(500).json({ error: 'Failed to verify authentication.' });
    }
}

/**
 * Role-based authorization middleware executed after requireAuth.
 */
function requireRole(...allowedRoles) {
    const allowed = allowedRoles
        .flat()
        .map((r) => String(r || '').trim().toLowerCase())
        .filter(Boolean);

    return (req, res, next) => {
        if (!req.auth || !req.auth.authenticated) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const currentRole = String(req.auth.role || '').toLowerCase();
        if (!allowed.includes(currentRole)) {
            return res.status(403).json({ error: 'Insufficient permissions for this resource.' });
        }

        return next();
    };
}

/**
 * Ownership guard for student-scoped endpoints.
 * Permits admin (and teacher unless allowTeacher=false).
 * For student accounts, verifies requested student_code matches req.auth.student.student_code.
 */
function requireStudentOwnerOrStaff(options = {}) {
    const config = typeof options === 'string' ? { paramName: options } : (options || {});
    const {
        paramName = 'code',
        bodyField = null,
        queryField = null,
        allowTeacher = true
    } = config;

    return (req, res, next) => {
        if (!req.auth || !req.auth.authenticated) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const role = String(req.auth.role || '').toLowerCase();
        if (role === 'admin' || (role === 'teacher' && allowTeacher)) {
            return next();
        }

        if (role === 'student') {
            const authCode = req.auth.student && req.auth.student.student_code
                ? String(req.auth.student.student_code).trim().toLowerCase()
                : '';

            let requested = '';
            if (paramName && req.params && req.params[paramName] !== undefined) {
                requested = String(req.params[paramName]).trim().toLowerCase();
            } else if (bodyField && req.body && req.body[bodyField] !== undefined) {
                requested = String(req.body[bodyField]).trim().toLowerCase();
            } else if (queryField && req.query && req.query[queryField] !== undefined) {
                requested = String(req.query[queryField]).trim().toLowerCase();
            }

            if (!authCode || !requested || authCode !== requested) {
                return res.status(403).json({
                    error: 'Access denied: Students may only access their own records.'
                });
            }

            req.authorizedStudentCode = req.auth.student.student_code;
            return next();
        }

        return res.status(403).json({ error: 'Insufficient permissions for this student record.' });
    };
}

module.exports = {
    requireAuth,
    requireRole,
    requireStudentOwnerOrStaff
};
