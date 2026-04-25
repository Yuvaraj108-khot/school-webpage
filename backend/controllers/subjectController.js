const prisma = require('../prismaClient');

exports.getSubjectsByClass = async (req, res) => {
    try {
        const { class: className, medium } = req.query;
        const subjects = await prisma.classSubject.findMany({
            where: { 
                class: className,
                medium: medium
            }
        });
        res.json(subjects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch subjects' });
    }
};

exports.addSubjectToClass = async (req, res) => {
    try {
        const { class: className, medium, subject } = req.body;
        
        // Check for duplicates
        const existing = await prisma.classSubject.findFirst({
            where: {
                class: className,
                medium: medium,
                subject: subject
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'This subject is already added to this class' });
        }

        const newSubject = await prisma.classSubject.create({
            data: { 
                class: className, 
                medium: medium,
                subject: subject 
            }
        });
        res.status(201).json(newSubject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add subject' });
    }
};

exports.removeSubjectFromClass = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.classSubject.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Subject removed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove subject' });
    }
};
