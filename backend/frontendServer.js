const http = require('http');
const path = require('path');
const express = require('express');

const ROOT_DIR = path.join(__dirname, '../');
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || '8000', 10);
const BACKEND_ORIGIN = process.env.BACKEND_URL || 'http://localhost:5000';

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

/**
 * Checks whether a URL pathname attempts directory traversal, null-byte injection,
 * or Windows backslash path smuggling before normalization.
 */
function hasUnsafePathSegment(rawOriginalUrl) {
    const rawPathname = String(rawOriginalUrl || '/').split('?')[0];
    let decoded;
    try {
        decoded = decodeURIComponent(rawPathname);
    } catch (_) {
        return true;
    }
    return (
        rawPathname.includes('..') ||
        decoded.includes('..') ||
        rawPathname.includes('\\') ||
        decoded.includes('\\') ||
        rawPathname.includes('\0') ||
        decoded.includes('\0')
    );
}

/**
 * Forwards `/api/*` requests to the local Express backend without buffering payloads
 * or altering cookies, authorization headers, or binary streams.
 */
function proxyApiRequest(req, res, backendTarget) {
    const outgoingHeaders = {
        ...req.headers,
        host: backendTarget.host
    };

    const proxyReq = http.request(
        {
            protocol: backendTarget.protocol,
            hostname: backendTarget.hostname,
            port: backendTarget.port || 5000,
            method: req.method,
            path: req.originalUrl,
            headers: outgoingHeaders
        },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
        }
    );

    proxyReq.on('error', (err) => {
        console.error('[Frontend Proxy] Backend request failed:', err.message);
        if (!res.headersSent) {
            res.status(502).json({ error: 'Backend API server unavailable.' });
        } else {
            res.end();
        }
    });

    req.on('aborted', () => proxyReq.destroy());
    req.pipe(proxyReq);
}

/**
 * Builds the restricted static frontend Express app for localhost development.
 * Serves only explicit allowlisted public files, `/images`, `/uploads`, and `/api` proxy.
 */
function createFrontendApp(backendOrigin = BACKEND_ORIGIN) {
    const app = express();
    const backendTarget = new URL(backendOrigin);

    app.disable('x-powered-by');

    app.use((req, res, next) => {
        if (hasUnsafePathSegment(req.originalUrl)) {
            return res.status(404).send('Not found');
        }
        return next();
    });

    app.use('/api', (req, res) => proxyApiRequest(req, res, backendTarget));

    app.use('/images', express.static(path.join(ROOT_DIR, 'images'), {
        dotfiles: 'deny',
        index: false,
        fallthrough: false,
        setHeaders(res) {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
    }));

    app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
        dotfiles: 'deny',
        index: false,
        fallthrough: false,
        setHeaders(res) {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        }
    }));

    app.use((req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return res.status(404).end();
        }

        const relPath = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '');
        if (!ALLOWED_PUBLIC_FILES.has(relPath)) {
            return res.status(404).send('Not found');
        }

        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.sendFile(path.join(ROOT_DIR, relPath), (err) => {
            if (err && !res.headersSent) {
                res.status(err.statusCode || 404).send('Not found');
            }
        });
    });

    // Map express.static fallthrough=false 403/404 errors cleanly without exposing paths or stacks
    app.use((err, req, res, _next) => {
        const status = err && (err.status || err.statusCode);
        if (status === 403 || status === 404 || status === 400) {
            return res.status(status).send(status === 403 ? 'Forbidden' : 'Not found');
        }
        return res.status(500).send('Internal server error');
    });

    return app;
}

function startFrontendServer(port = FRONTEND_PORT) {
    const app = createFrontendApp();
    return app.listen(port, () => {
        console.log(`Frontend static server (restricted allowlist) running at http://localhost:${port}`);
        console.log(`Proxying /api/* requests to ${BACKEND_ORIGIN}`);
    });
}

if (require.main === module) {
    startFrontendServer();
}

module.exports = {
    createFrontendApp,
    startFrontendServer,
    ALLOWED_PUBLIC_FILES,
    hasUnsafePathSegment
};
