const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const requireNeonAdmin = require('../middleware/requireNeonAdmin');
const { loginRateLimiter, otpRateLimiter } = require('../middleware/rateLimiters');
const {
    NEON_SESSION_COOKIE_NAME,
    hasSessionCookieSecret,
    parseCookies,
    setNeonSessionCookie,
    clearNeonSessionCookie,
    getNeonSessionCookie
} = require('../utils/neonSessionCookie');
const { withDbRetry, normalizeEmail } = require('../utils/accountProvisioning');

function retireLegacyOtpHandler(req, res) {
    return res.status(410).json({
        error: 'Legacy SMTP OTP password recovery has been retired. Please use Neon Email OTP password recovery.'
    });
}

// Legacy SMTP OTP endpoints retired in Phase 5 Stage 6
router.post('/send-otp', otpRateLimiter, retireLegacyOtpHandler);
router.post('/verify-otp', otpRateLimiter, retireLegacyOtpHandler);

function getNeonAuthBaseUrl() {
    return (process.env.NEON_AUTH_DEV_BASE_URL || '').trim().replace(/\/+$/, '');
}

function resolveNeonOrigin(req) {
    if (req && req.headers && req.headers.origin) return req.headers.origin;
    if (req && req.headers && req.headers.referer) {
        try {
            return new URL(req.headers.referer).origin;
        } catch (_) {}
    }
    return process.env.FRONTEND_URL || 'http://localhost:8000';
}

function extractCookieHeader(resp) {
    const setCookies = typeof resp.headers.getSetCookie === 'function'
        ? resp.headers.getSetCookie()
        : [resp.headers.get('set-cookie')].filter(Boolean);
    return setCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

async function authenticateWithNeon(email, password, expectedAuthUserId, origin) {
    const baseUrl = getNeonAuthBaseUrl();
    if (!baseUrl) return { ok: false, error: 'Neon Auth URL is not configured.' };

    const signInResp = await fetch(`${baseUrl}/sign-in/email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: origin
        },
        body: JSON.stringify({ email, password })
    });

    if (!signInResp.ok) {
        return { ok: false };
    }

    const signInData = await signInResp.json().catch(() => null);
    const neonUser = signInData && signInData.user;
    if (!neonUser || neonUser.id !== expectedAuthUserId || neonUser.banned === true) {
        return { ok: false };
    }

    const cookieHeader = extractCookieHeader(signInResp);
    if (!cookieHeader) {
        return { ok: false };
    }

    // Verify forwarded Neon session cookie can mint an EdDSA JWT
    const tokenResp = await fetch(`${baseUrl}/token`, {
        headers: {
            Origin: origin,
            Cookie: cookieHeader
        }
    });
    if (!tokenResp.ok) {
        return { ok: false };
    }
    const tokenJson = await tokenResp.json().catch(() => null);
    if (!tokenJson || typeof tokenJson.token !== 'string' || tokenJson.token.split('.').length !== 3) {
        return { ok: false };
    }

    return { ok: true, cookieHeader };
}

/**
 * Resolves the canonical Neon Auth user using auth_user_id and verifies
 * case-insensitive alignment between the school record email and Neon Auth.
 * Logs only non-sensitive record identifiers on mismatch; never logs email/OTP.
 */
async function resolveCanonicalNeonUser({ recordType, recordId, schoolEmail, authUserId }) {
    if (!authUserId) {
        return { ok: false, reason: 'unlinked' };
    }

    const rows = await withDbRetry(() => prisma.$queryRaw`
        SELECT id, email, banned
        FROM neon_auth."user"
        WHERE id = ${authUserId}::uuid
        LIMIT 1
    `);
    const user = rows && rows[0];
    if (!user || user.banned === true || !user.email) {
        return { ok: false, reason: 'unavailable' };
    }

    const cleanSchoolEmail = normalizeEmail(schoolEmail);
    const canonicalEmail = normalizeEmail(user.email);
    if (!cleanSchoolEmail || !canonicalEmail || cleanSchoolEmail !== canonicalEmail) {
        console.warn(`[NeonAuth Alignment] Email mismatch blocked for ${recordType} id=${recordId} auth_user_id=${authUserId}`);
        return { ok: false, reason: 'email_mismatch' };
    }

    return { ok: true, canonicalEmail, authUserId: user.id };
}

/**
 * Resolves a recovery email strictly server-side from Student ID, Staff ID, or Email
 * for active, unbanned, email-aligned Neon-linked users. Never returns email to browsers.
 */
async function resolveNeonRecoveryEmail(identifier) {
    const clean = typeof identifier === 'string' ? identifier.trim() : '';
    if (!clean) return null;

    if (clean.includes('@')) {
        const lower = clean.toLowerCase();
        const rows = await withDbRetry(() => prisma.$queryRaw`
            SELECT id, email, banned
            FROM neon_auth."user"
            WHERE LOWER(email) = ${lower}
            LIMIT 1
        `);
        const user = rows && rows[0];
        if (!user || user.banned === true || !user.email) return null;

        const canonicalEmail = normalizeEmail(user.email);
        const linkedTeacher = await prisma.teacher.findFirst({
            where: { auth_user_id: user.id },
            select: { id: true, email: true, is_active: true }
        });
        if (linkedTeacher) {
            if (!linkedTeacher.is_active) return null;
            if (normalizeEmail(linkedTeacher.email) !== canonicalEmail) {
                console.warn(`[NeonAuth Alignment] Email mismatch blocked for teacher id=${linkedTeacher.id} auth_user_id=${user.id}`);
                return null;
            }
            return canonicalEmail;
        }

        const linkedStudent = await prisma.student.findFirst({
            where: { auth_user_id: user.id },
            select: { id: true, email: true, is_active: true }
        });
        if (linkedStudent) {
            if (!linkedStudent.is_active) return null;
            if (normalizeEmail(linkedStudent.email) !== canonicalEmail) {
                console.warn(`[NeonAuth Alignment] Email mismatch blocked for student id=${linkedStudent.id} auth_user_id=${user.id}`);
                return null;
            }
            return canonicalEmail;
        }

        return canonicalEmail;
    }

    const teacher = await prisma.teacher.findFirst({
        where: {
            staff_id: { equals: clean, mode: 'insensitive' },
            is_active: true,
            auth_user_id: { not: null }
        },
        select: { id: true, email: true, auth_user_id: true }
    });
    if (teacher && teacher.auth_user_id) {
        const aligned = await resolveCanonicalNeonUser({
            recordType: 'teacher',
            recordId: teacher.id,
            schoolEmail: teacher.email,
            authUserId: teacher.auth_user_id
        });
        return aligned.ok ? aligned.canonicalEmail : null;
    }

    const student = await prisma.student.findFirst({
        where: {
            student_code: { equals: clean, mode: 'insensitive' },
            is_active: true,
            auth_user_id: { not: null }
        },
        select: { id: true, email: true, auth_user_id: true }
    });
    if (student && student.auth_user_id) {
        const aligned = await resolveCanonicalNeonUser({
            recordType: 'student',
            recordId: student.id,
            schoolEmail: student.email,
            authUserId: student.auth_user_id
        });
        return aligned.ok ? aligned.canonicalEmail : null;
    }

    return null;
}

// POST /api/auth/login
// Body: { username, password }
router.post('/login', loginRateLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'ID and password are required.' });
    }

    const trimmedUser = String(username).trim();
    const userLower = trimmedUser.toLowerCase();
    const origin = resolveNeonOrigin(req);

    try {
        // 1. Legacy hardcoded Admin login disabled in Phase 4A
        if (userLower === 'admin') {
            return res.status(403).json({
                error: 'Hardcoded admin login is disabled. Please sign in with your Neon Auth administrator email.'
            });
        }

        // 2. Teacher login (Staff ID or Email)
        const teacher = await prisma.teacher.findFirst({
            where: {
                is_active: true,
                OR: [
                    { staff_id: { equals: trimmedUser, mode: 'insensitive' } },
                    { email: { equals: userLower, mode: 'insensitive' } }
                ]
            }
        });

        if (teacher) {
            if (!teacher.auth_user_id) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }
            if (!hasSessionCookieSecret()) {
                console.error('[NeonSessionCookie] Missing required environment variable: NEON_SESSION_COOKIE_SECRET');
                return res.status(503).json({
                    error: 'Server session configuration incomplete: NEON_SESSION_COOKIE_SECRET must be configured.'
                });
            }
            const aligned = await resolveCanonicalNeonUser({
                recordType: 'teacher',
                recordId: teacher.id,
                schoolEmail: teacher.email,
                authUserId: teacher.auth_user_id
            });
            if (!aligned.ok) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }
            const neonAuthRes = await authenticateWithNeon(aligned.canonicalEmail, password, aligned.authUserId, origin);
            if (!neonAuthRes.ok) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }
            setNeonSessionCookie(req, res, neonAuthRes.cookieHeader);
            return res.json({
                success: true,
                authProvider: 'neon',
                role: 'teacher',
                staff_id: teacher.staff_id || 'teacher',
                name: teacher.name,
                teacher_name: teacher.name
            });
        }

        // 3. Student/Parent login (Student ID or Email linked to Neon Managed Auth)
        const student = await prisma.student.findFirst({
            where: {
                is_active: true,
                OR: [
                    { student_code: { equals: trimmedUser, mode: 'insensitive' } },
                    { email: { equals: userLower, mode: 'insensitive' } }
                ]
            }
        });

        if (student) {
            if (!student.auth_user_id) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }
            if (!hasSessionCookieSecret()) {
                console.error('[NeonSessionCookie] Missing required environment variable: NEON_SESSION_COOKIE_SECRET');
                return res.status(503).json({
                    error: 'Server session configuration incomplete: NEON_SESSION_COOKIE_SECRET must be configured.'
                });
            }
            const aligned = await resolveCanonicalNeonUser({
                recordType: 'student',
                recordId: student.id,
                schoolEmail: student.email,
                authUserId: student.auth_user_id
            });
            if (!aligned.ok) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }
            const neonAuthRes = await authenticateWithNeon(aligned.canonicalEmail, password, aligned.authUserId, origin);
            if (!neonAuthRes.ok) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }
            setNeonSessionCookie(req, res, neonAuthRes.cookieHeader);
            return res.json({
                success: true,
                authProvider: 'neon',
                role: 'student',
                student_code: student.student_code,
                name: student.name,
                student_name: student.name,
                student_class: student.class || '',
                student_medium: student.medium || ''
            });
        }

        return res.status(401).json({ error: 'Invalid ID or password.' });
    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({ error: 'Internal server error during login.' });
    }
});

// Exchanges first-party encrypted HttpOnly Neon cookie for an in-memory EdDSA JWT
router.get('/session-token', async (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache'
    });
    try {
        if (!hasSessionCookieSecret()) {
            console.error('[NeonSessionCookie] Missing required environment variable: NEON_SESSION_COOKIE_SECRET');
            return res.status(503).json({
                error: 'Server session configuration incomplete: NEON_SESSION_COOKIE_SECRET must be configured.'
            });
        }
        const rawCookies = parseCookies(req);
        const cookieHeader = getNeonSessionCookie(req);
        if (!cookieHeader) {
            if (rawCookies[NEON_SESSION_COOKIE_NAME]) {
                clearNeonSessionCookie(req, res);
            }
            return res.status(401).json({ error: 'No active session.' });
        }
        const baseUrl = getNeonAuthBaseUrl();
        if (!baseUrl) {
            return res.status(503).json({ error: 'Neon Auth configuration unavailable.' });
        }
        const origin = resolveNeonOrigin(req);
        const tokenResp = await fetch(`${baseUrl}/token`, {
            headers: { Origin: origin, Cookie: cookieHeader }
        });
        if (!tokenResp.ok) {
            clearNeonSessionCookie(req, res);
            return res.status(401).json({ error: 'Session expired or revoked.' });
        }
        const data = await tokenResp.json().catch(() => null);
        if (!data || !data.token) {
            clearNeonSessionCookie(req, res);
            return res.status(401).json({ error: 'Session expired or revoked.' });
        }
        return res.json({ authenticated: true, token: data.token });
    } catch (err) {
        console.error('[Auth /session-token] Error:', err.message);
        return res.status(500).json({ error: 'Failed to retrieve session token.' });
    }
});

// Revokes backend-proxied Neon Auth session and clears HttpOnly cookie
router.post('/logout', async (req, res) => {
    try {
        const cookieHeader = getNeonSessionCookie(req);
        const baseUrl = getNeonAuthBaseUrl();
        const origin = resolveNeonOrigin(req);
        if (cookieHeader && baseUrl) {
            await fetch(`${baseUrl}/sign-out`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: origin,
                    Cookie: cookieHeader
                },
                body: '{}'
            }).catch(() => {});
        }
    } finally {
        clearNeonSessionCookie(req, res);
    }
    res.json({ success: true });
});

// Neon Email OTP proxy for Student ID / Staff ID first-time password setup & recovery
// Never exposes resolved email addresses to unauthenticated callers.
router.post('/neon/request-reset-otp', otpRateLimiter, async (req, res) => {
    const genericMsg = 'If an active Neon Auth account exists for this ID or email, a 6-digit verification code has been sent to the registered email address.';
    try {
        const { identifier } = req.body;
        if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
            return res.status(400).json({ error: 'Student ID, Staff ID, or Email is required.' });
        }

        const resolvedEmail = await resolveNeonRecoveryEmail(identifier);
        const baseUrl = getNeonAuthBaseUrl();
        const origin = resolveNeonOrigin(req);

        if (resolvedEmail && baseUrl) {
            try {
                const upstreamResp = await fetch(`${baseUrl}/forget-password/email-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Origin: origin },
                    body: JSON.stringify({ email: resolvedEmail })
                });
                if (upstreamResp.status === 429) {
                    console.warn('[NeonOTP Request] Upstream Neon Auth rate-limited OTP request (HTTP 429).');
                } else if (upstreamResp.status >= 500) {
                    console.error(`[NeonOTP Request] Upstream Neon Auth server error (HTTP ${upstreamResp.status}).`);
                } else if (!upstreamResp.ok) {
                    console.warn(`[NeonOTP Request] Upstream Neon Auth returned non-OK status (HTTP ${upstreamResp.status}).`);
                }
            } catch (upstreamErr) {
                console.error('[NeonOTP Request] Upstream fetch failed:', upstreamErr.message);
            }
        }

        return res.json({ success: true, message: genericMsg });
    } catch (err) {
        console.error('[NeonOTP Request] Error:', err.message);
        return res.status(500).json({ error: 'Unable to process verification request.' });
    }
});

router.post('/neon/verify-reset-otp', otpRateLimiter, async (req, res) => {
    try {
        const { identifier, otp } = req.body;
        if (!identifier || !otp || !/^\d{6}$/.test(String(otp).trim())) {
            return res.status(400).json({ error: 'Identifier and 6-digit OTP code are required.' });
        }

        const resolvedEmail = await resolveNeonRecoveryEmail(identifier);
        const baseUrl = getNeonAuthBaseUrl();
        const origin = resolveNeonOrigin(req);
        if (!resolvedEmail || !baseUrl) {
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        const resp = await fetch(`${baseUrl}/email-otp/check-verification-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify({
                email: resolvedEmail,
                otp: String(otp).trim(),
                type: 'forget-password'
            })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.success === false) {
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        return res.json({ success: true, message: 'Verification code confirmed.' });
    } catch (err) {
        console.error('[NeonOTP Verify] Error:', err.message);
        return res.status(500).json({ error: 'Failed to verify OTP code.' });
    }
});

router.post('/neon/reset-password', otpRateLimiter, async (req, res) => {
    try {
        const { identifier, otp, password } = req.body;
        if (!identifier || !otp || !/^\d{6}$/.test(String(otp).trim())) {
            return res.status(400).json({ error: 'Identifier and 6-digit OTP code are required.' });
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }

        const resolvedEmail = await resolveNeonRecoveryEmail(identifier);
        const baseUrl = getNeonAuthBaseUrl();
        const origin = resolveNeonOrigin(req);
        if (!resolvedEmail || !baseUrl) {
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        const resp = await fetch(`${baseUrl}/email-otp/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify({
                email: resolvedEmail,
                otp: String(otp).trim(),
                password
            })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.error) {
            return res.status(400).json({ error: data.message || 'Invalid or expired verification code.' });
        }

        return res.json({
            success: true,
            message: 'Password updated successfully. You can now log in with your Student ID / Staff ID and new password.'
        });
    } catch (err) {
        console.error('[NeonOTP Reset] Error:', err.message);
        return res.status(500).json({ error: 'Failed to update password.' });
    }
});

// Legacy SMTP password reset retired in Phase 5 Stage 6
router.post('/reset-password', otpRateLimiter, retireLegacyOtpHandler);

// ────────────────────────────────────────────────────────────────
// GET /api/auth/me (Phase 4A)
// Requires a valid Neon Auth JWT; resolves user role strictly on the server.
// Never trusts JWT role claim alone; never returns password fields.
// ────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
    try {
        const resolved = await requireNeonAdmin.resolveVerifiedNeonUser(req);
        if (!resolved.ok) {
            return res.status(resolved.status).json({ error: resolved.error });
        }

        const { user, roles } = resolved;

        // 1. Check Admin role strictly from neon_auth."user"
        if (roles.includes('admin')) {
            return res.json({
                authenticated: true,
                userId: user.id,
                role: 'admin',
                linked: true,
                profile: {
                    name: user.name || 'Administrator',
                    email: user.email,
                    emailVerified: Boolean(user.emailVerified)
                }
            });
        }

        // 2. Check linked Teacher record on auth-dev
        const teacher = await prisma.teacher.findFirst({
            where: { auth_user_id: user.id, is_active: true },
            select: {
                id: true,
                staff_id: true,
                name: true,
                email: true,
                subject: true,
                medium: true,
                designation: true,
                category: true,
                photo_url: true
            }
        });

        if (teacher) {
            return res.json({
                authenticated: true,
                userId: user.id,
                role: 'teacher',
                linked: true,
                profile: teacher
            });
        }

        // 3. Check linked Student record on auth-dev
        const student = await prisma.student.findFirst({
            where: { auth_user_id: user.id, is_active: true },
            select: {
                id: true,
                student_code: true,
                name: true,
                email: true,
                class: true,
                medium: true,
                roll_no: true,
                parent_name: true,
                photo_url: true
            }
        });

        if (student) {
            return res.json({
                authenticated: true,
                userId: user.id,
                role: 'student',
                linked: true,
                profile: student
            });
        }

        // 4. Authenticated Neon Auth user not yet linked to a school record
        return res.json({
            authenticated: true,
            userId: user.id,
            role: 'unlinked',
            linked: false,
            profile: {
                name: user.name || null,
                email: user.email || null,
                emailVerified: Boolean(user.emailVerified)
            }
        });
    } catch (err) {
        console.error('[Auth /me] Resolution error:', err.message);
        return res.status(500).json({ error: 'Failed to resolve authenticated user profile.' });
    }
});

module.exports = router;
