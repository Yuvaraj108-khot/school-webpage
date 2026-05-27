const prisma = require('../prismaClient');

// Helper to resolve class_id and medium_id from names
async function resolveStudentClassAndMedium(className, mediumName) {
    let class_id = null;
    let medium_id = null;

    if (mediumName) {
        const medName = mediumName === 'CBSE' ? 'English' : mediumName;
        const med = await prisma.medium.findUnique({
            where: { name: medName }
        });
        if (med) {
            medium_id = med.id;
        }
    }

    if (className && medium_id) {
        const clsName = className.replace(/\D/g, ''); // Extract numeric class e.g., "10"
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
        }
    }

    return { class_id, medium_id };
}

exports.getStudents = async (req, res) => {
  try {
    const { class: cls, medium, page = 1, limit = 50, include_inactive = 'false' } = req.query;
    
    const where = {};
    if (cls) where.class = cls;
    if (medium) {
        const normalized = (medium === 'CBSE' ? 'English' : medium);
        where.OR = [
            { medium: { equals: medium, mode: 'insensitive' } },
            { medium: { equals: normalized, mode: 'insensitive' } }
        ];
    }
    
    // Soft delete filtering
    if (include_inactive !== 'true') {
        where.is_active = true;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalItems = await prisma.student.count({ where });

    const students = await prisma.student.findMany({ 
        where,
        skip,
        take: parseInt(limit),
        orderBy: { roll_no: 'asc' },
        include: {
            class_rel: true,
            medium_rel: true
        }
    });

    res.json({
        data: students,
        pagination: {
            totalItems,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalItems / parseInt(limit)),
            limit: parseInt(limit)
        }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
        res.json(student);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch student' });
    }
};

exports.createStudent = async (req, res) => {
    try {
        const { student_code, name, class: className, medium, parent_name, roll_no, photo_url } = req.body;
        
        // Validation
        if (!student_code || !name || !className || !medium) {
            return res.status(400).json({ error: 'Student code, name, class, and medium are required' });
        }

        // Check if student code already exists
        const existing = await prisma.student.findUnique({
            where: { student_code }
        });

        if (existing) {
            return res.status(400).json({ error: 'Student Code already exists' });
        }

        // Resolve relational mapping fields
        const rel = await resolveStudentClassAndMedium(className, medium);

        const student = await prisma.student.create({
            data: { 
                student_code, 
                name, 
                class: className, 
                medium, 
                parent_name, 
                roll_no, 
                photo_url,
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
        res.status(201).json(student);
    } catch (error) {
        console.error('Create Student Error:', error);
        res.status(500).json({ error: 'Failed to create student' });
    }
};

exports.deleteStudent = async (req, res) => {
    try {
        const student = await prisma.student.findUnique({
            where: { student_code: req.params.code }
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        
        // Soft delete
        const updated = await prisma.student.update({
            where: { student_code: req.params.code },
            data: { is_active: false }
        });
        res.json({ message: 'Student soft-deleted successfully', student: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete student' });
    }
};

exports.updateStudent = async (req, res) => {
    try {
        const { student_code, name, class: className, medium, parent_name, roll_no, photo_url, is_active } = req.body;
        const code = req.params.code;

        const existing = await prisma.student.findUnique({
            where: { student_code: code }
        });
        if (!existing) return res.status(404).json({ error: 'Student not found' });

        // Resolve new class/medium relation IDs if updated
        const targetClass = className !== undefined ? className : existing.class;
        const targetMedium = medium !== undefined ? medium : existing.medium;
        const rel = await resolveStudentClassAndMedium(targetClass, targetMedium);

        const updated = await prisma.student.update({
            where: { student_code: code },
            data: {
                student_code: student_code !== undefined ? student_code : existing.student_code,
                name: name !== undefined ? name : existing.name,
                class: className !== undefined ? className : existing.class,
                medium: medium !== undefined ? medium : existing.medium,
                parent_name: parent_name !== undefined ? parent_name : existing.parent_name,
                roll_no: roll_no !== undefined ? roll_no : existing.roll_no,
                photo_url: photo_url !== undefined ? photo_url : existing.photo_url,
                is_active: is_active !== undefined ? is_active : existing.is_active,
                class_id: rel.class_id,
                medium_id: rel.medium_id
            },
            include: {
                class_rel: true,
                medium_rel: true
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Update Student Error:", error);
        res.status(500).json({ error: 'Failed to update student' });
    }
};
