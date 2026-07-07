require('dotenv').config({ path: __dirname + '/../.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function keepDbAlive() {
    try {
        console.log('Initiating Database Keep-Alive routine...');
        
        // 1. Create a dummy notice to register "write" activity
        const dummyNotice = await prisma.notice.create({
            data: {
                title: "DB Keep Alive - " + new Date().toISOString(),
                description: "Automated entry to prevent Supabase from pausing.",
                date: new Date()
            }
        });
        console.log('✅ Created dummy notice with ID:', dummyNotice.id);

        // 2. Immediately delete it to keep the database clean
        await prisma.notice.delete({
            where: { id: dummyNotice.id }
        });
        console.log('✅ Deleted dummy notice successfully.');
        
        console.log('🎉 Database activity registered successfully! Supabase pause timer reset.');
        
    } catch (error) {
        console.error('❌ Failed to ping database:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

keepDbAlive();
