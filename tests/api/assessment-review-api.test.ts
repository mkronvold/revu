import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assessmentItemResponseSchema,
  assessmentReassignmentResponseSchema,
  assessmentsListResponseSchema,
  assignmentResponseSchema,
  authLoginResponseSchema,
  questionSetResponseSchema,
  reviewPeriodResponseSchema,
} from "@revu/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/api/src/app.js";

describe("assessment authoring and review API", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function createApp() {
    const app = buildApp();
    apps.push(app);
    await app.ready();
    return app;
  }

  async function login(
    app: ReturnType<typeof buildApp>,
    username: string,
    password: string,
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username,
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    return authLoginResponseSchema.parse(response.json()).session;
  }

  it("supports self-assessment authoring, submission, acceptance, and final review", async () => {
    const app = await createApp();
    const pat = await login(app, "pat.peer", "PeerPass123!");
    const manny = await login(app, "manny.manager", "ManagerPass123!");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
      payload: {
        employeeId: "44444444-4444-4444-8444-444444444444",
        target: "self",
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdAssessment = assessmentItemResponseSchema.parse(createResponse.json()).item;
    expect(createdAssessment.reviewState).toBe("new");

    const saveDraftResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdAssessment.id}/save`,
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa",
            order: 1,
            response: "I supported my teammates consistently.",
          },
        ],
      },
    });
    expect(saveDraftResponse.statusCode).toBe(200);
    expect(assessmentItemResponseSchema.parse(saveDraftResponse.json()).item.reviewState).toBe("draft");

    const submitResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdAssessment.id}/submit`,
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa",
            order: 1,
            response: "I supported my teammates consistently.",
          },
          {
            questionId: "aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa",
            order: 2,
            response: "I improved release handoffs across the team.",
          },
        ],
      },
    });
    expect(submitResponse.statusCode).toBe(200);
    expect(assessmentItemResponseSchema.parse(submitResponse.json()).item.reviewState).toBe("submitted");

    const acceptResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdAssessment.id}/accept`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Clear self-reflection and examples.",
      },
    });
    expect(acceptResponse.statusCode).toBe(200);
    const acceptedAssessment = assessmentItemResponseSchema.parse(acceptResponse.json()).item;
    expect(acceptedAssessment.reviewState).toBe("accepted");
    expect(acceptedAssessment.managerNotes).toBe("Clear self-reflection and examples.");
    expect(acceptedAssessment.isReadOnly).toBe(true);

    const blockedEditResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdAssessment.id}/save`,
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
      payload: {
        responses: [],
      },
    });
    expect(blockedEditResponse.statusCode).toBe(409);

    const saveReviewNotesResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdAssessment.id}/review`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Discuss growth opportunities in the 1:1.",
        reviewed: false,
      },
    });
    expect(saveReviewNotesResponse.statusCode).toBe(200);
    const acceptedWithNotes = assessmentItemResponseSchema.parse(saveReviewNotesResponse.json()).item;
    expect(acceptedWithNotes.reviewState).toBe("accepted");
    expect(acceptedWithNotes.managerNotes).toBe("Discuss growth opportunities in the 1:1.");

    const markReviewedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdAssessment.id}/review`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Finalized in the 1:1.",
        reviewed: true,
      },
    });
    expect(markReviewedResponse.statusCode).toBe(200);
    const reviewedAssessment = assessmentItemResponseSchema.parse(markReviewedResponse.json()).item;
    expect(reviewedAssessment.reviewState).toBe("reviewed");
    expect(reviewedAssessment.reviewedByEmployeeId).toBe(manny.user.id);
    expect(reviewedAssessment.managerNotes).toBe("Finalized in the 1:1.");
  });

  it("supports peer rejection back to draft, reassignment, and role-aware assessment visibility", async () => {
    const app = await createApp();
    const admin = await login(app, "ada.admin", "AdminPass123!");
    const manny = await login(app, "manny.manager", "ManagerPass123!");
    const elliot = await login(app, "elliot.employee", "EmployeePass123!");

    const createdAssignmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assignments",
      headers: {
        authorization: `Bearer ${admin.token}`,
      },
      payload: {
        employeeId: "44444444-4444-4444-8444-444444444444",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessorId: "33333333-3333-4333-8333-333333333333",
      },
    });
    expect(createdAssignmentResponse.statusCode).toBe(201);
    const assignment = assignmentResponseSchema.parse(createdAssignmentResponse.json()).item;

    const createAssessmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
      payload: {
        employeeId: "44444444-4444-4444-8444-444444444444",
        target: "peer",
        assignmentId: assignment.id,
      },
    });
    expect(createAssessmentResponse.statusCode).toBe(201);
    const assessment = assessmentItemResponseSchema.parse(createAssessmentResponse.json()).item;
    expect(assessment.assignmentId).toBe(assignment.id);

    const submitPeerResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/submit`,
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa",
            order: 1,
            response: "5",
          },
          {
            questionId: "aaaaaaaa-3222-4222-8222-aaaaaaaaaaaa",
            order: 2,
            response: "Pat regularly improved the team handoff process.",
          },
        ],
      },
    });
    expect(submitPeerResponse.statusCode).toBe(200);

    const rejectResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/reject-to-draft`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Please add more specific examples.",
      },
    });
    expect(rejectResponse.statusCode).toBe(200);
    const rejectedAssessment = assessmentItemResponseSchema.parse(rejectResponse.json()).item;
    expect(rejectedAssessment.reviewState).toBe("draft");
    expect(rejectedAssessment.managerNotes).toBe("Please add more specific examples.");

    const resubmitResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/submit`,
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa",
            order: 1,
            response: "5",
          },
          {
            questionId: "aaaaaaaa-3222-4222-8222-aaaaaaaaaaaa",
            order: 2,
            response: "Pat regularly improved the team handoff process and unblocked teammates.",
          },
        ],
      },
    });
    expect(resubmitResponse.statusCode).toBe(200);

    const acceptResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/accept`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Accepted after clarification.",
      },
    });
    expect(acceptResponse.statusCode).toBe(200);
    const acceptedAssessment = assessmentItemResponseSchema.parse(acceptResponse.json()).item;
    expect(acceptedAssessment.reviewState).toBe("accepted");

    const reassignmentResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/reassign`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerId: "11111111-1111-4111-8111-111111111111",
        assessorId: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(reassignmentResponse.statusCode).toBe(200);
    const reassignment = assessmentReassignmentResponseSchema.parse(reassignmentResponse.json());
    expect(reassignment.assignment?.managerId).toBe("11111111-1111-4111-8111-111111111111");
    expect(reassignment.assignment?.assessorId).toBe("11111111-1111-4111-8111-111111111111");
    expect(reassignment.employee.managerId).toBe("11111111-1111-4111-8111-111111111111");
    expect(reassignment.employee.assessor2Id).toBe("11111111-1111-4111-8111-111111111111");
    expect(reassignment.assessment.assessorId).toBe("33333333-3333-4333-8333-333333333333");

    const elliotVisibleAssessmentsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
    });
    expect(elliotVisibleAssessmentsResponse.statusCode).toBe(200);
    const elliotVisibleAssessments = assessmentsListResponseSchema.parse(elliotVisibleAssessmentsResponse.json()).items;
    expect(elliotVisibleAssessments.some((item) => item.id === assessment.id)).toBe(true);
    expect(elliotVisibleAssessments.some((item) => item.id === "dddddddd-dddd-4ddd-8ddd-dddddddddddd")).toBe(true);
    expect(elliotVisibleAssessments.some((item) => item.id === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")).toBe(false);

    const filteredManagerAssessmentsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments?reviewState=accepted",
      headers: {
        authorization: `Bearer ${admin.token}`,
      },
    });
    expect(filteredManagerAssessmentsResponse.statusCode).toBe(200);
    const filteredManagerAssessments = assessmentsListResponseSchema.parse(filteredManagerAssessmentsResponse.json()).items;
    expect(filteredManagerAssessments.every((item) => item.reviewState === "accepted")).toBe(true);
  });

  it("enforces archive-aware read-only behavior for assessment creation and updates", async () => {
    const app = await createApp();
    const admin = await login(app, "ada.admin", "AdminPass123!");
    const pat = await login(app, "pat.peer", "PeerPass123!");

    const archiveResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/archive",
      headers: {
        authorization: `Bearer ${admin.token}`,
      },
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(reviewPeriodResponseSchema.parse(archiveResponse.json()).item.status).toBe("archived");

    const blockedCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
      payload: {
        employeeId: "44444444-4444-4444-8444-444444444444",
        target: "self",
      },
    });
    expect(blockedCreateResponse.statusCode).toBe(409);

    const archivedAssessmentResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments/ffffffff-ffff-4fff-8fff-ffffffffffff",
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
    });
    expect(archivedAssessmentResponse.statusCode).toBe(200);
    expect(assessmentItemResponseSchema.parse(archivedAssessmentResponse.json()).item.archiveState).toBe("archived");

    const blockedArchivedReviewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/assessments/ffffffff-ffff-4fff-8fff-ffffffffffff/review",
      headers: {
        authorization: `Bearer ${admin.token}`,
      },
      payload: {
        managerNotes: "Should stay read-only.",
        reviewed: true,
      },
    });
    expect(blockedArchivedReviewResponse.statusCode).toBe(409);
  });

  it("captures assessment workflow protections in SQL", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../prisma/migrations/004_assessment_review_api.sql"), "utf8");

    expect(sql).toContain("enforce_assessment_review_transition");
    expect(sql).toContain("Invalid assessment review transition");
    expect(sql).toContain("log_assessment_state_transition");
    expect(sql).toContain("CREATE TRIGGER assessments_log_review_transition");
    expect(sql).toContain("assessment_review_events_assessment_created_idx");
  });
});
