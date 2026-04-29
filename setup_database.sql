-- 1. Create Database (Run this manually in psql if not already created)
-- CREATE DATABASE sbs_school;

-- Connect to sbs_school before running the following:
-- \c sbs_school

-- 2. Students Table
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    student_code TEXT UNIQUE,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    medium TEXT NOT NULL,
    
);

-- Example record:
-- student_code : C1-001
-- name : Rahul Kumar
-- class : 1
-- medium : English

-- 3. Teachers Table
CREATE TABLE teachers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    medium TEXT NOT NULL
);

-- Example:
-- name : Anita Sharma
-- subject : Mathematics
-- medium : English

-- 4. Gallery Table
CREATE TABLE gallery (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    category TEXT, -- Campus, Events, Sports, Lab, Other
    description TEXT,
    upload_date DATE DEFAULT CURRENT_DATE
);

-- 5. Notices Table (Events)
CREATE TABLE notices (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date DATE
);

-- Examples: Sports Day, Annual Day, Holiday Notice, Exam Announcement

-- 6. Alumni Table
CREATE TABLE alumni (
    id SERIAL PRIMARY KEY,
    name TEXT,
    batch_year TEXT,
    profession TEXT
);

-- Example:
-- name : Rahul Shetty
-- batch_year : 2015
-- profession : Software Engineer
