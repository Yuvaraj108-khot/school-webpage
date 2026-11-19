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
        const { category, description, image_url: body_url } = req.body;
        let publicUrl = body_url;

        if (req.file) {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const cleanFileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            fs.writeFileSync(path.join(uploadsDir, cleanFileName), req.file.buffer);
            publicUrl = `/uploads/${cleanFileName}`;
        }

        if (!publicUrl) {
            return res.status(400).json({ error: 'No image file or URL provided' });
        }
        
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
