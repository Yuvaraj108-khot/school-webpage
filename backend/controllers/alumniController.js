const prisma = require('../prismaClient');

exports.getAlumni = async (req, res) => {
    try {
        const alumni = await prisma.alumni.findMany();
        res.json(alumni);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alumni' });
    }
};

exports.createAlumni = async (req, res) => {
    try {
        const { name, batch_year, profession } = req.body;
        const alumni = await prisma.alumni.create({
            data: { name, batch_year, profession }
        });
        res.status(201).json(alumni);
    } catch (error) {
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
