const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');

router.get('/attendance', exportController.exportAttendance);
router.get('/marks', exportController.exportMarks);
router.get('/report-card/:code', exportController.exportStudentReportCard);

module.exports = router;
