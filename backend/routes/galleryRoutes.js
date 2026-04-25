const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const galleryController = require('../controllers/galleryController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', galleryController.getGallery);
router.post('/upload', upload.single('image'), galleryController.uploadGalleryItem);
router.delete('/:id', galleryController.deleteGalleryItem);

module.exports = router;
