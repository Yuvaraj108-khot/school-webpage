const prisma = require('../prismaClient');
const supabase = require('../supabaseClient');

exports.getAlumni = async (req, res) => {
    try {
        const { status } = req.query;
        let whereClause = {};
        if (status) {
            whereClause.status = status;
        }
        const alumni = await prisma.alumni.findMany({ where: whereClause, orderBy: { applied_at: 'desc' } });
        res.json(alumni);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alumni' });
    }
};

exports.createAlumni = async (req, res) => {
    try {
        const { name, batch_year, profession, email } = req.body;
        const status = req.body.status || 'Pending';
        
        let photo_url = null;
        if (req.file) {
            try {
                // Try Supabase first
                const fileName = `${Date.now()}-${req.file.originalname}`;
                const { data, error } = await supabase.storage
                    .from('school-media')
                    .upload(`alumni/${fileName}`, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: true
                    });

                if (error) throw error;

                const { data: urlData } = supabase.storage
                    .from('school-media')
                    .getPublicUrl(`alumni/${fileName}`);
                
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

        const alumni = await prisma.alumni.create({
            data: { name, email, batch_year, profession, photo_url, status }
        });
        res.status(201).json(alumni);
    } catch (error) {
        console.error("Create Alumni Error:", error);
        res.status(500).json({ error: 'Failed to create alumni' });
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

exports.updateAlumniStatus = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;
        
        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const alumni = await prisma.alumni.update({
            where: { id },
            data: { status }
        });
        res.json(alumni);
    } catch (error) {
        console.error("Update Alumni Status Error:", error);
        res.status(500).json({ error: 'Failed to update alumni status' });
    }
};
