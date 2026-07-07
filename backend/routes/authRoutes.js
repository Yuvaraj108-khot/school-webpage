const express = require('express');
const router = express.Router();
let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    console.warn("WARNING: nodemailer is not installed. Email features will run in mock mode.");
    nodemailer = {
        createTransport: () => ({
            sendMail: async () => {
                console.log("Mock email sent (nodemailer not installed)");
                return {};
            }
        })
    };
}
const path = require('path');
const prisma = require('../prismaClient');

// ── In-memory OTP store: { email -> { otp, expiry, studentKey, studentIndex } }
const otpStore = new Map();
const verifiedResetStore = new Map();

// ── Create reusable transporter using school Gmail ─────────────────────────
function createTransporter() {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        family: 4, // Force IPv4 to prevent Render ENETUNREACH errors
        auth: {
            user: process.env.SCHOOL_EMAIL,
            pass: process.env.SCHOOL_EMAIL_PASSWORD,
        },
        connectionTimeout: 5000,
        socketTimeout: 5000,
        greetingTimeout: 5000
    });
}

// ────────────────────────────────────────────────────────────────
// POST /api/auth/send-otp
// Body: { email: string }
// Checks if email exists in the database before sending an OTP.
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address.' });
    }

    const emailLower = email.toLowerCase().trim();

    let account;
    try {
        const student = await prisma.student.findFirst({
            where: { email: { equals: emailLower, mode: 'insensitive' } }
        });

        const teacher = student ? null : await prisma.teacher.findFirst({
            where: { email: { equals: emailLower, mode: 'insensitive' } }
        });

        account = student || teacher;
    } catch (err) {
        console.error('Email lookup error:', err);
        return res.status(500).json({ error: 'Failed to check email in database.' });
    }

    if (!account) {
        return res.status(404).json({ error: 'This email is not registered in the database.' });
    }

    const isConfigured = process.env.SCHOOL_EMAIL && 
                         process.env.SCHOOL_EMAIL.trim() !== '' &&
                         process.env.SCHOOL_EMAIL !== 'schoolemail@gmail.com' && 
                         process.env.SCHOOL_EMAIL_PASSWORD && 
                         process.env.SCHOOL_EMAIL_PASSWORD.trim() !== '' &&
                         process.env.SCHOOL_EMAIL_PASSWORD !== 'xxxx xxxx xxxx xxxx';

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = Date.now() + 60 * 1000; // 60 seconds

    // Store OTP
    otpStore.set(emailLower, { otp, expiry });

    if (!isConfigured) {
        console.log(`\n--------------------------------------------`);
        console.log(`📧 [DEMO MODE] OTP for ${email}: ${otp}`);
        console.log(`--------------------------------------------\n`);
        return res.json({ 
            success: true, 
            demoMode: true, 
            otp: otp,
            message: 'Demo mode: OTP printed to server terminal.' 
        });
    }

    const name = account.name || 'User';

    // Determine dynamic frontend URL from incoming request header, fallback to .env or localhost:8000
    let frontendUrl = req.headers.origin;
    if (!frontendUrl && req.headers.referer) {
        try {
            const refUrl = new URL(req.headers.referer);
            frontendUrl = refUrl.origin;
        } catch (e) {}
    }
    if (!frontendUrl) {
        frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
    }

    // Build email
    const schoolName = process.env.SCHOOL_NAME || 'SBS Karkala';
    const mailOptions = {
        from: `"${schoolName}" <${process.env.SCHOOL_EMAIL}>`,
        to: email,
        subject: `Your Password Reset Code — ${schoolName}`,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; background-color: #f4f7f6; padding: 30px 15px;">
                <div style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #eef2f5;">
                    
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #1a3a5c 0%, #2c4a6e 100%); padding: 30px 20px; text-align: center; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff;">${schoolName}</h1>
                        <p style="margin: 4px 0 0; font-size: 11px; color: #b0c4de; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Password Security Portal</p>
                    </div>

                    <!-- Body -->
                    <div style="padding: 35px 25px; color: #333333;">
                        <p style="font-size: 15px; line-height: 22px; margin: 0 0 16px;">Hello <strong style="color: #1a3a5c;">${name}</strong>,</p>
                        <p style="font-size: 14px; line-height: 20px; color: #555555; margin: 0 0 20px;">
                            We received a request to reset your student/parent portal password. Use the verification code below to complete your reset. This code will expire in <strong style="color: #e74c3c;">60 seconds</strong>.
                        </p>

                        <!-- OTP Box -->
                        <div style="background: #f0f4ff; border: 2px dashed #1a3a5c; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                            <p style="margin: 0 0 6px; font-size: 11px; color: #7f8c8d; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Verification Code</p>
                            <p style="margin: 0; font-size: 32px; font-weight: 800; color: #1a3a5c; letter-spacing: 8px;">${otp}</p>
                        </div>

                        <!-- Direct Link Button -->
                        <div style="text-align: center; margin: 28px 0 20px;">
                            <a href="${frontendUrl}/reset_password.html?email=${encodeURIComponent(email)}" target="_blank" style="background: linear-gradient(135deg, #1a3a5c 0%, #2c4a6e 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 13px; font-weight: 600; border-radius: 8px; display: inline-block; box-shadow: 0 4px 12px rgba(26, 58, 92, 0.2);">
                                Reset Password Directly
                            </a>
                        </div>

                        <p style="font-size: 12px; line-height: 18px; color: #7f8c8d; margin: 20px 0 0; border-top: 1px solid #eef2f5; padding-top: 15px; text-align: center;">
                            If you didn't request this change, you can safely ignore this email. Your password will remain unchanged.
                        </p>
                    </div>

                    <!-- Footer -->
                    <div style="background-color: #fafbfc; padding: 15px 20px; text-align: center; border-top: 1px solid #eef2f5;">
                        <p style="margin: 0; font-size: 10px; color: #95a5a6; line-height: 14px;">
                            This email was sent automatically by ${schoolName}. Please do not reply directly to this message.
                        </p>
                    </div>
                </div>
            </div>
        `
    };

    try {
        const transporter = createTransporter();
        // Fire and forget email sending to avoid blocking the UI due to Gmail SMTP latency
        transporter.sendMail(mailOptions).catch(err => {
            console.error('Background Email send error:', err.message);
        });
        
        res.json({ success: true, demoMode: false, message: 'OTP sent successfully.' });
    } catch (err) {
        console.error('Email setup error:', err.message);
        res.status(500).json({ error: 'Failed to initialize email sender.' });
    }
});

// ────────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { email: string, otp: string }
// Returns: { valid: true } or error
// ────────────────────────────────────────────────────────────────
router.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const record = otpStore.get(email.toLowerCase());

    if (!record) {
        return res.status(400).json({ error: 'No OTP requested for this email. Please request a new one.' });
    }

    if (Date.now() > record.expiry) {
        otpStore.delete(email.toLowerCase());
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (otp !== record.otp) {
        return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
    }

    // OTP matched. Clear it so it can't be reused, then allow one password reset.
    const emailLower = email.toLowerCase().trim();
    otpStore.delete(emailLower);
    verifiedResetStore.set(emailLower, Date.now() + 60 * 1000);
    res.json({ success: true, message: 'OTP verified.' });
});

// POST /api/auth/login
// Body: { username, password }
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username/ID and password are required.' });
    }

    const userLower = username.toLowerCase().trim();

    try {
        // 1. Admin login
        if (userLower === 'admin') {
            if (password === 'pass') {
                return res.json({
                    success: true,
                    role: 'admin',
                    staff_id: 'admin',
                    name: 'Super Admin'
                });
            } else {
                return res.status(400).json({ error: 'Incorrect Admin password.' });
            }
        }

        // 2. Teacher login
        // Check database by staff_id or email
        const teacher = await prisma.teacher.findFirst({
            where: {
                OR: [
                    { staff_id: { equals: username.trim(), mode: 'insensitive' } },
                    { email: { equals: userLower, mode: 'insensitive' } }
                ]
            }
        });

        if (teacher) {
            const correctPass = teacher.password || teacher.staff_id || 'pass';
            if (password === correctPass) {
                return res.json({
                    success: true,
                    role: 'teacher',
                    staff_id: teacher.staff_id || 'teacher',
                    name: teacher.name,
                    teacher_name: teacher.name
                });
            } else {
                return res.status(400).json({ error: 'Incorrect Teacher password.' });
            }
        }

        // 3. Student/Parent login
        // Check database by student_code or email
        const student = await prisma.student.findFirst({
            where: {
                OR: [
                    { student_code: { equals: username.trim(), mode: 'insensitive' } },
                    { email: { equals: userLower, mode: 'insensitive' } },
                    { name: { equals: username.trim(), mode: 'insensitive' } }
                ]
            }
        });

        if (student) {
            const correctPass = student.password || student.student_code || 'pass';
            if (password === correctPass) {
                return res.json({
                    success: true,
                    role: 'student',
                    student_code: student.student_code,
                    name: student.name,
                    student_name: student.name,
                    student_class: student.class || '',
                    student_medium: student.medium || ''
                });
            } else {
                return res.status(400).json({ error: 'Incorrect Student password.' });
            }
        }

        return res.status(404).json({ error: 'User ID / email not found in database.' });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal server error during login.' });
    }
});

// POST /api/auth/reset-password
// Body: { email: string, password: string }
router.post('/reset-password', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password || password.length < 6) {
        return res.status(400).json({ error: 'Email and a password of at least 6 characters are required.' });
    }

    try {
        const emailLower = email.toLowerCase().trim();
        const verifiedUntil = verifiedResetStore.get(emailLower);
        if (!verifiedUntil || Date.now() > verifiedUntil) {
            verifiedResetStore.delete(emailLower);
            return res.status(403).json({ error: 'Please verify the OTP before resetting your password.' });
        }

        let updated = false;

        // Try updating student
        const student = await prisma.student.findFirst({
            where: { email: { equals: emailLower, mode: 'insensitive' } }
        });
        if (student) {
            await prisma.student.update({
                where: { id: student.id },
                data: { password: password }
            });
            updated = true;
        }

        // Try updating teacher
        const teacher = await prisma.teacher.findFirst({
            where: { email: { equals: emailLower, mode: 'insensitive' } }
        });
        if (teacher) {
            await prisma.teacher.update({
                where: { id: teacher.id },
                data: { password: password }
            });
            updated = true;
        }

        if (!updated) {
            return res.status(404).json({ error: 'No student or teacher found with this email address.' });
        }

        verifiedResetStore.delete(emailLower);
        res.json({ success: true, message: 'Password reset successfully in database.' });
    } catch (err) {
        console.error('Password reset error:', err);
        res.status(500).json({ error: 'Failed to reset password in database.' });
    }
});

module.exports = router;
