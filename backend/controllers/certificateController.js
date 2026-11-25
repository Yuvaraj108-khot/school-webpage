const prisma = require('../prismaClient');
const { sendAdminNotification } = require('../utils/emailService');

exports.getCertificates = async (req, res) => {
    try {
        const certificates = await prisma.certificateRequest.findMany({
            orderBy: { request_date: 'desc' }
        });
        
        // Fetch all students to map comprehensive student details
        const students = await prisma.student.findMany({
            select: {
                id: true,
                student_code: true,
                name: true,
                class: true,
                medium: true,
                parent_name: true,
                roll_no: true,
                email: true,
                photo_url: true
            }
        });
        const studentMap = {};
        students.forEach(s => {
            if (s.student_code) {
                studentMap[s.student_code] = s;
                studentMap[s.student_code.toLowerCase()] = s;
            }
        });

        const enrichedCertificates = certificates.map(c => {
            const st = (c.student_code && (studentMap[c.student_code] || studentMap[c.student_code.toLowerCase()])) || {};
            return {
                ...c,
                student_name: st.name || 'Unknown Student',
                class: st.class || 'N/A',
                medium: st.medium || 'Unknown',
                parent_name: st.parent_name || 'N/A',
                roll_no: st.roll_no || 'N/A',
                email: st.email || 'N/A',
                photo_url: st.photo_url || null
            };
        });

        res.json(enrichedCertificates);
    } catch (error) {
        console.error('getCertificates Error:', error);
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

        // Trigger asynchronous admin notification email
        prisma.student.findUnique({
            where: { id: targetStudent.id },
            select: { name: true, student_code: true, class: true, medium: true }
        }).then(st => {
            const studentDisplayName = st ? `${st.name} (${st.student_code})` : targetStudent.student_code;
            return sendAdminNotification({
                subject: `New Certificate Request: ${cleanType} - ${studentDisplayName}`,
                title: 'New Certificate Request Submitted',
                details: {
                    'Student Name': st ? st.name : 'N/A',
                    'Student Code': targetStudent.student_code,
                    'Class / Medium': st ? `${st.class} (${st.medium || 'N/A'})` : 'N/A',
                    'Certificate Type': cleanType,
                    'Request Date': new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                    'Status': 'Pending Approval'
                },
                actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:8000'}/dashboard_admin.html`,
                actionText: 'Review Certificate Requests'
            });
        }).catch(err => {
            console.error('[Admin Alert] Error dispatching certificate notification:', err.message);
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

exports.deleteCertificate = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = await prisma.certificateRequest.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Certificate request not found' });
        }
        await prisma.certificateRequest.delete({ where: { id } });
        res.json({ message: 'Certificate request permanently deleted from database' });
    } catch (error) {
        console.error('Delete Certificate Error:', error.message);
        res.status(500).json({ error: 'Failed to delete certificate request' });
    }
};

exports.getPendingSummary = async (req, res) => {
    try {
        const [pendingCerts, pendingAlumni] = await Promise.all([
            prisma.certificateRequest.findMany({
                where: { status: 'Pending' },
                orderBy: { request_date: 'desc' },
                take: 10
            }),
            prisma.alumni.findMany({
                where: { status: 'Pending' },
                orderBy: { applied_at: 'desc' },
                take: 10
            })
        ]);

        const studentCodes = [...new Set(pendingCerts.map(c => c.student_code))];
        const students = await prisma.student.findMany({
            where: { student_code: { in: studentCodes } },
            select: { student_code: true, name: true, class: true }
        });
        const studentMap = new Map(students.map(s => [s.student_code.toLowerCase(), s]));

        const enrichedCerts = pendingCerts.map(c => {
            const st = studentMap.get((c.student_code || '').toLowerCase());
            return {
                id: c.id,
                student_code: c.student_code,
                student_name: st ? st.name : c.student_code,
                class: st ? st.class : 'N/A',
                certificate_type: c.certificate_type,
                request_date: c.request_date
            };
        });

        res.json({
            totalPending: enrichedCerts.length + pendingAlumni.length,
            certificates: {
                count: enrichedCerts.length,
                items: enrichedCerts
            },
            alumni: {
                count: pendingAlumni.length,
                items: pendingAlumni.map(a => ({
                    id: a.id,
                    name: a.name,
                    batch_year: a.batch_year,
                    profession: a.profession,
                    email: a.email,
                    applied_at: a.applied_at
                }))
            }
        });
    } catch (error) {
        console.error('Pending Summary Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch pending requests summary' });
    }
};
