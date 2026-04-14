const prisma = require('../prismaClient');

exports.getCertificates = async (req, res) => {
    try {
        const certificates = await prisma.certificateRequest.findMany();
        res.json(certificates);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
};

exports.getCertificateByStudent = async (req, res) => {
    try {
        const certificates = await prisma.certificateRequest.findMany({
            where: { student_code: req.params.code }
        });
        res.json(certificates);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch student certificates' });
    }
};

exports.createCertificate = async (req, res) => {
    try {
        const { student_code, certificate_type, status, request_date } = req.body;
        const certificate = await prisma.certificateRequest.create({
            data: {
                student_code,
                certificate_type,
                status: status || "Pending",
                request_date: request_date ? new Date(request_date).toISOString() : new Date().toISOString()
            }
        });
        res.status(201).json(certificate);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create certificate request' });
    }
};

exports.updateCertificate = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await prisma.certificateRequest.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Certificate request not found' });

        const { status } = req.body;
        const certificate = await prisma.certificateRequest.update({
            where: { id },
            data: { status }
        });
        res.json(certificate);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update certificate request' });
    }
};
