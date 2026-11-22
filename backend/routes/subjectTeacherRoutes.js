const express = require('express');
const router = express.Router();
const subjectTeacherController = require('../controllers/subjectTeacherController');
const { requireAuth, requireRole } = require('../middleware/authorize');

router.get('/', requireAuth, requireRole('admin', 'teacher'), subjectTeacherController.getAllSubjectTeachers);
router.post('/', requireAuth, requireRole('admin'), subjectTeacherController.assignSubjectTeacher);
router.delete('/:id', requireAuth, requireRole('admin'), subjectTeacherController.removeAssignment);

module.exports = router;
