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

const VALID_CERTIFICATE_STATUSES = new Set(['Pending', 'Accepted', 'Rejected']);

exports.createCertificate = async (req, res) => {
    try {
        const { student_code, certificate_type } = req.body;
        const cleanType = typeof certificate_type === 'string' ? certificate_type.trim() : '';
        if (!cleanType) {
            return res.status(400).json({ error: 'Certificate type is required.' });
        }

        let targetStudent = null;
        if (req.auth && req.auth.role === 'student') {
            if (!req.auth.student || !req.auth.student.id || !req.auth.student.student_code) {
                return res.status(403).json({ error: 'Authenticated student profile not found.' });
            }
            const cleanBodyCode = typeof student_code === 'string' ? student_code.trim() : '';
            if (cleanBodyCode && cleanBodyCode.toLowerCase() !== String(req.auth.student.student_code).trim().toLowerCase()) {
                return res.status(403).json({
                    error: 'Access denied: Students cannot submit certificate requests for another student.'
                });
            }
            targetStudent = {
                id: req.auth.student.id,
                student_code: req.auth.student.student_code
            };
        } else if (req.auth && req.auth.role === 'admin') {
            const cleanCode = typeof student_code === 'string' ? student_code.trim() : '';
            if (!cleanCode) {
                return res.status(400).json({ error: 'Valid student code is required.' });
            }
            targetStudent = await prisma.student.findFirst({
                where: {
                    student_code: { equals: cleanCode, mode: 'insensitive' },
                    is_active: true
                },
                select: { id: true, student_code: true }
            });
            if (!targetStudent) {
                return res.status(404).json({ error: 'Active student record not found.' });
            }
        } else {
            return res.status(403).json({ error: 'Insufficient permissions to submit certificate request.' });
        }

        const certificate = await prisma.certificateRequest.create({
            data: {
                student_code: targetStudent.student_code,
                student_id: targetStudent.id,
                certificate_type: cleanType,
                status: 'Pending',
                request_date: new Date()
            }
        });
        res.status(201).json(certificate);
    } catch (error) {
        console.error('Create Certificate Error:', error.message);
        res.status(500).json({ error: 'Failed to create certificate request' });
    }
};

exports.updateCertificate = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = await prisma.certificateRequest.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Certificate request not found' });

        const { status } = req.body;
        if (!VALID_CERTIFICATE_STATUSES.has(status)) {
            return res.status(400).json({ error: 'Invalid certificate status.' });
        }

        const certificate = await prisma.certificateRequest.update({
            where: { id },
            data: { status }
        });
        res.json(certificate);
    } catch (error) {
        console.error('Update Certificate Error:', error.message);
        res.status(500).json({ error: 'Failed to update certificate request' });
    }
};
