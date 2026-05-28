const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

router.get('/', studentController.getStudents);
router.get('/:code', studentController.getStudentByCode);
router.post('/', studentController.createStudent);
router.put('/:code', studentController.updateStudent);
router.delete('/:code', studentController.deleteStudent);

module.exports = router;
