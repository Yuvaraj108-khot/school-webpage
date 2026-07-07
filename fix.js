const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
async function fix() { 
  const queries = [ 
    "ALTER TABLE alumni ADD COLUMN IF NOT EXISTS email TEXT", 
    "ALTER TABLE alumni ADD COLUMN IF NOT EXISTS phone TEXT", 
    "ALTER TABLE alumni ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending'", 
    "ALTER TABLE alumni ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP(6) DEFAULT now()" 
  ]; 
  for(let q of queries) { 
    try { 
      await prisma.$executeRawUnsafe(q); 
      console.log('Executed:', q); 
    } catch(e) { 
      console.error('Failed:', q, e.message); 
    } 
  } 
} 
fix().finally(() => prisma.$disconnect());
