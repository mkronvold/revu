import { readFileSync } from "node:fs";

import {
  assessmentsListResponseSchema,
  assignmentResponseSchema,
  assignmentsExportResponseSchema,
  assignmentsImportResponseSchema,
  authLoginResponseSchema,
  clearReadyAssessmentsResponseSchema,
  deleteReviewPeriodResponseSchema,
  employeeResponseSchema,
  foundationSnapshotExample,
  questionSetsImportResponseSchema,
  questionSetsExportResponseSchema,
  questionSetResponseSchema,
  questionSetsListResponseSchema,
  reviewPeriodResponseSchema,
  syncAssessmentsResponseSchema,
} from "@revu/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/api/src/app.js";

describe("review periods, question sets, and assignments admin API", () => {
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

  async function loginAsAdmin(app: ReturnType<typeof buildApp>) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "ada.admin",
        password: "AdminPass123!",
      },
    });

    expect(response.statusCode).toBe(200);
    return authLoginResponseSchema.parse(response.json()).session;
  }

  it("supports admin CRUD flows for review periods, question sets, assignment sync, and question-set export downloads", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    const createdReviewPeriodResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        key: "2027",
        label: "2027 Annual Review",
        startDate: "2027-01-01",
        dueDate: "2027-03-07",
        assessmentDueDate: "2027-02-21",
        reviewDueDate: "2027-02-28",
      },
    });

    expect(createdReviewPeriodResponse.statusCode).toBe(201);
    const createdReviewPeriod = reviewPeriodResponseSchema.parse(createdReviewPeriodResponse.json()).item;
    expect(createdReviewPeriod).toMatchObject({
      dueDate: "2027-03-07",
      assessmentDueDate: "2027-02-21",
      reviewDueDate: "2027-02-28",
    });

    const updatedReviewPeriodResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        label: "2027 Performance Review",
      },
    });
    expect(updatedReviewPeriodResponse.statusCode).toBe(200);
    expect(reviewPeriodResponseSchema.parse(updatedReviewPeriodResponse.json()).item.label).toBe("2027 Performance Review");

    const relaxedDeadlineUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        startDate: "2027-01-10",
        dueDate: "2027-01-20",
        assessmentDueDate: "2027-01-05",
        reviewDueDate: "2027-02-01",
      },
    });
    expect(relaxedDeadlineUpdateResponse.statusCode).toBe(200);
    expect(reviewPeriodResponseSchema.parse(relaxedDeadlineUpdateResponse.json()).item).toMatchObject({
      startDate: "2027-01-10",
      dueDate: "2027-01-20",
      assessmentDueDate: "2027-01-05",
      reviewDueDate: "2027-02-01",
    });

    const firstSelfQuestionSetResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        target: "self",
        title: "2027 Self Questions v1",
        headerMarkdown: "Reflect on your year.",
        footerMarkdown: "Thank you.",
        questions: [
          {
            order: 1,
            type: "subjective",
            category: "Impact",
            prompt: "I delivered against my commitments.",
          },
        ],
      },
    });
    expect(firstSelfQuestionSetResponse.statusCode).toBe(201);
    const firstSelfQuestionSet = questionSetResponseSchema.parse(firstSelfQuestionSetResponse.json()).item;
    expect(firstSelfQuestionSet.status).toBe("active");

    const secondSelfQuestionSetResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        target: "self",
        title: "2027 Self Questions v2",
        headerMarkdown: "Updated intro.",
        footerMarkdown: "Updated footer.",
        questions: [
          {
            order: 1,
            type: "narrative",
            category: "Wins",
            prompt: "What are you most proud of this year?",
          },
        ],
      },
    });
    expect(secondSelfQuestionSetResponse.statusCode).toBe(201);
    const secondSelfQuestionSet = questionSetResponseSchema.parse(secondSelfQuestionSetResponse.json()).item;
    expect(secondSelfQuestionSet.status).toBe("active");

    const activateFirstResponse = await app.inject({
      method: "POST",
      url: `/api/v1/question-sets/${firstSelfQuestionSet.id}/activate`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(activateFirstResponse.statusCode).toBe(200);
    expect(questionSetResponseSchema.parse(activateFirstResponse.json()).item.status).toBe("active");

    const activateSecondResponse = await app.inject({
      method: "POST",
      url: `/api/v1/question-sets/${secondSelfQuestionSet.id}/activate`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(activateSecondResponse.statusCode).toBe(200);

    const filteredQuestionSetsResponse = await app.inject({
      method: "GET",
      url: `/api/v1/question-sets?reviewPeriodId=${createdReviewPeriod.id}`,
    });
    expect(filteredQuestionSetsResponse.statusCode).toBe(200);
    const filteredQuestionSets = questionSetsListResponseSchema.parse(filteredQuestionSetsResponse.json()).items;
    expect(filteredQuestionSets.filter((item) => item.target === "self" && item.status === "active")).toHaveLength(1);
    expect(filteredQuestionSets.find((item) => item.id === firstSelfQuestionSet.id)?.status).toBe("draft");
    expect(filteredQuestionSets.find((item) => item.id === secondSelfQuestionSet.id)?.status).toBe("active");

    const createdAssignmentResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/assignments`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        employeeId: "33333333-3333-4333-8333-333333333333",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessorId: "44444444-4444-4444-8444-444444444444",
      },
    });
    expect(createdAssignmentResponse.statusCode).toBe(201);
    const createdAssignment = assignmentResponseSchema.parse(createdAssignmentResponse.json()).item;

    const updateAssignmentResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/assignments/${createdAssignment.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        assessorId: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(updateAssignmentResponse.statusCode).toBe(200);
    expect(assignmentResponseSchema.parse(updateAssignmentResponse.json()).item.assessorId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );

    const employeeAfterAssignmentResponse = await app.inject({
      method: "GET",
      url: "/api/v1/employees/33333333-3333-4333-8333-333333333333",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(employeeAfterAssignmentResponse.statusCode).toBe(200);
    const employeeAfterAssignment = employeeResponseSchema.parse(employeeAfterAssignmentResponse.json()).item;
    expect(employeeAfterAssignment.assessor2Id).toBe("11111111-1111-4111-8111-111111111111");
    expect(employeeAfterAssignment.managerId).toBe("22222222-2222-4222-8222-222222222222");

    const questionSetExportResponse = await app.inject({
      method: "GET",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets/export?format=json`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(questionSetExportResponse.statusCode).toBe(200);
    const questionSetExport = questionSetsExportResponseSchema.parse(questionSetExportResponse.json());
    expect(questionSetExport.itemCount).toBe(2);
    expect(questionSetExport.items.map((item) => item.title)).toEqual(["2027 Self Questions v1", "2027 Self Questions v2"]);

    const questionSetCsvExportResponse = await app.inject({
      method: "GET",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets/export?format=csv`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(questionSetCsvExportResponse.statusCode).toBe(200);
    const questionSetCsvExport = questionSetsExportResponseSchema.parse(questionSetCsvExportResponse.json());
    expect(questionSetCsvExport.format).toBe("csv");
    expect(questionSetCsvExport.itemCount).toBe(2);

    const questionSetImportResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets/import`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        format: "csv",
        items: questionSetExport.items,
      },
    });
    expect(questionSetImportResponse.statusCode).toBe(200);
    const questionSetImport = questionSetsImportResponseSchema.parse(questionSetImportResponse.json());
    expect(questionSetImport.itemCount).toBe(2);
    expect(questionSetImport.updatedCount).toBe(2);

    const assignmentExportResponse = await app.inject({
      method: "GET",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/assignments/export?format=csv`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(assignmentExportResponse.statusCode).toBe(200);
    const assignmentExport = assignmentsExportResponseSchema.parse(assignmentExportResponse.json());
    expect(assignmentExport.itemCount).toBe(1);
    expect(assignmentExport.items[0]).toMatchObject({
      employeeUsername: "elliot.employee",
      managerUsername: "manny.manager",
      assessorUsername: "ada.admin",
    });

    const assignmentImportResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/assignments/import`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        format: "csv",
        items: assignmentExport.items,
      },
    });
    expect(assignmentImportResponse.statusCode).toBe(200);
    const assignmentImport = assignmentsImportResponseSchema.parse(assignmentImportResponse.json());
    expect(assignmentImport.itemCount).toBe(1);
    expect(assignmentImport.updatedCount).toBe(1);
  });

  it("preserves referenced question ids on update and blocks removing questions with recorded responses", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);
    const questionSet = foundationSnapshotExample.questionSets.find(
      (candidate) => candidate.id === "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    )!;

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/question-sets/${questionSet.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        title: "2026 Self Questions Revised",
        headerMarkdown: questionSet.headerMarkdown,
        footerMarkdown: questionSet.footerMarkdown,
        status: questionSet.status,
        questions: questionSet.questions.map((question) => ({
          id: question.id,
          order: question.order,
          type: question.type,
          category: question.category,
          prompt: `${question.prompt} Updated.`,
        })),
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const updatedQuestionSet = questionSetResponseSchema.parse(updateResponse.json()).item;
    expect(updatedQuestionSet.questions.map((question) => question.id)).toEqual(questionSet.questions.map((question) => question.id));
    expect(updatedQuestionSet.questions[0]?.prompt).toContain("Updated.");

    const removeReferencedQuestionResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/question-sets/${questionSet.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        title: updatedQuestionSet.title,
        headerMarkdown: updatedQuestionSet.headerMarkdown,
        footerMarkdown: updatedQuestionSet.footerMarkdown,
        status: updatedQuestionSet.status,
        questions: updatedQuestionSet.questions.slice(1).map((question, index) => ({
          id: question.id,
          order: index + 1,
          type: question.type,
          category: question.category,
          prompt: question.prompt,
        })),
      },
    });

    expect(removeReferencedQuestionResponse.statusCode).toBe(409);
    expect(removeReferencedQuestionResponse.body).toContain("cannot be removed from a question set");
  });

  it("reorders peer question sets safely after removing an unreferenced question", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    const createReviewPeriodResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        key: "2027-H2",
        label: "2027 H2",
        startDate: "2027-07-01",
        dueDate: "2027-12-31",
        assessmentDueDate: "2027-12-15",
        reviewDueDate: "2027-12-31",
      },
    });
    expect(createReviewPeriodResponse.statusCode).toBe(201);
    const createdReviewPeriod = reviewPeriodResponseSchema.parse(createReviewPeriodResponse.json()).item;

    const createQuestionSetResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        target: "peer",
        title: "2027 Peer Questions",
        headerMarkdown: "Peer header",
        footerMarkdown: "Peer footer",
        questions: [
          {
            order: 1,
            type: "ranking",
            category: "Collaboration",
            prompt: "Question 1",
          },
          {
            order: 2,
            type: "narrative",
            category: "Examples",
            prompt: "Question 2",
          },
          {
            order: 3,
            type: "subjective",
            category: "Impact",
            prompt: "Question 3",
          },
        ],
      },
    });
    expect(createQuestionSetResponse.statusCode).toBe(201);
    const createdQuestionSet = questionSetResponseSchema.parse(createQuestionSetResponse.json()).item;

    const compactedUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/question-sets/${createdQuestionSet.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        title: createdQuestionSet.title,
        headerMarkdown: createdQuestionSet.headerMarkdown,
        footerMarkdown: createdQuestionSet.footerMarkdown,
        status: createdQuestionSet.status,
        questions: [
          {
            id: createdQuestionSet.questions[0]!.id,
            order: 1,
            type: createdQuestionSet.questions[0]!.type,
            category: createdQuestionSet.questions[0]!.category,
            prompt: createdQuestionSet.questions[0]!.prompt,
          },
          {
            id: createdQuestionSet.questions[2]!.id,
            order: 2,
            type: createdQuestionSet.questions[2]!.type,
            category: createdQuestionSet.questions[2]!.category,
            prompt: `${createdQuestionSet.questions[2]!.prompt} Updated`,
          },
        ],
      },
    });

    expect(compactedUpdateResponse.statusCode).toBe(200);
    const updatedQuestionSet = questionSetResponseSchema.parse(compactedUpdateResponse.json()).item;
    expect(updatedQuestionSet.questions).toHaveLength(2);
    expect(updatedQuestionSet.questions.map((question) => question.order)).toEqual([1, 2]);
    expect(updatedQuestionSet.questions.map((question) => question.prompt)).toEqual(["Question 1", "Question 3 Updated"]);
  });

  it("deletes a review period together with its question sets, assessments, and assignments", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);
    const reviewPeriodToDelete = foundationSnapshotExample.reviewPeriods.find((reviewPeriod) => reviewPeriod.status === "archived")
      ?? foundationSnapshotExample.reviewPeriods[0]!;
    const expectedQuestionSetCount = foundationSnapshotExample.questionSets.filter(
      (questionSet) => questionSet.reviewPeriodId === reviewPeriodToDelete.id,
    ).length;
    const expectedAssessmentCount = foundationSnapshotExample.assessments.filter(
      (assessment) => assessment.reviewPeriodId === reviewPeriodToDelete.id,
    ).length;
    const expectedAssignmentCount = foundationSnapshotExample.assignments.filter(
      (assignment) => assignment.reviewPeriodId === reviewPeriodToDelete.id,
    ).length;

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/review-periods/${reviewPeriodToDelete.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteReviewPeriodResponseSchema.parse(deleteResponse.json())).toMatchObject({
      reviewPeriodId: reviewPeriodToDelete.id,
      label: reviewPeriodToDelete.label,
      deleted: true,
      questionSetCount: expectedQuestionSetCount,
      assessmentCount: expectedAssessmentCount,
      assignmentCount: expectedAssignmentCount,
    });

    const remainingQuestionSetsResponse = await app.inject({
      method: "GET",
      url: `/api/v1/question-sets?reviewPeriodId=${reviewPeriodToDelete.id}`,
    });
    expect(remainingQuestionSetsResponse.statusCode).toBe(200);
    expect(questionSetsListResponseSchema.parse(remainingQuestionSetsResponse.json()).items).toHaveLength(0);

    const remainingAssessmentsResponse = await app.inject({
      method: "GET",
      url: `/api/v1/assessments?reviewPeriodId=${reviewPeriodToDelete.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(remainingAssessmentsResponse.statusCode).toBe(200);
    expect(assessmentsListResponseSchema.parse(remainingAssessmentsResponse.json()).items).toHaveLength(0);

    const deletedReviewPeriodResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(deletedReviewPeriodResponse.statusCode).toBe(200);
    expect(deletedReviewPeriodResponse.body).not.toContain(reviewPeriodToDelete.id);
  });

  it("clears ready-to-start assessments for the active review period", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    const createdReviewPeriodResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        key: "2028",
        label: "2028 Annual Review",
        startDate: "2028-01-01",
        dueDate: "2028-03-07",
        assessmentDueDate: "2028-02-21",
        reviewDueDate: "2028-02-28",
        status: "active",
      },
    });
    expect(createdReviewPeriodResponse.statusCode).toBe(201);
    const createdReviewPeriod = reviewPeriodResponseSchema.parse(createdReviewPeriodResponse.json()).item;

    for (const questionSetPayload of [
      {
        target: "self",
        title: "2028 Self Questions",
        prompt: "I delivered against my commitments.",
      },
      {
        target: "peer",
        title: "2028 Peer Questions",
        prompt: "They delivered against their commitments.",
      },
    ] as const) {
      const questionSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets`,
        headers: {
          authorization: `Bearer ${session.token}`,
        },
        payload: {
          target: questionSetPayload.target,
          title: questionSetPayload.title,
          headerMarkdown: "Reflect on the review period.",
          footerMarkdown: "Thank you.",
          questions: [
            {
              order: 1,
              type: "subjective",
              category: "Impact",
              prompt: questionSetPayload.prompt,
            },
          ],
        },
      });
      expect(questionSetResponse.statusCode).toBe(201);
      const questionSet = questionSetResponseSchema.parse(questionSetResponse.json()).item;

      const activateQuestionSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/question-sets/${questionSet.id}/activate`,
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });
      expect(activateQuestionSetResponse.statusCode).toBe(200);
    }

    const syncResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/sync-assessments`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(syncResponse.statusCode).toBe(200);
    const syncResult = syncAssessmentsResponseSchema.parse(syncResponse.json());
    expect(syncResult.createdSelfAssessments).toBeGreaterThan(0);

    const assessmentsBeforeClearResponse = await app.inject({
      method: "GET",
      url: `/api/v1/assessments?reviewPeriodId=${createdReviewPeriod.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(assessmentsBeforeClearResponse.statusCode).toBe(200);
    const assessmentsBeforeClear = assessmentsListResponseSchema.parse(assessmentsBeforeClearResponse.json()).items;
    expect(assessmentsBeforeClear.length).toBeGreaterThan(0);

    const clearResponse = await app.inject({
      method: "POST",
      url: `/api/v1/review-periods/${createdReviewPeriod.id}/clear-ready-assessments`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(clearResponse.statusCode).toBe(200);
    expect(clearReadyAssessmentsResponseSchema.parse(clearResponse.json())).toEqual({
      reviewPeriodId: createdReviewPeriod.id,
      clearedAssessments: assessmentsBeforeClear.length,
    });

    const assessmentsAfterClearResponse = await app.inject({
      method: "GET",
      url: `/api/v1/assessments?reviewPeriodId=${createdReviewPeriod.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(assessmentsAfterClearResponse.statusCode).toBe(200);
    expect(assessmentsListResponseSchema.parse(assessmentsAfterClearResponse.json()).items).toHaveLength(0);
  });

  it("syncs only active employee-assessor pairs and removes stale not-started assessments", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    const createdReviewPeriodResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        key: "2029",
        label: "2029 Annual Review",
        startDate: "2029-01-01",
        dueDate: "2029-03-07",
        assessmentDueDate: "2029-02-21",
        reviewDueDate: "2029-02-28",
        status: "active",
      },
    });
    expect(createdReviewPeriodResponse.statusCode).toBe(201);
    const createdReviewPeriod = reviewPeriodResponseSchema.parse(createdReviewPeriodResponse.json()).item;

    for (const questionSetPayload of [
      {
        target: "self",
        title: "2029 Self Questions",
        prompt: "I delivered against my commitments.",
      },
      {
        target: "peer",
        title: "2029 Peer Questions",
        prompt: "They delivered against their commitments.",
      },
    ] as const) {
      const questionSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/review-periods/${createdReviewPeriod.id}/question-sets`,
        headers: {
          authorization: `Bearer ${session.token}`,
        },
        payload: {
          target: questionSetPayload.target,
          title: questionSetPayload.title,
          headerMarkdown: "Reflect on the review period.",
          footerMarkdown: "Thank you.",
          questions: [
            {
              order: 1,
              type: "subjective",
              category: "Impact",
              prompt: questionSetPayload.prompt,
            },
          ],
        },
      });
      expect(questionSetResponse.statusCode).toBe(201);
      const questionSet = questionSetResponseSchema.parse(questionSetResponse.json()).item;

      const activateQuestionSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/question-sets/${questionSet.id}/activate`,
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });
      expect(activateQuestionSetResponse.statusCode).toBe(200);
    }

    const createEmployee = async (payload: {
      username: string;
      fullName: string;
      email: string;
      assessor1Id?: string | null;
      assessor2Id?: string | null;
    }) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/employees",
        headers: {
          authorization: `Bearer ${session.token}`,
        },
        payload: {
          username: payload.username,
          fullName: payload.fullName,
          email: payload.email,
          role: "employee",
          status: "active",
          assessor1Id: payload.assessor1Id ?? null,
          assessor2Id: payload.assessor2Id ?? null,
        },
      });
      expect(response.statusCode).toBe(201);
      return employeeResponseSchema.parse(response.json()).item;
    };

    const listAssessmentKeys = async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/assessments?reviewPeriodId=${createdReviewPeriod.id}`,
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });
      expect(response.statusCode).toBe(200);
      return assessmentsListResponseSchema.parse(response.json()).items.map(
        (assessment) => `${assessment.employeeId}:${assessment.assessorId}`,
      );
    };

    const syncAssessments = async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/review-periods/${createdReviewPeriod.id}/sync-assessments`,
        headers: {
          authorization: `Bearer ${session.token}`,
        },
      });
      expect(response.statusCode).toBe(200);
      return syncAssessmentsResponseSchema.parse(response.json());
    };

    const assessorOne = await createEmployee({
      username: "assessor.one",
      fullName: "Assessor One",
      email: "assessor.one@example.com",
    });
    const assessorTwo = await createEmployee({
      username: "assessor.two",
      fullName: "Assessor Two",
      email: "assessor.two@example.com",
    });
    const subject = await createEmployee({
      username: "subject.employee",
      fullName: "Subject Employee",
      email: "subject.employee@example.com",
      assessor1Id: assessorOne.id,
      assessor2Id: assessorTwo.id,
    });

    await syncAssessments();
    let assessmentKeys = await listAssessmentKeys();
    expect(assessmentKeys).toContain(`${subject.id}:${subject.id}`);
    expect(assessmentKeys).toContain(`${subject.id}:${assessorOne.id}`);
    expect(assessmentKeys).toContain(`${subject.id}:${assessorTwo.id}`);

    const removeSecondAssessorResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/employees/${subject.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        assessor2Id: null,
      },
    });
    expect(removeSecondAssessorResponse.statusCode).toBe(200);

    await syncAssessments();
    assessmentKeys = await listAssessmentKeys();
    expect(assessmentKeys).toContain(`${subject.id}:${subject.id}`);
    expect(assessmentKeys).toContain(`${subject.id}:${assessorOne.id}`);
    expect(assessmentKeys).not.toContain(`${subject.id}:${assessorTwo.id}`);

    const deactivateAssessorResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/employees/${assessorOne.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        status: "inactive",
      },
    });
    expect(deactivateAssessorResponse.statusCode).toBe(200);

    assessmentKeys = await listAssessmentKeys();
    expect(assessmentKeys).not.toContain(`${subject.id}:${assessorOne.id}`);
    expect(assessmentKeys).not.toContain(`${assessorOne.id}:${assessorOne.id}`);

    const deactivateSubjectResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/employees/${subject.id}`,
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        assessor1Id: null,
        status: "inactive",
      },
    });
    expect(deactivateSubjectResponse.statusCode).toBe(200);

    assessmentKeys = await listAssessmentKeys();
    expect(assessmentKeys).not.toContain(`${subject.id}:${subject.id}`);

    await syncAssessments();
    assessmentKeys = await listAssessmentKeys();
    expect(
      assessmentKeys.some(
        (key) =>
          key.startsWith(`${subject.id}:`)
          || key.endsWith(`:${subject.id}`)
          || key.startsWith(`${assessorOne.id}:`)
          || key.endsWith(`:${assessorOne.id}`),
      ),
    ).toBe(false);
  });

  it("archives and unarchives review periods while enforcing archive-only mutations", async () => {
    const app = await createApp();
    const session = await loginAsAdmin(app);

    const archiveResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/archive",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(reviewPeriodResponseSchema.parse(archiveResponse.json()).item.status).toBe("archived");

    const archivedQuestionSetsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/question-sets?reviewPeriodId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const archivedQuestionSets = questionSetsListResponseSchema.parse(archivedQuestionSetsResponse.json()).items;
    expect(archivedQuestionSets.every((item) => item.isReadOnly)).toBe(true);

    const archivedFoundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    const archivedFoundation = archivedFoundationResponse.json() as {
      assessments: Array<{ reviewPeriodId: string; target: string; archiveState: string; isReadOnly: boolean }>;
    };
    const archivedAssessments = archivedFoundation.assessments.filter(
      (assessment) => assessment.reviewPeriodId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(archivedAssessments.every((assessment) => assessment.archiveState === "archived" && assessment.isReadOnly)).toBe(
      true,
    );

    const blockedQuestionSetUpdate = await app.inject({
      method: "PATCH",
      url: "/api/v1/question-sets/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        title: "Should fail while archived",
      },
    });
    expect(blockedQuestionSetUpdate.statusCode).toBe(409);

    const blockedAssignmentCreate = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/assignments",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
      payload: {
        employeeId: "44444444-4444-4444-8444-444444444444",
        managerId: "22222222-2222-4222-8222-222222222222",
        assessorId: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(blockedAssignmentCreate.statusCode).toBe(409);

    const unarchiveResponse = await app.inject({
      method: "POST",
      url: "/api/v1/review-periods/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/unarchive",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    expect(unarchiveResponse.statusCode).toBe(200);
    expect(reviewPeriodResponseSchema.parse(unarchiveResponse.json()).item.status).toBe("inactive");

    const unarchivedFoundationResponse = await app.inject({
      method: "GET",
      url: "/api/v1/foundation",
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });
    const unarchivedFoundation = unarchivedFoundationResponse.json() as {
      questionSets: Array<{ reviewPeriodId: string; isReadOnly: boolean }>;
      assessments: Array<{ reviewPeriodId: string; target: string; archiveState: string; isReadOnly: boolean }>;
    };

    expect(
      unarchivedFoundation.questionSets
        .filter((questionSet) => questionSet.reviewPeriodId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .every((questionSet) => questionSet.isReadOnly === false),
    ).toBe(true);

    const restoredSelfAssessment = unarchivedFoundation.assessments.find(
      (assessment) =>
        assessment.reviewPeriodId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" && assessment.target === "self",
    );
    const restoredAcceptedPeerAssessment = unarchivedFoundation.assessments.find(
      (assessment) =>
        assessment.reviewPeriodId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" && assessment.target === "peer",
    );

    expect(restoredSelfAssessment).toMatchObject({
      archiveState: "active",
      isReadOnly: false,
    });
    expect(restoredAcceptedPeerAssessment).toMatchObject({
      archiveState: "active",
      isReadOnly: true,
    });
  });

  it("captures review-period archive sync and assignment guard rails in SQL", () => {
    const sql = readFileSync(new URL("../../prisma/migrations/003_review_periods_assignments_api.sql", import.meta.url), "utf8");

    expect(sql).toContain("ADD COLUMN archive_state assessment_archive_state");
    expect(sql).toContain("prevent_assignment_mutation_if_archived");
    expect(sql).toContain("Assignments for archived review periods are read-only");
    expect(sql).toContain("sync_assignment_employee_relationships");
    expect(sql).toContain("sync_review_period_archive_state");
  });
});
