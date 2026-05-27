const prisma = require('../prismaClient');

exports.getAllMediums = async (req, res) => {
    try {
        const { is_active } = req.query;
        const where = {};
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }
        const mediums = await prisma.medium.findMany({ where });
        res.json(mediums);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch mediums' });
    }
};

exports.createMedium = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Medium name is required' });
        }

        const existing = await prisma.medium.findUnique({
            where: { name: name.trim() }
        });
        if (existing) {
            return res.status(400).json({ error: 'Medium already exists' });
        }

        const medium = await prisma.medium.create({
            data: { name: name.trim() }
        });
        res.status(201).json(medium);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create medium' });
    }
};

exports.updateMedium = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, is_active } = req.body;

        const data = {};
        if (name !== undefined) {
            if (!name || name.trim() === '') {
                return res.status(400).json({ error: 'Medium name cannot be empty' });
            }
            data.name = name.trim();
        }
        if (is_active !== undefined) {
            data.is_active = is_active;
        }

        const medium = await prisma.medium.update({
            where: { id: parseInt(id) },
            data
        });
        res.json(medium);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update medium' });
    }
};

exports.deleteMedium = async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete
        const medium = await prisma.medium.update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });
        res.json({ message: 'Medium soft-deleted successfully', medium });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete medium' });
    }
};
