import type {
  ApiIndexResponse,
  AuthLoginResponse,
  AssessmentsListResponse,
  AssignmentsListResponse,
  DomainRulesResponse,
  EmployeeResponse,
  EmployeesListResponse,
  FoundationSnapshot,
  QuestionSetsListResponse,
  ReviewPeriodsListResponse,
} from "./api.js";

const timestamps = {
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-02-01T12:00:00.000Z",
  submitted: "2026-02-10T08:00:00.000Z",
  accepted: "2026-02-12T09:00:00.000Z",
  reviewed: "2026-02-18T15:30:00.000Z",
  archived: "2026-03-01T00:00:00.000Z",
};

const adaAdminEmployee = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "ada.admin",
  fullName: "Ada Admin",
  email: "ada.admin@example.com",
  role: "admin",
  status: "active",
  managerId: null,
  assessor1Id: null,
  assessor2Id: null,
  createdAt: timestamps.created,
  updatedAt: timestamps.updated,
} as const;

const mannyManagerEmployee = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "manny.manager",
  fullName: "Manny Manager",
  email: "manny.manager@example.com",
  role: "manager",
  status: "active",
  managerId: "11111111-1111-4111-8111-111111111111",
  assessor1Id: "11111111-1111-4111-8111-111111111111",
  assessor2Id: "44444444-4444-4444-8444-444444444444",
  createdAt: timestamps.created,
  updatedAt: timestamps.updated,
} as const;

const elliotEmployee = {
  id: "33333333-3333-4333-8333-333333333333",
  username: "elliot.employee",
  fullName: "Elliot Employee",
  email: "elliot.employee@example.com",
  role: "employee",
  status: "active",
  managerId: "22222222-2222-4222-8222-222222222222",
  assessor1Id: "22222222-2222-4222-8222-222222222222",
  assessor2Id: "44444444-4444-4444-8444-444444444444",
  createdAt: timestamps.created,
  updatedAt: timestamps.updated,
} as const;

const patPeerEmployee = {
  id: "44444444-4444-4444-8444-444444444444",
  username: "pat.peer",
  fullName: "Pat Peer",
  email: "pat.peer@example.com",
  role: "employee",
  status: "active",
  managerId: "22222222-2222-4222-8222-222222222222",
  assessor1Id: "22222222-2222-4222-8222-222222222222",
  assessor2Id: "11111111-1111-4111-8111-111111111111",
  createdAt: timestamps.created,
  updatedAt: timestamps.updated,
} as const;

export const employeesListExample: EmployeesListResponse = {
  items: [
    adaAdminEmployee,
    mannyManagerEmployee,
    elliotEmployee,
    patPeerEmployee,
  ],
};

export const reviewPeriodsListExample: ReviewPeriodsListResponse = {
  items: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      key: "2026",
      label: "2026 Annual Review",
      startDate: "2026-01-01",
      dueDate: "2026-02-28",
      status: "active",
      archivedAt: null,
      archivedByEmployeeId: null,
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      key: "2025",
      label: "2025 Annual Review",
      startDate: "2025-01-01",
      dueDate: "2025-02-28",
      status: "archived",
      archivedAt: timestamps.archived,
      archivedByEmployeeId: "11111111-1111-4111-8111-111111111111",
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
  ],
};

export const questionSetsListExample: QuestionSetsListResponse = {
  items: [
    {
      id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      reviewPeriodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target: "self",
      status: "active",
      isReadOnly: false,
      title: "2026 Self Questions",
      headerMarkdown: "Reflect on your work from the review period.",
      footerMarkdown: "Submit when you are ready for manager review.",
      questions: [
        {
          id: "aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa",
          order: 1,
          type: "subjective",
          category: "Impact",
          prompt: "I consistently delivered on commitments.",
        },
        {
          id: "aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa",
          order: 2,
          type: "narrative",
          category: "Growth",
          prompt: "What are you most proud of this period?",
        },
      ],
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
    {
      id: "aaaaaaaa-1222-4222-8222-aaaaaaaaaaaa",
      reviewPeriodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target: "peer",
      status: "active",
      isReadOnly: false,
      title: "2026 Peer Questions",
      headerMarkdown: "Provide peer feedback for the assigned employee.",
      footerMarkdown: "Peer feedback is read-only after acceptance.",
      questions: [
        {
          id: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa",
          order: 1,
          type: "ranking",
          category: "Collaboration",
          prompt: "How would you rate collaboration with this employee?",
        },
        {
          id: "aaaaaaaa-3222-4222-8222-aaaaaaaaaaaa",
          order: 2,
          type: "narrative",
          category: "Examples",
          prompt: "Share a specific example that supports your rating.",
        },
      ],
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
    {
      id: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
      reviewPeriodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      target: "self",
      status: "active",
      isReadOnly: true,
      title: "2025 Self Questions",
      headerMarkdown: "Archived self questions.",
      footerMarkdown: "Archive only.",
      questions: [
        {
          id: "bbbbbbbb-2111-4111-8111-bbbbbbbbbbbb",
          order: 1,
          type: "subjective",
          category: "Impact",
          prompt: "Archived prompt",
        },
      ],
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
    {
      id: "bbbbbbbb-1222-4222-8222-bbbbbbbbbbbb",
      reviewPeriodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      target: "peer",
      status: "active",
      isReadOnly: true,
      title: "2025 Peer Questions",
      headerMarkdown: "Archived peer questions.",
      footerMarkdown: "Archive only.",
      questions: [
        {
          id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
          order: 1,
          type: "ranking",
          category: "Teamwork",
          prompt: "Archived peer prompt",
        },
      ],
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
  ],
};

export const assignmentsListExample: AssignmentsListResponse = {
  items: [
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      reviewPeriodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      employeeId: "33333333-3333-4333-8333-333333333333",
      managerId: "22222222-2222-4222-8222-222222222222",
      assessorId: "44444444-4444-4444-8444-444444444444",
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
  ],
};

export const assessmentsListExample: AssessmentsListResponse = {
  items: [
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      reviewPeriodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      questionSetId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      assignmentId: null,
      target: "self",
      employeeId: "33333333-3333-4333-8333-333333333333",
      assessorId: "33333333-3333-4333-8333-333333333333",
      reviewState: "submitted",
      archiveState: "active",
      isReadOnly: false,
      responses: [
        {
          questionId: "aaaaaaaa-2111-4111-8111-aaaaaaaaaaaa",
          order: 1,
          response: "strongly agree",
        },
        {
          questionId: "aaaaaaaa-3111-4111-8111-aaaaaaaaaaaa",
          order: 2,
          response: "I successfully launched our new workflow.",
        },
      ],
      submittedAt: timestamps.submitted,
      acceptedAt: null,
      acceptedByEmployeeId: null,
      managerNotes: null,
      reviewedAt: null,
      reviewedByEmployeeId: null,
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      reviewPeriodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      questionSetId: "aaaaaaaa-1222-4222-8222-aaaaaaaaaaaa",
      assignmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      target: "peer",
      employeeId: "33333333-3333-4333-8333-333333333333",
      assessorId: "44444444-4444-4444-8444-444444444444",
      reviewState: "accepted",
      archiveState: "active",
      isReadOnly: true,
      responses: [
        {
          questionId: "aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa",
          order: 1,
          response: "4",
        },
        {
          questionId: "aaaaaaaa-3222-4222-8222-aaaaaaaaaaaa",
          order: 2,
          response: "Pat regularly unblocked cross-team work.",
        },
      ],
      submittedAt: timestamps.submitted,
      acceptedAt: timestamps.accepted,
      acceptedByEmployeeId: "22222222-2222-4222-8222-222222222222",
      managerNotes: "Ready for final review.",
      reviewedAt: null,
      reviewedByEmployeeId: null,
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
    {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      reviewPeriodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      questionSetId: "bbbbbbbb-1222-4222-8222-bbbbbbbbbbbb",
      assignmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      target: "peer",
      employeeId: "33333333-3333-4333-8333-333333333333",
      assessorId: "44444444-4444-4444-8444-444444444444",
      reviewState: "reviewed",
      archiveState: "archived",
      isReadOnly: true,
      responses: [
        {
          questionId: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
          order: 1,
          response: "3",
        },
      ],
      submittedAt: timestamps.submitted,
      acceptedAt: timestamps.accepted,
      acceptedByEmployeeId: "11111111-1111-4111-8111-111111111111",
      managerNotes: "Archived after completion.",
      reviewedAt: timestamps.reviewed,
      reviewedByEmployeeId: "22222222-2222-4222-8222-222222222222",
      createdAt: timestamps.created,
      updatedAt: timestamps.updated,
    },
  ],
};

export const apiIndexExample: ApiIndexResponse = {
  name: "revu-api",
  version: "0.1.0",
  seededAccountsAvailable: true,
  resources: [
    {
      name: "health",
      path: "/health",
      description: "Simple process health check.",
    },
    {
      name: "index",
      path: "/api/v1",
      description: "Entry point for API-first clients.",
    },
    {
      name: "auth",
      path: "/api/v1/auth",
      description: "Local username/password authentication and session inspection.",
    },
    {
      name: "domain-rules",
      path: "/api/v1/domain-rules",
      description: "Fixed product rules and review transitions.",
    },
    {
      name: "employees",
      path: "/api/v1/employees",
      description: "Employee directory and relationships.",
    },
    {
      name: "review-periods",
      path: "/api/v1/review-periods",
      description: "Review period lifecycle and archive state.",
    },
    {
      name: "question-sets",
      path: "/api/v1/question-sets",
      description: "Question sets by review period and target.",
    },
    {
      name: "assignments",
      path: "/api/v1/assignments",
      description: "Review-period peer reviewer assignments.",
    },
    {
      name: "assessments",
      path: "/api/v1/assessments",
      description: "Assessment lifecycle and review metadata.",
    },
    {
      name: "foundation",
      path: "/api/v1/foundation",
      description: "Combined snapshot used during the initial build phase.",
    },
  ],
};

export const domainRulesExample: DomainRulesResponse = {
  postgresIsSourceOfTruth: true,
  employeeAssessorMatchesPeerAssignment: true,
  acceptedAssessmentsAreImmutable: true,
  singleActiveQuestionSetPerTarget: true,
  archiveIsDrivenByReviewPeriod: true,
  assessmentReviewTransitions: {
    new: ["draft", "submitted"],
    draft: ["draft", "submitted"],
    submitted: ["accepted", "draft"],
    accepted: ["reviewed"],
    reviewed: [],
  },
};

export const foundationSnapshotExample: FoundationSnapshot = {
  employees: employeesListExample.items,
  reviewPeriods: reviewPeriodsListExample.items,
  questionSets: questionSetsListExample.items,
  assignments: assignmentsListExample.items,
  assessments: assessmentsListExample.items,
};

export const adminLoginExample: AuthLoginResponse = {
  session: {
    token: "session-admin-example-token",
    issuedAt: timestamps.updated,
    expiresAt: "2026-02-01T20:00:00.000Z",
    passwordResetRequired: false,
    permissions: [
      "employees:read",
      "employees:create",
      "employees:update",
      "employees:delete",
      "employees:import",
      "employees:export",
      "employees:password:set",
      "employees:password:reset",
      "reviewPeriods:create",
      "reviewPeriods:update",
      "reviewPeriods:archive",
      "questionSets:create",
      "questionSets:update",
      "questionSets:activate",
      "questionSets:import",
      "questionSets:export",
      "assignments:create",
      "assignments:update",
      "assignments:delete",
      "assignments:import",
      "assignments:export",
      "assessments:read",
      "assessments:accept",
      "assessments:review",
      "assessments:reassign",
    ],
    user: adaAdminEmployee,
  },
};

export const adminEmployeeExample: EmployeeResponse = {
  item: {
    ...elliotEmployee,
    auth: {
      passwordConfigured: true,
      passwordResetRequired: false,
      lastPasswordChangeAt: timestamps.updated,
    },
  },
};
