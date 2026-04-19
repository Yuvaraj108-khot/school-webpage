const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const alumniController = require('../controllers/alumniController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', alumniController.getAlumni);
router.post('/', upload.single('photo'), alumniController.createAlumni);
router.delete('/:id', alumniController.deleteAlumni);

module.exports = router;
