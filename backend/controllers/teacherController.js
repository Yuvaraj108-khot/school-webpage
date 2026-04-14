const prisma = require('../prismaClient');

exports.getTeachers = async (req, res) => {
    try {
        const teachers = await prisma.teacher.findMany();
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch teachers' });
    }
};

exports.createTeacher = async (req, res) => {
    try {
        const { name, subject, medium } = req.body;
        const teacher = await prisma.teacher.create({
            data: { name, subject, medium }
        });
        res.status(201).json(teacher);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create teacher' });
    }
};

exports.deleteTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const teacher = await prisma.teacher.findUnique({ where: { id } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        
        await prisma.teacher.delete({ where: { id } });
        res.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete teacher' });
    }
};
