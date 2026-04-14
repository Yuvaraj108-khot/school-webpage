const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');

router.get('/', teacherController.getTeachers);
router.post('/', teacherController.createTeacher);
router.delete('/:id', teacherController.deleteTeacher);

module.exports = router;
