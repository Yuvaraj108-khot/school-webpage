const prisma = require('../prismaClient');
const { hashPassword } = require('../utils/passwordSecurity');
const {
    omitPassword,
    normalizeEmail,
    validateAccessibleEmail,
    checkEmailAvailable,
    verifyNeonAuthUserForLink,
    generateNextStudentCode
} = require('../utils/accountProvisioning');

// In-memory cache to eliminate repetitive foreign-key DB roundtrips
const mediumCache = new Map();
const classCache = new Map();

// Helper to resolve class_id and medium_id from names
async function resolveStudentClassAndMedium(className, mediumName) {
    let class_id = null;
    let medium_id = null;

    if (mediumName) {
        const medName = mediumName === 'CBSE' ? 'English' : mediumName;
        if (mediumCache.has(medName)) {
            medium_id = mediumCache.get(medName);
        } else {
            const med = await prisma.medium.findUnique({
                where: { name: medName }
            });
            if (med) {
                medium_id = med.id;
                mediumCache.set(medName, med.id);
            }
        }
    }

    if (className && medium_id) {
        const clsName = className.replace(/\D/g, ''); // Extract numeric class e.g., "10"
        const cacheKey = `${clsName}:${medium_id}`;
        if (classCache.has(cacheKey)) {
            class_id = classCache.get(cacheKey);
        } else {
            const cls = await prisma.schoolClass.findUnique({
                where: {
                    name_medium_id: {
                        name: clsName,
                        medium_id: medium_id
                    }
                }
            });
            if (cls) {
                class_id = cls.id;
                classCache.set(cacheKey, cls.id);
            }
        }
    }

    return { class_id, medium_id };
}

exports.getStudents = async (req, res) => {
    try {
        const { class: cls, medium, page = 1, limit = 50, include_inactive = 'false' } = req.query;

        const andConditions = [];

        if (cls) {
            const numericCls = cls.replace(/\D/g, '');
            andConditions.push({
                OR: [
                    { class: { equals: cls, mode: 'insensitive' } },
                    { class: { equals: numericCls, mode: 'insensitive' } },
                    { class: { equals: `Class ${numericCls}`, mode: 'insensitive' } }
                ]
            });
        }

        if (medium) {
            const normalized = (medium === 'CBSE' ? 'English' : medium);
            andConditions.push({
                OR: [
                    { medium: { equals: medium, mode: 'insensitive' } },
                    { medium: { equals: normalized, mode: 'insensitive' } }
                ]
            });
        }

        if (include_inactive !== 'true') {
            andConditions.push({ is_active: true });
        }

        const where = andConditions.length > 0 ? { AND: andConditions } : {};

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const totalItems = await prisma.student.count({ where });

        const students = await prisma.student.findMany({
            where,
            skip,
            take: parseInt(limit, 10),
            orderBy: { name: 'asc' },
            include: {
                class_rel: true,
                medium_rel: true
            }
        });

        res.json({
            data: students.map(omitPassword),
            pagination: {
                totalItems,
                currentPage: parseInt(page, 10),
                totalPages: Math.ceil(totalItems / parseInt(limit, 10)),
                limit: parseInt(limit, 10)
            }
        });
    } catch (error) {
        console.error('Get Students Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
};

exports.getStudentByCode = async (req, res) => {
    try {
        const student = await prisma.student.findFirst({
            where: {
                student_code: req.params.code,
                is_active: true
            },
            include: {
                class_rel: true,
                medium_rel: true
            }
        });
        if (!student) return res.status(404).json({ error: 'Student not found or inactive' });
        res.json(omitPassword(student));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch student' });
    }
};

/**
 * Pre-flight validation endpoint called by the Admin Dashboard BEFORE creating
 * a Neon Auth user. Ensures name/class/medium/email, student_code, and cross-table
 * email uniqueness are clean so no orphaned Neon Auth account is created.
 */
exports.validateStudentCreation = async (req, res) => {
    try {
        const { student_code, name, class: className, medium, email } = req.body;
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanClass = typeof className === 'string' ? className.trim() : '';
        const cleanMedium = typeof medium === 'string' ? medium.trim() : '';

        if (!cleanName || !cleanClass || !cleanMedium) {
            return res.status(400).json({ error: 'Student name, class, and medium are required.' });
        }

        const emailCheck = validateAccessibleEmail(email);
        if (!emailCheck.valid) {
            return res.status(400).json({ error: emailCheck.error });
        }

        let cleanStudentCode = typeof student_code === 'string' ? student_code.trim() : '';
        if (cleanStudentCode) {
            const existingCode = await prisma.student.findFirst({
                where: { student_code: { equals: cleanStudentCode, mode: 'insensitive' } },
                select: { id: true }
            });
            if (existingCode) {
                return res.status(400).json({ error: 'Student Code already exists.' });
            }
        } else {
            cleanStudentCode = await generateNextStudentCode(cleanClass, cleanMedium);
        }

        const avail = await checkEmailAvailable(emailCheck.email, { includeNeonAuth: true });
        if (!avail.available) {
            return res.status(409).json({ error: avail.error });
        }

        return res.json({
            valid: true,
            student_code: cleanStudentCode,
            email: emailCheck.email
        });
    } catch (error) {
        console.error('Validate Student Error:', error.message);
        return res.status(500).json({ error: 'Failed to validate student registration details.' });
    }
};

exports.createStudent = async (req, res) => {
    try {
        const { student_code, name, class: className, medium, parent_name, roll_no, photo_url, email, auth_user_id } = req.body;
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanClass = typeof className === 'string' ? className.trim() : '';
        const cleanMedium = typeof medium === 'string' ? medium.trim() : '';

        if (!cleanName || !cleanClass || !cleanMedium) {
            return res.status(400).json({ error: 'Student name, class, and medium are required.' });
        }

        const emailCheck = validateAccessibleEmail(email);
        if (!emailCheck.valid) {
            return res.status(400).json({ error: emailCheck.error });
        }

        const finalAuthUserId = (typeof auth_user_id === 'string' && auth_user_id.trim())
            ? auth_user_id.trim()
            : require('crypto').randomUUID();

        let cleanStudentCode = typeof student_code === 'string' ? student_code.trim() : '';
        if (cleanStudentCode) {
            const existing = await prisma.student.findFirst({
                where: { student_code: { equals: cleanStudentCode, mode: 'insensitive' } },
                select: { id: true }
            });
            if (existing) {
                return res.status(400).json({ error: 'Student Code already exists.' });
            }
        } else {
            cleanStudentCode = await generateNextStudentCode(cleanClass, cleanMedium);
        }

        // Verify email uniqueness across students and teachers
        const avail = await checkEmailAvailable(emailCheck.email, { includeNeonAuth: false });
        if (!avail.available) {
            return res.status(409).json({ error: avail.error });
        }

        // Ensure user exists in neon_auth."user"
        try {
            await prisma.$executeRaw`
                INSERT INTO neon_auth."user" (id, name, email, role, banned, "emailVerified", "createdAt", "updatedAt")
                VALUES (${finalAuthUserId}::uuid, ${cleanName}, ${emailCheck.email}, 'user', false, false, NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            `;
        } catch (_) {}

        // Resolve relational mapping fields
        const rel = await resolveStudentClassAndMedium(cleanClass, cleanMedium);

        const student = await prisma.student.create({
            data: {
                student_code: cleanStudentCode,
                name: cleanName,
                class: cleanClass,
                medium: cleanMedium,
                parent_name: typeof parent_name === 'string' && parent_name.trim() ? parent_name.trim() : null,
                roll_no: roll_no || null,
                photo_url: photo_url || null,
                email: emailCheck.email,
                password: null,
                auth_user_id: finalAuthUserId,
                class_id: rel.class_id,
                medium_id: rel.medium_id,
                is_active: true,
                academic_year: '2025-2026'
            },
            include: {
                class_rel: true,
                medium_rel: true
            }
        });
        res.status(201).json(omitPassword(student));
    } catch (error) {
        console.error('Create Student Error:', error.message);
        res.status(500).json({ error: 'Failed to create student' });
    }
};

exports.deleteStudent = async (req, res) => {
    try {
        const student = await prisma.student.findUnique({
            where: { student_code: req.params.code }
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });

        // Hard delete: remove associated records first
        const id = student.id;
        await prisma.alumniTracking.deleteMany({ where: { student_id: id } });
        await prisma.attendance.deleteMany({ where: { student_id: id } });
        await prisma.marks.deleteMany({ where: { student_id: id } });
        await prisma.certificateRequest.deleteMany({ where: { student_id: id } });

        const deleted = await prisma.student.delete({
            where: { id }
        });
        res.json({ message: 'Student deleted successfully', student: omitPassword(deleted) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete student' });
    }
};

exports.updateStudent = async (req, res) => {
    try {
        const { student_code, name, class: className, medium, parent_name, roll_no, photo_url, is_active, email, password } = req.body;
        const code = req.params.code;

        const existing = await prisma.student.findUnique({
            where: { student_code: code }
        });
        if (!existing) return res.status(404).json({ error: 'Student not found' });

        const existingEmail = normalizeEmail(existing.email);
        const cleanEmail = normalizeEmail(email);

        if (existing.auth_user_id) {
            if (email !== undefined && (!cleanEmail || cleanEmail !== existingEmail)) {
                return res.status(400).json({
                    error: 'Cannot change the registered email of a Neon Auth-linked student account directly. Changing a registered email requires an authenticated email-update process synced with Neon Auth.'
                });
            }
        } else if (email !== undefined && cleanEmail && cleanEmail !== existingEmail) {
            const avail = await checkEmailAvailable(cleanEmail, {
                excludeStudentId: existing.id,
                includeNeonAuth: false
            });
            if (!avail.available) {
                return res.status(409).json({ error: avail.error });
            }
        }

        // Resolve new class/medium relation IDs if updated
        const targetClass = className !== undefined ? className : existing.class;
        const targetMedium = medium !== undefined ? medium : existing.medium;
        const rel = await resolveStudentClassAndMedium(targetClass, targetMedium);

        // Prevent overwriting passwords for Neon-linked accounts
        const nextPassword = existing.auth_user_id
            ? null
            : (typeof password === 'string' && password.trim() ? hashPassword(password.trim()) : existing.password);
        const nextEmail = existing.auth_user_id
            ? existing.email
            : (email !== undefined ? cleanEmail : existing.email);

        const updated = await prisma.student.update({
            where: { student_code: code },
            data: {
                student_code: student_code !== undefined ? student_code : existing.student_code,
                name: name !== undefined ? name.trim() : existing.name,
                class: className !== undefined ? className : existing.class,
                medium: medium !== undefined ? medium : existing.medium,
                parent_name: parent_name !== undefined ? (typeof parent_name === 'string' ? parent_name.trim() || null : null) : existing.parent_name,
                roll_no: roll_no !== undefined ? roll_no : existing.roll_no,
                photo_url: photo_url !== undefined ? photo_url : existing.photo_url,
                is_active: is_active !== undefined ? is_active : existing.is_active,
                email: nextEmail,
                password: nextPassword,
                class_id: rel.class_id,
                medium_id: rel.medium_id
            },
            include: {
                class_rel: true,
                medium_rel: true
            }
        });
        res.json(omitPassword(updated));
    } catch (error) {
        console.error('Update Student Error:', error.message);
        res.status(500).json({ error: 'Failed to update student' });
    }
};
