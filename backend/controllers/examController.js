const prisma = require('../prismaClient');

exports.getAllExams = async (req, res) => {
    try {
        const { is_active } = req.query;
        const where = {};
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }
        const exams = await prisma.exam.findMany({ where });
        res.json(exams);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
};

exports.createExam = async (req, res) => {
    try {
        const { name, academic_year } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Exam name is required' });
        }

        const existing = await prisma.exam.findUnique({
            where: { name: name.trim() }
        });
        if (existing) {
            return res.status(400).json({ error: 'Exam already exists' });
        }

        const exam = await prisma.exam.create({
            data: {
                name: name.trim(),
                academic_year: academic_year || '2025-2026'
            }
        });
        res.status(201).json(exam);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create exam' });
    }
};

exports.updateExam = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, academic_year, is_active } = req.body;

        const data = {};
        if (name !== undefined) {
            if (!name || name.trim() === '') {
                return res.status(400).json({ error: 'Exam name cannot be empty' });
            }
            data.name = name.trim();
        }
        if (academic_year !== undefined) {
            data.academic_year = academic_year;
        }
        if (is_active !== undefined) {
            data.is_active = is_active;
        }

        const exam = await prisma.exam.update({
            where: { id: parseInt(id) },
            data
        });
        res.json(exam);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update exam' });
    }
};

exports.deleteExam = async (req, res) => {
    try {
        const { id } = req.params;
        const exam = await prisma.exam.update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });
        res.json({ message: 'Exam soft-deleted successfully', exam });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete exam' });
    }
};
