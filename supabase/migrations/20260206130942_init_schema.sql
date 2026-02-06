-- SAP BTP Use Case Recommendation Platform - Initial Schema

-- Table: questionnaires
CREATE TABLE questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  version TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: sections
CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid REFERENCES questionnaires(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  "order" INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(questionnaire_id, "order")
);

-- Enum type for question types
CREATE TYPE question_type AS ENUM ('MultipleChoice', 'YesNo', 'Checkbox');

-- Table: questions
CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES sections(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type question_type NOT NULL,
  options JSONB,
  "order" INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(section_id, "order")
);

-- Table: use_cases
CREATE TABLE use_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  scope TEXT,
  timeline TEXT,
  price TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: decision_matrix
CREATE TABLE decision_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES questions(id) ON DELETE CASCADE,
  use_case_id uuid REFERENCES use_cases(id) ON DELETE CASCADE,
  triggering_answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(question_id, use_case_id, triggering_answer)
);

-- Table: submissions
CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid REFERENCES questionnaires(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT NOT NULL,
  job_title TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: responses
CREATE TABLE responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES submissions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id),
  answer JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
