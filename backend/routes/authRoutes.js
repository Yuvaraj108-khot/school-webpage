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
    return (
        process.env.NEON_AUTH_BASE_URL ||
        process.env.NEON_AUTH_DEV_BASE_URL ||
        'https://ep-ancient-term-beaimd3l.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth'
    ).trim().replace(/\/+$/, '');
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

        // Demo teacher login (teacher / pass, also allowing common typo teacer)
        if ((userLower === 'teacher' || userLower === 'teacer') && password === 'pass') {
            const teacherToken = sealValue('teacher:11111111-1111-4111-8111-111111111111:' + Date.now());
            setNeonSessionCookie(req, res, 'teacher:' + teacherToken);
            return res.json({
                success: true,
                role: 'teacher',
                staff_id: 'teacher',
                name: 'Demo Teacher',
                teacher_name: 'Demo Teacher',
                token: teacherToken
            });
        }

        // Demo student login (student / pass, also allowing studen)
        if ((userLower === 'student' || userLower === 'studen') && password === 'pass') {
            const studentToken = sealValue('student:22222222-2222-4222-8222-222222222222:' + Date.now());
            setNeonSessionCookie(req, res, 'student:' + studentToken);
            return res.json({
                success: true,
                role: 'student',
                student_code: 'student',
                name: 'Demo Student',
                student_name: 'Demo Student',
                student_class: '10',
                student_medium: 'English',
                token: studentToken
            });
        }

        // 2. Teacher or Student login lookup (run concurrently to avoid sequential cross-region roundtrips)
        const [teacher, student] = await Promise.all([
            prisma.teacher.findFirst({
                where: {
                    is_active: true,
                    OR: [
                        { staff_id: { equals: trimmedUser, mode: 'insensitive' } },
                        { email: { equals: userLower, mode: 'insensitive' } }
                    ]
                }
            }),
            prisma.student.findFirst({
                where: {
                    is_active: true,
                    OR: [
                        { student_code: { equals: trimmedUser, mode: 'insensitive' } },
                        { email: { equals: userLower, mode: 'insensitive' } }
                    ]
                }
            })
        ]);

        if (teacher) {
            let authenticated = false;
            let sessionCookieHeader = null;

            // Check if teacher has direct password stored in DB
            if (teacher.password && verifyPassword(password, teacher.password)) {
                authenticated = true;
                const teacherAuthUserId = teacher.auth_user_id || '11111111-1111-4111-8111-111111111111';
                const teacherToken = sealValue('teacher:' + teacherAuthUserId + ':' + Date.now());
                sessionCookieHeader = 'teacher:' + teacherToken;
            } else if (teacher.auth_user_id && hasSessionCookieSecret()) {
                // Neon Managed Auth verification fallback
                const aligned = await resolveCanonicalNeonUser({
                    recordType: 'teacher',
                    recordId: teacher.id,
                    schoolEmail: teacher.email,
                    authUserId: teacher.auth_user_id
                });
                if (aligned.ok) {
                    const neonAuthRes = await authenticateWithNeon(aligned.canonicalEmail, password, aligned.authUserId, origin);
                    if (neonAuthRes.ok) {
                        authenticated = true;
                        sessionCookieHeader = neonAuthRes.cookieHeader;
                    }
                }
            }

            if (!authenticated) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }

            setNeonSessionCookie(req, res, sessionCookieHeader);
            return res.json({
                success: true,
                authProvider: 'neon',
                role: 'teacher',
                staff_id: teacher.staff_id || 'teacher',
                name: teacher.name,
                teacher_name: teacher.name,
                token: sessionCookieHeader.startsWith('teacher:') ? sessionCookieHeader.slice(8) : undefined
            });
        }

        if (student) {
            let authenticated = false;
            let sessionCookieHeader = null;

            // Check if student has direct password stored in DB
            if (student.password && verifyPassword(password, student.password)) {
                authenticated = true;
                const studentAuthUserId = student.auth_user_id || '22222222-2222-4222-8222-222222222222';
                const studentToken = sealValue('student:' + studentAuthUserId + ':' + Date.now());
                sessionCookieHeader = 'student:' + studentToken;
            } else if (student.auth_user_id && hasSessionCookieSecret()) {
                // Neon Managed Auth verification fallback
                const aligned = await resolveCanonicalNeonUser({
                    recordType: 'student',
                    recordId: student.id,
                    schoolEmail: student.email,
                    authUserId: student.auth_user_id
                });
                if (aligned.ok) {
                    const neonAuthRes = await authenticateWithNeon(aligned.canonicalEmail, password, aligned.authUserId, origin);
                    if (neonAuthRes.ok) {
                        authenticated = true;
                        sessionCookieHeader = neonAuthRes.cookieHeader;
                    }
                }
            }

            if (!authenticated) {
                return res.status(401).json({ error: 'Invalid ID or password.' });
            }

            setNeonSessionCookie(req, res, sessionCookieHeader);
            return res.json({
                success: true,
                authProvider: 'neon',
                role: 'student',
                student_code: student.student_code,
                name: student.name,
                student_name: student.name,
                student_class: student.class || '',
                student_medium: student.medium || '',
                token: sessionCookieHeader.startsWith('student:') ? sessionCookieHeader.slice(8) : undefined
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
        if (cookieHeader.startsWith('teacher:')) {
            const teacherToken = cookieHeader.slice(8);
            return res.json({ authenticated: true, token: teacherToken });
        }
        if (cookieHeader.startsWith('student:')) {
            const studentToken = cookieHeader.slice(8);
            return res.json({ authenticated: true, token: studentToken });
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

// Helper to send beautifully branded school verification email with automatic port fallback
async function sendSchoolVerificationEmail(targetEmail, otpCode) {
    const schoolEmail = (process.env.SCHOOL_EMAIL || 'srimadbhuvanendraeducationalin@gmail.com').trim();
    const schoolEmailPass = (process.env.SCHOOL_EMAIL_PASSWORD || 'mldx xrfw pwsi jjgh').replace(/\s+/g, '');
    if (!targetEmail || !schoolEmail || !schoolEmailPass) return false;

    const mailOptions = {
        from: `"Shri Basaveshwar English Medium School" <${schoolEmail}>`,
        to: targetEmail,
        subject: 'Password Reset Verification PIN - Shri Basaveshwar English Medium School',
        text: `Shri Basaveshwar English Medium School (SBEI)\n\nYour Password Reset Verification PIN is: ${otpCode}\n\nThis PIN is valid for 15 minutes. Enter it on the password reset page to choose a new password.\n\nIf you did not request this verification code, please ignore this email or contact school administration at ${schoolEmail}.`,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 580px; margin: 0 auto; padding: 0; border: 1px solid #dbe2ea; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
                <div style="background: linear-gradient(135deg, #0f3057 0%, #1a4f8b 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">Shri Basaveshwar English Medium School</h1>
                    <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9; color: #e2e8f0;">Srimad Bhuvanendra Educational Institutions (SBEI)</p>
                </div>
                <div style="padding: 32px 28px; color: #2d3748; line-height: 1.6;">
                    <h2 style="color: #0f3057; margin-top: 0; font-size: 18px; border-bottom: 2px solid #edf2f7; padding-bottom: 12px;">Password Reset Request</h2>
                    <p style="font-size: 15px; margin-bottom: 20px;">Dear Student / Staff Member,</p>
                    <p style="font-size: 15px; margin-bottom: 24px;">We received a request to reset the password for your account. Please use the following 6-digit Verification PIN to proceed:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <div style="display: inline-block; background: #f0f4f9; border: 2px dashed #0f3057; border-radius: 10px; padding: 16px 36px;">
                            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f3057; font-family: monospace;">${otpCode}</span>
                        </div>
                        <p style="color: #718096; font-size: 13px; margin-top: 10px;">Valid for 15 minutes</p>
                    </div>
                    
                    <div style="background-color: #f7fafc; border-left: 4px solid #0f3057; padding: 14px 18px; border-radius: 4px; margin: 24px 0;">
                        <p style="margin: 0; font-size: 13px; color: #4a5568;">
                            <strong>Important Security Notice:</strong> Never share this PIN with anyone. School staff will never ask for your verification code or password.
                        </p>
                    </div>
                    
                    <p style="font-size: 14px; color: #4a5568;">If you did not request this password reset, you can safely ignore this email. Your current password will remain unchanged.</p>
                </div>
                <div style="background-color: #edf2f7; padding: 18px 24px; text-align: center; font-size: 12px; color: #718096; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 4px;"><strong>Shri Basaveshwar English Medium School</strong></p>
                    <p style="margin: 0 0 6px;">Official Portal: <a href="https://school-webpage.yuvarajkhot2005.workers.dev" style="color: #0f3057; text-decoration: none; font-weight: 600;">school-webpage.yuvarajkhot2005.workers.dev</a></p>
                    <p style="margin: 0;">For assistance, contact: <a href="mailto:${schoolEmail}" style="color: #0f3057;">${schoolEmail}</a></p>
                </div>
            </div>
        `
    };

    // Try SMTPS (port 465)
    try {
        const t465 = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: schoolEmail, pass: schoolEmailPass },
            connectionTimeout: 8000,
            greetingTimeout: 8000
        });
        await t465.sendMail(mailOptions);
        console.log(`[EMAIL OTP] Delivered successfully to ${targetEmail} via port 465`);
        return true;
    } catch (err465) {
        console.warn(`[EMAIL OTP] Port 465 notice (${err465.message}). Retrying on port 587...`);
        try {
            const t587 = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: { user: schoolEmail, pass: schoolEmailPass },
                connectionTimeout: 8000,
                greetingTimeout: 8000
            });
            await t587.sendMail(mailOptions);
            console.log(`[EMAIL OTP] Delivered successfully to ${targetEmail} via port 587`);
            return true;
        } catch (err587) {
            console.error(`[EMAIL OTP] Delivery failed on both 465 and 587:`, err587.message);
            return false;
        }
    }
}

// Instant OTP verification and reset handler
router.post('/neon/request-reset-otp', otpRateLimiter, async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
            return res.status(400).json({ error: 'Student ID, Staff ID, or Email is required.' });
        }

        let resolvedEmail = null;
        try {
            resolvedEmail = await Promise.race([
                resolveNeonRecoveryEmail(identifier),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);
        } catch (_) {
            if (identifier.includes('@')) {
                resolvedEmail = identifier.trim().toLowerCase();
            }
        }

        const cleanIdent = identifier.trim().toLowerCase();
        const targetEmail = resolvedEmail || (identifier.includes('@') ? identifier.trim().toLowerCase() : null);

        if (!targetEmail) {
            return res.status(404).json({ error: 'No registered account found with that ID or email.' });
        }

        // Generate 6-digit OTP
        const otpCode = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 15 * 60 * 1000;
        localResetOtpStore.set(cleanIdent, { otp: otpCode, email: targetEmail, expiresAt });
        localResetOtpStore.set(targetEmail, { otp: otpCode, email: targetEmail, expiresAt });

        console.log('\n======================================================');
        console.log(`[PASSWORD RESET OTP] Target: ${identifier} -> ${targetEmail}`);
        console.log(`[PASSWORD RESET OTP] YOUR VERIFICATION CODE IS: ${otpCode}`);
        console.log('======================================================\n');

        // Send email in background (or awaited with timeout)
        sendSchoolVerificationEmail(targetEmail, otpCode).catch((err) => {
            console.error('[EMAIL OTP] Dispatch error:', err.message);
        });

        // Return immediately with success
        return res.json({
            success: true,
            message: 'A 6-digit verification code has been sent to your registered email address.'
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
        let stored = localResetOtpStore.get(cleanIdent);

        if (!stored) {
            for (const [key, val] of localResetOtpStore.entries()) {
                if (val && val.otp === cleanOtp && (key === cleanIdent || (val.email && val.email.toLowerCase() === cleanIdent))) {
                    stored = val;
                    break;
                }
            }
        }

        if (stored && stored.otp === cleanOtp && Date.now() < stored.expiresAt) {
            return res.json({ success: true, message: 'Verification code confirmed.' });
        }

        let resolvedEmail = null;
        try {
            resolvedEmail = await Promise.race([
                resolveNeonRecoveryEmail(identifier),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500))
            ]);
        } catch (_) {}
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
                }),
                signal: AbortSignal.timeout(3000)
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
        let stored = localResetOtpStore.get(cleanIdent);

        if (!stored) {
            for (const [key, val] of localResetOtpStore.entries()) {
                if (val && val.otp === cleanOtp && (key === cleanIdent || (val.email && val.email.toLowerCase() === cleanIdent))) {
                    stored = val;
                    break;
                }
            }
        }

        if (stored && stored.otp === cleanOtp) {
            const hashedPassword = hashPassword(password);
            // Update password in database with cryptographic hash
            const student = await prisma.student.findFirst({
                where: {
                    OR: [
                        { student_code: { equals: cleanIdent, mode: 'insensitive' } },
                        { email: { equals: cleanIdent, mode: 'insensitive' } },
                        ...(stored && stored.email ? [{ email: { equals: stored.email, mode: 'insensitive' } }] : [])
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
                        { email: { equals: cleanIdent, mode: 'insensitive' } },
                        ...(stored && stored.email ? [{ email: { equals: stored.email, mode: 'insensitive' } }] : [])
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

        let resolvedEmail = null;
        try {
            resolvedEmail = await Promise.race([
                resolveNeonRecoveryEmail(identifier),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500))
            ]);
        } catch (_) {}
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
                }),
                signal: AbortSignal.timeout(3000)
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

        // Demo Teacher instant session match
        if (user.id === '11111111-1111-4111-8111-111111111111' || roles.includes('teacher') && user.email === 'teacher@sbei.edu.in') {
            return res.json({
                authenticated: true,
                userId: user.id,
                role: 'teacher',
                linked: true,
                profile: {
                    id: 42,
                    staff_id: 'teacher',
                    name: 'Demo Teacher',
                    email: 'teacher@sbei.edu.in',
                    subject: 'Mathematics',
                    medium: 'English',
                    designation: 'Senior Teacher',
                    category: 'High School',
                    photo_url: null
                }
            });
        }

        // Demo Student instant session match
        if (user.id === '22222222-2222-4222-8222-222222222222' || roles.includes('student') && user.email === 'student@sbei.edu.in') {
            return res.json({
                authenticated: true,
                userId: user.id,
                role: 'student',
                linked: true,
                profile: {
                    id: 7,
                    student_code: 'student',
                    name: 'Demo Student',
                    email: 'student@sbei.edu.in',
                    class: '10',
                    medium: 'English',
                    roll_no: '1',
                    parent_name: 'Demo Parent',
                    photo_url: null
                }
            });
        }

        // 2. Check linked Teacher record on database
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
