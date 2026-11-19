require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../')));

// Routes Imports
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const marksRoutes = require('./routes/marksRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const alumniRoutes = require('./routes/alumniRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const exportRoutes = require('./routes/exportRoutes');
const authRoutes = require('./routes/authRoutes');

// New Relational Routes Imports
const mediumRoutes = require('./routes/mediumRoutes');
const classRoutes = require('./routes/classRoutes');
const examRoutes = require('./routes/examRoutes');
const subjectTeacherRoutes = require('./routes/subjectTeacherRoutes');

// Route Registrations
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/marks', marksRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/events', noticeRoutes);
app.use('/api/alumni', alumniRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/auth', authRoutes);

// New Relational Route Registrations
app.use('/api/mediums', mediumRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/subject-teachers', subjectTeacherRoutes);

const prisma = require('./prismaClient');

// Health Check & Neon Status
app.get('/api/health', async (req, res) => {
    try {
        const studentCount = await prisma.student.count();
        res.json({
            status: "ok",
            database: "Neon PostgreSQL",
            branch: process.env.NEON_BRANCH || "production",
            studentCount,
            services: {
                postgres: "connected",
                auth: process.env.NEON_AUTH_BASE_URL ? "configured" : "none",
                realtime: process.env.NEON_REALTIME_URL ? "configured" : "none"
            }
        });
    } catch (error) {
        res.status(500).json({ status: "error", error: error.message });
    }
});

if (!process.env.VERCEL) {
    // Initialize Cron Jobs
    const { scheduleRollover } = require('./utils/rollover');
    scheduleRollover();

    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}

module.exports = app;
