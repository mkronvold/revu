import type { Employee, FoundationSnapshot } from '@revu/contracts';

import { buildAssessmentQueues, createAssessmentWorkflowSnapshot, type AssessmentQueueItem } from './assessmentReview';

export type DashboardQueueItem = AssessmentQueueItem;

export type DashboardQueue = {
  title: string;
  items: DashboardQueueItem[];
};

export type DashboardSnapshot = {
  dueLabel: string;
  queues: DashboardQueue[];
  reviewSummary: string;
  adminSummary: string | null;
};

function formatDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function buildDashboardSnapshot(user: Employee, foundation: FoundationSnapshot, employees: Employee[]): DashboardSnapshot {
  const activeReviewPeriod = foundation.reviewPeriods.find((period) => period.status === 'active');
  const directReportIds = new Set(
    employees.filter((employee) => employee.managerId === user.id).map((employee) => employee.id),
  );
  const reviewWorkCount =
    user.role === 'admin'
      ? foundation.assessments.filter(
          (assessment) =>
            assessment.archiveState === 'active' &&
            (assessment.reviewState === 'submitted' || assessment.reviewState === 'accepted'),
        ).length
      : foundation.assessments.filter(
          (assessment) =>
            assessment.archiveState === 'active' &&
            directReportIds.has(assessment.employeeId) &&
            (assessment.reviewState === 'submitted' || assessment.reviewState === 'accepted'),
        ).length;
  const inactiveEmployees = employees.filter((employee) => employee.status === 'inactive').length;
  const workflowSnapshot = createAssessmentWorkflowSnapshot(foundation);
  const queues = buildAssessmentQueues(user, workflowSnapshot, employees).map((queue) => ({
    title: queue.title,
    items: queue.items,
  }));

  return {
    dueLabel: activeReviewPeriod ? `Complete by ${formatDate(activeReviewPeriod.dueDate)}` : 'No active review period',
    queues,
    reviewSummary:
      user.role === 'employee'
        ? 'No review work assigned. Employee dashboard stays centered on assessments.'
        : `${reviewWorkCount} submitted or accepted assessments need ${user.role === 'admin' ? 'admin' : 'manager'} attention.`,
    adminSummary:
      user.role === 'admin'
        ? inactiveEmployees > 0
          ? `${inactiveEmployees} inactive employee records remain visible for directory history.`
          : 'No inactive employee records need directory follow-up right now.'
        : null,
  };
}
