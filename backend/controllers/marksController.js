const prisma = require('../prismaClient');

exports.getMarksByClass = async (req, res) => {
    try {
        const marks = await prisma.marks.findMany({
            where: { class: req.params.cls }
        });
        res.json(marks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch marks for class' });
    }
};

exports.getMarksByStudent = async (req, res) => {
    try {
        const marks = await prisma.marks.findMany({
            where: { student_code: req.params.code }
        });
        res.json(marks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch marks for student' });
    }
};

exports.createMarks = async (req, res) => {
    try {
        const { student_code, class: className, subject, exam_type, marks } = req.body;
        const markRecord = await prisma.marks.create({
            data: {
                student_code,
                class: className,
                subject,
                exam_type,
                marks: parseInt(marks)
            }
        });
        res.status(201).json(markRecord);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create marks' });
    }
};

exports.getAllMarks = async (req, res) => {
    try {
        const marks = await prisma.marks.findMany();
        res.json(marks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all marks' });
    }
};
