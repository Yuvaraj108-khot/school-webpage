const prisma = require('../prismaClient');
const supabase = require('../supabaseClient');

exports.getTeachers = async (req, res) => {
    try {
        const teachers = await prisma.teacher.findMany({
            where: { is_active: true },
            orderBy: { name: 'asc' }
        });
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch teachers' });
    }
};

exports.createTeacher = async (req, res) => {
    try {
        const { name, subject, medium, designation, experience, category, staff_id, email, password, phone } = req.body;
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : 'General';
        const cleanMedium = typeof medium === 'string' && medium.trim() ? medium.trim() : 'Both';
        const cleanStaffId = typeof staff_id === 'string' ? staff_id.trim() : '';
        const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
        const cleanPassword = typeof password === 'string' && password.trim() ? password.trim() : cleanStaffId;

        if (!cleanName || !cleanStaffId || !cleanEmail) {
            return res.status(400).json({ error: 'Name, staff ID, and email are required' });
        }

        const existingStaff = await prisma.teacher.findUnique({
            where: { staff_id: cleanStaffId }
        });
        if (existingStaff) {
            return res.status(400).json({ error: 'Staff ID already exists' });
        }

        const existingEmail = await prisma.teacher.findUnique({
            where: { email: cleanEmail }
        });
        if (existingEmail) {
            return res.status(400).json({ error: 'Teacher email already exists' });
        }



        let photo_url = null;
        if (req.file) {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const cleanFileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            fs.writeFileSync(path.join(uploadsDir, cleanFileName), req.file.buffer);
            photo_url = `/uploads/${cleanFileName}`;
        }

        const teacher = await prisma.teacher.create({
            data: { 
                name: cleanName,
                subject: cleanSubject,
                medium: cleanMedium,
                designation: designation || null,
                experience: experience || null,
                category: category || null,
                photo_url,
                staff_id: cleanStaffId,
                email: cleanEmail,
                password: cleanPassword,
                phone: phone || null
            }
        });
        res.status(201).json(teacher);
    } catch (error) {
        console.error("Create Teacher Error:", error);
        res.status(500).json({ error: error.message || 'Failed to create teacher' });
    }
};

exports.deleteTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const teacher = await prisma.teacher.findUnique({ where: { id } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        
        // Hard delete: remove associated records first to avoid foreign key constraints
        await prisma.subjectTeacher.deleteMany({
            where: { teacher_id: id }
        });
        
        const deleted = await prisma.teacher.delete({
            where: { id }
        });
        res.json({ message: 'Teacher deleted successfully', teacher: deleted });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete teacher' });
    }
};

exports.updateTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, subject, medium, designation, experience, category, staff_id, email, password, phone } = req.body;
        
        const teacher = await prisma.teacher.findUnique({ where: { id } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

        const cleanStaffId = typeof staff_id === 'string' && staff_id.trim() ? staff_id.trim() : teacher.staff_id;
        const cleanEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

        if (cleanStaffId && cleanStaffId !== teacher.staff_id) {
            const existingStaff = await prisma.teacher.findUnique({ where: { staff_id: cleanStaffId } });
            if (existingStaff) {
                return res.status(400).json({ error: 'Staff ID already exists' });
            }
        }

        if (cleanEmail && cleanEmail !== teacher.email) {
            const existingEmail = await prisma.teacher.findUnique({ where: { email: cleanEmail } });
            if (existingEmail) {
                return res.status(400).json({ error: 'Teacher email already exists' });
            }


        }

        let photo_url = teacher.photo_url;
        if (req.file) {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const cleanFileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            fs.writeFileSync(path.join(uploadsDir, cleanFileName), req.file.buffer);
            photo_url = `/uploads/${cleanFileName}`;
        }

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
                email: email !== undefined ? cleanEmail : teacher.email,
                password: password !== undefined && password.trim() ? password.trim() : teacher.password,
                phone: phone !== undefined ? phone : teacher.phone
            }
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update teacher' });
    }
};
