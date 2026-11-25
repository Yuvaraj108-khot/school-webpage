const prisma = require('../prismaClient');

async function getTeacherAssignedSubjectIds(req) {
    if (!req.auth || req.auth.role !== 'teacher' || !req.auth.teacher) {
        return null;
    }
    const assignments = await prisma.subjectTeacher.findMany({
        where: {
            teacher_id: req.auth.teacher.id,
            is_active: true,
            subject: { is_active: true }
        },
        select: { subject_id: true }
    });
    if (assignments.length === 0) {
        return null;
    }
    return assignments.map((a) => a.subject_id);
}

// ==================== LEGACY ENDPOINTS ====================

exports.getSubjectsByClass = async (req, res) => {
    try {
        const { class: className, medium } = req.query;
        if (!className || !medium) {
            return res.json([]);
        }
        
        // Resolve medium_id
        const medName = medium === 'CBSE' ? 'English' : medium;
        const med = await prisma.medium.findUnique({ where: { name: medName } });
        if (!med) return res.json([]);

        // Resolve class_id
        const clsName = className.replace(/\D/g, ''); // Extract '10' from 'Class 10'
        const cls = await prisma.schoolClass.findUnique({
            where: { name_medium_id: { name: clsName, medium_id: med.id } }
        });
        if (!cls) return res.json([]);

        const assignedSubjectIds = await getTeacherAssignedSubjectIds(req);
        const where = {
            class_id: cls.id,
            medium_id: med.id,
            is_active: true
        };
        if (assignedSubjectIds !== null) {
            where.id = { in: assignedSubjectIds };
        }

        const subjects = await prisma.subject.findMany({
            where,
            orderBy: { name: 'asc' }
        });
        
        // Map to legacy format
        const legacySubjects = subjects.map(s => ({
            id: s.id,
            subject: s.name,
            class: className,
            medium: medium
        }));
        
        res.json(legacySubjects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
};

exports.addSubjectToClass = async (req, res) => {
    try {
        const { class: className, medium, subject } = req.body;
        if (!className || !medium || !subject) {
            return res.status(400).json({ error: 'Class, medium, and subject are required' });
        }
        
        // Resolve medium_id
        const medName = medium === 'CBSE' ? 'English' : medium;
        const med = await prisma.medium.findUnique({ where: { name: medName } });
        if (!med) return res.status(404).json({ error: 'Medium not found' });

        // Resolve class_id
        const clsName = className.replace(/\D/g, ''); // Extract '10' from 'Class 10' or '10'
        const cls = await prisma.schoolClass.findUnique({
            where: { name_medium_id: { name: clsName, medium_id: med.id } }
        });
        if (!cls) return res.status(404).json({ error: 'Class not found' });

        // Check for duplicates
        const existing = await prisma.subject.findUnique({
            where: {
                name_class_id_medium_id: {
                    name: subject.trim(),
                    class_id: cls.id,
                    medium_id: med.id
                }
            }
        });

        if (existing) {
            if (existing.is_active) {
                return res.status(400).json({ error: 'This subject is already added to this class' });
            }
            const reactivated = await prisma.subject.update({
                where: { id: existing.id },
                data: { is_active: true }
            });
            return res.status(201).json(reactivated);
        }

        const newSubject = await prisma.subject.create({
            data: { 
                name: subject.trim(),
                class_id: cls.id,
                medium_id: med.id
            }
        });
        res.status(201).json(newSubject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add subject' });
    }
};

exports.removeSubjectFromClass = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.subject.update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });
        res.json({ message: 'Subject soft-removed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove subject' });
    }
};

// ==================== NEW RELATIONAL ENDPOINTS ====================

// In-memory cache for ultra-fast subject lookups
let subjectCache = null;
let subjectCacheTime = 0;
const CACHE_TTL_MS = 120000;

exports.getAllSubjects = async (req, res) => {
    try {
        const { class_id, medium_id, is_active } = req.query;

        const now = Date.now();
        if (!subjectCache || (now - subjectCacheTime) > CACHE_TTL_MS) {
            subjectCache = await prisma.subject.findMany({
                orderBy: { name: 'asc' },
                include: {
                    class: true,
                    medium: true
                }
            });
            subjectCacheTime = now;
        }

        let subjects = subjectCache;

        if (class_id) {
            const cid = parseInt(class_id, 10);
            subjects = subjects.filter(s => s.class_id === cid);
        }
        if (medium_id) {
            const mid = parseInt(medium_id, 10);
            subjects = subjects.filter(s => s.medium_id === mid);
        }
        if (is_active !== undefined) {
            const activeBool = is_active === 'true';
            subjects = subjects.filter(s => s.is_active === activeBool);
        }

        const assignedSubjectIds = await getTeacherAssignedSubjectIds(req);
        if (assignedSubjectIds !== null) {
            const assignedSet = new Set(assignedSubjectIds);
            subjects = subjects.filter(s => assignedSet.has(s.id));
        }

        res.json(subjects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
};

exports.createRelationalSubject = async (req, res) => {
    try {
        const { name, class_id, medium_id } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Subject name is required' });
        }
        if (!class_id || !medium_id) {
            return res.status(400).json({ error: 'Class ID and Medium ID are required' });
        }

        // Validate class & medium existence
        const cls = await prisma.schoolClass.findUnique({
            where: { id: parseInt(class_id) }
        });
        if (!cls) {
            return res.status(404).json({ error: 'SchoolClass not found' });
        }

        const med = await prisma.medium.findUnique({
            where: { id: parseInt(medium_id) }
        });
        if (!med) {
            return res.status(404).json({ error: 'Medium not found' });
        }

        // Duplicate prevention
        const existing = await prisma.subject.findUnique({
            where: {
                name_class_id_medium_id: {
                    name: name.trim(),
                    class_id: parseInt(class_id),
                    medium_id: parseInt(medium_id)
                }
            }
        });
        if (existing) {
            if (existing.is_active) {
                return res.status(400).json({ error: 'Subject already exists for this class and medium' });
            }
            const reactivated = await prisma.subject.update({
                where: { id: existing.id },
                data: { is_active: true },
                include: {
                    class: true,
                    medium: true
                }
            });
            return res.status(201).json(reactivated);
        }

        const subject = await prisma.subject.create({
            data: {
                name: name.trim(),
                class_id: parseInt(class_id),
                medium_id: parseInt(medium_id)
            },
            include: {
                class: true,
                medium: true
            }
        });
        res.status(201).json(subject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create subject' });
    }
};

exports.updateRelationalSubject = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, is_active } = req.body;

        const data = {};
        if (name !== undefined) {
            if (!name || name.trim() === '') {
                return res.status(400).json({ error: 'Subject name cannot be empty' });
            }
            data.name = name.trim();
        }
        if (is_active !== undefined) {
            data.is_active = is_active;
        }

        const subject = await prisma.subject.update({
            where: { id: parseInt(id) },
            data,
            include: {
                class: true,
                medium: true
            }
        });
        res.json(subject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update subject' });
    }
};

exports.deleteRelationalSubject = async (req, res) => {
    try {
        const subjectId = parseInt(req.params.id, 10);
        await prisma.subjectTeacher.deleteMany({ where: { subject_id: subjectId } }).catch(() => {});
        await prisma.marks.deleteMany({ where: { subject_id: subjectId } }).catch(() => {});
        const subject = await prisma.subject.delete({
            where: { id: subjectId }
        });
        res.json({ message: 'Subject permanently deleted from database', subject });
    } catch (error) {
        console.error('Delete Subject Error:', error);
        res.status(500).json({ error: 'Failed to delete subject' });
    }
};
