const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { requireAuth, requireRole } = require('../middleware/authorize');

router.get('/', requireAuth, requireRole('admin', 'teacher'), examController.getAllExams);
router.post('/', requireAuth, requireRole('admin'), examController.createExam);
router.put('/:id', requireAuth, requireRole('admin'), examController.updateExam);
router.delete('/:id', requireAuth, requireRole('admin'), examController.deleteExam);

module.exports = router;
