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
          password_hash,
          password_reset_required,
          password_changed_at,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11::timestamptz,$12::timestamptz,$13::timestamptz)
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
          reviewed_at,
          reviewed_by_employee_id,
          manager_notes,
          archive_state,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::timestamptz,$13,$14,$15,$16::timestamptz,$17::timestamptz)
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
    await client.query("BEGIN");
    await ensureReviewPeriodDueDateColumns(client);
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
