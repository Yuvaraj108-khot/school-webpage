const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const teacherController = require('../controllers/teacherController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', teacherController.getTeachers);
router.post('/', upload.single('photo'), teacherController.createTeacher);
router.delete('/:id', teacherController.deleteTeacher);
router.put('/:id', upload.single('photo'), teacherController.updateTeacher);

module.exports = router;
