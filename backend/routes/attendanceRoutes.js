const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { requireAuth, requireRole, requireStudentOwnerOrStaff } = require('../middleware/authorize');

router.get('/', requireAuth, requireRole('admin', 'teacher'), attendanceController.getAllAttendance);
router.get('/class/:cls', requireAuth, requireRole('admin', 'teacher'), attendanceController.getAttendanceByClass);
router.get('/:code', requireAuth, requireStudentOwnerOrStaff({ paramName: 'code', allowTeacher: true }), attendanceController.getAttendanceByStudent);
router.post('/', requireAuth, requireRole('admin', 'teacher'), attendanceController.createAttendance);
router.post('/bulk', requireAuth, requireRole('admin', 'teacher'), attendanceController.createAttendanceBulk);

module.exports = router;
