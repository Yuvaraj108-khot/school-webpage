const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { requireAuth, requireRole, requireStudentOwnerOrStaff } = require('../middleware/authorize');

router.get('/pending-summary', requireAuth, requireRole('admin'), certificateController.getPendingSummary);
router.get('/', requireAuth, requireRole('admin'), certificateController.getCertificates);
router.get('/:code', requireAuth, requireStudentOwnerOrStaff({ paramName: 'code', allowTeacher: false }), certificateController.getCertificateByStudent);
router.post('/', requireAuth, requireRole('student', 'admin'), certificateController.createCertificate);
router.put('/:id', requireAuth, requireRole('admin'), certificateController.updateCertificate);

module.exports = router;
