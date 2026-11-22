const { PrismaClient } = require('@prisma/client');

// Connect to auth-dev branch database when DEV_DATABASE_URL is set, preserving production DATABASE_URL
const dbUrl = process.env.DEV_DATABASE_URL || process.env.DATABASE_DEV_URL;
const prisma = dbUrl
    ? new PrismaClient({ datasources: { db: { url: dbUrl } } })
    : new PrismaClient();

module.exports = prisma;
