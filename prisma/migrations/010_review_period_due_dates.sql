ALTER TABLE review_periods
  ADD COLUMN assessment_due_date DATE,
  ADD COLUMN review_due_date DATE;

UPDATE review_periods
SET assessment_due_date = due_date,
    review_due_date = due_date
WHERE assessment_due_date IS NULL
   OR review_due_date IS NULL;

ALTER TABLE review_periods
  ALTER COLUMN assessment_due_date SET NOT NULL,
  ALTER COLUMN review_due_date SET NOT NULL;

ALTER TABLE review_periods
  ADD CONSTRAINT review_period_deadlines_in_order CHECK (
    start_date <= assessment_due_date
    AND assessment_due_date <= review_due_date
    AND review_due_date <= due_date
  );
