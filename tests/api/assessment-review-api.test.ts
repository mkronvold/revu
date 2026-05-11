import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assessmentItemResponseSchema,
  assessmentReassignmentResponseSchema,
  assessmentSetResponseSchema,
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

  it("moves an employee assessment set through accepted, ready, scheduled, and reviewer conclusions", async () => {
    const app = await createApp();
    const ada = await login(app, "ada.admin", "AdminPass123!");
    const elliot = await login(app, "elliot.employee", "EmployeePass123!");
    const pat = await login(app, "pat.peer", "PeerPass123!");
    const manny = await login(app, "manny.manager", "ManagerPass123!");

    const assignmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assignments",
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        employeeId: pat.user.id,
        managerId: manny.user.id,
        assessorId: elliot.user.id,
      },
    });
    expect(assignmentResponse.statusCode).toBe(201);
    const assignment = assignmentResponseSchema.parse(assignmentResponse.json()).item;

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
    const createdSelfAssessment = assessmentItemResponseSchema.parse(createResponse.json()).item;
    expect(createdSelfAssessment.reviewState).toBe("new");

    const createPeerResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
      payload: {
        employeeId: pat.user.id,
        target: "peer",
        assignmentId: assignment.id,
      },
    });
    expect(createPeerResponse.statusCode).toBe(201);
    const createdPeerAssessment = assessmentItemResponseSchema.parse(createPeerResponse.json()).item;

    const saveDraftResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdSelfAssessment.id}/save`,
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
      url: `/api/v1/assessments/${createdSelfAssessment.id}/submit`,
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

    const submitPeerResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdPeerAssessment.id}/submit`,
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
            response: "Pat regularly improved team handoffs and follow-through.",
          },
        ],
      },
    });
    expect(submitPeerResponse.statusCode).toBe(200);

    const acceptSelfResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdSelfAssessment.id}/accept`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Clear self-reflection and examples.",
      },
    });
    expect(acceptSelfResponse.statusCode).toBe(200);
    expect(assessmentItemResponseSchema.parse(acceptSelfResponse.json()).item.reviewState).toBe("accepted");

    const acceptPeerResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdPeerAssessment.id}/accept`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Peer feedback accepted for meeting prep.",
      },
    });
    expect(acceptPeerResponse.statusCode).toBe(200);
    expect(assessmentItemResponseSchema.parse(acceptPeerResponse.json()).item.reviewState).toBe("accepted");

    const patVisibleAcceptedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
    });
    expect(patVisibleAcceptedResponse.statusCode).toBe(200);
    expect(
      assessmentsListResponseSchema.parse(patVisibleAcceptedResponse.json()).items
        .filter((item) => item.employeeId === pat.user.id)
        .map((item) => item.id)
        .sort(),
    ).toEqual([createdPeerAssessment.id, createdSelfAssessment.id].sort());

    const adaVisibleAcceptedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
    });
    expect(adaVisibleAcceptedResponse.statusCode).toBe(200);
    expect(
      assessmentsListResponseSchema.parse(adaVisibleAcceptedResponse.json()).items
        .filter((item) => item.employeeId === pat.user.id)
        .map((item) => item.id)
        .sort(),
    ).toEqual([createdPeerAssessment.id, createdSelfAssessment.id].sort());

    const readyForMeetingResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/ready-for-meeting`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
    });
    expect(readyForMeetingResponse.statusCode).toBe(200);
    const readyAssessmentSet = assessmentSetResponseSchema.parse(readyForMeetingResponse.json());
    expect(readyAssessmentSet.items.every((item) => item.reviewState === "ready_for_meeting")).toBe(true);

    const scheduleResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/schedule`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
    });
    expect(scheduleResponse.statusCode).toBe(200);
    const scheduledAssessmentSet = assessmentSetResponseSchema.parse(scheduleResponse.json());
    expect(scheduledAssessmentSet.items.every((item) => item.reviewState === "scheduled")).toBe(true);
    expect(scheduledAssessmentSet.items.every((item) => item.scheduledByEmployeeId === manny.user.id)).toBe(true);

    const reviewer1CompleteResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/conclude`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        reviewerRole: "reviewer1",
        reviewerNotes: "Ada signed off after reviewing the meeting notes.",
        completed: true,
      },
    });
    expect(reviewer1CompleteResponse.statusCode).toBe(200);
    const reviewer1CompletedSet = assessmentSetResponseSchema.parse(reviewer1CompleteResponse.json());
    expect(reviewer1CompletedSet.items.every((item) => item.reviewState === "scheduled")).toBe(true);
    expect(reviewer1CompletedSet.items.every((item) => item.reviewer1CompletedByEmployeeId === ada.user.id)).toBe(true);
    expect(reviewer1CompletedSet.items.every((item) => item.reviewer2CompletedByEmployeeId === null)).toBe(true);

    const reviewer2CompleteResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/conclude`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        reviewerRole: "reviewer2",
        reviewerNotes: "Manny documented the agreed follow-up goals.",
        completed: true,
      },
    });
    expect(reviewer2CompleteResponse.statusCode).toBe(200);
    const concludedAssessmentSet = assessmentSetResponseSchema.parse(reviewer2CompleteResponse.json());
    expect(concludedAssessmentSet.items.every((item) => item.reviewState === "concluded")).toBe(true);
    expect(concludedAssessmentSet.items.every((item) => item.concludedByEmployeeId === manny.user.id)).toBe(true);

    const reopenResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/conclude`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        reviewerRole: "reviewer1",
        reviewerNotes: "Ada reopened after requesting one more follow-up note.",
        completed: false,
      },
    });
    expect(reopenResponse.statusCode).toBe(200);
    const reopenedAssessmentSet = assessmentSetResponseSchema.parse(reopenResponse.json());
    expect(reopenedAssessmentSet.items.every((item) => item.reviewState === "scheduled")).toBe(true);
    expect(reopenedAssessmentSet.items.every((item) => item.reviewer1CompletedByEmployeeId === null)).toBe(true);
    expect(reopenedAssessmentSet.items.every((item) => item.reviewer2CompletedByEmployeeId === manny.user.id)).toBe(true);
    expect(reopenedAssessmentSet.items.every((item) => item.concludedByEmployeeId === null)).toBe(true);
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
    expect(elliotVisibleAssessments.some((item) => item.id === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")).toBe(true);

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

  it("lets admins override assessment responses, notes, state, and deletion", async () => {
    const app = await createApp();
    const ada = await login(app, "ada.admin", "AdminPass123!");
    const elliot = await login(app, "elliot.employee", "EmployeePass123!");
    const pat = await login(app, "pat.peer", "PeerPass123!");

    const assignmentResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assignments",
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        employeeId: pat.user.id,
        managerId: "11111111-1111-4111-8111-111111111111",
        assessorId: elliot.user.id,
      },
    });
    expect(assignmentResponse.statusCode).toBe(201);
    const assignment = assignmentResponseSchema.parse(assignmentResponse.json()).item;

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
      payload: {
        employeeId: pat.user.id,
        target: "self",
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdAssessment = assessmentItemResponseSchema.parse(createResponse.json()).item;

    const createPeerResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
      payload: {
        employeeId: pat.user.id,
        target: "peer",
        assignmentId: assignment.id,
      },
    });
    expect(createPeerResponse.statusCode).toBe(201);
    const createdPeerAssessment = assessmentItemResponseSchema.parse(createPeerResponse.json()).item;

    const forbiddenUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdAssessment.id}/admin`,
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
      payload: {
        reviewState: "accepted",
      },
    });
    expect(forbiddenUpdateResponse.statusCode).toBe(403);

    const forbiddenDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/assessments/${createdAssessment.id}`,
      headers: {
        authorization: `Bearer ${elliot.token}`,
      },
    });
    expect(forbiddenDeleteResponse.statusCode).toBe(403);

    const acceptResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdAssessment.id}/admin`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa",
            order: 1,
            response: "strongly agree",
          },
          {
            questionId: "aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa",
            order: 2,
            response: "Admin completed the assessment so the workflow could continue.",
          },
        ],
        managerNotes: "Admin override acceptance for follow-up testing.",
        reviewState: "accepted",
      },
    });
    expect(acceptResponse.statusCode).toBe(200);
    const acceptedAssessment = assessmentItemResponseSchema.parse(acceptResponse.json()).item;
    expect(acceptedAssessment.reviewState).toBe("accepted");
    expect(acceptedAssessment.managerNotes).toBe("Admin override acceptance for follow-up testing.");

    const acceptPeerResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdPeerAssessment.id}/admin`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        responses: [
          {
            questionId: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa",
            order: 1,
            response: "4",
          },
          {
            questionId: "aaaaaaaa-3222-4222-8222-aaaaaaaaaaaa",
            order: 2,
            response: "Admin accepted the peer feedback to keep the workflow moving.",
          },
        ],
        reviewState: "accepted",
      },
    });
    expect(acceptPeerResponse.statusCode).toBe(200);

    const scheduleResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdAssessment.id}/admin`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        reviewState: "scheduled",
      },
    });
    expect(scheduleResponse.statusCode).toBe(200);
    const scheduledAssessment = assessmentItemResponseSchema.parse(scheduleResponse.json()).item;
    expect(scheduledAssessment.reviewState).toBe("scheduled");
    expect(scheduledAssessment.scheduledByEmployeeId).toBe(ada.user.id);

    const peerStillAcceptedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
    });
    expect(peerStillAcceptedResponse.statusCode).toBe(200);
    const peerAfterSchedule = assessmentsListResponseSchema
      .parse(peerStillAcceptedResponse.json())
      .items.find((item) => item.id === createdPeerAssessment.id);
    expect(peerAfterSchedule?.reviewState).toBe("accepted");

    const concludeResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${createdAssessment.id}/admin`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        reviewState: "concluded",
      },
    });
    expect(concludeResponse.statusCode).toBe(200);
    const concludedAssessment = assessmentItemResponseSchema.parse(concludeResponse.json()).item;
    expect(concludedAssessment.reviewState).toBe("concluded");
    expect(concludedAssessment.concludedByEmployeeId).toBe(ada.user.id);
    expect(concludedAssessment.reviewer1CompletedByEmployeeId).toBe(ada.user.id);
    expect(concludedAssessment.reviewer2CompletedByEmployeeId).toBe(ada.user.id);

    const peerAfterConcludeResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
    });
    expect(peerAfterConcludeResponse.statusCode).toBe(200);
    const peerAfterConclude = assessmentsListResponseSchema
      .parse(peerAfterConcludeResponse.json())
      .items.find((item) => item.id === createdPeerAssessment.id);
    expect(peerAfterConclude?.reviewState).toBe("accepted");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/assessments/${createdAssessment.id}`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({
      assessmentId: createdAssessment.id,
      deleted: true,
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(assessmentsListResponseSchema.parse(listResponse.json()).items.map((item) => item.id)).not.toContain(createdAssessment.id);
  });

  it("concludes after the only assigned reviewer completes the set", async () => {
    const app = await createApp();
    const ada = await login(app, "ada.admin", "AdminPass123!");
    const pat = await login(app, "pat.peer", "PeerPass123!");
    const manny = await login(app, "manny.manager", "ManagerPass123!");

    const reviewerUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/employees/${pat.user.id}`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        reviewer1Id: ada.user.id,
        reviewer2Id: null,
      },
    });
    expect(reviewerUpdateResponse.statusCode).toBe(200);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assessments",
      headers: {
        authorization: `Bearer ${pat.token}`,
      },
      payload: {
        employeeId: pat.user.id,
        target: "self",
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const createdAssessment = assessmentItemResponseSchema.parse(createResponse.json()).item;

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
            response: "I kept projects on track and helped unblock teammates.",
          },
          {
            questionId: "aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa",
            order: 2,
            response: "I improved planning and team communication.",
          },
        ],
      },
    });
    expect(submitResponse.statusCode).toBe(200);

    const acceptResponse = await app.inject({
      method: "POST",
      url: `/api/v1/assessments/${createdAssessment.id}/accept`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
      payload: {
        managerNotes: "Ready for the meeting phase.",
      },
    });
    expect(acceptResponse.statusCode).toBe(200);

    const readyResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/ready-for-meeting`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
    });
    expect(readyResponse.statusCode).toBe(200);

    const scheduleResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/schedule`,
      headers: {
        authorization: `Bearer ${manny.token}`,
      },
    });
    expect(scheduleResponse.statusCode).toBe(200);

    const concludeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/employees/${pat.user.id}/assessment-set/conclude`,
      headers: {
        authorization: `Bearer ${ada.token}`,
      },
      payload: {
        reviewerRole: "reviewer1",
        reviewerNotes: "Only the assigned reviewer needed to conclude this set.",
        completed: true,
      },
    });
    expect(concludeResponse.statusCode).toBe(200);

    const concludedAssessmentSet = assessmentSetResponseSchema.parse(concludeResponse.json());
    expect(concludedAssessmentSet.items).toHaveLength(1);
    expect(concludedAssessmentSet.items[0]?.reviewState).toBe("concluded");
    expect(concludedAssessmentSet.items[0]?.reviewer1CompletedByEmployeeId).toBe(ada.user.id);
    expect(concludedAssessmentSet.items[0]?.reviewer2CompletedByEmployeeId).toBeNull();
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

    const blockedArchivedConclusionResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/employees/33333333-3333-4333-8333-333333333333/assessment-set/conclude",
      headers: {
        authorization: `Bearer ${admin.token}`,
      },
      payload: {
        reviewerRole: "reviewer1",
        reviewerNotes: "Should stay read-only.",
        completed: true,
      },
    });
    expect(blockedArchivedConclusionResponse.statusCode).toBe(409);
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
