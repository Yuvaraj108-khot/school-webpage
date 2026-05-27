const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');

// Legacy Endpoints
router.get('/', subjectController.getSubjectsByClass);
router.post('/', subjectController.addSubjectToClass);
router.delete('/:id', subjectController.removeSubjectFromClass);

// Relational Endpoints
router.get('/relational', subjectController.getAllSubjects);
router.post('/relational', subjectController.createRelationalSubject);
router.put('/relational/:id', subjectController.updateRelationalSubject);
router.delete('/relational/:id', subjectController.deleteRelationalSubject);

module.exports = router;
