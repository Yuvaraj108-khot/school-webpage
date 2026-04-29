const prisma = require('../prismaClient');

exports.getAttendanceByClass = async (req, res) => {
    try {
        const attendance = await prisma.attendance.findMany({
            where: { class: req.params.cls }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance for class' });
    }
};

exports.getAttendanceByStudent = async (req, res) => {
    try {
        const attendance = await prisma.attendance.findMany({
            where: { student_code: req.params.code }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance for student' });
    }
};

exports.createAttendance = async (req, res) => {
    try {
        const { student_code, class: className, teacher_name, date, status } = req.body;
        const attendance = await prisma.attendance.create({
            data: {
                student_code,
                class: className,
                teacher_name,
                date: new Date(date).toISOString(),
                status
            }
        });
        res.status(201).json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create attendance' });
    }
};

exports.getAllAttendance = async (req, res) => {
    try {
        const attendance = await prisma.attendance.findMany();
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all attendance' });
    }
};
