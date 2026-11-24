const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { requireAuth, requireRole } = require('../middleware/authorize');
const rateLimit = require('express-rate-limit');

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many queries submitted from this IP. Please try again later.' }
});

// Public submission
router.post('/', contactLimiter, contactController.submitContactQuery);

// Admin-only endpoints
router.get('/', requireAuth, requireRole('admin'), contactController.getContactQueries);
router.get('/pending-summary', requireAuth, requireRole('admin'), contactController.getPendingQueriesCount);
router.patch('/:id/read', requireAuth, requireRole('admin'), contactController.markQueryAsRead);
router.delete('/:id', requireAuth, requireRole('admin'), contactController.deleteContactQuery);

module.exports = router;
