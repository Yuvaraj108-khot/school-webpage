const path = require('path');
const prisma = require('../prismaClient');
const { validateAndSaveImageBuffer } = require('../utils/imageUpload');

let cachedGallery = null;
let lastGalleryFetch = 0;
const GALLERY_CACHE_TTL_MS = 300000; // 5 minutes cache

function clearGalleryCache() {
    cachedGallery = null;
    lastGalleryFetch = 0;
}

exports.clearGalleryCache = clearGalleryCache;

function sanitizeSafeImageUrl(urlValue) {
    if (typeof urlValue !== 'string') return null;
    const trimmed = urlValue.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('images/') || trimmed.startsWith('data:image/')) {
        return trimmed;
    }
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return trimmed;
        }
    } catch (_) {
        return null;
    }
    return null;
}

exports.getGallery = async (req, res) => {
    try {
        const now = Date.now();
        if (cachedGallery && (now - lastGalleryFetch < GALLERY_CACHE_TTL_MS)) {
            res.setHeader('Cache-Control', 'public, max-age=120');
            return res.json(cachedGallery);
        }

        const gallery = await prisma.gallery.findMany({
            orderBy: { upload_date: 'desc' }
        });

        cachedGallery = gallery;
        lastGalleryFetch = now;
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.json(gallery);
    } catch (error) {
        console.error('Get Gallery Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch gallery items' });
    }
};

exports.uploadGalleryItem = async (req, res) => {
    try {
        const { category, description, image_url: body_url } = req.body;
        let publicUrl = null;

        if (req.file) {
            const uploadsDir = path.join(__dirname, '../uploads');
            try {
                validateAndSaveImageBuffer(req.file.buffer, uploadsDir);
            } catch (_) {}
            const mime = (req.file.mimetype && req.file.mimetype.startsWith('image/')) ? req.file.mimetype : 'image/jpeg';
            publicUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
        } else if (body_url) {
            publicUrl = sanitizeSafeImageUrl(body_url);
            if (!publicUrl) {
                return res.status(400).json({ error: 'Invalid image URL protocol.' });
            }
        }

        if (!publicUrl) {
            return res.status(400).json({ error: 'No image file or URL provided' });
        }

        const galleryItem = await prisma.gallery.create({
            data: {
                image_url: publicUrl,
                category,
                description,
                upload_date: new Date().toISOString()
            }
        });
        clearGalleryCache();
        res.status(201).json(galleryItem);
    } catch (error) {
        console.error('Gallery Upload Error:', error.message);
        res.status(error.status === 400 ? 400 : 500).json({
            error: error.status === 400 ? error.message : 'Failed to upload gallery item'
        });
    }
};

exports.deleteGalleryItem = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const galleryItem = await prisma.gallery.findUnique({ where: { id } });
        if (!galleryItem) return res.status(404).json({ error: 'Gallery item not found' });

        if (galleryItem.image_url && galleryItem.image_url.startsWith('/uploads/')) {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '..', galleryItem.image_url);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (_) {}
        }

        await prisma.gallery.delete({ where: { id } });
        clearGalleryCache();
        res.json({ message: 'Gallery item permanently deleted from database and storage' });
    } catch (error) {
        console.error('Delete Gallery Error:', error.message);
        res.status(500).json({ error: 'Failed to delete gallery item' });
    }
};
