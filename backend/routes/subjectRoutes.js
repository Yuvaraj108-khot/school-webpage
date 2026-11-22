const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const { requireAuth, requireRole } = require('../middleware/authorize');

// Legacy Endpoints
router.get('/', requireAuth, requireRole('admin', 'teacher'), subjectController.getSubjectsByClass);
router.post('/', requireAuth, requireRole('admin'), subjectController.addSubjectToClass);
router.delete('/:id', requireAuth, requireRole('admin'), subjectController.removeSubjectFromClass);

// Relational Endpoints
router.get('/relational', requireAuth, requireRole('admin', 'teacher'), subjectController.getAllSubjects);
router.post('/relational', requireAuth, requireRole('admin'), subjectController.createRelationalSubject);
router.put('/relational/:id', requireAuth, requireRole('admin'), subjectController.updateRelationalSubject);
router.delete('/relational/:id', requireAuth, requireRole('admin'), subjectController.deleteRelationalSubject);

module.exports = router;
