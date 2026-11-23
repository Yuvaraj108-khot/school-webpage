/**
 * Input sanitization & XSS protection utilities.
 */

// Strips HTML tags and dangerous event handlers / schemes
function sanitizeText(input) {
    if (input == null) return '';
    let val = String(input).trim();
    // Strip HTML tags
    val = val.replace(/<[^>]*>?/gm, '');
    // Strip javascript: / vbscript: / data: pseudo-protocols
    val = val.replace(/(javascript|vbscript|data):/gi, '');
    // Strip inline event attributes like onclick=, onerror=
    val = val.replace(/on\w+\s*=/gi, '');
    return val;
}

// Deeply sanitizes string properties within an object
function sanitizeObject(obj, allowedKeys = null) {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized = Array.isArray(obj) ? [] : {};
    for (const [key, val] of Object.entries(obj)) {
        if (allowedKeys && !allowedKeys.includes(key)) continue;
        if (typeof val === 'string') {
            sanitized[key] = sanitizeText(val);
        } else if (val && typeof val === 'object') {
            sanitized[key] = sanitizeObject(val);
        } else {
            sanitized[key] = val;
        }
    }
    return sanitized;
}

/**
 * Express middleware to sanitize incoming req.body text fields
 */
function sanitizeBodyMiddleware(req, res, next) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        req.body = sanitizeObject(req.body);
    }
    next();
}

module.exports = {
    sanitizeText,
    sanitizeObject,
    sanitizeBodyMiddleware
};
