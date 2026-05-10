CREATE TABLE IF NOT EXISTS question_categories (
  name text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO question_categories (name)
SELECT DISTINCT trim(category) AS name
FROM question_set_questions
WHERE category IS NOT NULL
  AND length(trim(category)) > 0
ON CONFLICT (name) DO NOTHING;
