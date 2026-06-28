const prisma = require('../prismaClient');
const ExcelJS = require('exceljs');

// Configuration: Final Academic Class (defaults to 10)
const getFinalClassClean = () => {
    const finalClassConfig = process.env.FINAL_ACADEMIC_CLASS || '10';
    return finalClassConfig.replace(/\D/g, '');
};

// 1. Get students eligible for graduation (active students in the final academic class)
exports.getEligibleStudents = async (req, res) => {
    try {
        const finalClassClean = getFinalClassClean();
        
        // Fetch all active students
        const students = await prisma.student.findMany({
            where: { is_active: true },
            include: {
                class_rel: true,
                medium_rel: true
            },
            orderBy: { name: 'asc' }
        });

        // Filter by final class configuration
        const eligible = students.filter(s => {
            const studentClassClean = s.class.replace(/\D/g, '');
            return studentClassClean === finalClassClean;
        });

        res.json(eligible);
    } catch (error) {
        console.error('Error fetching eligible students:', error);
        res.status(500).json({ error: 'Failed to fetch eligible students' });
    }
};

// 2. Graduate student (Transaction-based)
exports.graduateStudent = async (req, res) => {
    const { student_id, graduation_batch, higher_education, employment_status, current_organization, email, phone } = req.body;

    if (!student_id || !graduation_batch) {
        return res.status(400).json({ error: 'Student ID and Graduation Batch are required' });
    }

    try {
        // Find the student first
        const student = await prisma.student.findUnique({
            where: { id: parseInt(student_id) }
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        if (!student.is_active) {
            return res.status(400).json({ error: 'Student is already inactive or graduated' });
        }

        // Validate final class eligibility
        const finalClassClean = getFinalClassClean();
        const studentClassClean = student.class.replace(/\D/g, '');
        if (studentClassClean !== finalClassClean) {
            return res.status(400).json({ 
                error: `Student class (${student.class}) does not match the configured final class (Class ${process.env.FINAL_ACADEMIC_CLASS || '10'})` 
            });
        }

        // Default values: Copy email/phone if left blank (note: Student schema only has email, not phone)
        const finalEmail = email ? email.trim() : (student.email || null);
        const finalPhone = phone ? phone.trim() : null;

        // Perform graduation atomically
        const result = await prisma.$transaction(async (tx) => {
            // Update student status: is_active = false
            const updatedStudent = await tx.student.update({
                where: { id: student.id },
                data: { is_active: false }
            });

            // Create tracking profile
            const tracking = await tx.alumniTracking.create({
                data: {
                    student_id: student.id,
                    graduation_batch: String(graduation_batch),
                    higher_education: higher_education || null,
                    employment_status: employment_status || null,
                    current_organization: current_organization || null,
                    email: finalEmail,
                    phone: finalPhone
                }
            });

            return { updatedStudent, tracking };
        });

        res.status(201).json({
            message: 'Student graduated successfully',
            data: result
        });

    } catch (error) {
        console.error('Graduation Transaction Error:', error);
        res.status(500).json({ error: error.message || 'Failed to complete graduation workflow' });
    }
};

// 3. Get list of tracked alumni (supports search & filters)
exports.getAlumniTrackingList = async (req, res) => {
    try {
        const { search, employment_status, batch } = req.query;

        const andConditions = [];

        if (employment_status && employment_status !== 'All') {
            andConditions.push({ employment_status });
        }

        if (batch) {
            andConditions.push({ graduation_batch: String(batch) });
        }

        if (search) {
            andConditions.push({
                student_rel: {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { student_code: { contains: search, mode: 'insensitive' } }
                    ]
                }
            });
        }

        const where = andConditions.length > 0 ? { AND: andConditions } : {};

        const trackingList = await prisma.alumniTracking.findMany({
            where,
            include: {
                student_rel: {
                    include: {
                        class_rel: true,
                        medium_rel: true
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        res.json(trackingList);
    } catch (error) {
        console.error('Error fetching alumni tracking list:', error);
        res.status(500).json({ error: 'Failed to fetch alumni tracking database' });
    }
};

// 4. Update tracking record
exports.updateAlumniTracking = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { higher_education, employment_status, current_organization, email, phone, graduation_batch } = req.body;

        const existing = await prisma.alumniTracking.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Tracking profile not found' });
        }

        const updated = await prisma.alumniTracking.update({
            where: { id },
            data: {
                graduation_batch: graduation_batch !== undefined ? String(graduation_batch) : existing.graduation_batch,
                higher_education: higher_education !== undefined ? higher_education : existing.higher_education,
                employment_status: employment_status !== undefined ? employment_status : existing.employment_status,
                current_organization: current_organization !== undefined ? current_organization : existing.current_organization,
                email: email !== undefined ? email : existing.email,
                phone: phone !== undefined ? phone : existing.phone
            },
            include: {
                student_rel: true
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating tracking profile:', error);
        res.status(500).json({ error: 'Failed to update tracking profile' });
    }
};

// 5. Delete tracking profile (re-activates the student profile atomically)
exports.deleteAlumniTracking = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const existing = await prisma.alumniTracking.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Tracking profile not found' });
        }

        // Atomically remove tracking and restore student active status
        await prisma.$transaction([
            prisma.student.update({
                where: { id: existing.student_id },
                data: { is_active: true }
            }),
            prisma.alumniTracking.delete({
                where: { id }
            })
        ]);

        res.json({ message: 'Tracking profile removed and student active status restored successfully' });
    } catch (error) {
        console.error('Error deleting tracking profile:', error);
        res.status(500).json({ error: 'Failed to delete tracking profile' });
    }
};

// 6. Get dashboard stats
exports.getDashboardStats = async (req, res) => {
    try {
        const now = new Date();
        const currentYearStr = String(now.getFullYear());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const totalAlumni = await prisma.alumniTracking.count();
        
        const graduatedThisYear = await prisma.alumniTracking.count({
            where: { graduation_batch: currentYearStr }
        });

        const archivedThisMonth = await prisma.alumniTracking.count({
            where: {
                created_at: { gte: startOfMonth }
            }
        });

        // Find latest batch
        const latestRecord = await prisma.alumniTracking.findFirst({
            orderBy: { graduation_batch: 'desc' },
            select: { graduation_batch: true }
        });
        const latestBatch = latestRecord ? latestRecord.graduation_batch : 'N/A';

        res.json({
            totalAlumni,
            graduatedThisYear,
            latestBatch,
            archivedThisMonth
        });
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ error: 'Failed to compute dashboard stats' });
    }
};

// 7. Export to Excel (reusing ExcelJS pattern)
exports.exportExcel = async (req, res) => {
    try {
        const trackingList = await prisma.alumniTracking.findMany({
            include: {
                student_rel: true
            },
            orderBy: { graduation_batch: 'desc' }
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Alumni Tracking Database');

        const primaryFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF5B21B6' } // Purple matching the theme
        };

        // Title Block
        sheet.mergeCells('A1:G1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'SBRS Alumni Tracking Database';
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = primaryFill;
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 40;

        // Subtitle
        sheet.mergeCells('A2:G2');
        const subCell = sheet.getCell('A2');
        subCell.value = `Report Generated: ${new Date().toLocaleDateString()}`;
        subCell.font = { name: 'Arial', size: 10, italic: true };
        subCell.alignment = { horizontal: 'center' };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        // Table Header
        const headerRow = sheet.addRow([
            'Student Code', 
            'Name', 
            'Graduation Batch', 
            'Employment Status', 
            'Current Organization', 
            'Higher Education', 
            'Contact Info (Email/Phone)'
        ]);
        headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.eachCell(cell => {
            cell.fill = primaryFill;
            cell.alignment = { horizontal: 'center' };
        });
        sheet.getRow(4).height = 25;

        // Populate Data
        trackingList.forEach(rec => {
            const student = rec.student_rel;
            const contact = [rec.email, rec.phone].filter(Boolean).join(' / ') || '-';
            sheet.addRow([
                student.student_code || '-',
                student.name || '-',
                rec.graduation_batch || '-',
                rec.employment_status || '-',
                rec.current_organization || '-',
                rec.higher_education || '-',
                contact
            ]);
        });

        // Format borders & widths
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

        sheet.eachRow((row, rowNum) => {
            if (rowNum > 4) {
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                });
            }
        });

        res.setHeader('Content-Disposition', 'attachment; filename=Alumni_Tracking_Roster.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Excel Export Error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
};

// 8. Export to CSV (simple pattern)
exports.exportCsv = async (req, res) => {
    try {
        const trackingList = await prisma.alumniTracking.findMany({
            include: {
                student_rel: true
            },
            orderBy: { graduation_batch: 'desc' }
        });

        // CSV Header
        let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility
        csvContent += '"Student Code","Name","Graduation Batch","Employment Status","Current Organization","Higher Education","Email","Phone"\n';

        // Add rows
        trackingList.forEach(rec => {
            const student = rec.student_rel;
            const escape = (val) => `"${(val || '').toString().replace(/"/g, '""')}"`;
            csvContent += `${escape(student.student_code)},${escape(student.name)},${escape(rec.graduation_batch)},${escape(rec.employment_status)},${escape(rec.current_organization)},${escape(rec.higher_education)},${escape(rec.email)},${escape(rec.phone)}\n`;
        });

        res.setHeader('Content-Disposition', 'attachment; filename=Alumni_Tracking_Roster.csv');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.status(200).send(csvContent);

    } catch (error) {
        console.error('CSV Export Error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
};

// 9. Get eligible students for bulk graduation by class and medium
exports.getEligibleBulkStudents = async (req, res) => {
    try {
        const { class: cls, medium } = req.query;
        if (!cls || !medium) {
            return res.status(400).json({ error: 'Class and Medium are required' });
        }

        const numericCls = cls.replace(/\D/g, '');
        const normalizedMedium = medium === 'CBSE' ? 'English' : medium;

        const students = await prisma.student.findMany({
            where: {
                is_active: true,
                OR: [
                    { class: { equals: cls, mode: 'insensitive' } },
                    { class: { equals: numericCls, mode: 'insensitive' } },
                    { class: { equals: `Class ${numericCls}`, mode: 'insensitive' } }
                ],
                AND: [
                    {
                        OR: [
                            { medium: { equals: medium, mode: 'insensitive' } },
                            { medium: { equals: normalizedMedium, mode: 'insensitive' } }
                        ]
                    }
                ]
            },
            include: {
                class_rel: true,
                medium_rel: true
            },
            orderBy: { name: 'asc' }
        });

        res.json(students);
    } catch (error) {
        console.error('Error fetching bulk eligible students:', error);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
};

// 10. Bulk Graduate Students (Transaction)
exports.bulkGraduateStudent = async (req, res) => {
    const { batch, students } = req.body;

    if (!batch || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'Batch and a valid array of student IDs are required' });
    }

    try {
        // Find already tracked students to avoid duplicates
        const existingRecords = await prisma.alumniTracking.findMany({
            where: { student_id: { in: students } }
        });
        
        const existingIds = existingRecords.map(r => r.student_id);
        const pendingIds = students.filter(id => !existingIds.includes(id));

        if (pendingIds.length === 0) {
            return res.status(400).json({ error: 'All selected students have already been graduated' });
        }

        // Use Prisma transaction to atomically graduate all pending students
        const result = await prisma.$transaction(async (tx) => {
            // Update all to inactive
            const updatedStudents = await tx.student.updateMany({
                where: { id: { in: pendingIds } },
                data: { is_active: false }
            });

            // Prepare tracking data
            const trackingData = pendingIds.map(id => ({
                student_id: id,
                graduation_batch: String(batch)
            }));

            // Create all tracking records
            const trackingRecords = await tx.alumniTracking.createMany({
                data: trackingData
            });

            return { updatedStudents, trackingRecords };
        });

        res.status(201).json({
            message: 'Bulk graduation completed successfully',
            graduated_count: result.updatedStudents.count
        });

    } catch (error) {
        console.error('Bulk Graduation Error:', error);
        res.status(500).json({ error: error.message || 'Failed to complete bulk graduation workflow' });
    }
};
