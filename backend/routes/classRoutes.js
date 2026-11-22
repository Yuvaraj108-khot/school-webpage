const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const { requireAuth, requireRole } = require('../middleware/authorize');

router.get('/', requireAuth, requireRole('admin', 'teacher'), classController.getAllClasses);
router.post('/', requireAuth, requireRole('admin'), classController.createClass);
router.put('/:id', requireAuth, requireRole('admin'), classController.updateClass);
router.delete('/:id', requireAuth, requireRole('admin'), classController.deleteClass);

module.exports = router;
