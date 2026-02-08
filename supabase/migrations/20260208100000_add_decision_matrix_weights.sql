-- Add weight column to decision_matrix for weighted scoring
-- Weights determine how much each question section influences recommendations
-- Higher weights = more specific/important questions

ALTER TABLE decision_matrix ADD COLUMN weight INT NOT NULL DEFAULT 2;

-- Section 3.x.1 (Core Business Challenge Details — MultipleChoice follow-ups)
-- These are the most specific pain point identifiers → weight 5
UPDATE decision_matrix dm SET weight = 5
FROM questions q, sections s
WHERE dm.question_id = q.id AND q.section_id = s.id
AND s.title = 'Core Business Challenges' AND q.question_type = 'MultipleChoice';

-- Section 9 (Industry-Specific Questions — YesNo)
-- Highly targeted to vertical → weight 4
UPDATE decision_matrix dm SET weight = 4
FROM questions q, sections s
WHERE dm.question_id = q.id AND q.section_id = s.id
AND s.title = 'Industry-Specific Questions';

-- Section 3 (Core Business Challenges — YesNo parent questions)
-- Identifies real business problems → weight 3
UPDATE decision_matrix dm SET weight = 3
FROM questions q, sections s
WHERE dm.question_id = q.id AND q.section_id = s.id
AND s.title = 'Core Business Challenges' AND q.question_type = 'YesNo';

-- Sections 4-8 (Functional area checkboxes) keep the default weight of 2
-- These are relevant but broader in scope

-- Section 10 (Strategic Technology Roadmap)
-- Aspirational/directional → weight 1
UPDATE decision_matrix dm SET weight = 1
FROM questions q, sections s
WHERE dm.question_id = q.id AND q.section_id = s.id
AND s.title = 'Strategic Technology Roadmap';
