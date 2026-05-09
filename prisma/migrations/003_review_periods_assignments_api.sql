CREATE TYPE assessment_archive_state AS ENUM ('active', 'archived');

ALTER TABLE assessments
  ADD COLUMN archive_state assessment_archive_state NOT NULL DEFAULT 'active';

UPDATE assessments a
SET archive_state = CASE
  WHEN rp.status = 'archived' THEN 'archived'::assessment_archive_state
  ELSE 'active'::assessment_archive_state
END
FROM review_periods rp
WHERE rp.id = a.review_period_id;

CREATE OR REPLACE FUNCTION prevent_assignment_mutation_if_archived()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_review_period_id UUID;
BEGIN
  v_review_period_id := COALESCE(NEW.review_period_id, OLD.review_period_id);

  IF review_period_is_archived(v_review_period_id) THEN
    RAISE EXCEPTION 'Assignments for archived review periods are read-only';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION sync_assignment_employee_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE employees
  SET manager_employee_id = NEW.manager_employee_id,
      assessor_employee_id = NEW.assessor_employee_id,
      updated_at = NOW()
  WHERE id = NEW.employee_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_review_period_archive_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE assessments
    SET archive_state = CASE
      WHEN NEW.status = 'archived' THEN 'archived'::assessment_archive_state
      ELSE 'active'::assessment_archive_state
    END,
        updated_at = NOW()
    WHERE review_period_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER review_period_assignments_prevent_archived_insert
  BEFORE INSERT ON review_period_assignments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_assignment_mutation_if_archived();

CREATE TRIGGER review_period_assignments_prevent_archived_update
  BEFORE UPDATE ON review_period_assignments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_assignment_mutation_if_archived();

CREATE TRIGGER review_period_assignments_prevent_archived_delete
  BEFORE DELETE ON review_period_assignments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_assignment_mutation_if_archived();

CREATE TRIGGER review_period_assignments_sync_employee_relationships
  AFTER INSERT OR UPDATE ON review_period_assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_assignment_employee_relationships();

CREATE TRIGGER review_periods_sync_archive_state
  AFTER UPDATE ON review_periods
  FOR EACH ROW
  EXECUTE FUNCTION sync_review_period_archive_state();
