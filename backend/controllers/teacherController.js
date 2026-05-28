const prisma = require('../prismaClient');
const supabase = require('../supabaseClient');

exports.getTeachers = async (req, res) => {
    try {
        const teachers = await prisma.teacher.findMany({
            where: { is_active: true }
        });
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch teachers' });
    }
};

exports.createTeacher = async (req, res) => {
    try {
        const { name, subject, medium, designation, experience, category, staff_id, email, password } = req.body;
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

        const existingStudentEmail = await prisma.student.findUnique({
            where: { email: cleanEmail }
        });
        if (existingStudentEmail) {
            return res.status(400).json({ error: 'Email is already used by a student' });
        }

        let photo_url = null;
        if (req.file) {
            try {
                // Try Supabase first
                const fileName = `${Date.now()}-${req.file.originalname}`;
                const { data, error } = await supabase.storage
                    .from('school-media')
                    .upload(`teachers/${fileName}`, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: true
                    });

                if (error) throw error;

                const { data: urlData } = supabase.storage
                    .from('school-media')
                    .getPublicUrl(`teachers/${fileName}`);
                
                if (urlData && urlData.publicUrl) {
                    photo_url = urlData.publicUrl;
                } else {
                    throw new Error("Failed to get public URL");
                }
            } catch (supabaseError) {
                console.warn("Supabase Upload Failed, falling back to local storage:", supabaseError.message);
                // Fallback to local storage
                const fs = require('fs');
                const path = require('path');
                const localFileName = `${Date.now()}-${req.file.originalname}`;
                const localPath = path.join(__dirname, '../uploads', localFileName);
                
                // Ensure uploads directory exists
                if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
                    fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
                }

                fs.writeFileSync(localPath, req.file.buffer);
                photo_url = `/uploads/${localFileName}`;
            }
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
                password: cleanPassword
            }
        });
        res.status(201).json(teacher);
    } catch (error) {
<<<<<<< HEAD
        console.error("Create Teacher Error:", error);
        res.status(500).json({ error: 'Failed to create teacher' });
=======
        console.error("Create teacher error:", error);
        res.status(500).json({ error: error.message || 'Failed to create teacher' });
>>>>>>> 79642c3 (my local changes)
    }
};

exports.deleteTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const teacher = await prisma.teacher.findUnique({ where: { id } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        
        // Soft delete
        const updated = await prisma.teacher.update({
            where: { id },
            data: { is_active: false }
        });
        res.json({ message: 'Teacher deleted successfully', teacher: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete teacher' });
    }
};

exports.updateTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, subject, medium, designation, experience, category, staff_id, email, password } = req.body;
        
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

            const existingStudentEmail = await prisma.student.findUnique({ where: { email: cleanEmail } });
            if (existingStudentEmail) {
                return res.status(400).json({ error: 'Email is already used by a student' });
            }
        }

        let photo_url = teacher.photo_url;
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const { data, error } = await supabase.storage
                .from('school-media')
                .upload(`teachers/${fileName}`, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: true
                });

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('school-media')
                .getPublicUrl(`teachers/${fileName}`);
            
            photo_url = publicUrl;
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
                password: password !== undefined && password.trim() ? password.trim() : teacher.password
            }
        });
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update teacher' });
    }
};
