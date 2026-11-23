const rateLimit = require('express-rate-limit');

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function createLoginRateLimiter(options = {}) {
    return rateLimit({
        windowMs: options.windowMs || FIFTEEN_MINUTES_MS,
        limit: options.limit || 10,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            console.log(`[RateLimit] Login limit exceeded for ${req.method} ${req.originalUrl}`);
            res.status(429).json({
                error: 'Too many login attempts. Please wait a few minutes and try again.'
            });
        }
    });
}

function createOtpRateLimiter(options = {}) {
    return rateLimit({
        windowMs: options.windowMs || FIFTEEN_MINUTES_MS,
        limit: options.limit || 5,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            console.log(`[RateLimit] OTP verification limit exceeded for ${req.method} ${req.originalUrl}`);
            res.status(429).json({
                error: 'Too many verification requests. Please wait a few minutes and try again.'
            });
        }
    });
}

const loginRateLimiter = createLoginRateLimiter();
const otpRateLimiter = createOtpRateLimiter();

function createGlobalApiLimiter(options = {}) {
    return rateLimit({
        windowMs: options.windowMs || FIFTEEN_MINUTES_MS,
        limit: options.limit || 400,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            console.log(`[RateLimit] API rate limit exceeded for ${req.method} ${req.originalUrl}`);
            res.status(429).json({
                error: 'Too many requests. Please slow down and try again later.'
            });
        }
    });
}

function createExportRateLimiter(options = {}) {
    return rateLimit({
        windowMs: options.windowMs || FIFTEEN_MINUTES_MS,
        limit: options.limit || 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                error: 'Too many export requests generated. Please wait a few minutes before exporting again.'
            });
        }
    });
}

const globalApiLimiter = createGlobalApiLimiter();
const exportRateLimiter = createExportRateLimiter();

module.exports = {
    loginRateLimiter,
    otpRateLimiter,
    globalApiLimiter,
    exportRateLimiter,
    createLoginRateLimiter,
    createOtpRateLimiter,
    createGlobalApiLimiter,
    createExportRateLimiter
};
