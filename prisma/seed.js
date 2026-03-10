const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding the sbs_school database...\n');

    // --- Student ---
    const student = await prisma.student.upsert({
        where: { student_code: 'C1-001' },
        update: {},
        create: {
            student_code: 'C1-001',
            name: 'Rahul Kumar',
            class: '1',
            medium: 'English',
            parent_name: 'Raj Kumar',
        },
    });
    console.log(`✅ Student created: ${student.name} (${student.student_code})`);

    // --- Teacher ---
    const teacher = await prisma.teacher.create({
        data: {
            name: 'Anita Sharma',
            subject: 'Mathematics',
            medium: 'English',
        },
    });
    console.log(`✅ Teacher created: ${teacher.name} (${teacher.subject})`);

    // --- Notice ---
    const notice = await prisma.notice.create({
        data: {
            title: 'Annual Sports Day',
            description: 'Annual sports event for all classes',
            date: new Date('2026-03-10'),
        },
    });
    console.log(`✅ Notice created: ${notice.title}`);

    // --- Attendance ---
    const attendance = await prisma.attendance.create({
        data: {
            student_code: 'C1-001',
            class: '1',
            teacher_name: 'Anita Sharma',
            date: new Date('2026-03-01'),
            status: 'Present',
        },
    });
    console.log(
        `✅ Attendance created: ${attendance.student_code} on ${attendance.date.toDateString()} — ${attendance.status}`
    );

    // --- Marks ---
    const marks = await prisma.marks.create({
        data: {
            student_code: 'C1-001',
            class: '1',
            subject: 'Math',
            exam_type: 'Unit Test',
            marks: 92,
        },
    });
    console.log(
        `✅ Marks created: ${marks.student_code} — ${marks.subject} (${marks.exam_type}): ${marks.marks}`
    );

    // --- Certificate Request ---
    const certRequest = await prisma.certificateRequest.create({
        data: {
            student_code: 'C1-001',
            certificate_type: 'Transfer Certificate',
            status: 'Pending',
        },
    });
    console.log(
        `✅ Certificate Request created: ${certRequest.certificate_type} for ${certRequest.student_code} — ${certRequest.status}`
    );

    console.log('\n🎉 Seeding complete!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
