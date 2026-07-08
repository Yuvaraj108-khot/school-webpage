const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const teachersData = [
  // LKG/UKG/Primary
  { name: 'GAYATHRI PAI', subject: 'B.Sc. Montessori', experience: '21 year', phone: '8105907400', category: 'LKG', medium: 'Both' },
  { name: 'ANURADHA K', subject: 'B.A. Montessori', experience: '18 year', phone: '9945013065', category: 'UKG', medium: 'Both' },
  { name: 'VIDYAV KINI', subject: 'B.Sc., b.Ed,Guide Commissioner training', experience: '22 year', phone: '9945013065', category: 'Primary Section', medium: 'Both' },
  { name: 'SEEMA KAMATH', subject: 'M.A,TCH,B.Ed,Hindi Praveena,Basic guider training', experience: '21 year', phone: '9945013065', category: 'Primary Section', medium: 'Both' },
  { name: 'PUSHA', subject: 'B.A,B.Ed', experience: '20 year', phone: '7899983092', category: 'Primary Section', medium: 'Both' },
  { name: 'SHUBHALAXMI', subject: 'M.A,B.Ed', experience: '19 year', phone: '9902194287', category: 'Primary Section', medium: 'Both' },
  { name: 'SAVITHA', subject: 'M.A,B.Ed,Tch', experience: '19 year', phone: '8971164977', category: 'Primary Section', medium: 'Both' },
  { name: 'ASHA MADIVALA', subject: 'B.A,D.Ed', experience: '16 year', phone: '7353620437', category: 'Primary Section', medium: 'Both' },
  { name: 'RANJITHA', subject: 'B.A,D.Ed,B.Ed', experience: '14 year', phone: '8748896695', category: 'Primary Section', medium: 'Both' },
  { name: 'SUJATHA HEGDE', subject: 'B.A, B.P.Ed,Basic Scouter Training', experience: '8 year', phone: '9008844815', category: 'Primary Section', medium: 'Both' },
  { name: 'SHWETHA BHAT', subject: 'M.Sc,B.Ed,Montenssori', experience: '5 year', phone: '8296457780', category: 'Primary Section', medium: 'Both' },
  { name: 'ARCHANA Y KINI', subject: 'PUC,Montessory', experience: '4 year', phone: '7624926755', category: 'Primary Section', medium: 'Both' },
  { name: 'SNEHA LONDE', subject: 'B.A,B.Ed', experience: '4 year', phone: '9964237176', category: 'Primary Section', medium: 'Both' },
  { name: 'Gayathri Kini', subject: 'B.Com.Dilpm in english', experience: '21 year', phone: '9964237176', category: 'Primary Section', medium: 'Both' },
  // AIDED KANNADA MEDIUM
  { name: 'Mis. Nayana Shenoy M', subject: 'B.Sc, Science', experience: '20 year', phone: '9060479695', category: 'Aided Kannada Medium', medium: 'Kannada' },
  { name: 'Mis. Chethana Nayak', subject: 'MA,B.Ed, Hindi Teacher', experience: '20 year', phone: '9449451587', category: 'Aided Kannada Medium', medium: 'Kannada' },
  { name: 'Mis. Poornima Prabhu M U', subject: 'MA, B.Ed, samskrit Language Teacher', experience: '20 year', phone: '8073661207', category: 'Aided Kannada Medium', medium: 'Kannada' },
  { name: 'Mr. Ganesh s', subject: 'MA, B.Ed,Kannada Language Teacher', experience: '15 year', phone: '9481214438', category: 'Aided Kannada Medium', medium: 'Kannada' },
  { name: 'Mr. Sanjay Kumar', subject: 'MA.B.P.Ed,P.G.Diploma in Yoga,P.E.T(Grade-1) Teacher', experience: '30 year', phone: '9449387959', category: 'Aided Kannada Medium', medium: 'Kannada' },
  { name: 'Mr.Divya Kumar C K', subject: 'MA, B.Ed, Social Science Teacher', experience: '13 year', phone: '9481757990', category: 'Aided Kannada Medium', medium: 'Kannada' },
  { name: 'Miss. SriLaxmi Nayak', subject: 'MCom,B.Ed,D.C.A, English, Computer teacher', experience: '02 year', phone: '8105461966', category: 'Aided Kannada Medium', medium: 'Kannada' },
  // ENGLISH MEDIUM
  { name: 'Mr.Denis D’Cunha', subject: 'MA,B.Ed, Social Science and English Teacher', experience: '28 year', phone: '9972356828', category: 'English Medium', medium: 'English' },
  { name: 'Mis. Veena B', subject: 'MA,M.Sc.,B.Ed, Science & English Teacher', experience: '20 year', phone: '9611845657', category: 'English Medium', medium: 'English' },
  { name: 'Mis Indira P Nayak', subject: 'MA, B.Sc.,B.Ed, Maths & Biology Teacher, (Guide Teacher)', experience: '13 year', phone: '7760917707', category: 'English Medium', medium: 'English' },
  { name: 'Mis. Sudha Mohan', subject: 'MA, B.Ed, Sanskrit Language Teacher', experience: '08 year', phone: '9886391537', category: 'English Medium', medium: 'English' },
  { name: 'Miss. Bhavya Kini', subject: 'M.Sc.,B.Ed, Maths Teacher,N.C.C. Officer', experience: '01 year', phone: '9380875491', category: 'English Medium', medium: 'English' }
];

async function seedTeachers() {
    let idCounter = 1;
    for (const t of teachersData) {
        let staff_id = `TCH-${String(idCounter).padStart(3, '0')}`;
        
        // Ensure staff_id is unique
        let existing = await prisma.teacher.findUnique({ where: { staff_id } });
        while(existing) {
            idCounter++;
            staff_id = `TCH-${String(idCounter).padStart(3, '0')}`;
            existing = await prisma.teacher.findUnique({ where: { staff_id } });
        }

        const email = `${t.name.toLowerCase().replace(/[^a-z0-9]/g, '')}${idCounter}@school.com`;
        
        try {
            await prisma.teacher.create({
                data: {
                    name: t.name,
                    subject: t.subject,
                    medium: t.medium,
                    experience: t.experience,
                    phone: t.phone,
                    category: t.category,
                    staff_id,
                    email,
                    password: staff_id // Default password
                }
            });
            console.log(`Added ${t.name}`);
        } catch (e) {
            console.error(`Failed to add ${t.name}:`, e);
        }
        idCounter++;
    }
    console.log("Seeding complete!");
}

seedTeachers().finally(() => prisma.$disconnect());
