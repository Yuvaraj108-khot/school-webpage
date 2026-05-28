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
        const { name, subject, medium, designation, experience, category } = req.body;
        
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
            data: { name, subject, medium, designation, experience, category, photo_url }
        });
        res.status(201).json(teacher);
    } catch (error) {
        console.error("Create Teacher Error:", error);
        res.status(500).json({ error: 'Failed to create teacher' });
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
