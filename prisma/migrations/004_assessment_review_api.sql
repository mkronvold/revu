CREATE OR REPLACE FUNCTION enforce_assessment_review_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.review_state = OLD.review_state THEN
    RETURN NEW;
  END IF;

  IF OLD.review_state = 'new' AND NEW.review_state IN ('draft', 'submitted') THEN
    RETURN NEW;
  END IF;

  IF OLD.review_state = 'draft' AND NEW.review_state IN ('draft', 'submitted') THEN
    RETURN NEW;
  END IF;

  IF OLD.review_state = 'submitted' AND NEW.review_state IN ('draft', 'accepted') THEN
    RETURN NEW;
  END IF;

  IF OLD.review_state = 'accepted' AND NEW.review_state = 'reviewed' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid assessment review transition: % -> %', OLD.review_state, NEW.review_state;
END;
$$;

CREATE OR REPLACE FUNCTION log_assessment_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_action assessment_transition_action;
BEGIN
  IF NEW.review_state = OLD.review_state THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN NEW.review_state = 'draft' AND OLD.review_state IN ('new', 'draft') THEN 'save_draft'::assessment_transition_action
    WHEN NEW.review_state = 'submitted' THEN 'submit'::assessment_transition_action
    WHEN NEW.review_state = 'accepted' THEN 'accept'::assessment_transition_action
    WHEN NEW.review_state = 'draft' AND OLD.review_state = 'submitted' THEN 'reject'::assessment_transition_action
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
      COALESCE(NEW.reviewed_by_employee_id, NEW.accepted_by_employee_id, OLD.reviewed_by_employee_id, OLD.accepted_by_employee_id),
      OLD.review_state,
      NEW.review_state,
      v_action,
      NEW.manager_notes,
      jsonb_build_object(
        'submittedAt', NEW.submitted_at,
        'acceptedAt', NEW.accepted_at,
        'reviewedAt', NEW.reviewed_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER assessments_enforce_review_transition
  BEFORE UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_assessment_review_transition();

CREATE TRIGGER assessments_log_review_transition
  AFTER UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION log_assessment_state_transition();

CREATE INDEX assessment_review_events_assessment_created_idx
  ON assessment_review_events (assessment_id, created_at DESC);
