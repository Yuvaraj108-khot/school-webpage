const prisma = require('../prismaClient');
const supabase = require('../supabaseClient');

exports.getAlumni = async (req, res) => {
    try {
        const alumni = await prisma.alumni.findMany();
        res.json(alumni);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alumni' });
    }
};

exports.createAlumni = async (req, res) => {
    try {
        const { name, batch_year, profession } = req.body;
        
        let photo_url = null;
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const { data, error } = await supabase.storage
                .from('school-media')
                .upload(`alumni/${fileName}`, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: true
                });

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('school-media')
                .getPublicUrl(`alumni/${fileName}`);
            
            photo_url = publicUrl;
        }

        const alumni = await prisma.alumni.create({
            data: { name, batch_year, profession, photo_url }
        });
        res.status(201).json(alumni);
    } catch (error) {
        console.error("Supabase Upload Error:", error);
        res.status(500).json({ error: 'Failed to create alumni in Supabase' });
    }
};

exports.deleteAlumni = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const alumni = await prisma.alumni.findUnique({ where: { id } });
        if (!alumni) return res.status(404).json({ error: 'Alumni not found' });
        
        await prisma.alumni.delete({ where: { id } });
        res.json({ message: 'Alumni deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete alumni' });
    }
};
