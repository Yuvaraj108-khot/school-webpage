const express = require('express');
const router = express.Router();
const alumniController = require('../controllers/alumniController');

router.get('/', alumniController.getAlumni);
router.post('/', alumniController.createAlumni);
router.delete('/:id', alumniController.deleteAlumni);

module.exports = router;
