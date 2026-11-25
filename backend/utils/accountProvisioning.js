const prisma = require('../prismaClient');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const BLOCKED_DUMMY_DOMAINS = new Set([
    'test.com',
    'example.com',
    'example.org',
    'example.net',
    'invalid',
    'localhost',
    'local',
    'fake.com',
    'dummy.com'
]);

function isTransientDbConnectionError(err) {
    const code = err && err.code;
    const msg = (err && err.message) || '';
    return code === 'P1001' || code === 'P1017' || /Can't reach database server/i.test(msg);
}

async function withDbRetry(fn) {
    try {
        return await fn();
    } catch (err) {
        if (!isTransientDbConnectionError(err)) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return fn();
    }
}

/**
 * Safe Prisma field projections for related lookups and public views.
 * Excludes password, auth_user_id, and unnecessary personal data.
 */
const SAFE_STUDENT_SELECT = {
    id: true,
    student_code: true,
    name: true,
    class: true,
    medium: true,
    roll_no: true,
    is_active: true
};

const SAFE_TEACHER_PUBLIC_SELECT = {
    id: true,
    name: true,
    subject: true,
    medium: true,
    category: true,
    designation: true,
    experience: true,
    photo_url: true,
    phone: true
};

const SAFE_TEACHER_ASSIGNMENT_SELECT = {
    id: true,
    staff_id: true,
    name: true,
    subject: true,
    medium: true,
    designation: true,
    category: true,
    is_active: true
};

/**
 * Strips plaintext password and raw auth_user_id UUID from API response objects,
 * exposing only a safe boolean `is_neon_managed` flag.
 */
function omitPassword(record) {
    if (!record || typeof record !== 'object') return record;
    const { password, auth_user_id, ...safe } = record;
    if ('auth_user_id' in record) {
        safe.is_neon_managed = Boolean(auth_user_id);
    }
    return safe;
}

/**
 * Normalizes an email string (trimmed lowercase) or returns null when blank.
 */
function normalizeEmail(email) {
    if (typeof email !== 'string') return null;
    const trimmed = email.trim().toLowerCase();
    return trimmed || null;
}

/**
 * Validates that an email has valid syntax and does not belong to dummy/placeholder domains.
 *
 * @param {string} email
 * @returns {{ valid: true, email: string } | { valid: false, error: string }}
 */
function validateAccessibleEmail(email) {
    const clean = normalizeEmail(email);
    if (!clean || clean.length > 254 || !EMAIL_REGEX.test(clean)) {
        return { valid: false, error: 'A valid accessible email address is required.' };
    }

    const parts = clean.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { valid: false, error: 'A valid accessible email address is required.' };
    }

    const domain = parts[1].toLowerCase();
    for (const blocked of BLOCKED_DUMMY_DOMAINS) {
        if (domain === blocked || domain.endsWith(`.${blocked}`)) {
            return {
                valid: false,
                error: `Dummy or placeholder email domains (@${blocked}) are not allowed. Enter a real accessible email address.`
            };
        }
    }

    return { valid: true, email: clean };
}

/**
 * Checks email uniqueness case-insensitively across public.students, public.teachers,
 * and (optionally) neon_auth."user".
 *
 * @param {string} email
 * @param {{ excludeStudentId?: number, excludeTeacherId?: number, includeNeonAuth?: boolean }} [options]
 */
async function checkEmailAvailable(email, options = {}) {
    const clean = normalizeEmail(email);
    if (!clean) {
        return { available: false, error: 'Email address is required.' };
    }

    const { excludeStudentId = null, excludeTeacherId = null, includeNeonAuth = true } = options;

    const studentPromise = prisma.student.findFirst({
        where: {
            email: { equals: clean, mode: 'insensitive' },
            ...(excludeStudentId !== null ? { NOT: { id: excludeStudentId } } : {})
        },
        select: { id: true }
    });

    const teacherPromise = prisma.teacher.findFirst({
        where: {
            email: { equals: clean, mode: 'insensitive' },
            ...(excludeTeacherId !== null ? { NOT: { id: excludeTeacherId } } : {})
        },
        select: { id: true }
    });

    const neonPromise = includeNeonAuth
        ? withDbRetry(() => prisma.$queryRaw`
            SELECT id, role
            FROM neon_auth."user"
            WHERE LOWER(email) = ${clean}
            LIMIT 1
        `)
        : Promise.resolve([]);

    const [existingStudent, existingTeacher, neonRows] = await Promise.all([
        studentPromise,
        teacherPromise,
        neonPromise
    ]);

    if (existingStudent) {
        return { available: false, conflictIn: 'students', error: 'This email address is already assigned to a student.' };
    }
    if (existingTeacher) {
        return { available: false, conflictIn: 'teachers', error: 'This email address is already assigned to a teacher.' };
    }
    if (neonRows && neonRows.length > 0) {
        const neonUser = neonRows[0];
        if (neonUser.role === 'admin') {
            return {
                available: false,
                conflictIn: 'neon_auth',
                error: 'Administrator accounts cannot be assigned to students or teachers.'
            };
        }
        // Check if already linked to a student or teacher
        const linkedStudent = await prisma.student.findFirst({
            where: {
                OR: [
                    { auth_user_id: neonUser.id },
                    { email: { equals: clean, mode: 'insensitive' } }
                ],
                ...(excludeStudentId !== null ? { NOT: { id: excludeStudentId } } : {})
            },
            select: { id: true }
        });
        if (linkedStudent) {
            return {
                available: false,
                conflictIn: 'students',
                error: 'This email address is already assigned to a student.'
            };
        }
        const linkedTeacher = await prisma.teacher.findFirst({
            where: {
                OR: [
                    { auth_user_id: neonUser.id },
                    { email: { equals: clean, mode: 'insensitive' } }
                ],
                ...(excludeTeacherId !== null ? { NOT: { id: excludeTeacherId } } : {})
            },
            select: { id: true }
        });
        if (linkedTeacher) {
            return {
                available: false,
                conflictIn: 'teachers',
                error: 'This email address is already assigned to a teacher.'
            };
        }
        // It is an unlinked Neon Auth account: allow reuse and return its ID
        return { available: true, existingNeonUserId: neonUser.id };
    }

    return { available: true };
}

/**
 * Verifies a Neon Auth user UUID before linking it to a new student or teacher record.
 * Ensures the user exists on auth-dev, is unbanned, matches the expected normalized email,
 * is not an admin user, and is not already linked to any student or teacher record.
 *
 * @param {string} authUserId
 * @param {string} expectedEmail
 */
async function verifyNeonAuthUserForLink(authUserId, expectedEmail) {
    const cleanId = typeof authUserId === 'string' ? authUserId.trim() : '';
    const cleanEmail = normalizeEmail(expectedEmail);

    if (!UUID_REGEX.test(cleanId)) {
        return { ok: false, status: 400, error: 'Valid Neon Auth auth_user_id UUID is required.' };
    }
    if (!cleanEmail) {
        return { ok: false, status: 400, error: 'Expected email is required to verify Neon Auth account link.' };
    }

    const rows = await withDbRetry(() => prisma.$queryRaw`
        SELECT id, email, name, role, banned
        FROM neon_auth."user"
        WHERE id = ${cleanId}::uuid
        LIMIT 1
    `);

    const neonUser = rows && rows[0];
    if (!neonUser) {
        return { ok: false, status: 400, error: 'Referenced Neon Auth account does not exist.' };
    }

    if (neonUser.banned === true) {
        return { ok: false, status: 403, error: 'Referenced Neon Auth account is banned.' };
    }

    if (normalizeEmail(neonUser.email) !== cleanEmail) {
        return { ok: false, status: 400, error: 'Neon Auth user email does not match the school record email.' };
    }

    const roles = String(neonUser.role || '')
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
    if (roles.includes('admin')) {
        return { ok: false, status: 400, error: 'Administrator Neon Auth accounts cannot be linked to student or teacher records.' };
    }

    const existingStudentLink = await prisma.student.findUnique({
        where: { auth_user_id: cleanId },
        select: { id: true }
    });
    if (existingStudentLink) {
        return { ok: false, status: 409, error: 'This Neon Auth account is already linked to a student record.' };
    }

    const existingTeacherLink = await prisma.teacher.findUnique({
        where: { auth_user_id: cleanId },
        select: { id: true }
    });
    if (existingTeacherLink) {
        return { ok: false, status: 409, error: 'This Neon Auth account is already linked to a teacher record.' };
    }

    return { ok: true, authUserId: cleanId, neonUser };
}

/**
 * Generates the next sequential, collision-free student_code directly from the database
 * for the given class & medium (e.g. C1-003 or K8-001).
 */
async function generateNextStudentCode(className, mediumName) {
    const cleanMedium = String(mediumName || '').trim().toLowerCase();
    const prefixLetter = cleanMedium.includes('kannada') ? 'K' : 'C';
    const numericClass = String(className || '').replace(/\D/g, '') || String(className || '').trim();
    const pattern = `${prefixLetter}${numericClass}-`;

    const existingCodes = await prisma.student.findMany({
        where: {
            student_code: { startsWith: pattern, mode: 'insensitive' }
        },
        select: { student_code: true }
    });

    let maxNum = 0;
    for (const row of existingCodes) {
        if (!row.student_code) continue;
        const suffix = row.student_code.slice(pattern.length);
        const parsed = parseInt(suffix, 10);
        if (!Number.isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
        }
    }

    return `${pattern}${String(maxNum + 1).padStart(3, '0')}`;
}

module.exports = {
    UUID_REGEX,
    SAFE_STUDENT_SELECT,
    SAFE_TEACHER_PUBLIC_SELECT,
    SAFE_TEACHER_ASSIGNMENT_SELECT,
    omitPassword,
    normalizeEmail,
    validateAccessibleEmail,
    checkEmailAvailable,
    verifyNeonAuthUserForLink,
    generateNextStudentCode,
    withDbRetry
};
