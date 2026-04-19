const prisma = require('../prismaClient');

exports.getAllAttendance = async (req, res) => {
    try {
        const attendance = await prisma.attendance.findMany({
            orderBy: { date: 'desc' }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all attendance' });
    }
};

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
        const { student_code, class: className, medium, period, subject, teacher_name, date, status } = req.body;
        
        const startOfDay = new Date(date);
        startOfDay.setHours(0,0,0,0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23,59,59,999);

        // Check if attendance for this specific student/period/day already exists
        const existing = await prisma.attendance.findFirst({
            where: {
                student_code,
                class: className,
                medium,
                period: String(period),
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'Attendance already recorded for this session' });
        }

        const attendance = await prisma.attendance.create({
            data: {
                student_code,
                class: className,
                medium,
                period: String(period),
                subject,
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
