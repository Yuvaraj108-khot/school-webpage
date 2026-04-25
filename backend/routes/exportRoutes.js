const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');

router.get('/attendance', exportController.exportAttendance);
router.get('/marks', exportController.exportMarks);

module.exports = router;
