const prisma = require('../prismaClient');
const supabase = require('../supabaseClient');

exports.getGallery = async (req, res) => {
    try {
        const gallery = await prisma.gallery.findMany({
            orderBy: { upload_date: 'desc' }
        });
        res.json(gallery);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gallery items' });
    }
};

exports.uploadGalleryItem = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        const { category, description } = req.body;
        
        // Upload to Supabase Storage
        const fileName = `${Date.now()}-${req.file.originalname}`;
        const { data, error } = await supabase.storage
            .from('school-media')
            .upload(`gallery/${fileName}`, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('school-media')
            .getPublicUrl(`gallery/${fileName}`);
        
        const galleryItem = await prisma.gallery.create({
            data: {
                image_url: publicUrl,
                category,
                description,
                upload_date: new Date().toISOString()
            }
        });
        res.status(201).json(galleryItem);
    } catch (error) {
        console.error("Supabase Upload Error:", error);
        res.status(500).json({ error: 'Failed to upload gallery item to Supabase' });
    }
};

exports.deleteGalleryItem = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const galleryItem = await prisma.gallery.findUnique({ where: { id } });
        if (!galleryItem) return res.status(404).json({ error: 'Gallery item not found' });
        
        await prisma.gallery.delete({ where: { id } });
        res.json({ message: 'Gallery item deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete gallery item' });
    }
};
