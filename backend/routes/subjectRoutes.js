const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');

router.get('/', subjectController.getSubjectsByClass);
router.post('/', subjectController.addSubjectToClass);
router.delete('/:id', subjectController.removeSubjectFromClass);

module.exports = router;
