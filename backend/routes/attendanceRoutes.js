const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

router.get('/class/:cls', attendanceController.getAttendanceByClass);
router.get('/:code', attendanceController.getAttendanceByStudent);
router.post('/', attendanceController.createAttendance);

module.exports = router;
