const prisma = require('../prismaClient');

// In-memory cache for exams to guarantee instantaneous dropdowns (<5ms)
let cachedExams = null;
let lastExamsFetch = 0;
const EXAMS_CACHE_TTL_MS = 120000; // 2 minutes

function clearExamsCache() {
    cachedExams = null;
    lastExamsFetch = 0;
}

exports.clearExamsCache = clearExamsCache;

exports.getAllExams = async (req, res) => {
    try {
        const { is_active } = req.query;
        const now = Date.now();
        if (cachedExams && (now - lastExamsFetch < EXAMS_CACHE_TTL_MS)) {
            let filtered = cachedExams;
            if (is_active !== undefined) {
                const activeBool = is_active === 'true';
                filtered = cachedExams.filter(e => e.is_active === activeBool);
            }
            return res.json(filtered);
        }

        const where = {};
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }
        let exams = await prisma.exam.findMany({ orderBy: { id: 'asc' } });
        if (!exams || exams.length === 0) {
            const defaults = ['Unit Test 1', 'Unit Test 2', 'Mid-Term Exam', 'Annual / Final Exam'];
            for (const name of defaults) {
                await prisma.exam.upsert({
                    where: { name },
                    update: { is_active: true },
                    create: { name, academic_year: '2025-2026', is_active: true }
                }).catch(() => {});
            }
            exams = await prisma.exam.findMany({ orderBy: { id: 'asc' } });
        }

        cachedExams = exams;
        lastExamsFetch = now;

        let result = exams;
        if (is_active !== undefined) {
            const activeBool = is_active === 'true';
            result = exams.filter(e => e.is_active === activeBool);
        }
        res.json(result);
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
        clearExamsCache();
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
        clearExamsCache();
        res.json(exam);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update exam' });
    }
};

exports.deleteExam = async (req, res) => {
    try {
        const examId = parseInt(req.params.id, 10);
        await prisma.marks.deleteMany({ where: { exam_id: examId } }).catch(() => {});
        const exam = await prisma.exam.delete({
            where: { id: examId }
        });
        clearExamsCache();
        res.json({ message: 'Exam permanently deleted from database', exam });
    } catch (error) {
        console.error('Delete Exam Error:', error);
        res.status(500).json({ error: 'Failed to delete exam' });
    }
};
