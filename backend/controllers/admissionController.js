const prisma = require('../prismaClient');
const { sanitizeText } = require('../utils/sanitize');
const emailService = require('../utils/emailService');
const path = require('path');
const fs = require('fs');

const submitAdmissionApplication = async (req, res) => {
    try {
        const body = req.body || {};
        const student_name = sanitizeText(body.student_name);
        const grade = sanitizeText(body.grade);
        const parent_name = sanitizeText(body.parent_name);
        const email = sanitizeText(body.email);
        const phone = sanitizeText(body.phone);

        if (!student_name || !grade || !parent_name || !email || !phone) {
            return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
        }

        let document_url = null;
        if (req.file) {
            document_url = `/uploads/${req.file.filename}`;
        }

        const application = await prisma.admissionApplication.create({
            data: {
                student_name,
                grade,
                parent_name,
                email,
                phone,
                document_url,
                status: 'Pending'
            }
        });

        // Fire-and-forget email alert to school admin
        emailService.sendAdminNotification({
            subject: `New Admission Application: ${student_name} (${grade})`,
            title: 'New Online Admission Application',
            details: {
                'Student Name': student_name,
                'Grade Applying For': grade,
                'Parent/Guardian': parent_name,
                'Email': email,
                'Phone': phone,
                'Attached Documents': document_url ? `Yes (${path.basename(document_url)})` : 'None uploaded'
            },
            actionUrl: 'http://localhost:8000/dashboard_admin.html',
            actionText: 'View in Admin Dashboard'
        }).catch(err => console.error('[Admission] Failed to send admin email alert:', err.message));

        return res.status(201).json({
            success: true,
            message: 'Your admission application has been submitted successfully! We will get back to you shortly.',
            applicationId: application.id
        });
    } catch (error) {
        console.error('[Admission] submitAdmissionApplication error:', error);
        return res.status(500).json({ success: false, message: 'Failed to submit admission application.' });
    }
};

const getAdmissionApplications = async (req, res) => {
    try {
        const { status } = req.query;
        const whereClause = {};
        if (status && status !== 'All') {
            whereClause.status = status;
        }

        const applications = await prisma.admissionApplication.findMany({
            where: whereClause,
            orderBy: { created_at: 'desc' }
        });

        return res.json(applications);
    } catch (error) {
        console.error('[Admission] getAdmissionApplications error:', error);
        return res.status(500).json({ message: 'Failed to load admission applications.' });
    }
};

const getPendingAdmissionsCount = async (req, res) => {
    try {
        const count = await prisma.admissionApplication.count({
            where: { status: 'Pending' }
        });
        return res.json({ pendingCount: count });
    } catch (error) {
        console.error('[Admission] getPendingAdmissionsCount error:', error);
        return res.status(500).json({ pendingCount: 0 });
    }
};

const updateAdmissionStatus = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;
        if (isNaN(id) || !['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid ID or status value.' });
        }

        const updated = await prisma.admissionApplication.update({
            where: { id },
            data: { status }
        });

        return res.json({ success: true, message: `Application marked as ${status}.`, application: updated });
    } catch (error) {
        console.error('[Admission] updateAdmissionStatus error:', error);
        return res.status(500).json({ message: 'Failed to update admission status.' });
    }
};

const deleteAdmissionApplication = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ message: 'Invalid application ID.' });
        }

        const appRecord = await prisma.admissionApplication.findUnique({ where: { id } });
        if (appRecord && appRecord.document_url) {
            const filePath = path.join(__dirname, '..', appRecord.document_url);
            if (fs.existsSync(filePath)) {
                fs.unlink(filePath, () => {});
            }
        }

        await prisma.admissionApplication.delete({ where: { id } });

        return res.json({ success: true, message: 'Admission application deleted successfully.' });
    } catch (error) {
        console.error('[Admission] deleteAdmissionApplication error:', error);
        return res.status(500).json({ message: 'Failed to delete application.' });
    }
};

module.exports = {
    submitAdmissionApplication,
    getAdmissionApplications,
    getPendingAdmissionsCount,
    updateAdmissionStatus,
    deleteAdmissionApplication
};
