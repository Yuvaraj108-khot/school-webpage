const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
]);

/**
 * Inspects binary file headers (magic bytes) to verify genuine image content.
 * Returns normalized extension or null when invalid.
 */
function detectImageExtension(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return null;
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return '.jpg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return '.png';
    }

    // GIF: GIF87a or GIF89a
    const gifHeader = buffer.subarray(0, 6).toString('ascii');
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
        return '.gif';
    }

    // WebP: RIFF....WEBP
    if (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return '.webp';
    }

    return null;
}

/**
 * Express middleware wrapping Multer memory storage with strict MIME allowlist
 * and file size enforcement.
 */
function createImageUploadMiddleware(fieldName, maxBytes = DEFAULT_MAX_IMAGE_BYTES) {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: maxBytes,
            files: 1
        },
        fileFilter: (req, file, cb) => {
            const mime = String((file && file.mimetype) || '').toLowerCase();
            if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
                const err = new Error('Only JPEG, PNG, GIF, and WebP image files are allowed.');
                err.status = 400;
                return cb(err);
            }
            return cb(null, true);
        }
    }).single(fieldName);

    return (req, res, next) => {
        upload(req, res, (err) => {
            if (!err) return next();
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: `Uploaded image exceeds the maximum allowed size (${Math.round(maxBytes / (1024 * 1024))} MB).`
                    });
                }
                return res.status(400).json({ error: 'Invalid file upload request.' });
            }
            return res.status(err.status || 400).json({
                error: err.message || 'Invalid image upload.'
            });
        });
    };
}

/**
 * Validates actual image magic bytes, generates an opaque hex filename,
 * writes the image to uploadsDir, and returns the public /uploads/... path.
 */
function validateAndSaveImageBuffer(buffer, uploadsDir) {
    const ext = detectImageExtension(buffer);
    if (!ext) {
        const err = new Error('Invalid image file content. Supported formats: JPEG, PNG, GIF, WebP.');
        err.status = 400;
        throw err;
    }

    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(uploadsDir, safeName), buffer);
    return `/uploads/${safeName}`;
}

module.exports = {
    DEFAULT_MAX_IMAGE_BYTES,
    ALLOWED_IMAGE_MIME_TYPES,
    detectImageExtension,
    createImageUploadMiddleware,
    validateAndSaveImageBuffer
};
