const express = require('express');
const router = express.Router();
const alumniTrackingController = require('../controllers/alumniTrackingController');

// Define Alumni Tracking Module routes
router.get('/eligible', alumniTrackingController.getEligibleStudents);
router.get('/eligible-bulk', alumniTrackingController.getEligibleBulkStudents);
router.post('/graduate', alumniTrackingController.graduateStudent);
router.post('/bulk-graduate', alumniTrackingController.bulkGraduateStudent);
router.get('/', alumniTrackingController.getAlumniTrackingList);
router.put('/:id', alumniTrackingController.updateAlumniTracking);
router.delete('/:id', alumniTrackingController.deleteAlumniTracking);
router.get('/stats', alumniTrackingController.getDashboardStats);
router.get('/export/excel', alumniTrackingController.exportExcel);
router.get('/export/csv', alumniTrackingController.exportCsv);

module.exports = router;
