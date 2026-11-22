const express = require('express');
const router = express.Router();
const marksController = require('../controllers/marksController');
const { requireAuth, requireRole, requireStudentOwnerOrStaff } = require('../middleware/authorize');

router.get('/', requireAuth, requireRole('admin', 'teacher'), marksController.getAllMarks);
router.get('/class/:cls', requireAuth, requireRole('admin', 'teacher'), marksController.getMarksByClass);
router.get('/:code', requireAuth, requireStudentOwnerOrStaff({ paramName: 'code', allowTeacher: true }), marksController.getMarksByStudent);
router.post('/', requireAuth, requireRole('admin', 'teacher'), marksController.createMarks);
router.post('/bulk', requireAuth, requireRole('admin', 'teacher'), marksController.createMarksBulk);

module.exports = router;
