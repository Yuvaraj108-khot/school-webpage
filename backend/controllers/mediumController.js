const prisma = require('../prismaClient');

let mediumCache = null;
let mediumCacheTime = 0;
const CACHE_TTL_MS = 120000;

exports.getAllMediums = async (req, res) => {
    try {
        const { is_active } = req.query;
        const now = Date.now();
        if (!mediumCache || (now - mediumCacheTime) > CACHE_TTL_MS) {
            mediumCache = await prisma.medium.findMany({
                orderBy: { id: 'asc' }
            });
            mediumCacheTime = now;
        }
        let result = mediumCache;
        if (is_active !== undefined) {
            const activeBool = is_active === 'true';
            result = result.filter(m => m.is_active === activeBool);
        }
        res.json(result);
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
        const mediumId = parseInt(req.params.id, 10);
        await prisma.student.updateMany({ where: { medium_id: mediumId }, data: { medium_id: null } }).catch(() => {});
        await prisma.subject.deleteMany({ where: { medium_id: mediumId } }).catch(() => {});
        await prisma.schoolClass.deleteMany({ where: { medium_id: mediumId } }).catch(() => {});
        const medium = await prisma.medium.delete({
            where: { id: mediumId }
        });
        res.json({ message: 'Medium permanently deleted from database', medium });
    } catch (error) {
        console.error('Delete Medium Error:', error);
        res.status(500).json({ error: 'Failed to delete medium' });
    }
};
