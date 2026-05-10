ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_email_key;

DROP INDEX IF EXISTS employees_username_unique_idx;
DROP INDEX IF EXISTS employees_username_unique_ci_idx;

CREATE UNIQUE INDEX IF NOT EXISTS employees_email_active_unique_idx
  ON employees(email)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_username_active_unique_ci_idx
  ON employees(lower(username))
  WHERE deleted_at IS NULL;
