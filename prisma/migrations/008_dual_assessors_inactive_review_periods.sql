ALTER TYPE review_period_status ADD VALUE IF NOT EXISTS 'inactive';

ALTER TABLE employees
  RENAME COLUMN assessor_employee_id TO assessor2_employee_id;

ALTER TABLE employees
  ADD COLUMN assessor1_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

UPDATE employees
SET assessor1_employee_id = manager_employee_id
WHERE assessor1_employee_id IS NULL;

CREATE OR REPLACE FUNCTION sync_assignment_employee_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE employees
  SET manager_employee_id = NEW.manager_employee_id,
      assessor2_employee_id = NEW.assessor_employee_id,
      updated_at = NOW()
  WHERE id = NEW.employee_id;

  RETURN NEW;
END;
$$;

ALTER TABLE review_periods
  ALTER COLUMN status SET DEFAULT 'inactive';

WITH ranked_active_periods AS (
  SELECT id, row_number() OVER (ORDER BY updated_at DESC, created_at DESC, start_date DESC, id DESC) AS row_number
  FROM review_periods
  WHERE status = 'active'
)
UPDATE review_periods
SET status = 'inactive',
    updated_at = NOW()
FROM ranked_active_periods
WHERE review_periods.id = ranked_active_periods.id
  AND ranked_active_periods.row_number > 1;

ALTER TABLE review_periods
  DROP CONSTRAINT IF EXISTS review_period_archive_fields;

ALTER TABLE review_periods
  ADD CONSTRAINT review_period_archive_fields CHECK (
    (status IN ('active', 'inactive') AND archived_at IS NULL AND archived_by_employee_id IS NULL)
    OR
    (status = 'archived' AND archived_at IS NOT NULL)
  );

CREATE UNIQUE INDEX review_periods_single_active_idx
  ON review_periods(status)
  WHERE status = 'active';
