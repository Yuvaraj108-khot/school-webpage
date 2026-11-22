const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const { requireAuth, requireRole } = require('../middleware/authorize');

router.get('/', noticeController.getNotices);
router.post('/', requireAuth, requireRole('admin'), noticeController.createNotice);
router.delete('/:id', requireAuth, requireRole('admin'), noticeController.deleteNotice);

module.exports = router;
