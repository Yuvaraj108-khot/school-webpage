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
        const { student_code, name, class: className, medium, parent_name } = req.body;
        const student = await prisma.student.create({
            data: { student_code, name, class: className, medium, parent_name }
        });
        res.status(201).json(student);
    } catch (error) {
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
