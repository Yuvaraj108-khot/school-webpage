const prisma = require('../prismaClient');
const ExcelJS = require('exceljs');

exports.exportAttendance = async (req, res) => {
    try {
        const { class: cls, medium, month, year } = req.query;
        
        const studentWhere = { AND: [] };
        if (cls) {
            const numericCls = cls.replace(/\D/g, '');
            studentWhere.AND.push({
                OR: [
                    { class: { equals: cls, mode: 'insensitive' } },
                    { class: { equals: numericCls, mode: 'insensitive' } },
                    { class: { equals: `Class ${numericCls}`, mode: 'insensitive' } }
                ]
            });
        }
        if (medium) {
            const normalized = (medium === 'CBSE' ? 'English' : medium);
            studentWhere.AND.push({
                OR: [
                    { medium: { equals: medium, mode: 'insensitive' } },
                    { medium: { equals: normalized, mode: 'insensitive' } }
                ]
            });
        }
        studentWhere.AND.push({ is_active: true });

        // Fetch students
        const students = await prisma.student.findMany({
            where: studentWhere,
            orderBy: { roll_no: 'asc' }
        });

        // Fetch attendance records
        const attWhere = { AND: [] };
        if (cls) {
            const numericCls = cls.replace(/\D/g, '');
            attWhere.AND.push({
                OR: [
                    { class: { equals: cls, mode: 'insensitive' } },
                    { class: { equals: numericCls, mode: 'insensitive' } },
                    { class: { equals: `Class ${numericCls}`, mode: 'insensitive' } }
                ]
            });
        }
        if (medium) {
            const normalized = (medium === 'CBSE' ? 'English' : medium);
            attWhere.AND.push({
                OR: [
                    { medium: { equals: medium, mode: 'insensitive' } },
                    { medium: { equals: normalized, mode: 'insensitive' } }
                ]
            });
        }
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59, 999);
            attWhere.AND.push({
                date: { gte: startDate, lte: endDate }
            });
        }
        attWhere.AND.push({ is_active: true });

        const attendanceRecords = await prisma.attendance.findMany({
            where: attWhere,
            orderBy: [{ date: 'asc' }, { period: 'asc' }]
        });

        if (attendanceRecords.length === 0) {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Attendance Register');
            sheet.getCell('A1').value = 'No attendance records found for this period.';
            res.setHeader('Content-Disposition', `attachment; filename=Register_Attendance_${cls || 'Class'}_${medium || 'Medium'}.xlsx`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            await workbook.xlsx.write(res);
            return res.end();
        }

        // Create workbook & worksheet
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Attendance Register');

        // Style constants
        const primaryFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1F4E78' } // Navy blue
        };

        const accentFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD9E1F2' } // Light blue accent
        };

        // Title Block
        sheet.mergeCells('A1:F1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = `SBRS Attendance Register – Class ${cls} (${medium} Medium)`;
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = primaryFill;
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 40;

        // Subtitle
        sheet.mergeCells('A2:F2');
        const subCell = sheet.getCell('A2');
        subCell.value = `Report Period: ${month ? `${month}/${year}` : 'All Time'} | Generated: ${new Date().toLocaleDateString()}`;
        subCell.font = { name: 'Arial', size: 10, italic: true };
        subCell.alignment = { horizontal: 'center' };
        sheet.getRow(2).height = 20;

        // Space
        sheet.addRow([]);

        // Table Header
        const headerRow = sheet.addRow(['Date', 'Period', 'Subject', 'Roll No', 'Student Name', 'Status']);
        headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.eachCell(cell => {
            cell.fill = primaryFill;
            cell.alignment = { horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'medium' },
                right: { style: 'thin' }
            };
        });
        sheet.getRow(4).height = 25;

        // Populate Data
        attendanceRecords.forEach(rec => {
            students.forEach(s => {
                const studentRec = attendanceRecords.find(r => 
                    r.student_code === s.student_code && 
                    r.date && rec.date && r.date.getTime() === rec.date.getTime() &&
                    r.period === rec.period &&
                    r.subject === rec.subject
                );

                const status = (studentRec && studentRec.status === 'Present') ? 'Present' : (studentRec ? 'Absent' : '-');
                const row = sheet.addRow([
                    rec.date ? rec.date.toLocaleDateString() : '-',
                    `Period ${rec.period}`,
                    rec.subject,
                    s.roll_no,
                    s.name,
                    status
                ]);

                // Highlight absent records for visual alert
                if (status === 'Absent') {
                    row.getCell(6).font = { color: { argb: 'FFFF0000' }, bold: true }; // Red text
                }
            });
        });

        // Set columns width
        sheet.columns.forEach(col => {
            let maxLen = 0;
            col.eachCell({ includeEmpty: true }, cell => {
                if (cell.value) {
                    const len = cell.value.toString().length;
                    if (len > maxLen) maxLen = len;
                }
            });
            col.width = Math.max(maxLen + 4, 12);
        });

        // Format borders for data rows
        sheet.eachRow((row, rowNum) => {
            if (rowNum > 4) {
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
                    };
                });
            }
        });

        res.setHeader('Content-Disposition', `attachment; filename=Register_Attendance_${cls}_${medium}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Export failed' });
    }
};

exports.exportMarks = async (req, res) => {
    try {
        const { class: cls, medium, exam_type, subject } = req.query;
        
        const studentWhere = { AND: [] };
        if (cls) {
            const numericCls = cls.replace(/\D/g, '');
            studentWhere.AND.push({
                OR: [
                    { class: { equals: cls, mode: 'insensitive' } },
                    { class: { equals: numericCls, mode: 'insensitive' } },
                    { class: { equals: `Class ${numericCls}`, mode: 'insensitive' } }
                ]
            });
        }
        if (medium) {
            const normalized = (medium === 'CBSE' ? 'English' : medium);
            studentWhere.AND.push({
                OR: [
                    { medium: { equals: medium, mode: 'insensitive' } },
                    { medium: { equals: normalized, mode: 'insensitive' } }
                ]
            });
        }
        studentWhere.AND.push({ is_active: true });

        const students = await prisma.student.findMany({
            where: studentWhere,
            orderBy: { roll_no: 'asc' }
        });

        const marksWhere = { AND: [] };
        if (cls) {
            const numericCls = cls.replace(/\D/g, '');
            marksWhere.AND.push({
                OR: [
                    { class: { equals: cls, mode: 'insensitive' } },
                    { class: { equals: numericCls, mode: 'insensitive' } },
                    { class: { equals: `Class ${numericCls}`, mode: 'insensitive' } }
                ]
            });
        }
        if (medium) {
            const normalized = (medium === 'CBSE' ? 'English' : medium);
            marksWhere.AND.push({
                OR: [
                    { medium: { equals: medium, mode: 'insensitive' } },
                    { medium: { equals: normalized, mode: 'insensitive' } }
                ]
            });
        }
        if (exam_type) {
            marksWhere.AND.push({ exam_type });
        }
        if (subject) {
            marksWhere.AND.push({ subject });
        }
        marksWhere.AND.push({ is_active: true });

        const marksData = await prisma.marks.findMany({
            where: marksWhere
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Marks Report');

        const primaryFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1F4E78' }
        };

        // Title Block
        sheet.mergeCells('A1:E1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = `SBRS Marks Register – Class ${cls} (${medium} Medium)`;
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = primaryFill;
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 40;

        // Subtitle
        sheet.mergeCells('A2:E2');
        const subCell = sheet.getCell('A2');
        subCell.value = `Exam: ${exam_type} | ${subject ? `Subject: ${subject} | ` : ''}Generated: ${new Date().toLocaleDateString()}`;
        subCell.font = { name: 'Arial', size: 10, italic: true };
        subCell.alignment = { horizontal: 'center' };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        // Get distinct subjects listed
        const distinctSubjects = [...new Set(marksData.map(m => m.subject))];
        const headers = ['Roll No', 'Student Name', ...distinctSubjects];
        
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.eachCell(cell => {
            cell.fill = primaryFill;
            cell.alignment = { horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'medium' },
                right: { style: 'thin' }
            };
        });
        sheet.getRow(4).height = 25;

        // Populate student score rows
        students.forEach(s => {
            const studentMarks = marksData.filter(m => m.student_code === s.student_code);
            const rowData = [s.roll_no, s.name];
            
            distinctSubjects.forEach(sub => {
                const record = studentMarks.find(m => m.subject === sub);
                rowData.push(record ? record.marks : '-');
            });

            const row = sheet.addRow(rowData);
            // Format number columns centered
            row.eachCell((cell, colNum) => {
                if (colNum > 2) {
                    cell.alignment = { horizontal: 'center' };
                }
            });
        });

        sheet.columns.forEach(col => {
            let maxLen = 0;
            col.eachCell({ includeEmpty: true }, cell => {
                if (cell.value) {
                    const len = cell.value.toString().length;
                    if (len > maxLen) maxLen = len;
                }
            });
            col.width = Math.max(maxLen + 4, 12);
        });

        sheet.eachRow((row, rowNum) => {
            if (rowNum > 4) {
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
                        right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
                    };
                });
            }
        });

        const filename = subject 
            ? `Marks_${cls}_${medium}_${exam_type}_${subject}.xlsx`
            : `Marks_${cls}_${medium}_${exam_type}.xlsx`;

        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Export failed' });
    }
};

exports.exportStudentReportCard = async (req, res) => {
    try {
        const { code } = req.params;

        const student = await prisma.student.findUnique({
            where: { student_code: code }
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Fetch marks and attendance
        const marks = await prisma.marks.findMany({
            where: { student_code: code }
        });

        const attendance = await prisma.attendance.findMany({
            where: { student_code: code }
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Report Card');

        const primaryFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2F4F4F' } // Dark Slate Gray for a premium look
        };

        const highlightFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
        };

        // Title Row
        sheet.mergeCells('A1:E1');
        const title = sheet.getCell('A1');
        title.value = "SBRS ACADEMIC REPORT CARD";
        title.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
        title.fill = primaryFill;
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 45;

        // Student Info block
        sheet.addRow([]);
        sheet.addRow(['STUDENT INFORMATION']).font = { bold: true, size: 12 };
        sheet.addRow(['Name:', student.name, '', 'Student Code:', student.student_code]);
        sheet.addRow(['Class:', student.class, '', 'Medium:', student.medium]);
        sheet.addRow(['Roll No:', student.roll_no || '-', '', 'Parent Name:', student.parent_name || '-']);

        sheet.addRow([]);
        
        // Marks Headers
        const mHeader = sheet.addRow(['Subject', 'Exam', 'Marks Obtained', 'Max Marks', 'Status']);
        mHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        mHeader.eachCell(cell => {
            cell.fill = primaryFill;
            cell.alignment = { horizontal: 'center' };
        });

        marks.forEach(m => {
            const pass = m.marks >= 35 ? 'PASS' : 'FAIL';
            const row = sheet.addRow([m.subject, m.exam_type, m.marks, m.total || 100, pass]);
            row.getCell(3).alignment = { horizontal: 'center' };
            row.getCell(4).alignment = { horizontal: 'center' };
            row.getCell(5).alignment = { horizontal: 'center' };
            if (pass === 'FAIL') {
                row.getCell(5).font = { color: { argb: 'FFFF0000' }, bold: true };
            }
        });

        sheet.addRow([]);
        sheet.addRow(['ATTENDANCE SUMMARY']).font = { bold: true, size: 12 };
        
        const totalSessions = attendance.length;
        const presentSessions = attendance.filter(a => a.status === 'Present').length;
        const pct = totalSessions > 0 ? ((presentSessions / totalSessions) * 100).toFixed(1) : 100;

        sheet.addRow(['Total Sessions:', totalSessions]);
        sheet.addRow(['Present:', presentSessions]);
        sheet.addRow(['Attendance Rate:', `${pct}%`]).font = { bold: true };

        sheet.columns.forEach(col => {
            let maxLen = 0;
            col.eachCell({ includeEmpty: true }, cell => {
                if (cell.value) {
                    const len = cell.value.toString().length;
                    if (len > maxLen) maxLen = len;
                }
            });
            col.width = Math.max(maxLen + 4, 15);
        });

        // Borders
        sheet.eachRow((row, rowNum) => {
            row.eachCell(cell => {
                if (rowNum > 1) {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                }
            });
        });

        res.setHeader('Content-Disposition', `attachment; filename=ReportCard_${student.student_code}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Export failed' });
    }
};
