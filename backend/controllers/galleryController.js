const prisma = require('../prismaClient');

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
        let image_url = body_url;

        if (req.file) {
            image_url = `/uploads/${req.file.filename}`;
        }

        if (!image_url) {
            return res.status(400).json({ error: 'No image file or URL provided' });
        }
        
        const galleryItem = await prisma.gallery.create({
            data: {
                image_url,
                category,
                description,
                upload_date: new Date().toISOString()
            }
        });
        res.status(201).json(galleryItem);
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload gallery item' });
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
