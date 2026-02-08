-- Migration: Add detailed use case fields and conditional question logic
-- Date: 2026-02-08

-- Add new columns to use_cases table
ALTER TABLE use_cases
  ADD COLUMN IF NOT EXISTS engagement_category TEXT,
  ADD COLUMN IF NOT EXISTS whats_included TEXT,
  ADD COLUMN IF NOT EXISTS key_deliverables TEXT,
  ADD COLUMN IF NOT EXISTS why_it_matters TEXT,
  ADD COLUMN IF NOT EXISTS how_its_delivered TEXT,
  ADD COLUMN IF NOT EXISTS use_case_number INT;

-- Add conditional display columns to questions table
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS condition_question_id uuid REFERENCES questions(id),
  ADD COLUMN IF NOT EXISTS condition_answer TEXT;

-- Drop the unique constraint on version so we can re-seed
ALTER TABLE questionnaires DROP CONSTRAINT IF EXISTS questionnaires_version_key;
ALTER TABLE questionnaires ADD CONSTRAINT questionnaires_version_key UNIQUE (version);
