const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');

router.get('/', certificateController.getCertificates);
router.get('/:code', certificateController.getCertificateByStudent);
router.post('/', certificateController.createCertificate);
router.put('/:id', certificateController.updateCertificate);

module.exports = router;
