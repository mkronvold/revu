ALTER TABLE review_periods
  DROP CONSTRAINT IF EXISTS review_period_deadlines_in_order;

ALTER TABLE review_periods
  ADD CONSTRAINT review_period_deadlines_in_order CHECK (
    assessment_due_date <= review_due_date
  );
