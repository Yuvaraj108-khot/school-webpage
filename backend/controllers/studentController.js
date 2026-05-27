const prisma = require('../prismaClient');

exports.getStudents = async (req, res) => {
  try {
    const { class: cls, medium } = req.query;
    const where = {};
    if (cls) where.class = cls;
    if (medium) where.medium = medium;
    const students = await prisma.student.findMany({ where });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStudentByCode = async (req, res) => {
    try {
        const student = await prisma.student.findUnique({
            where: { student_code: req.params.code }
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch student' });
    }
};

exports.createStudent = async (req, res) => {
    try {
        const { student_code, name, class: className, medium, parent_name, roll_no, photo_url } = req.body;
        
        // Check if student code already exists
        const existing = await prisma.student.findUnique({
            where: { student_code }
        });

        if (existing) {
            return res.status(400).json({ error: 'Student Code already exists' });
        }

        const student = await prisma.student.create({
            data: { student_code, name, class: className, medium, parent_name, roll_no, photo_url }
        });
        res.status(201).json(student);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create student' });
    }
};

exports.deleteStudent = async (req, res) => {
    try {
        const student = await prisma.student.findUnique({
            where: { student_code: req.params.code }
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        
        await prisma.student.delete({
            where: { student_code: req.params.code }
        });
        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete student' });
    }
};

exports.updateStudent = async (req, res) => {
    try {
        const { student_code, name, class: className, medium, parent_name, roll_no, photo_url } = req.body;
        const code = req.params.code;

        const existing = await prisma.student.findUnique({
            where: { student_code: code }
        });
        if (!existing) return res.status(404).json({ error: 'Student not found' });

        const updated = await prisma.student.update({
            where: { student_code: code },
            data: {
                student_code: student_code !== undefined ? student_code : existing.student_code,
                name: name !== undefined ? name : existing.name,
                class: className !== undefined ? className : existing.class,
                medium: medium !== undefined ? medium : existing.medium,
                parent_name: parent_name !== undefined ? parent_name : existing.parent_name,
                roll_no: roll_no !== undefined ? roll_no : existing.roll_no,
                photo_url: photo_url !== undefined ? photo_url : existing.photo_url
            }
        });
        res.json(updated);
    } catch (error) {
        console.error("Update Student Error:", error);
        res.status(500).json({ error: 'Failed to update student' });
    }
};

