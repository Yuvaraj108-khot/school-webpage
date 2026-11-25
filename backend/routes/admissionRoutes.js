const express = require('express');
const router = express.Router();
const admissionController = require('../controllers/admissionController');
const { requireAuth, requireRole } = require('../middleware/authorize');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'admission_' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['.pdf', '.zip', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF, ZIP, and Image files are allowed.'));
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
    fileFilter
});

const admissionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many applications submitted from this IP. Please try again later.' }
});

// Public application submission
router.post('/', admissionLimiter, upload.single('document'), admissionController.submitAdmissionApplication);

// Admin-only endpoints
router.get('/', requireAuth, requireRole('admin'), admissionController.getAdmissionApplications);
router.get('/pending-summary', requireAuth, requireRole('admin'), admissionController.getPendingAdmissionsCount);
router.patch('/:id/status', requireAuth, requireRole('admin'), admissionController.updateAdmissionStatus);
router.delete('/:id', requireAuth, requireRole('admin'), admissionController.deleteAdmissionApplication);

module.exports = router;
