const prisma = require('../prismaClient');
const { sanitizeText } = require('../utils/sanitize');
const emailService = require('../utils/emailService');

const submitContactQuery = async (req, res) => {
    try {
        const name = sanitizeText(req.body.name);
        const email = sanitizeText(req.body.email);
        const phone = sanitizeText(req.body.phone);
        const message = sanitizeText(req.body.message);

        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
        }

        const query = await prisma.contactQuery.create({
            data: {
                name,
                email,
                phone: phone || null,
                message,
                status: 'Unread'
            }
        });

        // Fire-and-forget email alert to admin
        emailService.sendAdminNotification({
            subject: `New Website Inquiry from ${name}`,
            title: 'New Contact Query Received',
            details: {
                Name: name,
                Email: email,
                Phone: phone || 'N/A',
                Message: message
            },
            actionUrl: 'http://localhost:8000/dashboard_admin.html',
            actionText: 'View in Admin Dashboard'
        }).catch(err => console.error('[Contact] Failed to send admin email alert:', err.message));

        return res.status(201).json({
            success: true,
            message: 'Your query has been submitted successfully. We will get back to you shortly.',
            queryId: query.id
        });
    } catch (error) {
        console.error('[Contact] submitContactQuery error:', error);
        return res.status(500).json({ success: false, message: 'Failed to submit inquiry. Please try again.' });
    }
};

const getContactQueries = async (req, res) => {
    try {
        const { status } = req.query;
        const whereClause = {};
        if (status && (status === 'Unread' || status === 'Read')) {
            whereClause.status = status;
        }

        const queries = await prisma.contactQuery.findMany({
            where: whereClause,
            orderBy: { created_at: 'desc' }
        });

        return res.json(queries);
    } catch (error) {
        console.error('[Contact] getContactQueries error:', error);
        return res.status(500).json({ message: 'Failed to load contact queries.' });
    }
};

const getPendingQueriesCount = async (req, res) => {
    try {
        const count = await prisma.contactQuery.count({
            where: { status: 'Unread' }
        });
        return res.json({ unreadCount: count });
    } catch (error) {
        console.error('[Contact] getPendingQueriesCount error:', error);
        return res.status(500).json({ unreadCount: 0 });
    }
};

const markQueryAsRead = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ message: 'Invalid query ID.' });
        }

        const updated = await prisma.contactQuery.update({
            where: { id },
            data: { status: 'Read' }
        });

        return res.json({ success: true, message: 'Query marked as read.', query: updated });
    } catch (error) {
        console.error('[Contact] markQueryAsRead error:', error);
        return res.status(500).json({ message: 'Failed to update query status.' });
    }
};

const deleteContactQuery = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ message: 'Invalid query ID.' });
        }

        await prisma.contactQuery.delete({
            where: { id }
        });

        return res.json({ success: true, message: 'Query deleted successfully.' });
    } catch (error) {
        console.error('[Contact] deleteContactQuery error:', error);
        return res.status(500).json({ message: 'Failed to delete query.' });
    }
};

module.exports = {
    submitContactQuery,
    getContactQueries,
    getPendingQueriesCount,
    markQueryAsRead,
    deleteContactQuery
};
