const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const { requireAuth, requireRole } = require('../middleware/authorize');
const { createImageUploadMiddleware } = require('../utils/imageUpload');

const uploadPhoto = createImageUploadMiddleware('photo');

router.get('/', teacherController.getTeachers);
router.post('/validate', requireAuth, requireRole('admin'), teacherController.validateTeacherCreation);
router.post('/', requireAuth, requireRole('admin'), uploadPhoto, teacherController.createTeacher);
router.delete('/:id', requireAuth, requireRole('admin'), teacherController.deleteTeacher);
router.put('/:id', requireAuth, requireRole('admin'), uploadPhoto, teacherController.updateTeacher);

module.exports = router;
