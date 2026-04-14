const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const galleryController = require('../controllers/galleryController');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

router.get('/', galleryController.getGallery);
router.post('/upload', upload.single('image'), galleryController.uploadGalleryItem);
router.delete('/:id', galleryController.deleteGalleryItem);

module.exports = router;
