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
            try {
                // Try Supabase first
                const fileName = `${Date.now()}-${req.file.originalname}`;
                const { data, error } = await supabase.storage
                    .from('gallery')
                    .upload(`${fileName}`, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: true
                    });

                if (error) throw error;

                const { data: urlData } = supabase.storage
                    .from('gallery')
                    .getPublicUrl(`${fileName}`);
                
                if (urlData && urlData.publicUrl) {
                    publicUrl = urlData.publicUrl;
                } else {
                    throw new Error("Failed to get public URL");
                }
            } catch (supabaseError) {
                console.warn("Supabase Upload Failed, falling back to local storage:", supabaseError.message);
                // Fallback to local storage
                // Note: multer handles saving to memory, we need to save it to disk for local fallback
                const fs = require('fs');
                const path = require('path');
                const localFileName = `${Date.now()}-${req.file.originalname}`;
                const localPath = path.join(__dirname, '../uploads', localFileName);
                
                // Ensure uploads directory exists
                if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
                    fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
                }

                fs.writeFileSync(localPath, req.file.buffer);
                publicUrl = `/uploads/${localFileName}`;
            }
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
