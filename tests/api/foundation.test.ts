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
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/api/src/app.js";

describe("API/domain foundation", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
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

    const [indexResponse, rulesResponse, employeesResponse, periodsResponse, questionSetsResponse, assignmentsResponse, assessmentsResponse, foundationResponse] =
      await Promise.all([
        app.inject({ method: "GET", url: "/api/v1" }),
        app.inject({ method: "GET", url: "/api/v1/domain-rules" }),
        app.inject({
          method: "GET",
          url: "/api/v1/employees",
          headers: {
            authorization: `Bearer ${authSession.token}`,
          },
        }),
        app.inject({ method: "GET", url: "/api/v1/review-periods" }),
        app.inject({ method: "GET", url: "/api/v1/question-sets" }),
        app.inject({ method: "GET", url: "/api/v1/assignments" }),
        app.inject({
          method: "GET",
          url: "/api/v1/assessments",
          headers: {
            authorization: `Bearer ${authSession.token}`,
          },
        }),
        app.inject({
          method: "GET",
          url: "/api/v1/foundation",
          headers: {
            authorization: `Bearer ${authSession.token}`,
          },
        }),
      ]);

    expect(apiIndexResponseSchema.parse(indexResponse.json()).resources.length).toBeGreaterThan(0);
    expect(domainRulesResponseSchema.parse(rulesResponse.json()).acceptedAssessmentsAreImmutable).toBe(true);
    expect(employeesListResponseSchema.parse(employeesResponse.json()).items.length).toBeGreaterThan(0);
    expect(reviewPeriodsListResponseSchema.parse(periodsResponse.json()).items.length).toBe(2);
    expect(questionSetsListResponseSchema.parse(questionSetsResponse.json()).items.length).toBe(4);
    expect(assignmentsListResponseSchema.parse(assignmentsResponse.json()).items.length).toBe(1);
    expect(assessmentsListResponseSchema.parse(assessmentsResponse.json()).items.length).toBe(3);

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

    const foundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${authSession.token}`,
      },
    });

    expect(foundationResponse.statusCode).toBe(200);
    const snapshot = foundationSnapshotSchema.parse(foundationResponse.json());
    expect(snapshot.assessments.map((assessment) => assessment.id)).toEqual(["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]);
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
    expect(sql).toContain("Accepted, reviewed, or archived assessments are read-only");
  });
});
