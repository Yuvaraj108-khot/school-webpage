const express = require('express');
const router = express.Router();
const galleryController = require('../controllers/galleryController');
const { requireAuth, requireRole } = require('../middleware/authorize');
const { createImageUploadMiddleware } = require('../utils/imageUpload');

const uploadImage = createImageUploadMiddleware('image');

router.get('/', galleryController.getGallery);
router.post('/upload', requireAuth, requireRole('admin'), uploadImage, galleryController.uploadGalleryItem);
router.delete('/:id', requireAuth, requireRole('admin'), galleryController.deleteGalleryItem);

module.exports = router;
