const prisma = require('../prismaClient');

exports.getAllClasses = async (req, res) => {
    try {
        const { medium_id, is_active } = req.query;
        const where = {};
        if (medium_id) {
            where.medium_id = parseInt(medium_id);
        }
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }

        const classes = await prisma.schoolClass.findMany({
            where,
            include: { medium: true }
        });
        res.json(classes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch classes' });
    }
};

exports.createClass = async (req, res) => {
    try {
        const { name, medium_id } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Class name is required' });
        }
        if (!medium_id) {
            return res.status(400).json({ error: 'Medium ID is required' });
        }

        // Validate medium exists
        const med = await prisma.medium.findUnique({
            where: { id: parseInt(medium_id) }
        });
        if (!med) {
            return res.status(404).json({ error: 'Medium not found' });
        }

        // Duplicate prevention
        const existing = await prisma.schoolClass.findUnique({
            where: {
                name_medium_id: {
                    name: name.trim(),
                    medium_id: parseInt(medium_id)
                }
            }
        });
        if (existing) {
            return res.status(400).json({ error: 'Class already exists under this medium' });
        }

        const schoolClass = await prisma.schoolClass.create({
            data: {
                name: name.trim(),
                medium_id: parseInt(medium_id)
            },
            include: { medium: true }
        });
        res.status(201).json(schoolClass);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create class' });
    }
};

exports.updateClass = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, is_active } = req.body;

        const data = {};
        if (name !== undefined) {
            if (!name || name.trim() === '') {
                return res.status(400).json({ error: 'Class name cannot be empty' });
            }
            data.name = name.trim();
        }
        if (is_active !== undefined) {
            data.is_active = is_active;
        }

        const schoolClass = await prisma.schoolClass.update({
            where: { id: parseInt(id) },
            data,
            include: { medium: true }
        });
        res.json(schoolClass);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update class' });
    }
};

exports.deleteClass = async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete
        const schoolClass = await prisma.schoolClass.update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });
        res.json({ message: 'Class soft-deleted successfully', schoolClass });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete class' });
    }
};
