import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  apiIndexResponseSchema,
  authLoginResponseSchema,
  assessmentsListResponseSchema,
  assignmentsListResponseSchema,
  domainRulesResponseSchema,
  employeesListResponseSchema,
  foundationSnapshotSchema,
  questionSetsListResponseSchema,
  reviewPeriodsListResponseSchema,
} from "@revu/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/api/src/app.js";

describe("API/domain foundation", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves a health response", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("serves typed foundation resources", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "manny.manager",
        password: "ManagerPass123!",
      },
    });
    const authSession = authLoginResponseSchema.parse(loginResponse.json()).session;
    expect(authSession.passwordResetRequired).toBe(false);

    const indexResponse = await app.inject({ method: "GET", url: "/api/v1" });
    const rulesResponse = await app.inject({ method: "GET", url: "/api/v1/domain-rules" });
    const employeesResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees",
      headers: {
        authorization: `Bearer ${authSession.token}`,
      },
    });
    const periodsResponse = await app.inject({ method: "GET", url: "/api/v1/review-periods" });
    const questionSetsResponse = await app.inject({ method: "GET", url: "/api/v1/question-sets" });
    const assignmentsResponse = await app.inject({ method: "GET", url: "/api/v1/assignments" });
    const assessmentsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: {
        authorization: `Bearer ${authSession.token}`,
      },
    });
    const foundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${authSession.token}`,
      },
    });

    const apiIndex = apiIndexResponseSchema.parse(indexResponse.json());
    expect(apiIndex.resources.length).toBeGreaterThan(0);
    expect(apiIndex.seededAccountsAvailable).toBe(true);
    expect(domainRulesResponseSchema.parse(rulesResponse.json()).acceptedAssessmentsAreImmutable).toBe(false);
    expect(employeesResponse.statusCode).toBe(200);
    expect(employeesListResponseSchema.parse(employeesResponse.json()).items.length).toBeGreaterThan(0);
    expect(reviewPeriodsListResponseSchema.parse(periodsResponse.json()).items.length).toBe(2);
    expect(questionSetsListResponseSchema.parse(questionSetsResponse.json()).items.length).toBe(4);
    expect(assignmentsListResponseSchema.parse(assignmentsResponse.json()).items.length).toBe(1);
    expect(assessmentsResponse.statusCode).toBe(200);
    expect(assessmentsListResponseSchema.parse(assessmentsResponse.json()).items.length).toBe(3);

    expect(foundationResponse.statusCode).toBe(200);
    const snapshot = foundationSnapshotSchema.parse(foundationResponse.json());
    const activeQuestionSets = snapshot.questionSets.filter(
      (questionSet) => questionSet.reviewPeriodId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" && questionSet.status === "active",
    );

    expect(activeQuestionSets.filter((questionSet) => questionSet.target === "self")).toHaveLength(1);
    expect(activeQuestionSets.filter((questionSet) => questionSet.target === "peer")).toHaveLength(1);

    const archivedPeriodIds = new Set(
      snapshot.reviewPeriods.filter((period) => period.status === "archived").map((period) => period.id),
    );

    expect(
      snapshot.questionSets
        .filter((questionSet) => archivedPeriodIds.has(questionSet.reviewPeriodId))
        .every((questionSet) => questionSet.isReadOnly),
    ).toBe(true);

    expect(
      snapshot.assessments
        .filter((assessment) => archivedPeriodIds.has(assessment.reviewPeriodId))
        .every((assessment) => assessment.archiveState === "archived" && assessment.isReadOnly),
    ).toBe(true);
    expect(snapshot.workflow.visibility).toBe("all");
    expect(snapshot.workflow.markdown).toContain("Dashboard follow-up moves the set through `ready_for_meeting` and then `scheduled`");
  });

  it("requires auth for the foundation snapshot and filters assessments by viewer visibility", async () => {
    const unauthorizedResponse = await app.inject({ method: "GET", url: "/api/v1/foundation" });
    expect(unauthorizedResponse.statusCode).toBe(401);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "elliot.employee",
        password: "EmployeePass123!",
      },
    });
    const authSession = authLoginResponseSchema.parse(loginResponse.json()).session;
    expect(authSession.passwordResetRequired).toBe(false);

    const foundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${authSession.token}`,
      },
    });

    expect(foundationResponse.statusCode).toBe(200);
    const snapshot = foundationSnapshotSchema.parse(foundationResponse.json());
    expect(snapshot.assessments.map((assessment) => assessment.id)).toEqual([
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
    ]);
  });

  it("captures database invariants in the migration", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "../../prisma/migrations/001_api_domain_foundation.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE UNIQUE INDEX question_sets_one_active_per_target");
    expect(sql).toContain("assignment_requires_peer_assessor");
    expect(sql).toContain("assessment_target_matches_relationship");
    expect(sql).toContain("prevent_assessment_response_mutation_if_locked");
    expect(sql).toContain("Reviewed or archived assessments are read-only");
  });
});
