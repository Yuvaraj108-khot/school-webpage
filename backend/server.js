require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOriginPatterns = [
    /^http:\/\/localhost(:\d+)?$/i,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/i
];
const trustedOrigins = new Set();
const configuredFrontend = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
if (configuredFrontend) {
    trustedOrigins.add(configuredFrontend);
}
if (process.env.ALLOWED_ORIGINS) {
    for (const item of process.env.ALLOWED_ORIGINS.split(',')) {
        const normalized = item.trim().replace(/\/+$/, '');
        if (normalized) trustedOrigins.add(normalized);
    }
}

app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        const normalizedOrigin = origin.replace(/\/+$/, '');
        if (trustedOrigins.has(normalizedOrigin)) {
            return callback(null, true);
        }
        if (allowedOriginPatterns.some((re) => re.test(normalizedOrigin))) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true
}));
app.use(express.json());
app.use((req, res, next) => {
    const rawPathname = String(req.originalUrl || '/').split('?')[0];
    let decoded = rawPathname;
    try {
        decoded = decodeURIComponent(rawPathname);
    } catch (_) {
        return res.status(400).send('Bad request');
    }
    if (
        rawPathname.includes('..') ||
        decoded.includes('..') ||
        rawPathname.includes('\\') ||
        decoded.includes('\\') ||
        rawPathname.includes('\0') ||
        decoded.includes('\0')
    ) {
        return res.status(404).send('Not found');
    }
    return next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny',
    index: false,
    setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    }
}));

// Neon Auth Phase 3: JWT Verification Middleware (runs in log-only mode on /api routes)
const neonAuthMiddleware = require('./middleware/neonAuthMiddleware');
app.use('/api', neonAuthMiddleware);

// Serve ONLY curated public website pages, dashboard apps, and client assets (never backend/, logs, SQL, env, or test files)
const ROOT_DIR = path.join(__dirname, '../');
const ALLOWED_PUBLIC_FILES = new Set([
    'index.html',
    'about.html',
    'academics.html',
    'admission.html',
    'alumni.html',
    'contact.html',
    'gallery.html',
    'teachers.html',
    'login.html',
    'login_admin.html',
    'login_parent.html',
    'reset_password.html',
    'dashboard_admin.html',
    'dashboard_teacher.html',
    'dashboard_student.html',
    'style.css',
    'script.js',
    'neon-auth-client.js',
    'auth-dev-sdk.js'
]);

app.use('/images', express.static(path.join(ROOT_DIR, 'images'), {
    dotfiles: 'deny',
    index: false
}));
app.get('/', (req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));
app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/images')) {
        return next();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(404).end();
    }
    const cleanRel = req.path.replace(/^\/+/, '');
    if (ALLOWED_PUBLIC_FILES.has(cleanRel)) {
        return res.sendFile(path.join(ROOT_DIR, cleanRel));
    }
    return res.status(404).send('Not found');
});

// Routes Imports
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const marksRoutes = require('./routes/marksRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const alumniRoutes = require('./routes/alumniRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const exportRoutes = require('./routes/exportRoutes');
const authRoutes = require('./routes/authRoutes');

// New Relational Routes Imports
const mediumRoutes = require('./routes/mediumRoutes');
const classRoutes = require('./routes/classRoutes');
const examRoutes = require('./routes/examRoutes');
const subjectTeacherRoutes = require('./routes/subjectTeacherRoutes');

// Route Registrations
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/marks', marksRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/events', noticeRoutes);
app.use('/api/alumni', alumniRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/auth', authRoutes);

// New Relational Route Registrations
app.use('/api/mediums', mediumRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/subject-teachers', subjectTeacherRoutes);

const prisma = require('./prismaClient');

// Health Check & Neon Status
app.get('/api/health', async (req, res) => {
    try {
        const studentCount = await prisma.student.count();
        res.json({
            status: "ok",
            database: "Neon PostgreSQL",
            branch: process.env.NEON_BRANCH || "production",
            studentCount,
            services: {
                postgres: "connected",
                auth: process.env.NEON_AUTH_BASE_URL ? "configured" : "none",
                realtime: process.env.NEON_REALTIME_URL ? "configured" : "none"
            }
        });
    } catch (error) {
        console.error('[Health] Check error:', error.message);
        res.status(500).json({ status: "error", error: "Service health check failed." });
    }
});

const isProductionEnv = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

function blockDevDiagnosticsInProduction(req, res, next) {
    if (isProductionEnv) {
        return res.status(404).json({ error: 'Not found' });
    }
    return next();
}

// Temporary Phase 1 dev-only config endpoint for auth-dev-test.html (never exposes production Auth URL)
app.get('/api/dev/neon-auth-config', (req, res) => {
    const devAuthUrl = (process.env.NEON_AUTH_DEV_BASE_URL || '').trim();
    const prodAuthUrl = (process.env.NEON_AUTH_BASE_URL || '').trim();

    if (!devAuthUrl) {
        return res.status(503).json({
            error: 'NEON_AUTH_DEV_BASE_URL is not set in .env. Add the auth-dev branch Auth URL and restart the server.'
        });
    }

    if (prodAuthUrl && devAuthUrl === prodAuthUrl) {
        return res.status(400).json({
            error: 'NEON_AUTH_DEV_BASE_URL matches the production NEON_AUTH_BASE_URL. Use the auth-dev branch Auth URL instead.'
        });
    }

    res.json({
        branch: 'auth-dev',
        authBaseUrl: devAuthUrl
    });
});

// Phase 3/5 dev-only audit endpoint restricted to local dev + verified Neon Admin
const requireNeonAdmin = require('./middleware/requireNeonAdmin');
app.get('/api/dev/auth-audit', blockDevDiagnosticsInProduction, requireNeonAdmin, (req, res) => {
    const neonAuth = req.neonAuth || {
        verified: false,
        status: 'unauthenticated',
        reason: 'middleware_not_run'
    };

    res.json({
        auditMode: process.env.NEON_AUTH_AUDIT_MODE || 'log-only',
        branch: 'auth-dev',
        verified: !!neonAuth.verified,
        status: neonAuth.status || (neonAuth.verified ? 'authenticated_unlinked' : 'unauthenticated'),
        userId: neonAuth.userId || null,
        email: neonAuth.email || null,
        name: neonAuth.name || null,
        reason: neonAuth.reason || null
    });
});

// Phase 4A dev-only endpoint protected strictly by Neon Auth Admin verification
app.get('/api/dev/admin-check', blockDevDiagnosticsInProduction, requireNeonAdmin, (req, res) => {
    res.json({
        ok: true,
        branch: 'auth-dev',
        authorized: true,
        role: 'admin',
        admin: {
            userId: req.neonAdmin.userId,
            name: req.neonAdmin.name,
            email: req.neonAdmin.email
        }
    });
});

// Phase 4B admin-only orphan Neon Auth user check (detects interrupted requests)
const KNOWN_DEV_TEST_EMAILS = new Set([
    'vathsambhat@gmail.com',
    'phase3_test_1795337256065@example.com',
    'phase3_test_1795337268721@example.com'
]);

app.get('/api/dev/orphan-auth-check', blockDevDiagnosticsInProduction, requireNeonAdmin, async (req, res) => {
    try {
        const unlinkedNeonUsers = await prisma.$queryRaw`
            SELECT u.id, u.email, u.name, u.role, u."createdAt"
            FROM neon_auth."user" u
            LEFT JOIN public.students s ON s.auth_user_id = u.id
            LEFT JOIN public.teachers t ON t.auth_user_id = u.id
            WHERE LOWER(COALESCE(u.role, 'user')) NOT LIKE '%admin%'
              AND s.id IS NULL
              AND t.id IS NULL
            ORDER BY u."createdAt" DESC
        `;

        const knownDevTestAccounts = [];
        const orphans = [];
        for (const u of unlinkedNeonUsers) {
            const cleanEmail = String(u.email || '').toLowerCase();
            const safeRow = {
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                createdAt: u.createdAt
            };
            if (KNOWN_DEV_TEST_EMAILS.has(cleanEmail)) {
                knownDevTestAccounts.push(safeRow);
            } else {
                orphans.push(safeRow);
            }
        }

        res.json({
            ok: true,
            branch: 'auth-dev',
            orphanCount: orphans.length,
            orphans,
            knownDevTestAccounts
        });
    } catch (err) {
        console.error('[NeonAuth OrphanCheck] Error:', err.message);
        res.status(500).json({ error: 'Failed to inspect orphaned Neon Auth accounts.' });
    }
});

if (!process.env.VERCEL) {
    // Initialize Cron Jobs
    const { scheduleRollover } = require('./utils/rollover');
    scheduleRollover();

    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}

module.exports = app;
