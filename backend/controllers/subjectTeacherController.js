const prisma = require('../prismaClient');

exports.getAllSubjectTeachers = async (req, res) => {
    try {
        const { subject_id, teacher_id, is_active } = req.query;
        const where = {};
        if (subject_id) {
            where.subject_id = parseInt(subject_id);
        }
        if (teacher_id) {
            where.teacher_id = parseInt(teacher_id);
        }
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }

        const assignments = await prisma.subjectTeacher.findMany({
            where,
            include: {
                subject: {
                    include: {
                        class: true,
                        medium: true
                    }
                },
                teacher: true
            }
        });
        res.json(assignments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch assignments' });
    }
};

exports.assignSubjectTeacher = async (req, res) => {
    try {
        const { subject_id, teacher_id } = req.body;
        if (!subject_id || !teacher_id) {
            return res.status(400).json({ error: 'Subject ID and Teacher ID are required' });
        }

        // Validate subject exists
        const sub = await prisma.subject.findUnique({
            where: { id: parseInt(subject_id) }
        });
        if (!sub) {
            return res.status(404).json({ error: 'Subject not found' });
        }

        // Validate teacher exists
        const teach = await prisma.teacher.findUnique({
            where: { id: parseInt(teacher_id) }
        });
        if (!teach) {
            return res.status(404).json({ error: 'Teacher not found' });
        }

        // Duplicate prevention
        const existing = await prisma.subjectTeacher.findUnique({
            where: {
                subject_id_teacher_id: {
                    subject_id: parseInt(subject_id),
                    teacher_id: parseInt(teacher_id)
                }
            }
        });
        if (existing) {
            return res.status(400).json({ error: 'This subject is already assigned to this teacher' });
        }

        const assignment = await prisma.subjectTeacher.create({
            data: {
                subject_id: parseInt(subject_id),
                teacher_id: parseInt(teacher_id)
            },
            include: {
                subject: true,
                teacher: true
            }
        });
        res.status(201).json(assignment);
    } catch (error) {
        res.status(500).json({ error: 'Failed to assign subject to teacher' });
    }
};

exports.removeAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete or hard delete depending on design. Since it's a mapping, soft delete is safer.
        const assignment = await prisma.subjectTeacher.update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });
        res.json({ message: 'Assignment removed successfully', assignment });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove assignment' });
    }
};
