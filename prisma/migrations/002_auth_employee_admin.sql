ALTER TABLE employees
  ADD COLUMN username TEXT;

UPDATE employees
SET username = lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9._-]+', '-', 'g'))
WHERE username IS NULL;

ALTER TABLE employees
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE employees
  ADD COLUMN password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN password_changed_at TIMESTAMPTZ,
  ADD COLUMN password_changed_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE employees
  ADD CONSTRAINT employees_username_not_blank CHECK (length(trim(username)) > 0),
  ADD CONSTRAINT employees_username_format CHECK (username ~ '^[a-z0-9._-]+$'),
  ADD CONSTRAINT employees_password_change_consistency CHECK (
    (password_hash IS NULL AND password_changed_at IS NULL)
    OR
    (password_hash IS NOT NULL)
  );

CREATE UNIQUE INDEX employees_username_unique_idx ON employees(username);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT auth_sessions_token_hash_not_blank CHECK (length(trim(token_hash)) > 0),
  CONSTRAINT auth_sessions_expiry_after_create CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX auth_sessions_token_hash_unique_idx ON auth_sessions(token_hash);
CREATE INDEX auth_sessions_employee_id_idx ON auth_sessions(employee_id);
