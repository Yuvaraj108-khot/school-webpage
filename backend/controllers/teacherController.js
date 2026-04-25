const prisma = require('../prismaClient');
const supabase = require('../supabaseClient');

exports.getTeachers = async (req, res) => {
    try {
        const teachers = await prisma.teacher.findMany();
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

        const teacher = await prisma.teacher.create({
            data: { name, subject, medium, designation, experience, category, photo_url }
        });
        res.status(201).json(teacher);
    } catch (error) {
        console.error("Supabase Upload Error:", error);
        res.status(500).json({ error: 'Failed to create teacher in Supabase' });
    }
};

exports.deleteTeacher = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const teacher = await prisma.teacher.findUnique({ where: { id } });
        if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
        
        await prisma.teacher.delete({ where: { id } });
        res.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete teacher' });
    }
};
