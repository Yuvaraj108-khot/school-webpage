const express = require('express');
const router = express.Router();
const marksController = require('../controllers/marksController');

router.get('/', marksController.getAllMarks);
router.get('/class/:cls', marksController.getMarksByClass);
router.get('/:code', marksController.getMarksByStudent);
router.post('/', marksController.createMarks);
router.post('/bulk', marksController.createMarksBulk);

module.exports = router;
