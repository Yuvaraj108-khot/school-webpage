const prisma = require('../prismaClient');
const supabase = require('../supabaseClient');

exports.getAlumni = async (req, res) => {
    try {
        const { status } = req.query;
        let whereClause = {};
        if (status) {
            whereClause.status = status;
        }
        const alumni = await prisma.alumni.findMany({ where: whereClause, orderBy: { applied_at: 'desc' } });
        res.json(alumni);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alumni' });
    }
};

exports.createAlumni = async (req, res) => {
    try {
        const { name, batch_year, profession, email } = req.body;
        const status = req.body.status || 'Pending';
        
        let photo_url = null;
        if (req.file) {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const cleanFileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            fs.writeFileSync(path.join(uploadsDir, cleanFileName), req.file.buffer);
            photo_url = `/uploads/${cleanFileName}`;
        }

        const alumni = await prisma.alumni.create({
            data: { name, email, batch_year, profession, photo_url, status }
        });
        res.status(201).json(alumni);
    } catch (error) {
        console.error("Create Alumni Error:", error);
        res.status(500).json({ error: 'Failed to create alumni' });
    }
};

exports.deleteAlumni = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const alumni = await prisma.alumni.findUnique({ where: { id } });
        if (!alumni) return res.status(404).json({ error: 'Alumni not found' });
        
        await prisma.alumni.delete({ where: { id } });
        res.json({ message: 'Alumni deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete alumni' });
    }
};

exports.updateAlumniStatus = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;
        
        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const alumni = await prisma.alumni.update({
            where: { id },
            data: { status }
        });
        res.json(alumni);
    } catch (error) {
        console.error("Update Alumni Status Error:", error);
        res.status(500).json({ error: 'Failed to update alumni status' });
    }
};
