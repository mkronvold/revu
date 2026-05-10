ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_username_format;

ALTER TABLE employees
  ADD CONSTRAINT employees_username_format CHECK (username ~ '^[A-Za-z0-9._-]+$');

CREATE UNIQUE INDEX IF NOT EXISTS employees_username_unique_ci_idx ON employees (lower(username));
