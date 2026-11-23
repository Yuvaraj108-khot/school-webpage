const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { requireAuth, requireRole, requireStudentOwnerOrStaff } = require('../middleware/authorize');
const { exportRateLimiter } = require('../middleware/rateLimiters');

router.use(exportRateLimiter);

router.get('/attendance', requireAuth, requireRole('admin', 'teacher'), exportController.exportAttendance);
router.get('/marks', requireAuth, requireRole('admin', 'teacher'), exportController.exportMarks);
router.get('/report-card/:code', requireAuth, requireStudentOwnerOrStaff({ paramName: 'code', allowTeacher: true }), exportController.exportStudentReportCard);

module.exports = router;
