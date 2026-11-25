const path = require('path');
const prisma = require('../prismaClient');
const requireNeonAdmin = require('../middleware/requireNeonAdmin');
const { validateAndSaveImageBuffer } = require('../utils/imageUpload');
const { hashPassword } = require('../utils/passwordSecurity');
const {
    SAFE_TEACHER_PUBLIC_SELECT,
    omitPassword,
    normalizeEmail,
    validateAccessibleEmail,
    checkEmailAvailable,
    verifyNeonAuthUserForLink
} = require('../utils/accountProvisioning');

exports.getTeachers = async (req, res) => {
    try {
        let isVerifiedAdmin = false;
        if (req.neonAuth && req.neonAuth.verified) {
            const resolved = await requireNeonAdmin.resolveVerifiedNeonUser(req).catch(() => null);
            isVerifiedAdmin = Boolean(resolved && resolved.ok && resolved.roles.includes('admin'));
        }

        if (isVerifiedAdmin) {
            const teachers = await prisma.teacher.findMany({
                where: { is_active: true },
                orderBy: { name: 'asc' }
            });
            return res.json(teachers.map(omitPassword));
        }

        const publicTeachers = await prisma.teacher.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' },
            select: SAFE_TEACHER_PUBLIC_SELECT
        });
        return res.json(publicTeachers);
    } catch (error) {
        console.error('Fetch Teachers Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch teachers' });
    }
};

/**
 * Pre-flight validation endpoint called by the Admin Dashboard BEFORE creating
 * a Neon Auth user. Checks required fields, accessible email, Staff ID uniqueness,
 * and cross-table email uniqueness.
 */
exports.validateTeacherCreation = async (req, res) => {
    try {
        const { name, staff_id, email, designation, experience } = req.body;
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanStaffId = typeof staff_id === 'string' ? staff_id.trim() : '';
        const cleanDesignation = typeof designation === 'string' ? designation.trim() : '';

        if (!cleanName || !cleanStaffId || !cleanDesignation || experience === undefined || experience === null || String(experience).trim() === '') {
            return res.status(400).json({ error: 'Name, Staff ID, Designation, Experience, and Email are required.' });
        }

        const emailCheck = validateAccessibleEmail(email);
        if (!emailCheck.valid) {
            return res.status(400).json({ error: emailCheck.error });
        }

        const existingStaff = await prisma.teacher.findFirst({
            where: { staff_id: { equals: cleanStaffId, mode: 'insensitive' } },
            select: { id: true }
        });
        if (existingStaff) {
            return res.status(400).json({ error: 'Staff ID already exists.' });
        }

        const avail = await checkEmailAvailable(emailCheck.email, { includeNeonAuth: true });
        if (!avail.available) {
            return res.status(409).json({ error: avail.error });
        }

        return res.json({
            valid: true,
            staff_id: cleanStaffId,
            email: emailCheck.email,
            existing_auth_user_id: avail.existingNeonUserId || null
        });
    } catch (error) {
        console.error('Validate Teacher Error:', error.message);
        return res.status(500).json({ error: 'Failed to validate teacher registration details.' });
    }
};

exports.createTeacher = async (req, res) => {
    try {
        const { name, subject, medium, designation, experience, category, staff_id, email, phone, auth_user_id } = req.body;
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : 'General';
        const cleanMedium = typeof medium === 'string' && medium.trim() ? medium.trim() : 'Both';
        const cleanStaffId = typeof staff_id === 'string' ? staff_id.trim() : '';

        if (!cleanName || !cleanStaffId) {
            return res.status(400).json({ error: 'Name, Staff ID, and Email are required.' });
        }

        const emailCheck = validateAccessibleEmail(email);
        if (!emailCheck.valid) {
            return res.status(400).json({ error: emailCheck.error });
        }

        const finalAuthUserId = (typeof auth_user_id === 'string' && auth_user_id.trim())
            ? auth_user_id.trim()
            : require('crypto').randomUUID();

        // Check staff ID uniqueness and email availability in parallel
        const [existingStaff, avail] = await Promise.all([
            prisma.teacher.findFirst({
                where: { staff_id: { equals: cleanStaffId, mode: 'insensitive' } },
                select: { id: true }
            }),
            checkEmailAvailable(emailCheck.email, { includeNeonAuth: false })
        ]);

        if (existingStaff) {
            return res.status(400).json({ error: 'Staff ID already exists.' });
        }

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

        // Hash initial password if provided, or default to 123456789
        const rawPassword = (typeof req.body.password === 'string' && req.body.password.trim()) ? req.body.password.trim() : '123456789';
        const initialHashedPassword = hashPassword(rawPassword);

        let photo_url = null;
        if (req.file) {
            const uploadsDir = path.join(__dirname, '../uploads');
            try {
                validateAndSaveImageBuffer(req.file.buffer, uploadsDir);
            } catch (_) {}
            const mime = (req.file.mimetype && req.file.mimetype.startsWith('image/')) ? req.file.mimetype : 'image/jpeg';
            photo_url = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
        }

        const teacher = await prisma.teacher.create({
            data: {
                name: cleanName,
                subject: cleanSubject,
                medium: cleanMedium,
                designation: designation || null,
                experience: experience !== undefined && experience !== null ? String(experience) : null,
                category: category || null,
                photo_url,
                staff_id: cleanStaffId,
                email: emailCheck.email,
                password: initialHashedPassword,
                auth_user_id: finalAuthUserId,
                phone: phone || null
            }
        });
        res.status(201).json(omitPassword(teacher));
    } catch (error) {
        console.error('Create Teacher Error:', error.message);
        res.status(error.status === 400 ? 400 : 500).json({
            error: error.status === 400 ? error.message : 'Failed to create teacher'
        });
    }
};

exports.deleteTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const teacher = await prisma.teacher.findUnique({ where: { id } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

        const teacherEmail = (teacher.email || '').trim().toLowerCase();
        const authUserId = teacher.auth_user_id;

        // 1. Remove associated assignments
        await prisma.subjectTeacher.deleteMany({
            where: { teacher_id: id }
        }).catch(() => {});

        // 2. Delete uploaded photo file from disk if present
        if (teacher.photo_url && teacher.photo_url.startsWith('/uploads/')) {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, '..', teacher.photo_url);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (_) {}
        }

        // 3. Completely purge from Neon Managed Auth user table
        if (authUserId) {
            try {
                await prisma.$executeRaw`DELETE FROM neon_auth."user" WHERE id = ${authUserId}::uuid`;
            } catch (_) {}
        }
        if (teacherEmail) {
            try {
                await prisma.$executeRaw`DELETE FROM neon_auth."user" WHERE LOWER(email) = ${teacherEmail} AND role != 'admin'`;
            } catch (_) {}
        }

        // 4. Hard delete from teacher table
        const deleted = await prisma.teacher.delete({
            where: { id }
        });

        res.json({ message: 'Teacher and all related records permanently deleted from database', teacher: omitPassword(deleted) });
    } catch (error) {
        console.error('Delete Teacher Error:', error);
        res.status(500).json({ error: 'Failed to delete teacher from database' });
    }
};

exports.updateTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, subject, medium, designation, experience, category, staff_id, email, password, phone } = req.body;

        const teacher = await prisma.teacher.findUnique({ where: { id } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

        const cleanStaffId = typeof staff_id === 'string' && staff_id.trim() ? staff_id.trim() : teacher.staff_id;
        const existingEmail = normalizeEmail(teacher.email);
        const cleanEmail = normalizeEmail(email);

        if (cleanStaffId && cleanStaffId !== teacher.staff_id) {
            const existingStaff = await prisma.teacher.findFirst({
                where: {
                    staff_id: { equals: cleanStaffId, mode: 'insensitive' },
                    NOT: { id }
                },
                select: { id: true }
            });
            if (existingStaff) {
                return res.status(400).json({ error: 'Staff ID already exists.' });
            }
        }

        if (teacher.auth_user_id) {
            if (email !== undefined && (!cleanEmail || cleanEmail !== existingEmail)) {
                return res.status(400).json({
                    error: 'Cannot change the registered email of a Neon Auth-linked teacher account directly. Changing a registered email requires an authenticated email-update process synced with Neon Auth.'
                });
            }
        } else if (email !== undefined && cleanEmail && cleanEmail !== existingEmail) {
            const avail = await checkEmailAvailable(cleanEmail, {
                excludeTeacherId: id,
                includeNeonAuth: false
            });
            if (!avail.available) {
                return res.status(409).json({ error: avail.error });
            }
        }

        let photo_url = teacher.photo_url;
        if (req.file) {
            const uploadsDir = path.join(__dirname, '../uploads');
            try {
                validateAndSaveImageBuffer(req.file.buffer, uploadsDir);
            } catch (_) {}
            const mime = (req.file.mimetype && req.file.mimetype.startsWith('image/')) ? req.file.mimetype : 'image/jpeg';
            photo_url = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
        }

        // Prevent overwriting passwords for Neon-linked accounts
        const nextPassword = teacher.auth_user_id
            ? null
            : (typeof password === 'string' && password.trim() ? hashPassword(password.trim()) : teacher.password);
        const nextEmail = teacher.auth_user_id
            ? teacher.email
            : (email !== undefined ? cleanEmail : teacher.email);

        const updated = await prisma.teacher.update({
            where: { id },
            data: {
                name: name !== undefined ? name : teacher.name,
                subject: subject !== undefined ? subject : teacher.subject,
                medium: medium !== undefined ? medium : teacher.medium,
                designation: designation !== undefined ? designation : teacher.designation,
                experience: experience !== undefined ? experience : teacher.experience,
                category: category !== undefined ? category : teacher.category,
                photo_url: photo_url,
                staff_id: staff_id !== undefined ? cleanStaffId : teacher.staff_id,
                email: nextEmail,
                password: nextPassword,
                phone: phone !== undefined ? phone : teacher.phone
            }
        });
        res.json(omitPassword(updated));
    } catch (error) {
        console.error('Update Teacher Error:', error.message);
        res.status(error.status === 400 ? 400 : 500).json({
            error: error.status === 400 ? error.message : 'Failed to update teacher'
        });
    }
};
