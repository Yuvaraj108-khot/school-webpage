const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addPhoneColumn() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "public"."teachers" ADD COLUMN IF NOT EXISTS "phone" TEXT;`);
        console.log("Successfully added phone column to teachers table.");
    } catch (e) {
        console.error("Error adding column:", e);
    } finally {
        await prisma.$disconnect();
    }
}

addPhoneColumn();
