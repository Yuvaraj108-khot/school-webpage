const prisma = require('../prismaClient');
const { SAFE_STUDENT_SELECT, withDbRetry } = require('../utils/accountProvisioning');

function validateMarksScore(rawMarks, maxMarks = 1000) {
    if (rawMarks === undefined || rawMarks === null || typeof rawMarks === 'boolean') {
        return null;
    }
    const str = String(rawMarks).trim();
    if (!str) {
        return null;
    }
    const num = Number(str);
    if (!Number.isFinite(num) || num < 0 || (maxMarks && num > maxMarks)) {
        return null;
    }
    return Math.round(num);
}

function validateMarksTotal(rawTotal) {
    if (rawTotal === undefined || rawTotal === null || typeof rawTotal === 'boolean') {
        return 100;
    }
    const num = parseInt(String(rawTotal).trim(), 10);
    return (Number.isFinite(num) && num > 0) ? num : 100;

}

function validateMarksTotal(rawTotal) {
    if (rawTotal === undefined || rawTotal === null || typeof rawTotal === 'boolean') {
        return 100;
    }
    const num = parseInt(String(rawTotal).trim(), 10);
    return (Number.isFinite(num) && num > 0) ? num : 100;
}

// Resolve relational helper
async function resolveRelationalIds(student_code, className, mediumName, subjectName, examName, db = prisma) {
    let studentId = null;
    let subjectId = null;
    let examId = null;
    let classId = null;
    let mediumId = null;

    if (student_code) {
        const student = await db.student.findUnique({
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
        const med = await db.medium.findUnique({
            where: { name: medName }
        });
        if (med) {
            mediumId = med.id;
        }
    }

    if (!classId && className && mediumId) {
        const clsName = className.replace(/\D/g, '');
        const cls = await db.schoolClass.findUnique({
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
        const sub = await db.subject.findUnique({
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

    if (examName) {
        const exam = await db.exam.findUnique({
            where: { name: examName }
        });
        if (exam) {
            examId = exam.id;
        }
    }

    return { studentId, classId, mediumId, subjectId, examId };
}

exports.getMarksByClass = async (req, res) => {
    try {
        const { cls } = req.params;
        const marks = await prisma.marks.findMany({
            where: { class: cls },
            include: {
                student: { select: SAFE_STUDENT_SELECT },
                subject_rel: true,
                exam: true
            }
        });
        res.json(marks);
    } catch (error) {
        console.error('Error fetching marks for class:', error.message);
        res.status(500).json({ error: 'Failed to fetch marks for class' });
    }
};

exports.getMarksByStudent = async (req, res) => {
    try {
        const { code } = req.params;
        const marks = await prisma.marks.findMany({
            where: { student_code: code },
            include: {
                student: { select: SAFE_STUDENT_SELECT },
                subject_rel: true,
                exam: true
            }
        });
        res.json(marks);
    } catch (error) {
        console.error('Error fetching marks for student:', error.message);
        res.status(500).json({ error: 'Failed to fetch marks for student' });
    }
};

exports.createMarks = async (req, res) => {
    try {
        const { student_code, class: className, medium, subject, exam_type, marks, total } = req.body;
        
        if (!student_code || !subject || !exam_type || marks === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const validatedTotal = validateMarksTotal(total);
        const validatedScore = validateMarksScore(marks, validatedTotal);
        if (validatedScore === null) {
            return res.status(400).json({ error: `Marks must be a valid number between 0 and ${validatedTotal}.` });
        }

        // Resolve relational mappings
        const ids = await resolveRelationalIds(student_code, className, medium, subject, exam_type);

        let result;
        if (ids.studentId && ids.subjectId && ids.examId) {
            // Safe upsert on database unique constraint
            result = await prisma.marks.upsert({
                where: {
                    student_id_subject_id_exam_id: {
                        student_id: ids.studentId,
                        subject_id: ids.subjectId,
                        exam_id: ids.examId
                    }
                },
                update: {
                    marks: validatedScore,
                    total: validatedTotal,
                    // Keep legacy field updated too
                    student_code,
                    class: className,
                    medium,
                    subject,
                    exam_type
                },
                create: {
                    student_id: ids.studentId,
                    subject_id: ids.subjectId,
                    exam_id: ids.examId,
                    marks: validatedScore,
                    total: validatedTotal,
                    student_code,
                    class: className,
                    medium,
                    subject,
                    exam_type
                }
            });
        } else {
            // Fallback for legacy items without perfect relational resolution
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
                result = await prisma.marks.update({
                    where: { id: existing.id },
                    data: {
                        marks: validatedScore,
                        total: validatedTotal
                    }
                });
            } else {
                result = await prisma.marks.create({
                    data: {
                        student_code,
                        class: className,
                        medium,
                        subject,
                        exam_type,
                        marks: validatedScore,
                        total: validatedTotal
                    }
                });
            }
        }

        res.status(201).json(result);
    } catch (error) {
        console.error('Error saving marks:', error.message);
        res.status(500).json({ error: 'Failed to save marks' });
    }
};

exports.createMarksBulk = async (req, res) => {
    try {
        const { class: className, medium, subject, exam_type, marks_list } = req.body;

        if (!subject || !exam_type || !marks_list || !Array.isArray(marks_list)) {
            return res.status(400).json({ error: 'Invalid payload structure' });
        }

        const defaultTotal = validateMarksTotal(req.body.total);

        for (const item of marks_list) {
            const itemTotal = validateMarksTotal(item.total || defaultTotal);
            if (!item || typeof item.student_code !== 'string' || !item.student_code.trim() || validateMarksScore(item.marks, itemTotal) === null) {
                return res.status(400).json({ error: `Marks must be a valid number between 0 and ${itemTotal} for every student entry.` });
            }
        }

        // Resolve shared metadata (Medium, Class, Exam, Subject, and Students) in parallel ONCE upfront
        const codes = marks_list.map(i => i.student_code.trim());
        const medName = medium === 'CBSE' ? 'English' : medium;
        const clsName = className ? className.replace(/\D/g, '') : '';

        const [med, exam, students] = await Promise.all([
            medName ? prisma.medium.findUnique({ where: { name: medName } }) : null,
            exam_type ? prisma.exam.findUnique({ where: { name: exam_type } }) : null,
            prisma.student.findMany({ where: { student_code: { in: codes } } })
        ]);

        const mediumId = med?.id || null;
        let classId = null;
        if (mediumId && clsName) {
            const cls = await prisma.schoolClass.findUnique({
                where: { name_medium_id: { name: clsName, medium_id: mediumId } }
            });
            classId = cls?.id || null;
        }

        let subjectId = null;
        if (subject && classId && mediumId) {
            const sub = await prisma.subject.findUnique({
                where: { name_class_id_medium_id: { name: subject, class_id: classId, medium_id: mediumId } }
            });
            subjectId = sub?.id || null;
        }
        const examId = exam?.id || null;
        const studentMap = new Map(students.map(s => [s.student_code, s]));

        // Execute all marks upserts concurrently inside a single transaction
        const results = await withDbRetry(() => prisma.$transaction(async (tx) => {
            return Promise.all(marks_list.map(async (item) => {
                const code = item.student_code.trim();
                const itemTotal = validateMarksTotal(item.total || defaultTotal);
                const validatedScore = validateMarksScore(item.marks, itemTotal);
                const student = studentMap.get(code);
                const studentId = student?.id || null;

                if (studentId && subjectId && examId) {
                    return tx.marks.upsert({
                        where: {
                            student_id_subject_id_exam_id: {
                                student_id: studentId,
                                subject_id: subjectId,
                                exam_id: examId
                            }
                        },
                        update: {
                            marks: validatedScore,
                            total: itemTotal,
                            student_code: code,
                            class: className,
                            medium,
                            subject,
                            exam_type
                        },
                        create: {
                            student_id: studentId,
                            subject_id: subjectId,
                            exam_id: examId,
                            marks: validatedScore,
                            total: itemTotal,
                            student_code: code,
                            class: className,
                            medium,
                            subject,
                            exam_type
                        }
                    });
                } else {
                    const existing = await tx.marks.findFirst({
                        where: {
                            student_code: code,
                            subject,
                            exam_type,
                            class: className,
                            medium
                        }
                    });

                    if (existing) {
                        return tx.marks.update({
                            where: { id: existing.id },
                            data: {
                                marks: validatedScore,
                                total: itemTotal
                            }
                        });
                    } else {
                        return tx.marks.create({
                            data: {
                                student_code: code,
                                class: className,
                                medium,
                                subject,
                                exam_type,
                                marks: validatedScore,
                                total: itemTotal
                            }
                        });
                    }
                }
            }));
        }, {
            maxWait: 15000,
            timeout: 60000
        }));

        res.json({ message: `Successfully saved ${results.length} marks in bulk`, results });
    } catch (error) {
        console.error('Error saving bulk marks:', error.message);
        res.status(500).json({ error: 'Failed to save bulk marks' });
    }
};

exports.getAllMarks = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const totalItems = await prisma.marks.count();
        const marks = await prisma.marks.findMany({
            skip,
            take: parseInt(limit),
            include: {
                student: { select: SAFE_STUDENT_SELECT },
                subject_rel: true,
                exam: true
            }
        });

        res.json({
            data: marks,
            pagination: {
                totalItems,
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalItems / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching all marks:', error.message);
        res.status(500).json({ error: 'Failed to fetch all marks' });
    }
};
