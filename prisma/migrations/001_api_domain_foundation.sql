CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE app_role AS ENUM ('employee', 'manager', 'admin');
CREATE TYPE employee_status AS ENUM ('active', 'inactive');
CREATE TYPE review_period_status AS ENUM ('active', 'archived');
CREATE TYPE question_target AS ENUM ('self', 'peer');
CREATE TYPE question_type AS ENUM ('subjective', 'ranking', 'narrative');
CREATE TYPE question_set_status AS ENUM ('draft', 'active');
CREATE TYPE assessment_review_state AS ENUM ('new', 'draft', 'submitted', 'accepted', 'reviewed');
CREATE TYPE assessment_transition_action AS ENUM (
  'save_draft',
  'submit',
  'accept',
  'reject',
  'mark_reviewed',
  'reassign',
  'archive',
  'unarchive'
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'employee',
  status employee_status NOT NULL DEFAULT 'active',
  manager_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  assessor_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employees_name_not_blank CHECK (length(trim(full_name)) > 0)
);

CREATE TABLE review_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status review_period_status NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  archived_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT review_period_dates_in_order CHECK (start_date <= due_date),
  CONSTRAINT review_period_archive_fields CHECK (
    (status = 'active' AND archived_at IS NULL)
    OR
    (status = 'archived' AND archived_at IS NOT NULL)
  )
);

CREATE TABLE question_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_id UUID NOT NULL REFERENCES review_periods(id) ON DELETE RESTRICT,
  target question_target NOT NULL,
  status question_set_status NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  header_markdown TEXT NOT NULL DEFAULT '',
  footer_markdown TEXT NOT NULL DEFAULT '',
  created_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT question_sets_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT uq_question_sets_id_target UNIQUE (id, target)
);

CREATE UNIQUE INDEX question_sets_one_active_per_target
  ON question_sets(review_period_id, target)
  WHERE status = 'active';

CREATE TABLE question_set_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_set_id UUID NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  type question_type NOT NULL,
  category TEXT,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT question_order_positive CHECK (display_order > 0),
  CONSTRAINT question_prompt_not_blank CHECK (length(trim(prompt)) > 0),
  CONSTRAINT uq_question_order_per_set UNIQUE (question_set_id, display_order)
);

CREATE TABLE review_period_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_id UUID NOT NULL REFERENCES review_periods(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  manager_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  assessor_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assignment_employee_per_period UNIQUE (review_period_id, employee_id),
  CONSTRAINT assignment_requires_peer_assessor CHECK (employee_id <> assessor_employee_id)
);

CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_period_id UUID NOT NULL REFERENCES review_periods(id) ON DELETE RESTRICT,
  question_set_id UUID NOT NULL REFERENCES question_sets(id) ON DELETE RESTRICT,
  assignment_id UUID REFERENCES review_period_assignments(id) ON DELETE SET NULL,
  target question_target NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  assessor_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  review_state assessment_review_state NOT NULL DEFAULT 'new',
  submitted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  manager_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assessment_actor_per_period UNIQUE (review_period_id, employee_id, assessor_employee_id),
  CONSTRAINT assessment_target_matches_relationship CHECK (
    (target = 'self' AND employee_id = assessor_employee_id AND assignment_id IS NULL)
    OR
    (target = 'peer' AND employee_id <> assessor_employee_id)
  ),
  CONSTRAINT assessment_submit_timestamp_consistency CHECK (
    (review_state IN ('new', 'draft') AND submitted_at IS NULL)
    OR
    (review_state IN ('submitted', 'accepted', 'reviewed') AND submitted_at IS NOT NULL)
  ),
  CONSTRAINT assessment_accept_timestamp_consistency CHECK (
    (review_state IN ('new', 'draft', 'submitted') AND accepted_at IS NULL AND accepted_by_employee_id IS NULL)
    OR
    (review_state IN ('accepted', 'reviewed') AND accepted_at IS NOT NULL AND accepted_by_employee_id IS NOT NULL)
  ),
  CONSTRAINT assessment_review_timestamp_consistency CHECK (
    (review_state <> 'reviewed' AND reviewed_at IS NULL AND reviewed_by_employee_id IS NULL)
    OR
    (review_state = 'reviewed' AND reviewed_at IS NOT NULL AND reviewed_by_employee_id IS NOT NULL)
  )
);

CREATE TABLE assessment_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_set_questions(id) ON DELETE RESTRICT,
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assessment_response UNIQUE (assessment_id, question_id)
);

CREATE TABLE assessment_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  actor_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  from_state assessment_review_state,
  to_state assessment_review_state,
  action assessment_transition_action NOT NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION review_period_is_archived(p_review_period_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM review_periods rp
    WHERE rp.id = p_review_period_id
      AND rp.status = 'archived'
  );
$$;

CREATE OR REPLACE FUNCTION question_set_is_archived(p_question_set_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM question_sets qs
    JOIN review_periods rp ON rp.id = qs.review_period_id
    WHERE qs.id = p_question_set_id
      AND rp.status = 'archived'
  );
$$;

CREATE OR REPLACE FUNCTION assessment_is_locked(p_assessment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assessments a
    JOIN review_periods rp ON rp.id = a.review_period_id
    WHERE a.id = p_assessment_id
      AND (a.review_state IN ('reviewed') OR rp.status = 'archived')
  );
$$;

CREATE OR REPLACE FUNCTION prevent_question_set_mutation_if_archived()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF review_period_is_archived(NEW.review_period_id) THEN
    RAISE EXCEPTION 'Question sets for archived review periods are read-only';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_question_set_question_mutation_if_archived()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF question_set_is_archived(COALESCE(NEW.question_set_id, OLD.question_set_id)) THEN
    RAISE EXCEPTION 'Question sets for archived review periods are read-only';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION prevent_locked_assessment_field_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_review_period_status review_period_status;
BEGIN
  SELECT rp.status
  INTO v_review_period_status
  FROM review_periods rp
  WHERE rp.id = NEW.review_period_id;

  IF assessment_is_locked(NEW.id) THEN
    IF NEW.question_set_id <> OLD.question_set_id
      OR NEW.target <> OLD.target
      OR NEW.employee_id <> OLD.employee_id
      OR NEW.assessor_employee_id <> OLD.assessor_employee_id
      OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
      RAISE EXCEPTION 'Accepted, reviewed, or archived assessments have immutable authored fields';
    END IF;
  END IF;

  IF v_review_period_status = 'archived'
    AND NEW.review_state <> OLD.review_state THEN
    RAISE EXCEPTION 'Assessment review state cannot change after review period archive';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_assessment_question_set_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_review_period_id UUID;
  v_target question_target;
BEGIN
  SELECT review_period_id, target
  INTO v_review_period_id, v_target
  FROM question_sets
  WHERE id = NEW.question_set_id;

  IF v_review_period_id IS NULL THEN
    RAISE EXCEPTION 'Assessment question set must exist';
  END IF;

  IF v_review_period_id <> NEW.review_period_id THEN
    RAISE EXCEPTION 'Assessment review period must match question set review period';
  END IF;

  IF v_target <> NEW.target THEN
    RAISE EXCEPTION 'Assessment target must match question set target';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_response_belongs_to_assessment_question_set()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_question_set_id UUID;
  v_question_match BOOLEAN;
BEGIN
  SELECT question_set_id
  INTO v_question_set_id
  FROM assessments
  WHERE id = NEW.assessment_id;

  SELECT EXISTS (
    SELECT 1
    FROM question_set_questions q
    WHERE q.id = NEW.question_id
      AND q.question_set_id = v_question_set_id
  )
  INTO v_question_match;

  IF NOT v_question_match THEN
    RAISE EXCEPTION 'Assessment responses must reference questions from the selected question set';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_assessment_response_mutation_if_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_assessment_id UUID;
BEGIN
  v_assessment_id := COALESCE(NEW.assessment_id, OLD.assessment_id);

  IF assessment_is_locked(v_assessment_id) THEN
    RAISE EXCEPTION 'Reviewed or archived assessments are read-only';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER employees_set_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER review_periods_set_updated_at
  BEFORE UPDATE ON review_periods
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER question_sets_set_updated_at
  BEFORE UPDATE ON question_sets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER question_set_questions_set_updated_at
  BEFORE UPDATE ON question_set_questions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER review_period_assignments_set_updated_at
  BEFORE UPDATE ON review_period_assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER assessments_set_updated_at
  BEFORE UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER assessment_responses_set_updated_at
  BEFORE UPDATE ON assessment_responses
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER question_sets_prevent_archived_insert
  BEFORE INSERT ON question_sets
  FOR EACH ROW
  EXECUTE FUNCTION prevent_question_set_mutation_if_archived();

CREATE TRIGGER question_sets_prevent_archived_update
  BEFORE UPDATE ON question_sets
  FOR EACH ROW
  EXECUTE FUNCTION prevent_question_set_mutation_if_archived();

CREATE TRIGGER question_set_questions_prevent_archived_insert
  BEFORE INSERT ON question_set_questions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_question_set_question_mutation_if_archived();

CREATE TRIGGER question_set_questions_prevent_archived_update
  BEFORE UPDATE ON question_set_questions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_question_set_question_mutation_if_archived();

CREATE TRIGGER question_set_questions_prevent_archived_delete
  BEFORE DELETE ON question_set_questions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_question_set_question_mutation_if_archived();

CREATE TRIGGER assessments_enforce_question_set_consistency
  BEFORE INSERT OR UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_assessment_question_set_consistency();

CREATE TRIGGER assessments_prevent_locked_mutation
  BEFORE UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_assessment_field_mutation();

CREATE TRIGGER assessment_responses_enforce_question_set_consistency
  BEFORE INSERT OR UPDATE ON assessment_responses
  FOR EACH ROW
  EXECUTE FUNCTION enforce_response_belongs_to_assessment_question_set();

CREATE TRIGGER assessment_responses_prevent_locked_insert
  BEFORE INSERT ON assessment_responses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_assessment_response_mutation_if_locked();

CREATE TRIGGER assessment_responses_prevent_locked_update
  BEFORE UPDATE ON assessment_responses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_assessment_response_mutation_if_locked();

CREATE TRIGGER assessment_responses_prevent_locked_delete
  BEFORE DELETE ON assessment_responses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_assessment_response_mutation_if_locked();
