const prisma = require('../prismaClient');

exports.getNotices = async (req, res) => {
    try {
        const notices = await prisma.notice.findMany({
            orderBy: { date: 'desc' }
        });
        res.json(notices);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notices' });
    }
};

exports.createNotice = async (req, res) => {
    try {
        const { title, description, date } = req.body;
        const notice = await prisma.notice.create({
            data: {
                title,
                description,
                date: date ? new Date(date).toISOString() : new Date().toISOString()
            }
        });
        res.status(201).json(notice);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create notice' });
    }
};

exports.deleteNotice = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const notice = await prisma.notice.findUnique({ where: { id } });
        if (!notice) return res.status(404).json({ error: 'Notice not found' });
        
        await prisma.notice.delete({ where: { id } });
        res.json({ message: 'Notice deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete notice' });
    }
};
