const express = require('express');
const router = express.Router();
const mediumController = require('../controllers/mediumController');
const { requireAuth, requireRole } = require('../middleware/authorize');

router.get('/', requireAuth, requireRole('admin', 'teacher'), mediumController.getAllMediums);
router.post('/', requireAuth, requireRole('admin'), mediumController.createMedium);
router.put('/:id', requireAuth, requireRole('admin'), mediumController.updateMedium);
router.delete('/:id', requireAuth, requireRole('admin'), mediumController.deleteMedium);

module.exports = router;
