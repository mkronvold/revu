import type { Employee, FoundationSnapshot } from '@revu/contracts';

import {
  buildAdminOversightQueues,
  buildAssessmentQueues,
  buildReadyForMeetingQueues,
  buildReviewQueues,
  buildReviewerScheduledQueues,
  createAssessmentWorkflowSnapshot,
  type AssessmentQueueItem,
  type AssessmentSetQueueAction,
  type AssessmentSetQueueItem,
  type ReviewQueueItem,
} from './assessmentReview';

export type DashboardQueueItem = AssessmentQueueItem;

export type DashboardActionItem = {
  id: string;
  kind: 'authored-assessment' | 'review-assessment' | 'assessment-set';
  assessmentId: string | null;
  reviewPeriodId: string | null;
  employeeId: string | null;
  title: string;
  detail: string;
  subjectName: string;
  workLabel: string;
  responsibilityLabel: string;
  dueDate: string;
  statusLabel: string;
  actionLabel: string;
  actionKind: AssessmentSetQueueAction | 'open-assessment' | 'open-review';
  reviewerRole: AssessmentSetQueueItem['reviewerRole'];
};

export type DashboardQueue = {
  id: string;
  title: string;
  emptyMessage: string;
  items: DashboardActionItem[];
};

export type DashboardSection = {
  id: 'manager-workflow' | 'reviewer-workflow' | 'admin-oversight';
  title: string;
  description: string;
  queues: DashboardQueue[];
};

export type DashboardSnapshot = {
  dueLabel: string;
  queues: DashboardQueue[];
  sections: DashboardSection[];
  reviewSummary: string;
  adminSummary: string | null;
};

function formatDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function toAuthoredDashboardItem(item: AssessmentQueueItem): DashboardActionItem {
  return {
    id: item.assessmentId,
    kind: 'authored-assessment',
    assessmentId: item.assessmentId,
    reviewPeriodId: null,
    employeeId: null,
    title: item.title,
    detail: item.detail,
    subjectName: item.subjectName,
    workLabel: item.targetLabel,
    responsibilityLabel: item.assessorLabel,
    dueDate: item.dueDate,
    statusLabel: item.statusLabel,
    actionLabel: item.actionLabel,
    actionKind: 'open-assessment',
    reviewerRole: null,
  };
}

function toReviewDashboardItem(item: ReviewQueueItem): DashboardActionItem {
  return {
    id: item.assessmentId,
    kind: 'review-assessment',
    assessmentId: item.assessmentId,
    reviewPeriodId: null,
    employeeId: null,
    title: item.title,
    detail: item.detail,
    subjectName: item.subjectName,
    workLabel: item.targetLabel,
    responsibilityLabel: item.assessorLabel,
    dueDate: item.dueDate,
    statusLabel: item.statusLabel,
    actionLabel: item.actionLabel,
    actionKind: 'open-review',
    reviewerRole: null,
  };
}

function toAssessmentSetDashboardItem(item: AssessmentSetQueueItem): DashboardActionItem {
  return {
    id: item.id,
    kind: 'assessment-set',
    assessmentId: null,
    reviewPeriodId: item.reviewPeriodId,
    employeeId: item.employeeId,
    title: item.title,
    detail: item.detail,
    subjectName: item.subjectName,
    workLabel: 'Assessment set',
    responsibilityLabel: item.responsibilityLabel,
    dueDate: item.dueDate,
    statusLabel: item.statusLabel,
    actionLabel: item.actionLabel,
    actionKind: item.actionKind,
    reviewerRole: item.reviewerRole,
  };
}

export function buildDashboardSnapshot(user: Employee, foundation: FoundationSnapshot, employees: Employee[]): DashboardSnapshot {
  const activeReviewPeriod = foundation.reviewPeriods.find((period) => period.status === 'active');
  const inactiveEmployees = employees.filter((employee) => employee.status === 'inactive').length;
  const workflowSnapshot = createAssessmentWorkflowSnapshot(foundation);

  const queues = buildAssessmentQueues(user, workflowSnapshot, employees).map((queue) => ({
    id: queue.id,
    title: queue.title,
    emptyMessage: `No ${queue.title.toLowerCase()} assessments right now.`,
    items: queue.items.map(toAuthoredDashboardItem),
  }));

  const managerSubmittedItems = user.role === 'employee' ? [] : buildReviewQueues(user, workflowSnapshot, employees);
  const managerReadyItems = user.role === 'employee' ? [] : buildReadyForMeetingQueues(user, workflowSnapshot, employees);
  const reviewerItems = buildReviewerScheduledQueues(user, workflowSnapshot, employees);
  const reviewerAssignments = employees.some((employee) => employee.reviewer1Id === user.id || employee.reviewer2Id === user.id);
  const adminOversight = user.role === 'admin' ? buildAdminOversightQueues(workflowSnapshot, employees) : null;

  const sections: DashboardSection[] = [];

  if (user.role !== 'employee') {
    sections.push({
      id: 'manager-workflow',
      title: 'Manager workflow',
      description: 'Accept submitted assessments and schedule meetings for accepted assessment sets.',
      queues: [
        {
          id: 'submitted-assessments',
          title: 'Submitted assessments',
          emptyMessage: 'No submitted assessments need acceptance right now.',
          items: managerSubmittedItems.map(toReviewDashboardItem),
        },
        {
          id: 'accepted-assessment-sets',
          title: 'Ready to be Scheduled',
          emptyMessage: 'No accepted assessment sets are waiting to be scheduled.',
          items: managerReadyItems.map(toAssessmentSetDashboardItem),
        },
      ],
    });
  }

  if (reviewerAssignments || reviewerItems.length > 0) {
    sections.push({
      id: 'reviewer-workflow',
      title: 'Reviewer follow-up',
      description: 'Scheduled assessment sets assigned to you stay on the dashboard until your reviewer conclusion is recorded.',
      queues: [
        {
          id: 'scheduled-reviewer-work',
          title: 'Scheduled work assigned to you',
          emptyMessage: 'No scheduled reviewer work is assigned to you right now.',
          items: reviewerItems.map(toAssessmentSetDashboardItem),
        },
      ],
    });
  }

  if (adminOversight) {
    sections.push({
      id: 'admin-oversight',
      title: 'Admin oversight',
      description: 'Track sets that are ready for meeting, scheduled, or concluded without leaving the dashboard.',
      queues: [
        {
          id: 'admin-ready-for-meeting',
          title: 'Ready for meeting',
          emptyMessage: 'No assessment sets are waiting to be scheduled.',
          items: adminOversight.readyForMeeting.map(toAssessmentSetDashboardItem),
        },
        {
          id: 'admin-scheduled',
          title: 'Scheduled',
          emptyMessage: 'No scheduled assessment sets need oversight right now.',
          items: adminOversight.scheduled.map(toAssessmentSetDashboardItem),
        },
        {
          id: 'admin-concluded',
          title: 'Concluded',
          emptyMessage: 'No active assessment sets are concluded yet.',
          items: adminOversight.concluded.map(toAssessmentSetDashboardItem),
        },
      ],
    });
  }

  const reviewSummary =
    reviewerItems.length > 0
      ? `${pluralize(reviewerItems.length, 'scheduled assessment set')} need your reviewer follow-up.`
      : user.role === 'employee'
        ? 'No workflow follow-up is assigned right now. Dashboard stays centered on authored assessments.'
        : `${pluralize(managerSubmittedItems.length, 'submitted assessment')} and ${pluralize(
            managerReadyItems.length,
            'set ready to be scheduled',
          )} need workflow follow-up.`;

  return {
    dueLabel: activeReviewPeriod ? `Complete by ${formatDate(activeReviewPeriod.assessmentDueDate)}` : 'No active review period',
    queues,
    sections,
    reviewSummary,
    adminSummary:
      user.role === 'admin'
        ? inactiveEmployees > 0
          ? `${inactiveEmployees} inactive employee records remain visible for directory history.`
          : 'No inactive employee records need directory follow-up right now.'
        : null,
  };
}
