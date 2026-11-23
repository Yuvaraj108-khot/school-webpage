const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const prisma = require('../prismaClient');
const { hashPassword, verifyPassword } = require('../utils/passwordSecurity');
const requireNeonAdmin = require('../middleware/requireNeonAdmin');
const { loginRateLimiter, otpRateLimiter } = require('../middleware/rateLimiters');
const {
    NEON_SESSION_COOKIE_NAME,
    hasSessionCookieSecret,
    sealValue,
    unsealValue,
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

const localResetOtpStore = new Map(); // identifier -> { otp, email, expiresAt }

/**
 * Resolves a recovery email strictly server-side from Student ID, Staff ID, or Email.
 */
async function resolveNeonRecoveryEmail(identifier) {
    const clean = typeof identifier === 'string' ? identifier.trim() : '';
    if (!clean) return null;
    const lower = clean.toLowerCase();

    if (lower === 'admin' || lower === 'srimadbhuvanendraeducationalin@gmail.com') {
        return 'srimadbhuvanendraeducationalin@gmail.com';
    }

    if (clean.includes('@')) {
        return lower;
    }

    const teacher = await prisma.teacher.findFirst({
        where: { staff_id: { equals: clean, mode: 'insensitive' }, is_active: true },
        select: { email: true }
    });
    if (teacher && teacher.email) {
        return normalizeEmail(teacher.email);
    }

    const student = await prisma.student.findFirst({
        where: { student_code: { equals: clean, mode: 'insensitive' }, is_active: true },
        select: { email: true }
    });
    if (student && student.email) {
        return normalizeEmail(student.email);
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
        // 1. Admin login
        if (userLower === 'admin' || userLower === 'srimadbhuvanendraeducationalin@gmail.com') {
            const adminPass = process.env.ADMIN_PASSWORD || 'pass';
            if (password === adminPass) {
                const adminToken = sealValue('admin:89b8e50a-dce1-492f-902a-d5d9c771b55d:' + Date.now());
                setNeonSessionCookie(req, res, 'admin:' + adminToken);
                return res.json({
                    success: true,
                    role: 'admin',
                    staff_id: 'admin',
                    name: 'Super Admin',
                    token: adminToken
                });
            } else {
                return res.status(400).json({ error: 'Incorrect Admin password.' });
            }
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
        if (cookieHeader.startsWith('admin:')) {
            const adminToken = cookieHeader.slice(6);
            return res.json({ authenticated: true, token: adminToken });
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

// Instant OTP verification and reset handler
router.post('/neon/request-reset-otp', otpRateLimiter, async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
            return res.status(400).json({ error: 'Student ID, Staff ID, or Email is required.' });
        }

        const resolvedEmail = await resolveNeonRecoveryEmail(identifier);
        const cleanIdent = identifier.trim().toLowerCase();

        // Generate 6-digit OTP
        const otpCode = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 15 * 60 * 1000;
        localResetOtpStore.set(cleanIdent, { otp: otpCode, email: resolvedEmail, expiresAt });
        if (resolvedEmail) {
            localResetOtpStore.set(resolvedEmail.toLowerCase(), { otp: otpCode, email: resolvedEmail, expiresAt });
        }

        console.log('\n======================================================');
        console.log(`[PASSWORD RESET OTP] Target: ${identifier} (${resolvedEmail || 'local account'})`);
        console.log(`[PASSWORD RESET OTP] YOUR VERIFICATION CODE IS: ${otpCode}`);
        console.log('======================================================\n');

        // Send OTP directly via Nodemailer to registered email
        if (resolvedEmail && process.env.SCHOOL_EMAIL && process.env.SCHOOL_EMAIL_PASSWORD) {
            try {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.SCHOOL_EMAIL,
                        pass: process.env.SCHOOL_EMAIL_PASSWORD
                    }
                });
                await transporter.sendMail({
                    from: `"Srimad Bhuvanendra School" <${process.env.SCHOOL_EMAIL}>`,
                    to: resolvedEmail,
                    subject: 'Password Reset Verification Code',
                    text: `Your password reset verification code is: ${otpCode}. It will expire in 15 minutes.`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
                            <h2 style="color: #1a3a5c; margin-top: 0;">Password Reset Request</h2>
                            <p style="color: #444; font-size: 15px;">You requested to reset your password. Use the verification code below:</p>
                            <div style="text-align: center; margin: 24px 0;">
                                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a3a5c; background: #f0f4f8; padding: 12px 24px; border-radius: 6px; display: inline-block;">${otpCode}</span>
                            </div>
                            <p style="color: #777; font-size: 13px;">This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
                        </div>
                    `
                });
                console.log(`[EMAIL OTP] Successfully delivered verification code to ${resolvedEmail}`);
            } catch (mailErr) {
                console.error(`[EMAIL OTP ERROR] Could not deliver email to ${resolvedEmail}:`, mailErr.message);
            }
        }

        // Forward to upstream Neon Auth in background if configured
        const baseUrl = getNeonAuthBaseUrl();
        const origin = resolveNeonOrigin(req);
        if (resolvedEmail && baseUrl) {
            fetch(`${baseUrl}/forget-password/email-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: origin },
                body: JSON.stringify({ email: resolvedEmail })
            }).catch(() => {});
        }

        return res.json({
            success: true,
            message: 'A 6-digit verification code has been sent to your registered email.'
        });
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

        const cleanIdent = String(identifier).trim().toLowerCase();
        const cleanOtp = String(otp).trim();
        const stored = localResetOtpStore.get(cleanIdent);

        if (stored && stored.otp === cleanOtp && Date.now() < stored.expiresAt) {
            return res.json({ success: true, message: 'Verification code confirmed.' });
        }

        const resolvedEmail = await resolveNeonRecoveryEmail(identifier);
        const baseUrl = getNeonAuthBaseUrl();
        const origin = resolveNeonOrigin(req);
        if (resolvedEmail && baseUrl) {
            const resp = await fetch(`${baseUrl}/email-otp/check-verification-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: origin },
                body: JSON.stringify({
                    email: resolvedEmail,
                    otp: cleanOtp,
                    type: 'forget-password'
                })
            }).catch(() => null);
            if (resp && resp.ok) {
                return res.json({ success: true, message: 'Verification code confirmed.' });
            }
        }

        return res.status(400).json({ error: 'Invalid or expired verification code.' });
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

        const cleanIdent = String(identifier).trim().toLowerCase();
        const cleanOtp = String(otp).trim();
        const stored = localResetOtpStore.get(cleanIdent);

        if (stored && stored.otp === cleanOtp) {
            const hashedPassword = hashPassword(password);
            // Update password in database with cryptographic hash
            const student = await prisma.student.findFirst({
                where: {
                    OR: [
                        { student_code: { equals: cleanIdent, mode: 'insensitive' } },
                        { email: { equals: cleanIdent, mode: 'insensitive' } }
                    ]
                }
            });
            if (student) {
                await prisma.student.update({
                    where: { id: student.id },
                    data: { password: hashedPassword }
                });
            }

            const teacher = await prisma.teacher.findFirst({
                where: {
                    OR: [
                        { staff_id: { equals: cleanIdent, mode: 'insensitive' } },
                        { email: { equals: cleanIdent, mode: 'insensitive' } }
                    ]
                }
            });
            if (teacher) {
                await prisma.teacher.update({
                    where: { id: teacher.id },
                    data: { password: hashedPassword }
                });
            }

            localResetOtpStore.delete(cleanIdent);
            return res.json({
                success: true,
                message: 'Password updated successfully! You can now log in with your new password.'
            });
        }

        const resolvedEmail = await resolveNeonRecoveryEmail(identifier);
        const baseUrl = getNeonAuthBaseUrl();
        const origin = resolveNeonOrigin(req);
        if (resolvedEmail && baseUrl) {
            const resp = await fetch(`${baseUrl}/email-otp/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: origin },
                body: JSON.stringify({
                    email: resolvedEmail,
                    otp: cleanOtp,
                    password
                })
            }).catch(() => null);
            if (resp && resp.ok) {
                return res.json({
                    success: true,
                    message: 'Password updated successfully. You can now log in with your new password.'
                });
            }
        }

        return res.status(400).json({ error: 'Invalid or expired verification code.' });
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
