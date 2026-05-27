const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
let content = fs.readFileSync(schemaPath, 'utf8');

// 1. Evolve Student
const studentOld = `model Student {
  id           Int     @id @default(autoincrement())
  student_code String? @unique
  name         String
  class        String
  medium       String
  parent_name  String?
  photo_url    String?
  roll_no      String?

  @@map("students")
  @@schema("public")
}`;

const studentNew = `model Student {
  id           Int     @id @default(autoincrement())
  student_code String? @unique
  name         String
  class        String
  medium       String
  parent_name  String?
  photo_url    String?
  roll_no      String?

  // Additive fields & relations
  class_id      Int?
  class_rel     SchoolClass? @relation(fields: [class_id], references: [id])
  medium_id     Int?
  medium_rel    Medium?      @relation(fields: [medium_id], references: [id])
  is_active     Boolean      @default(true)
  academic_year String       @default("2025-2026")

  marks                 Marks[]
  attendance            Attendance[]
  certificate_requests  CertificateRequest[]

  @@map("students")
  @@schema("public")
}`;

content = content.replace(studentOld, studentNew);

// 2. Evolve Teacher
const teacherOld = `model Teacher {
  id          Int      @id @default(autoincrement())
  name        String
  subject     String
  medium      String
  category    String?
  designation String?
  experience  String?
  joined_date DateTime @default(now())
  photo_url   String?

  @@map("teachers")
  @@schema("public")
}`;

const teacherNew = `model Teacher {
  id          Int      @id @default(autoincrement())
  name        String
  subject     String
  medium      String
  category    String?
  designation String?
  experience  String?
  joined_date DateTime @default(now())
  photo_url   String?

  // Additive fields & relations
  is_active        Boolean          @default(true)
  academic_year    String           @default("2025-2026")
  subject_teachers SubjectTeacher[]

  @@map("teachers")
  @@schema("public")
}`;

content = content.replace(teacherOld, teacherNew);

// 3. Evolve Attendance
const attendanceOld = `model Attendance {
  id           Int       @id @default(autoincrement())
  student_code String?
  class        String?
  teacher_name String?
  date         DateTime? @db.Timestamp(6)
  status       String?
  medium       String?
  section      String?   @default("A")

  @@map("attendance")
  @@schema("public")
}`;

const attendanceNew = `model Attendance {
  id           Int       @id @default(autoincrement())
  student_code String?
  class        String?
  teacher_name String?
  date         DateTime? @db.Timestamp(6)
  status       String?
  medium       String?
  section      String?   @default("A")

  // Additive fields & relations
  attendance_day String?
  student_id     Int?
  student        Student? @relation(fields: [student_id], references: [id])
  subject_id     Int?
  subject_rel    Subject? @relation(fields: [subject_id], references: [id])
  is_active      Boolean  @default(true)
  academic_year  String   @default("2025-2026")

  @@unique([student_id, subject_id, attendance_day, period])
  @@map("attendance")
  @@schema("public")
}`;

// Note: Wait! Let's check if there is a 'period' field in the old Attendance model!
// In the viewed lines, line 74-86:
// student_code String?
// class String?
// teacher_name String?
// date DateTime? @db.Timestamp(6)
// status String?
// medium String?
// section String? @default("A")
// Oh, the old model in the database doesn't have a 'period' or 'subject' field?
// Let's look at lines 74-86 in our view_file:
// 74: model Attendance {
// 75:   id           Int       @id @default(autoincrement())
// 76:   student_code String?
// 77:   class        String?
// 78:   teacher_name String?
// 79:   date         DateTime? @db.Timestamp(6)
// 80:   status       String?
// 81:   medium       String?
// 82:   section      String?   @default("A")
// Oh! It doesn't have 'period' or 'subject' in the actual database table!
// Wait! Let's check Marks in lines 88-101:
// 88: model Marks {
// 89:   id           Int     @id @default(autoincrement())
// 90:   student_code String?
// 91:   class        String?
// 92:   subject      String?
// 93:   exam_type    String?
// 94:   marks        Int?
// 95:   medium       String?
// 96:   section      String? @default("A")
// 97:   total        Int?
// Marks has 'subject' but not 'exam_id' or 'subject_id'.
// Attendance does not have 'period' or 'subject'!
// Wait, if Attendance does not have 'period' or 'subject', but our old schema model had:
// student_code String?
// class String?
// medium String?
// period String?
// subject String?
// teacher_name String?
// date DateTime?
// status String?
// Why did the database not have them?
// Ah! In the database they might have been missing or dropped or introspected from the real DB which had `section` instead.
// Since we CANNOT delete columns, we must make sure we ADD them safely as additive changes!
// So in `attendanceNew`, we should preserve `period` and `subject` as optional fields if they are missing!
// Let's check what the old model in the database has. It has `student_code`, `class`, `teacher_name`, `date`, `status`, `medium`, `section`.
// If we want to add `period` and `subject`, they will be added as new optional fields!
// So:
// attendanceNew:
//   id           Int       @id @default(autoincrement())
//   student_code String?
//   class        String?
//   teacher_name String?
//   date         DateTime? @db.Timestamp(6)
//   status       String?
//   medium       String?
//   section      String?   @default("A")
//
//   // Additive fields
//   period       String?
//   subject      String?
//   attendance_day String?
//   student_id     Int?
//   student        Student? @relation(fields: [student_id], references: [id])
//   subject_id     Int?
//   subject_rel    Subject? @relation(fields: [subject_id], references: [id])
//   is_active      Boolean  @default(true)
//   academic_year  String   @default("2025-2026")
// Correct! This keeps all existing fields intact, and safely adds all others!

const attendanceNewCorrected = `model Attendance {
  id           Int       @id @default(autoincrement())
  student_code String?
  class        String?
  teacher_name String?
  date         DateTime? @db.Timestamp(6)
  status       String?
  medium       String?
  section      String?   @default("A")

  // Additive fields & relations
  period         String?
  subject        String?
  attendance_day String?
  student_id     Int?
  student        Student? @relation(fields: [student_id], references: [id])
  subject_id     Int?
  subject_rel    Subject? @relation(fields: [subject_id], references: [id])
  is_active      Boolean  @default(true)
  academic_year  String   @default("2025-2026")

  @@unique([student_id, subject_id, attendance_day, period])
  @@map("attendance")
  @@schema("public")
}`;

content = content.replace(attendanceOld, attendanceNewCorrected);

// 4. Evolve Marks
const marksOld = `model Marks {
  id           Int     @id @default(autoincrement())
  student_code String?
  class        String?
  subject      String?
  exam_type    String?
  marks        Int?
  medium       String?
  section      String? @default("A")
  total        Int?

  @@map("marks")
  @@schema("public")
}`;

const marksNew = `model Marks {
  id           Int     @id @default(autoincrement())
  student_code String?
  class        String?
  subject      String?
  exam_type    String?
  marks        Int?
  medium       String?
  section      String? @default("A")
  total        Int?

  // Additive fields & relations
  student_id    Int?
  student       Student? @relation(fields: [student_id], references: [id])
  exam_id       Int?
  exam          Exam?    @relation(fields: [exam_id], references: [id])
  subject_id    Int?
  subject_rel   Subject? @relation(fields: [subject_id], references: [id])
  is_active     Boolean  @default(true)
  academic_year String   @default("2025-2026")

  @@unique([student_id, subject_id, exam_id])
  @@map("marks")
  @@schema("public")
}`;

content = content.replace(marksOld, marksNew);

// 5. Evolve CertificateRequest
const certOld = `model CertificateRequest {
  id               Int       @id @default(autoincrement())
  student_code     String?
  certificate_type String?
  status           String?   @default("Pending")
  request_date     DateTime? @default(now()) @db.Timestamp(6)

  @@map("certificate_requests")
  @@schema("public")
}`;

const certNew = `model CertificateRequest {
  id               Int       @id @default(autoincrement())
  student_code     String?
  certificate_type String?
  status           String?   @default("Pending")
  request_date     DateTime? @default(now()) @db.Timestamp(6)

  // Additive fields & relations
  student_id    Int?
  student       Student? @relation(fields: [student_id], references: [id])
  is_active     Boolean  @default(true)
  academic_year String   @default("2025-2026")

  @@map("certificate_requests")
  @@schema("public")
}`;

content = content.replace(certOld, certNew);

// 6. Append New Models
const newModels = `
// ==================== NEW MODELS ====================

model Medium {
  id        Int      @id @default(autoincrement())
  name      String   @unique // e.g. "CBSE", "Kannada", "English"
  is_active Boolean  @default(true)
  
  students  Student[]
  classes   SchoolClass[]
  subjects  Subject[]
  
  @@map("mediums")
  @@schema("public")
}

model SchoolClass {
  id        Int      @id @default(autoincrement())
  name      String   // e.g. "1", "2", ..., "10"
  medium_id Int
  medium    Medium   @relation(fields: [medium_id], references: [id])
  is_active Boolean  @default(true)
  
  students  Student[]
  subjects  Subject[]
  
  @@unique([name, medium_id])
  @@map("school_classes")
  @@schema("public")
}

model Subject {
  id          Int      @id @default(autoincrement())
  name        String   // e.g. "Mathematics", "Science"
  class_id    Int
  class       SchoolClass @relation(fields: [class_id], references: [id])
  medium_id   Int
  medium      Medium   @relation(fields: [medium_id], references: [id])
  is_active   Boolean  @default(true)
  
  subject_teachers SubjectTeacher[]
  marks            Marks[]
  attendance       Attendance[]

  @@unique([name, class_id, medium_id])
  @@map("subjects")
  @@schema("public")
}

model SubjectTeacher {
  id         Int      @id @default(autoincrement())
  subject_id Int
  subject    Subject  @relation(fields: [subject_id], references: [id])
  teacher_id Int
  teacher    Teacher  @relation(fields: [teacher_id], references: [id])
  is_active  Boolean  @default(true)
  
  @@unique([subject_id, teacher_id])
  @@map("subject_teachers")
  @@schema("public")
}

model Exam {
  id            Int      @id @default(autoincrement())
  name          String   @unique // e.g. "Midterm", "Final"
  academic_year String   @default("2025-2026")
  is_active     Boolean  @default(true)
  
  marks         Marks[]
  
  @@map("exams")
  @@schema("public")
}
`;

content += newModels;

fs.writeFileSync(schemaPath, content, 'utf8');
console.log('Successfully evolved schema.prisma!');
