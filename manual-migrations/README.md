# Manual Database Migrations

This folder tracks targeted, reviewed SQL migrations executed outside `prisma/migrations`.

## Context on Prisma Migration History Inconsistency
- The PostgreSQL database was originally initialized and evolved using SQL scripts (e.g. `setup_database.sql`) without `prisma migrate`.
- Consequently, the `_prisma_migrations` table does not exist in the database.
- A legacy migration file (`prisma/migrations/20260309161209_init_postgres`) exists in the repository from March 9, 2026, which contains stale `CREATE TABLE` statements for tables that already exist in the database.
- Running `prisma migrate dev` or `prisma migrate deploy` would fail or attempt an unwanted reset of existing data.
- To protect all existing school data (students, teachers, marks, attendance, certificates, classes, etc.), schema changes are applied using explicit, additive SQL transactions documented in this directory, followed by updating `prisma/schema.prisma` and running `npx prisma generate`.

## Migrations in this directory

### `phase2_add_auth_user_id.sql`
- **Target Branch:** `auth-dev` (`br-quiet-morning-begtoy2e`)
- **Date Applied:** 2026-11-22
- **Purpose:** Adds nullable `auth_user_id` (UUID) with a unique index to both `students` and `teachers` tables to prepare for linking Neon Managed Auth users without breaking existing student/teacher IDs or relations.
