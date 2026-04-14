const express = require('express');
const router = express.Router();
const marksController = require('../controllers/marksController');

router.get('/class/:cls', marksController.getMarksByClass);
router.get('/:code', marksController.getMarksByStudent);
router.post('/', marksController.createMarks);

module.exports = router;
