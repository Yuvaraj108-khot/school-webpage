const prisma = require('../prismaClient');
const { SAFE_STUDENT_SELECT, withDbRetry } = require('../utils/accountProvisioning');

function validateMarksScore(rawMarks) {
    if (rawMarks === undefined || rawMarks === null || typeof rawMarks === 'boolean') {
        return null;
    }
    const str = String(rawMarks).trim();
    if (!str) {
        return null;
    }
    const num = Number(str);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 100) {
        return null;
    }
    return num;
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
        const { student_code, class: className, medium, subject, exam_type, marks } = req.body;
        
        if (!student_code || !subject || !exam_type || marks === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const validatedScore = validateMarksScore(marks);
        if (validatedScore === null) {
            return res.status(400).json({ error: 'Marks must be a valid integer between 0 and 100.' });
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
                    student_code,
                    class: className,
                    medium,
                    subject,
                    exam_type,
                    total: 100
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
                    data: { marks: validatedScore }
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
                        total: 100
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

        for (const item of marks_list) {
            if (!item || typeof item.student_code !== 'string' || !item.student_code.trim() || validateMarksScore(item.marks) === null) {
                return res.status(400).json({ error: 'Marks must be a valid integer between 0 and 100 for every student entry.' });
            }
        }

        // Execute in transaction to ensure safety
        const results = await withDbRetry(() => prisma.$transaction(async (tx) => {
            const txResults = [];
            for (const item of marks_list) {
                const code = item.student_code.trim();
                const validatedScore = validateMarksScore(item.marks);

                // Resolve relational mappings on the active transaction client
                const ids = await resolveRelationalIds(code, className, medium, subject, exam_type, tx);

                if (ids.studentId && ids.subjectId && ids.examId) {
                    const result = await tx.marks.upsert({
                        where: {
                            student_id_subject_id_exam_id: {
                                student_id: ids.studentId,
                                subject_id: ids.subjectId,
                                exam_id: ids.examId
                            }
                        },
                        update: {
                            marks: validatedScore,
                            student_code: code,
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
                            student_code: code,
                            class: className,
                            medium,
                            subject,
                            exam_type,
                            total: 100
                        }
                    });
                    txResults.push(result);
                } else {
                    // Fallback legacy
                    const existing = await tx.marks.findFirst({
                        where: {
                            student_code: code,
                            subject,
                            exam_type,
                            class: className,
                            medium
                        }
                    });

                    let result;
                    if (existing) {
                        result = await tx.marks.update({
                            where: { id: existing.id },
                            data: { marks: validatedScore }
                        });
                    } else {
                        result = await tx.marks.create({
                            data: {
                                student_code: code,
                                class: className,
                                medium,
                                subject,
                                exam_type,
                                marks: validatedScore,
                                total: 100
                            }
                        });
                    }
                    txResults.push(result);
                }
            }
            return txResults;
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
