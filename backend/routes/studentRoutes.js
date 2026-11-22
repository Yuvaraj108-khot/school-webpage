const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { requireAuth, requireRole, requireStudentOwnerOrStaff } = require('../middleware/authorize');

router.get('/', requireAuth, requireRole('admin', 'teacher'), studentController.getStudents);
router.post('/validate', requireAuth, requireRole('admin'), studentController.validateStudentCreation);
router.post('/', requireAuth, requireRole('admin'), studentController.createStudent);
router.get('/:code', requireAuth, requireStudentOwnerOrStaff({ paramName: 'code', allowTeacher: true }), studentController.getStudentByCode);
router.delete('/:code', requireAuth, requireRole('admin'), studentController.deleteStudent);
router.put('/:code', requireAuth, requireRole('admin'), studentController.updateStudent);

module.exports = router;
