ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS reviewer1_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer2_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_reviewer_assignments_valid;

ALTER TABLE employees
  ADD CONSTRAINT employees_reviewer_assignments_valid CHECK (
    (reviewer1_employee_id IS NULL OR reviewer1_employee_id <> id)
    AND (reviewer2_employee_id IS NULL OR reviewer2_employee_id <> id)
    AND (
      reviewer1_employee_id IS NULL
      OR reviewer2_employee_id IS NULL
      OR reviewer1_employee_id <> reviewer2_employee_id
    )
  );

ALTER TYPE assessment_review_state ADD VALUE IF NOT EXISTS 'ready_for_meeting';
ALTER TYPE assessment_review_state ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE assessment_review_state ADD VALUE IF NOT EXISTS 'concluded';

ALTER TYPE assessment_transition_action ADD VALUE IF NOT EXISTS 'mark_ready_for_meeting';
ALTER TYPE assessment_transition_action ADD VALUE IF NOT EXISTS 'schedule';
ALTER TYPE assessment_transition_action ADD VALUE IF NOT EXISTS 'complete_reviewer1';
ALTER TYPE assessment_transition_action ADD VALUE IF NOT EXISTS 'complete_reviewer2';
ALTER TYPE assessment_transition_action ADD VALUE IF NOT EXISTS 'conclude';
ALTER TYPE assessment_transition_action ADD VALUE IF NOT EXISTS 'reopen_conclusion';

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS ready_for_meeting_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer1_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewer1_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer1_completed_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer2_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewer2_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer2_completed_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concluded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluded_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE assessments
  DROP CONSTRAINT IF EXISTS assessment_submit_timestamp_consistency,
  DROP CONSTRAINT IF EXISTS assessment_accept_timestamp_consistency,
  DROP CONSTRAINT IF EXISTS assessment_review_timestamp_consistency,
  DROP CONSTRAINT IF EXISTS assessment_ready_for_meeting_timestamp_consistency,
  DROP CONSTRAINT IF EXISTS assessment_scheduled_timestamp_consistency,
  DROP CONSTRAINT IF EXISTS assessment_reviewer1_completion_consistency,
  DROP CONSTRAINT IF EXISTS assessment_reviewer2_completion_consistency,
  DROP CONSTRAINT IF EXISTS assessment_concluded_timestamp_consistency,
  DROP CONSTRAINT IF EXISTS assessment_concluded_requires_reviewer_completion;

ALTER TABLE assessments
  ADD CONSTRAINT assessment_submit_timestamp_consistency CHECK (
    (review_state IN ('new', 'draft') AND submitted_at IS NULL)
    OR
    (review_state NOT IN ('new', 'draft') AND submitted_at IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_accept_timestamp_consistency CHECK (
    (review_state IN ('new', 'draft', 'submitted') AND accepted_at IS NULL AND accepted_by_employee_id IS NULL)
    OR
    (review_state NOT IN ('new', 'draft', 'submitted') AND accepted_at IS NOT NULL AND accepted_by_employee_id IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_ready_for_meeting_timestamp_consistency CHECK (
    (review_state IN ('new', 'draft', 'submitted', 'accepted', 'reviewed') AND ready_for_meeting_at IS NULL)
    OR
    (review_state IN ('ready_for_meeting', 'scheduled', 'concluded') AND ready_for_meeting_at IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_scheduled_timestamp_consistency CHECK (
    (review_state IN ('new', 'draft', 'submitted', 'accepted', 'ready_for_meeting', 'reviewed')
      AND scheduled_at IS NULL
      AND scheduled_by_employee_id IS NULL)
    OR
    (review_state IN ('scheduled', 'concluded')
      AND scheduled_at IS NOT NULL
      AND scheduled_by_employee_id IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_reviewer1_completion_consistency CHECK (
    (reviewer1_completed_at IS NULL AND reviewer1_completed_by_employee_id IS NULL)
    OR
    (reviewer1_completed_at IS NOT NULL AND reviewer1_completed_by_employee_id IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_reviewer2_completion_consistency CHECK (
    (reviewer2_completed_at IS NULL AND reviewer2_completed_by_employee_id IS NULL)
    OR
    (reviewer2_completed_at IS NOT NULL AND reviewer2_completed_by_employee_id IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_concluded_timestamp_consistency CHECK (
    (review_state <> 'concluded' AND concluded_at IS NULL AND concluded_by_employee_id IS NULL)
    OR
    (review_state = 'concluded' AND concluded_at IS NOT NULL AND concluded_by_employee_id IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_review_timestamp_consistency CHECK (
    (reviewed_at IS NULL AND reviewed_by_employee_id IS NULL)
    OR
    (reviewed_at IS NOT NULL AND reviewed_by_employee_id IS NOT NULL)
  ),
  ADD CONSTRAINT assessment_concluded_requires_reviewer_completion CHECK (review_state <> 'concluded' OR concluded_at IS NOT NULL);

CREATE OR REPLACE FUNCTION assessment_is_locked(p_assessment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assessments a
    JOIN review_periods rp ON rp.id = a.review_period_id
    WHERE a.id = p_assessment_id
      AND (
        a.review_state IN ('reviewed')
        OR a.archive_state = 'archived'
        OR rp.status = 'archived'
      )
  );
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

  IF v_review_period_status = 'archived' THEN
    IF (to_jsonb(NEW) - 'archive_state' - 'updated_at') <> (to_jsonb(OLD) - 'archive_state' - 'updated_at') THEN
      RAISE EXCEPTION 'Reviewed or archived assessments are read-only';
    END IF;

    RETURN NEW;
  END IF;

  IF assessment_is_locked(NEW.id) THEN
    IF NEW.question_set_id <> OLD.question_set_id
      OR NEW.target <> OLD.target
      OR NEW.employee_id <> OLD.employee_id
      OR NEW.assessor_employee_id <> OLD.assessor_employee_id
      OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
      RAISE EXCEPTION 'Accepted, reviewed, or archived assessments have immutable authored fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_assessment_reviewer_completion_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_reviewer1_employee_id UUID;
  v_reviewer2_employee_id UUID;
BEGIN
  SELECT reviewer1_employee_id, reviewer2_employee_id
  INTO v_reviewer1_employee_id, v_reviewer2_employee_id
  FROM employees
  WHERE id = NEW.employee_id;

  IF NEW.reviewer1_completed_by_employee_id IS NOT NULL
    AND NEW.reviewer1_completed_by_employee_id IS DISTINCT FROM v_reviewer1_employee_id THEN
    RAISE EXCEPTION 'Reviewer 1 completion must match the employee reviewer 1 assignment';
  END IF;

  IF NEW.reviewer2_completed_by_employee_id IS NOT NULL
    AND NEW.reviewer2_completed_by_employee_id IS DISTINCT FROM v_reviewer2_employee_id THEN
    RAISE EXCEPTION 'Reviewer 2 completion must match the employee reviewer 2 assignment';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_employee_assessment_set_conclusion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_reviewer1_employee_id UUID;
  v_reviewer2_employee_id UUID;
BEGIN
  SELECT reviewer1_employee_id, reviewer2_employee_id
  INTO v_reviewer1_employee_id, v_reviewer2_employee_id
  FROM employees
  WHERE id = NEW.employee_id;

  IF NEW.review_state = 'concluded'
    AND (
      (
        v_reviewer1_employee_id IS NOT NULL
        AND (
          NEW.reviewer1_completed_at IS NULL
          OR NEW.reviewer1_completed_by_employee_id IS NULL
        )
      )
      OR (
        v_reviewer2_employee_id IS NOT NULL
        AND (
          NEW.reviewer2_completed_at IS NULL
          OR NEW.reviewer2_completed_by_employee_id IS NULL
        )
      )
    ) THEN
    RAISE EXCEPTION 'Concluded assessments must record each assigned reviewer completion';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_assessment_review_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION log_assessment_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_action assessment_transition_action;
  v_metadata JSONB;
BEGIN
  v_metadata := jsonb_build_object(
    'submittedAt', NEW.submitted_at,
    'acceptedAt', NEW.accepted_at,
    'readyForMeetingAt', NEW.ready_for_meeting_at,
    'scheduledAt', NEW.scheduled_at,
    'reviewer1CompletedAt', NEW.reviewer1_completed_at,
    'reviewer2CompletedAt', NEW.reviewer2_completed_at,
    'concludedAt', NEW.concluded_at,
    'reviewedAt', NEW.reviewed_at
  );

  IF NEW.review_state IS DISTINCT FROM OLD.review_state THEN
    v_action := CASE
      WHEN NEW.review_state = 'draft' AND OLD.review_state IN ('new', 'draft') THEN 'save_draft'::assessment_transition_action
      WHEN NEW.review_state = 'submitted' THEN 'submit'::assessment_transition_action
      WHEN NEW.review_state = 'accepted' THEN 'accept'::assessment_transition_action
      WHEN NEW.review_state = 'draft' AND OLD.review_state = 'submitted' THEN 'reject'::assessment_transition_action
      WHEN NEW.review_state = 'ready_for_meeting' THEN 'mark_ready_for_meeting'::assessment_transition_action
      WHEN NEW.review_state = 'scheduled' AND OLD.review_state = 'ready_for_meeting' THEN 'schedule'::assessment_transition_action
      WHEN NEW.review_state = 'scheduled' AND OLD.review_state = 'concluded' THEN 'reopen_conclusion'::assessment_transition_action
      WHEN NEW.review_state = 'concluded' THEN 'conclude'::assessment_transition_action
      WHEN NEW.review_state = 'reviewed' THEN 'mark_reviewed'::assessment_transition_action
      ELSE NULL
    END;

    IF v_action IS NOT NULL THEN
      INSERT INTO assessment_review_events (
        assessment_id,
        actor_employee_id,
        from_state,
        to_state,
        action,
        notes,
        metadata
      ) VALUES (
        NEW.id,
        COALESCE(
          NEW.concluded_by_employee_id,
          NEW.scheduled_by_employee_id,
          NEW.reviewed_by_employee_id,
          NEW.accepted_by_employee_id,
          OLD.concluded_by_employee_id,
          OLD.scheduled_by_employee_id,
          OLD.reviewed_by_employee_id,
          OLD.accepted_by_employee_id
        ),
        OLD.review_state,
        NEW.review_state,
        v_action,
        NEW.manager_notes,
        v_metadata
      );
    END IF;
  END IF;

  IF NEW.reviewer1_completed_at IS DISTINCT FROM OLD.reviewer1_completed_at THEN
    INSERT INTO assessment_review_events (
      assessment_id,
      actor_employee_id,
      from_state,
      to_state,
      action,
      notes,
      metadata
    ) VALUES (
      NEW.id,
      NEW.reviewer1_completed_by_employee_id,
      OLD.review_state,
      NEW.review_state,
      'complete_reviewer1'::assessment_transition_action,
      NEW.reviewer1_notes,
      v_metadata
    );
  END IF;

  IF NEW.reviewer2_completed_at IS DISTINCT FROM OLD.reviewer2_completed_at THEN
    INSERT INTO assessment_review_events (
      assessment_id,
      actor_employee_id,
      from_state,
      to_state,
      action,
      notes,
      metadata
    ) VALUES (
      NEW.id,
      NEW.reviewer2_completed_by_employee_id,
      OLD.review_state,
      NEW.review_state,
      'complete_reviewer2'::assessment_transition_action,
      NEW.reviewer2_notes,
      v_metadata
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assessments_enforce_reviewer_completion_consistency ON assessments;
DROP TRIGGER IF EXISTS assessments_enforce_employee_set_conclusion ON assessments;

CREATE TRIGGER assessments_enforce_reviewer_completion_consistency
  BEFORE INSERT OR UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_assessment_reviewer_completion_consistency();

CREATE CONSTRAINT TRIGGER assessments_enforce_employee_set_conclusion
  AFTER INSERT OR UPDATE OF review_state, reviewer1_completed_at, reviewer1_completed_by_employee_id, reviewer2_completed_at, reviewer2_completed_by_employee_id, archive_state
  ON assessments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_employee_assessment_set_conclusion();
