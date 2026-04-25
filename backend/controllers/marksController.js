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
        const { student_code, class: className, medium, subject, exam_type, marks } = req.body;
        
        // Check for existing marks for this specific student/subject/exam
        const existing = await prisma.marks.findFirst({
            where: {
                student_code,
                subject,
                exam_type,
                class: className,
                medium
            }
        });

        if (existing) {
            // Update existing
            const updated = await prisma.marks.update({
                where: { id: existing.id },
                data: { marks: parseInt(marks) }
            });
            return res.json(updated);
        }

        const markRecord = await prisma.marks.create({
            data: {
                student_code,
                class: className,
                medium,
                subject,
                exam_type,
                marks: parseInt(marks)
            }
        });
        res.status(201).json(markRecord);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save marks' });
    }
};
