const express = require('express');
const router = express.Router();
const alumniController = require('../controllers/alumniController');
const { requireAuth, requireRole } = require('../middleware/authorize');
const { createImageUploadMiddleware } = require('../utils/imageUpload');

const uploadPhoto = createImageUploadMiddleware('photo');

router.get('/', alumniController.getAlumni);
router.post('/', uploadPhoto, alumniController.createAlumni);
router.delete('/:id', requireAuth, requireRole('admin'), alumniController.deleteAlumni);
router.put('/:id/status', requireAuth, requireRole('admin'), alumniController.updateAlumniStatus);

module.exports = router;
