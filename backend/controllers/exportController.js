const prisma = require('../prismaClient');
const XLSX = require('xlsx');

exports.exportAttendance = async (req, res) => {
    try {
        const { class: cls, medium, month, year } = req.query;
        
        // Fetch students
        const students = await prisma.student.findMany({
            where: { class: cls, medium },
            orderBy: { roll_no: 'asc' }
        });

        // Date range filtering
        let dateFilter = {};
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);
            dateFilter = {
                date: { gte: startDate, lte: endDate }
            };
        }

        // Fetch attendance records (sessions)
        const attendanceRecords = await prisma.attendance.findMany({
            where: { class: cls, medium, ...dateFilter },
            orderBy: [{ date: 'asc' }, { period: 'asc' }]
        });

        if (attendanceRecords.length === 0) {
            return res.status(404).json({ error: 'No attendance records found for this period.' });
        }

        // Identify unique sessions (Date + Period + Subject)
        const uniqueSessions = [];
        attendanceRecords.forEach(rec => {
            const dateStr = rec.date.toISOString().split('T')[0];
            const sessionKey = `${dateStr}|${rec.period}|${rec.subject}`;
            if (!uniqueSessions.some(s => s.key === sessionKey)) {
                uniqueSessions.push({ 
                    key: sessionKey, 
                    date: dateStr, 
                    period: rec.period, 
                    subject: rec.subject 
                });
            }
        });

        // Format data for Excel (Vertical Register)
        const wsData = [
            [`SBRS – ${medium} Medium – Class ${cls} – Attendance Register`],
            [`Report Generated on: ${new Date().toLocaleDateString()}`],
            [],
            ['Date', 'Period', 'Subject', 'Roll No', 'Student Name', 'Status']
        ];

        attendanceRecords.forEach(rec => {
            students.forEach(s => {
                // Find matching record for this specific student in this specific session
                const studentRec = attendanceRecords.find(r => 
                    r.student_code === s.student_code && 
                    r.date.getTime() === rec.date.getTime() &&
                    r.period === rec.period &&
                    r.subject === rec.subject
                );

                wsData.push([
                    rec.date.toLocaleDateString(),
                    `Period ${rec.period}`,
                    rec.subject,
                    s.roll_no,
                    s.name,
                    (studentRec && studentRec.status === 'Present') ? 'Present' : (studentRec ? 'Absent' : '-')
                ]);
            });
            // Spacer between sessions
            wsData.push([]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Attendance Register");
        
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename=Register_Attendance_${cls}_${medium}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Export failed' });
    }
};

exports.exportMarks = async (req, res) => {
    try {
        const { class: cls, medium, exam_type, subject } = req.query;
        
        const students = await prisma.student.findMany({
            where: { class: cls, medium },
            orderBy: { roll_no: 'asc' }
        });

        const marksData = await prisma.marks.findMany({
            where: { 
                class: cls, 
                medium, 
                exam_type,
                ...(subject && { subject })
            }
        });


        const rows = students.map(s => {
            const studentMarks = marksData.filter(m => m.student_code === s.student_code);
            const row = {
                'Roll No': s.roll_no,
                'Student Name': s.name
            };
            
            studentMarks.forEach(m => {
                row[m.subject] = `${m.marks} / ${m.total || 100}`;
            });

            return row;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "Marks Report");
        
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        const filename = subject 
            ? `Marks_${cls}_${medium}_${exam_type}_${subject}.xlsx`
            : `Marks_${cls}_${medium}_${exam_type}.xlsx`;

        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Export failed' });
    }
};
