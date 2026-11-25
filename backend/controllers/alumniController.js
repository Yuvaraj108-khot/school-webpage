const path = require('path');
const prisma = require('../prismaClient');
const requireNeonAdmin = require('../middleware/requireNeonAdmin');
const { validateAndSaveImageBuffer } = require('../utils/imageUpload');
const { sendAdminNotification } = require('../utils/emailService');

async function isRequestFromNeonAdmin(req) {
    if (!req.neonAuth || !req.neonAuth.verified) return false;
    const resolved = await requireNeonAdmin.resolveVerifiedNeonUser(req).catch(() => null);
    return Boolean(resolved && resolved.ok && resolved.roles.includes('admin'));
}

exports.getAlumni = async (req, res) => {
    try {
        const isAdmin = await isRequestFromNeonAdmin(req);
        if (isAdmin) {
            const { status } = req.query;
            const whereClause = status ? { status } : {};
            const alumni = await prisma.alumni.findMany({
                where: whereClause,
                orderBy: { applied_at: 'desc' },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    batch_year: true,
                    profession: true,
                    photo_url: true,
                    status: true,
                    applied_at: true
                }
            });
            return res.json(alumni);
        }

        // Public visitors only receive approved alumni and safe non-PII fields
        const publicAlumni = await prisma.alumni.findMany({
            where: { status: 'Approved' },
            orderBy: { applied_at: 'desc' },
            select: {
                id: true,
                name: true,
                batch_year: true,
                profession: true,
                photo_url: true,
                status: true
            }
        });
        return res.json(publicAlumni);
    } catch (error) {
        console.error('Get Alumni Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch alumni' });
    }
};

exports.createAlumni = async (req, res) => {
    try {
        const { name, batch_year, profession, email } = req.body;
        if (!name || !String(name).trim() || !batch_year || !String(batch_year).trim()) {
            return res.status(400).json({ error: 'Name and batch year are required.' });
        }

        const isAdmin = await isRequestFromNeonAdmin(req);
        const requestedStatus = req.body.status === 'Approved' ? 'Approved' : 'Pending';
        const status = isAdmin ? requestedStatus : 'Pending';

        let photo_url = null;
        if (req.file) {
            const uploadsDir = path.join(__dirname, '../uploads');
            photo_url = validateAndSaveImageBuffer(req.file.buffer, uploadsDir);
        }

        const alumni = await prisma.alumni.create({
            data: {
                name: String(name).trim(),
                email: email ? String(email).trim() : null,
                batch_year: String(batch_year).trim(),
                profession: profession ? String(profession).trim() : null,
                photo_url,
                status
            },
            select: {
                id: true,
                name: true,
                batch_year: true,
                profession: true,
                photo_url: true,
                status: true,
                applied_at: true
            }
        });

        if (status === 'Pending') {
            sendAdminNotification({
                subject: `New Alumni Registration: ${name} (Batch ${batch_year})`,
                title: 'New Alumni Registration Submitted',
                details: {
                    'Full Name': name,
                    'Batch Year': batch_year,
                    'Profession': profession || 'Not specified',
                    'Email': email || 'Not provided',
                    'Applied Date': new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                    'Status': 'Pending Approval'
                },
                actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:8000'}/dashboard_admin.html`,
                actionText: 'Review Alumni Applications'
            }).catch(err => {
                console.error('[Admin Alert] Error dispatching alumni notification:', err.message);
            });
        }

        res.status(201).json(alumni);
    } catch (error) {
        console.error('Create Alumni Error:', error.message);
        res.status(error.status === 400 ? 400 : 500).json({
            error: error.status === 400 ? error.message : 'Failed to create alumni'
        });
    }
};

exports.deleteAlumni = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const alumni = await prisma.alumni.findUnique({ where: { id } });
        if (!alumni) return res.status(404).json({ error: 'Alumni not found' });

        if (alumni.photo_url && alumni.photo_url.startsWith('/uploads/')) {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '..', alumni.photo_url);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (_) {}
        }

        await prisma.alumni.delete({ where: { id } });
        res.json({ message: 'Alumni permanently deleted from database and storage' });
    } catch (error) {
        console.error('Delete Alumni Error:', error.message);
        res.status(500).json({ error: 'Failed to delete alumni' });
    }
};

exports.updateAlumniStatus = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;

        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const alumni = await prisma.alumni.update({
            where: { id },
            data: { status },
            select: {
                id: true,
                name: true,
                batch_year: true,
                profession: true,
                photo_url: true,
                status: true,
                applied_at: true
            }
        });
        res.json(alumni);
    } catch (error) {
        console.error('Update Alumni Status Error:', error.message);
        res.status(500).json({ error: 'Failed to update alumni status' });
    }
};
