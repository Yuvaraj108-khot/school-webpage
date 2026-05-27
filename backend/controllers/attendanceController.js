const prisma = require('../prismaClient');

// Resolve relational helper
async function resolveRelationalIds(student_code, className, mediumName, subjectName) {
    let studentId = null;
    let subjectId = null;
    let classId = null;
    let mediumId = null;

    if (student_code) {
        const student = await prisma.student.findUnique({
            where: { student_code }
        });
        if (student) {
            studentId = student.id;
            classId = student.class_id;
            mediumId = student.medium_id;
        }
    }

    if (!mediumId && mediumName) {
        const medName = mediumName === 'CBSE' ? 'English' : mediumName;
        const med = await prisma.medium.findUnique({
            where: { name: medName }
        });
        if (med) {
            mediumId = med.id;
        }
    }

    if (!classId && className && mediumId) {
        const clsName = className.replace(/\D/g, '');
        const cls = await prisma.schoolClass.findUnique({
            where: {
                name_medium_id: {
                    name: clsName,
                    medium_id: mediumId
                }
            }
        });
        if (cls) {
            classId = cls.id;
        }
    }

    if (subjectName && classId && mediumId) {
        const sub = await prisma.subject.findUnique({
            where: {
                name_class_id_medium_id: {
                    name: subjectName,
                    class_id: classId,
                    medium_id: mediumId
                }
            }
        });
        if (sub) {
            subjectId = sub.id;
        }
    }

    return { studentId, classId, mediumId, subjectId };
}

exports.getAttendanceByClass = async (req, res) => {
    try {
        const { cls } = req.params;
        const attendance = await prisma.attendance.findMany({
            where: { class: cls },
            include: {
                student: true,
                subject_rel: true
            }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance for class' });
    }
};

exports.getAttendanceByStudent = async (req, res) => {
    try {
        const { code } = req.params;
        const attendance = await prisma.attendance.findMany({
            where: { student_code: code },
            include: {
                student: true,
                subject_rel: true
            }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance for student' });
    }
};

exports.createAttendance = async (req, res) => {
    try {
        const { student_code, class: className, medium, period, subject, teacher_name, date, status } = req.body;
        
        if (!student_code || !period || !subject || !date || !status) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const dateObj = new Date(date);
        const dayString = dateObj.toISOString().split('T')[0]; // Format YYYY-MM-DD

        // Resolve relational mappings
        const ids = await resolveRelationalIds(student_code, className, medium, subject);

        let result;
        if (ids.studentId && ids.subjectId) {
            // Safe upsert on database unique constraint
            result = await prisma.attendance.upsert({
                where: {
                    student_id_subject_id_attendance_day_period: {
                        student_id: ids.studentId,
                        subject_id: ids.subjectId,
                        attendance_day: dayString,
                        period: String(period)
                    }
                },
                update: {
                    status,
                    teacher_name,
                    date: dateObj.toISOString(),
                    // Keep legacy fields updated
                    student_code,
                    class: className,
                    medium,
                    period: String(period),
                    subject
                },
                create: {
                    student_id: ids.studentId,
                    subject_id: ids.subjectId,
                    attendance_day: dayString,
                    period: String(period),
                    status,
                    teacher_name,
                    date: dateObj.toISOString(),
                    student_code,
                    class: className,
                    medium,
                    subject
                }
            });
        } else {
            // Fallback for legacy items
            const startOfDay = new Date(date);
            startOfDay.setHours(0,0,0,0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23,59,59,999);

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
                result = await prisma.attendance.update({
                    where: { id: existing.id },
                    data: { status, teacher_name }
                });
            } else {
                result = await prisma.attendance.create({
                    data: {
                        student_code,
                        class: className,
                        medium,
                        period: String(period),
                        subject,
                        teacher_name,
                        date: dateObj.toISOString(),
                        status
                    }
                });
            }
        }

        res.status(201).json(result);
    } catch (error) {
        console.error('Error saving attendance:', error);
        res.status(500).json({ error: 'Failed to save attendance' });
    }
};

exports.createAttendanceBulk = async (req, res) => {
    try {
        const { class: className, medium, period, subject, teacher_name, date, attendance_list } = req.body;

        if (!period || !subject || !date || !attendance_list || !Array.isArray(attendance_list)) {
            return res.status(400).json({ error: 'Invalid payload structure' });
        }

        const dateObj = new Date(date);
        const dayString = dateObj.toISOString().split('T')[0];
        const results = [];

        await prisma.$transaction(async (tx) => {
            for (const item of attendance_list) {
                const code = item.student_code;
                const status = item.status;

                // Resolve relational mappings
                const ids = await resolveRelationalIds(code, className, medium, subject);

                if (ids.studentId && ids.subjectId) {
                    const result = await tx.attendance.upsert({
                        where: {
                            student_id_subject_id_attendance_day_period: {
                                student_id: ids.studentId,
                                subject_id: ids.subjectId,
                                attendance_day: dayString,
                                period: String(period)
                            }
                        },
                        update: {
                            status,
                            teacher_name,
                            date: dateObj.toISOString(),
                            student_code: code,
                            class: className,
                            medium,
                            period: String(period),
                            subject
                        },
                        create: {
                            student_id: ids.studentId,
                            subject_id: ids.subjectId,
                            attendance_day: dayString,
                            period: String(period),
                            status,
                            teacher_name,
                            date: dateObj.toISOString(),
                            student_code: code,
                            class: className,
                            medium,
                            subject
                        }
                    });
                    results.push(result);
                } else {
                    // Fallback legacy
                    const startOfDay = new Date(date);
                    startOfDay.setHours(0,0,0,0);
                    const endOfDay = new Date(date);
                    endOfDay.setHours(23,59,59,999);

                    const existing = await tx.attendance.findFirst({
                        where: {
                            student_code: code,
                            class: className,
                            medium,
                            period: String(period),
                            date: {
                                gte: startOfDay,
                                lte: endOfDay
                            }
                        }
                    });

                    let result;
                    if (existing) {
                        result = await tx.attendance.update({
                            where: { id: existing.id },
                            data: { status, teacher_name }
                        });
                    } else {
                        result = await tx.attendance.create({
                            data: {
                                student_code: code,
                                class: className,
                                medium,
                                period: String(period),
                                subject,
                                teacher_name,
                                date: dateObj.toISOString(),
                                status
                            }
                        });
                    }
                    results.push(result);
                }
            }
        }, {
            maxWait: 15000,
            timeout: 60000
        });

        res.json({ message: `Successfully recorded bulk attendance for ${results.length} students`, results });
    } catch (error) {
        console.error('Error saving bulk attendance:', error);
        res.status(500).json({ error: 'Failed to save bulk attendance' });
    }
};

exports.getAllAttendance = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const totalItems = await prisma.attendance.count();
        const attendance = await prisma.attendance.findMany({
            skip,
            take: parseInt(limit),
            orderBy: { date: 'desc' },
            include: {
                student: true,
                subject_rel: true
            }
        });

        res.json({
            data: attendance,
            pagination: {
                totalItems,
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalItems / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all attendance' });
    }
};
