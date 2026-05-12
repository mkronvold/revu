# Revu admin guide

This guide describes what admins need to do during a review cycle and where each administrative function lives in the app.

See also:

- [`WORKFLOW.md`](./WORKFLOW.md) for the lifecycle and state flow
- [`FILEMANAGEMENT.md`](./FILEMANAGEMENT.md) for backups and import/export work

## Admin cycle checklist

### Before a cycle opens

1. Create or confirm the active review period.
2. Create or update the self and peer question sets for that period.
3. Review the employee directory for active users, reporting lines, and reviewer assignments.
4. Configure peer assignments and any reviewer 1 / reviewer 2 coverage.
5. Review the shared workflow markdown and visibility settings.
6. Take a backup before any large import or structural change.

### While the cycle is running

1. Monitor assessment progress from the shared workflow surfaces.
2. Accept submitted assessment sets when they are ready to move forward.
3. Move sets toward `ready_for_meeting` and `scheduled` as the review process advances.
4. Use admin overrides when a set needs correction, reassignment, or direct state adjustment.
5. Keep employees, reviewer coverage, and assignments aligned as staffing changes.
6. Use File Management for backup and transfer work instead of ad hoc database changes.

### After the cycle is complete

1. Confirm reviewer conclusions are complete and the assessment sets are truly concluded.
2. Export or snapshot the current data if you need a retained point-in-time copy.
3. Archive the review period so it becomes read-only history.
4. Prepare the next cycle by creating the next review period and copying forward what should persist.

## Administrative functions by area

## Review periods

Admins manage the cycle container itself:

- create, edit, activate, deactivate, archive, and unarchive review periods
- remove a review period when the data should be deleted rather than archived
- control the review-period lifecycle that determines what is editable versus read-only

## Questions

Admins maintain the question configuration for each cycle:

- create and edit self and peer question sets
- manage question order, prompts, headers, footers, and categories
- copy question sets forward into the active period when appropriate
- keep the live question-set configuration aligned with the current review period

## Employees

Admins manage the local user directory:

- add, edit, inactivate, and delete employees
- maintain manager, assessor, reviewer 1, and reviewer 2 relationships
- set or reset passwords
- keep local user state aligned with the actual organization

## Assessments

Admins use the Assessments area as the override and visibility surface for the active review period:

- search and inspect assessments across the active cycle
- edit responses and notes when an override is needed
- move assessments between valid workflow states when operational cleanup is required
- remove assessments when that is the correct administrative action

Dashboard remains the shared day-to-day workflow surface, while Assessments is the admin intervention surface.

## Workflow content

Admins maintain the shared workflow instructions shown in the app:

- update the workflow markdown content
- control who can see that guidance

## File Management

Admins use File Management for:

- backups and restores
- browsing the stored backup archive
- import and export flows for supported admin data

See [`FILEMANAGEMENT.md`](./FILEMANAGEMENT.md) for the detailed behavior and operational notes.
