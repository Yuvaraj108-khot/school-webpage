const prisma = require('../prismaClient');

// In-memory cache for ultra-fast class lookups
let classCache = null;
let classCacheTime = 0;
const CACHE_TTL_MS = 120000; // 2 minutes

function invalidateClassCache() {
    classCache = null;
    classCacheTime = 0;
}
exports.invalidateClassCache = invalidateClassCache;

exports.getAllClasses = async (req, res) => {
    try {
        const { medium_id, is_active } = req.query;

        const now = Date.now();
        if (!classCache || (now - classCacheTime) > CACHE_TTL_MS) {
            const all = await prisma.schoolClass.findMany({
                include: { medium: true }
            });
            all.sort((a, b) => {
                const numA = parseInt(String(a.name || '').replace(/\D/g, ''), 10);
                const numB = parseInt(String(b.name || '').replace(/\D/g, ''), 10);
                if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
                    return numA - numB;
                }
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
            classCache = all;
            classCacheTime = now;
        }

        let classes = classCache;

        if (medium_id) {
            const mId = parseInt(medium_id, 10);
            classes = classes.filter(c => c.medium_id === mId);
        }

        if (is_active !== undefined) {
            const activeBool = is_active === 'true';
            classes = classes.filter(c => c.is_active === activeBool);
        }

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
        const classId = parseInt(req.params.id, 10);
        // Disconnect students referencing this class
        await prisma.student.updateMany({
            where: { class_id: classId },
            data: { class_id: null }
        }).catch(() => {});

        // Delete subject assignments and subjects linked to this class
        const subjects = await prisma.subject.findMany({ where: { class_id: classId }, select: { id: true } });
        const subjectIds = subjects.map(s => s.id);
        if (subjectIds.length > 0) {
            await prisma.subjectTeacher.deleteMany({ where: { subject_id: { in: subjectIds } } }).catch(() => {});
            await prisma.marks.deleteMany({ where: { subject_id: { in: subjectIds } } }).catch(() => {});
            await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } }).catch(() => {});
        }

        // Hard delete class from database
        const schoolClass = await prisma.schoolClass.delete({
            where: { id: classId }
        });
        res.json({ message: 'Class permanently deleted from database', schoolClass });
    } catch (error) {
        console.error('Delete Class Error:', error);
        res.status(500).json({ error: 'Failed to delete class' });
    }
};
