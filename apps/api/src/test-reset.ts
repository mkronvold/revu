import { randomBytes, scryptSync } from "node:crypto";

import {
  assessmentsListExample,
  assignmentsListExample,
  defaultWorkflowMarkdown,
  defaultWorkflowVisibility,
  employeesListExample,
  questionSetsListExample,
  reviewPeriodsListExample,
} from "@revu/contracts";
import { type PoolClient } from "pg";

import { getPool } from "./db.js";

const seedPasswordsByUsername: Record<string, string> = {
  "ada.admin": "AdminPass123!",
  "manny.manager": "ManagerPass123!",
  "elliot.employee": "EmployeePass123!",
  "pat.peer": "PeerPass123!",
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function seedPasswordFor(username: string) {
  const password = seedPasswordsByUsername[username];
  if (!password) {
    throw new Error(`Missing seed password for ${username}`);
  }

  return password;
}

async function ensureReviewPeriodDueDateColumns(client: PoolClient) {
  await client.query(
    `
      ALTER TABLE review_periods
      ADD COLUMN IF NOT EXISTS assessment_due_date DATE,
      ADD COLUMN IF NOT EXISTS review_due_date DATE
    `,
  );
  await client.query(
    `
      ALTER TABLE review_periods
      DROP CONSTRAINT IF EXISTS review_period_deadlines_in_order
    `,
  );
  await client.query(
    `
      DO $$
      BEGIN
        ALTER TABLE review_periods
        ADD CONSTRAINT review_period_deadlines_in_order CHECK (assessment_due_date <= review_due_date);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `,
  );
}

async function ensureEmployeeReviewerColumns(client: PoolClient) {
  await client.query(
    `
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS reviewer1_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewer2_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL
    `,
  );
}

async function ensureAssessmentWorkflowColumns(client: PoolClient) {
  await client.query(
    `
      ALTER TYPE assessment_review_state ADD VALUE IF NOT EXISTS 'ready_for_meeting'
    `,
  );
  await client.query(
    `
      ALTER TYPE assessment_review_state ADD VALUE IF NOT EXISTS 'scheduled'
    `,
  );
  await client.query(
    `
      ALTER TYPE assessment_review_state ADD VALUE IF NOT EXISTS 'concluded'
    `,
  );
  await client.query(
    `
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
      ADD COLUMN IF NOT EXISTS concluded_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL
    `,
  );
  await client.query(
    `
      ALTER TABLE assessments
      DROP CONSTRAINT IF EXISTS assessment_submit_timestamp_consistency,
      DROP CONSTRAINT IF EXISTS assessment_accept_timestamp_consistency,
      DROP CONSTRAINT IF EXISTS assessment_review_timestamp_consistency,
      DROP CONSTRAINT IF EXISTS assessment_ready_for_meeting_timestamp_consistency,
      DROP CONSTRAINT IF EXISTS assessment_scheduled_timestamp_consistency,
      DROP CONSTRAINT IF EXISTS assessment_reviewer1_completion_consistency,
      DROP CONSTRAINT IF EXISTS assessment_reviewer2_completion_consistency,
      DROP CONSTRAINT IF EXISTS assessment_concluded_timestamp_consistency,
      DROP CONSTRAINT IF EXISTS assessment_concluded_requires_reviewer_completion
    `,
  );
  await client.query(
    `
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
      ADD CONSTRAINT assessment_concluded_requires_reviewer_completion CHECK (review_state <> 'concluded' OR concluded_at IS NOT NULL)
    `,
  );
  await client.query(
    `
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

        IF EXISTS (
          SELECT 1
          FROM assessments a
          WHERE a.review_period_id = NEW.review_period_id
            AND a.employee_id = NEW.employee_id
            AND a.archive_state = 'active'
            AND a.review_state = 'concluded'
        ) THEN
          IF EXISTS (
            SELECT 1
            FROM assessments a
            WHERE a.review_period_id = NEW.review_period_id
              AND a.employee_id = NEW.employee_id
              AND a.archive_state = 'active'
              AND (
                a.review_state <> 'concluded'
                OR (
                  v_reviewer1_employee_id IS NOT NULL
                  AND (
                    a.reviewer1_completed_at IS NULL
                    OR a.reviewer1_completed_by_employee_id IS NULL
                  )
                )
                OR (
                  v_reviewer2_employee_id IS NOT NULL
                  AND (
                    a.reviewer2_completed_at IS NULL
                    OR a.reviewer2_completed_by_employee_id IS NULL
                  )
                )
              )
          ) THEN
            RAISE EXCEPTION 'Employee assessment sets can only be concluded after every active assessment records each assigned reviewer conclusion';
          END IF;
        END IF;

        RETURN NULL;
      END;
      $$;
    `,
  );
  await client.query(
    `
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

        IF OLD.review_state = 'accepted' AND NEW.review_state IN ('ready_for_meeting', 'reviewed') THEN
          RETURN NEW;
        END IF;

        IF OLD.review_state = 'ready_for_meeting' AND NEW.review_state = 'scheduled' THEN
          RETURN NEW;
        END IF;

        IF OLD.review_state = 'scheduled' AND NEW.review_state = 'concluded' THEN
          RETURN NEW;
        END IF;

        IF OLD.review_state = 'concluded' AND NEW.review_state = 'scheduled' THEN
          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Invalid assessment review transition: % -> %', OLD.review_state, NEW.review_state;
      END;
      $$;
    `,
  );
  await client.query(
    `
      DROP TRIGGER IF EXISTS assessments_enforce_employee_set_conclusion ON assessments
    `,
  );
  await client.query(
    `
      CREATE CONSTRAINT TRIGGER assessments_enforce_employee_set_conclusion
      AFTER INSERT OR UPDATE OF review_state, reviewer1_completed_at, reviewer1_completed_by_employee_id, reviewer2_completed_at, reviewer2_completed_by_employee_id, archive_state
      ON assessments
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION enforce_employee_assessment_set_conclusion()
    `,
  );
}

async function insertEmployees(client: PoolClient) {
  for (const employee of employeesListExample.items) {
    await client.query(
      `
        INSERT INTO employees (
          id,
          username,
          full_name,
          email,
          role,
          status,
          manager_employee_id,
          assessor1_employee_id,
          assessor2_employee_id,
          reviewer1_employee_id,
          reviewer2_employee_id,
          password_hash,
          password_reset_required,
          password_changed_at,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE,$13::timestamptz,$14::timestamptz,$15::timestamptz)
      `,
      [
        employee.id,
        employee.username,
        employee.fullName,
        employee.email,
        employee.role,
        employee.status,
        employee.managerId,
        employee.assessor1Id,
        employee.assessor2Id,
        employee.reviewer1Id,
        employee.reviewer2Id,
        hashPassword(seedPasswordFor(employee.username)),
        employee.updatedAt,
        employee.createdAt,
        employee.updatedAt,
      ],
    );
  }
}

async function insertReviewPeriods(client: PoolClient) {
  for (const period of reviewPeriodsListExample.items) {
    await client.query(
      `
        INSERT INTO review_periods (
          id,
          key,
          label,
          start_date,
          due_date,
          assessment_due_date,
          review_due_date,
          status,
          archived_at,
          archived_by_employee_id,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4::date,$5::date,$6::date,$7::date,$8,$9::timestamptz,$10,$11::timestamptz,$12::timestamptz)
      `,
      [
        period.id,
        period.key,
        period.label,
        period.startDate,
        period.dueDate,
        period.assessmentDueDate,
        period.reviewDueDate,
        period.status,
        period.archivedAt,
        period.archivedByEmployeeId,
        period.createdAt,
        period.updatedAt,
      ],
    );
  }
}

async function insertQuestionSets(client: PoolClient) {
  for (const questionSet of questionSetsListExample.items) {
    await client.query(
      `
        INSERT INTO question_sets (
          id,
          review_period_id,
          target,
          status,
          title,
          header_markdown,
          footer_markdown,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz)
      `,
      [
        questionSet.id,
        questionSet.reviewPeriodId,
        questionSet.target,
        questionSet.status,
        questionSet.title,
        questionSet.headerMarkdown,
        questionSet.footerMarkdown,
        questionSet.createdAt,
        questionSet.updatedAt,
      ],
    );

    for (const question of questionSet.questions) {
      await client.query(
        `
          INSERT INTO question_set_questions (
            id,
            question_set_id,
            display_order,
            type,
            category,
            prompt,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)
        `,
        [
          question.id,
          questionSet.id,
          question.order,
          question.type,
          question.category,
          question.prompt,
          questionSet.createdAt,
          questionSet.updatedAt,
        ],
      );
    }
  }
}

async function insertQuestionCategories(client: PoolClient) {
  const categories = Array.from(
    new Set(
      questionSetsListExample.items.flatMap((questionSet) =>
        questionSet.questions
          .map((question) => question.category?.trim() ?? "")
          .filter((category) => category.length > 0),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

  for (const category of categories) {
    await client.query(
      `
        INSERT INTO question_categories (name)
        VALUES ($1)
        ON CONFLICT (name) DO NOTHING
      `,
      [category],
    );
  }
}

async function insertAssignments(client: PoolClient) {
  for (const assignment of assignmentsListExample.items) {
    await client.query(
      `
        INSERT INTO review_period_assignments (
          id,
          review_period_id,
          employee_id,
          manager_employee_id,
          assessor_employee_id,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz)
      `,
      [
        assignment.id,
        assignment.reviewPeriodId,
        assignment.employeeId,
        assignment.managerId,
        assignment.assessorId,
        assignment.createdAt,
        assignment.updatedAt,
      ],
    );
  }
}

async function insertAssessments(client: PoolClient) {
  for (const assessment of assessmentsListExample.items) {
    await client.query(
      `
        INSERT INTO assessments (
          id,
          review_period_id,
          question_set_id,
          assignment_id,
          target,
          employee_id,
          assessor_employee_id,
          review_state,
          submitted_at,
          accepted_at,
          accepted_by_employee_id,
          ready_for_meeting_at,
          scheduled_at,
          scheduled_by_employee_id,
          reviewer1_notes,
          reviewer1_completed_at,
          reviewer1_completed_by_employee_id,
          reviewer2_notes,
          reviewer2_completed_at,
          reviewer2_completed_by_employee_id,
          concluded_at,
          concluded_by_employee_id,
          reviewed_at,
          reviewed_by_employee_id,
          manager_notes,
          archive_state,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::timestamptz,$13::timestamptz,$14,$15,$16::timestamptz,$17,$18,$19::timestamptz,$20,$21::timestamptz,$22,$23,$24,$25,$26,$27::timestamptz,$28::timestamptz)
      `,
      [
        assessment.id,
        assessment.reviewPeriodId,
        assessment.questionSetId,
        assessment.assignmentId,
        assessment.target,
        assessment.employeeId,
        assessment.assessorId,
        assessment.reviewState,
        assessment.submittedAt,
        assessment.acceptedAt,
        assessment.acceptedByEmployeeId,
        assessment.readyForMeetingAt,
        assessment.scheduledAt,
        assessment.scheduledByEmployeeId,
        assessment.reviewer1Notes,
        assessment.reviewer1CompletedAt,
        assessment.reviewer1CompletedByEmployeeId,
        assessment.reviewer2Notes,
        assessment.reviewer2CompletedAt,
        assessment.reviewer2CompletedByEmployeeId,
        assessment.concludedAt,
        assessment.concludedByEmployeeId,
        assessment.reviewedAt,
        assessment.reviewedByEmployeeId,
        assessment.managerNotes,
        assessment.archiveState,
        assessment.createdAt,
        assessment.updatedAt,
      ],
    );

    for (const response of assessment.responses) {
      await client.query(
        `
          INSERT INTO assessment_responses (
            assessment_id,
            question_id,
            response_text,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz)
        `,
        [assessment.id, response.questionId, response.response, assessment.createdAt, assessment.updatedAt],
      );
    }
  }
}

async function insertWorkflowSettings(client: PoolClient) {
  await client.query(
    `
      INSERT INTO workflow_settings (
        id,
        markdown,
        visibility
      ) VALUES (TRUE, $1, $2)
      ON CONFLICT (id) DO UPDATE
      SET markdown = EXCLUDED.markdown,
          visibility = EXCLUDED.visibility,
          updated_at = NOW()
    `,
    [defaultWorkflowMarkdown, defaultWorkflowVisibility],
  );
}

export async function resetDemoData() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureReviewPeriodDueDateColumns(client);
    await ensureEmployeeReviewerColumns(client);
    await ensureAssessmentWorkflowColumns(client);
    await client.query("BEGIN");
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS question_categories (
          name text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
    );
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS workflow_settings (
          id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
          markdown text NOT NULL,
          visibility text NOT NULL CHECK (visibility IN ('all', 'managers', 'admin only')),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `,
    );
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `
        TRUNCATE TABLE
          assessment_review_events,
          assessment_responses,
          assessments,
          review_period_assignments,
          question_categories,
          workflow_settings,
          question_set_questions,
          question_sets,
          review_periods,
          auth_sessions,
          employees
        RESTART IDENTITY CASCADE
      `,
    );
    await insertEmployees(client);
    await insertReviewPeriods(client);
    await insertQuestionSets(client);
    await insertQuestionCategories(client);
    await insertWorkflowSettings(client);
    await insertAssignments(client);
    await insertAssessments(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
