const express = require('express');
const router = express.Router();
const subjectTeacherController = require('../controllers/subjectTeacherController');

router.get('/', subjectTeacherController.getAllSubjectTeachers);
router.post('/', subjectTeacherController.assignSubjectTeacher);
router.delete('/:id', subjectTeacherController.removeAssignment);

module.exports = router;
