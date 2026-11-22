-- Phase 2: Additive database schema migration for Neon Managed Auth (auth-dev branch)
-- Target: students and teachers tables
-- Date: 2026-11-22
-- Safety: Additive, nullable UUID, zero data loss, preserves all existing IDs and relationships.

BEGIN;

-- 1. Add auth_user_id UUID column to students
ALTER TABLE "students" ADD COLUMN "auth_user_id" UUID;

-- 2. Add auth_user_id UUID column to teachers
ALTER TABLE "teachers" ADD COLUMN "auth_user_id" UUID;

-- 3. Create unique index on students(auth_user_id)
CREATE UNIQUE INDEX "students_auth_user_id_key" ON "students"("auth_user_id");

-- 4. Create unique index on teachers(auth_user_id)
CREATE UNIQUE INDEX "teachers_auth_user_id_key" ON "teachers"("auth_user_id");

COMMIT;
