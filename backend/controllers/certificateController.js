const prisma = require('../prismaClient');

exports.getCertificates = async (req, res) => {
    try {
        const certificates = await prisma.certificateRequest.findMany();
        
        // Fetch all students to map medium
        const students = await prisma.student.findMany({
            select: { student_code: true, medium: true }
        });
        const studentMap = {};
        students.forEach(s => studentMap[s.student_code] = s.medium);

        const enrichedCertificates = certificates.map(c => ({
            ...c,
            medium: studentMap[c.student_code] || 'Unknown'
        }));

        res.json(enrichedCertificates);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
};

exports.getCertificateByStudent = async (req, res) => {
    try {
        const student = await prisma.student.findUnique({
            where: { student_code: req.params.code }
        });

        const certificates = await prisma.certificateRequest.findMany({
            where: { student_code: req.params.code }
        });

        const enrichedCertificates = certificates.map(c => ({
            ...c,
            medium: student ? student.medium : 'Unknown'
        }));

        res.json(enrichedCertificates);
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
                request_date: request_date ? new Date(request_date) : new Date()
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
