const express = require('express');
const router = express.Router();
const mediumController = require('../controllers/mediumController');

router.get('/', mediumController.getAllMediums);
router.post('/', mediumController.createMedium);
router.put('/:id', mediumController.updateMedium);
router.delete('/:id', mediumController.deleteMedium);

module.exports = router;
