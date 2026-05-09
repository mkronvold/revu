Revu:

A survey-like tool for personnel assessments and performance reviews

## Tech
web-based
api-first
valkey or postgres
typescript
docker-compose containers


## What someone sees when they log in

My profile                          [Edit]
------------------------------------------
Complete by 5/27/2026
  2025 Peer-Assessment for <name1>  [Edit]
------------------------------------------
Started but not completed           [Edit]
  none
------------------------------------------
Complete but not submitted yet
  2025 Self-Assessment              [Edit]
------------------------------------------
Complete but not accepted yet
  2025 Peer-Assessment for <name2>  [Edit]
------------------------------------------
Complete                             [+/-]
  none
------------------------------------------
[Reviews] [Employees] (shown to managers and admins)
------------------------------------------
[Questions] [Assignments] [Archive] (only shown to admins)
------------------------------------------

## Edit Assessment
web-based entry of review results, mutiple choice checkboxes and narrative entries
shows the correct questions set self or peer based on the type of assessment
users choice of display one at a time with next/prev buttons or all at once with scrolling
[Save for Later] [Save and Submit for Review] [Cancel] (don't save)


## Reviews (all managers and admins)

Submitted but not accepted
  <user1> -self                     [View] [Accept] [Reject]
------------------------------------------
Accepted but not reviewed
  <user1> by <user2>                [View] [Review] leads to Review panel
------------------------------------------
Reviewed
  <user2> by <user3>                [View] [View] [Archive] view shows finished review, archive marks review archived and removes from lists and can only be seen in [Archive]
------------------------------------------
[Import] [Export] (admin only - import-upload/export-download entire assessment data as csv or json)


### Review Panel
- Show assessment with a compact question and response with a resizable space to put comments/notes
[Save for later] [Save as Reviewed] [Reassign] (allow managers and admins a quick edit for an Employee's manager field and assessor field)


### Reassign
display a quick edit for the accepted assessment's Employee manager and assessor fields.


## Employees
Active Employees
  <Employee1>                       [View]
  <Employee2>                       [View]
  <Employee3>                       [View]
------------------------------------------
Inactive Employees
  <Employee99>                      [View]
------------------------------------------
[Add] [Remove] `Employees` (local users)
```
full name: text field
email: validated text field
manager: (pulldown of all managers)
assessor: (pulldown of all employees)
app role (pulldown admin|manager|employee) 
status: (toggle active|inactive) 
```
[Import] [Export] (admin only - import-upload/export-download entire local user dataset as csv or json)


### Employee-View
Name
Email
Manager
Assessor
Role
Status
[Edit] [Remove] [Set Password] [Reset Password] (admin only - resets to a set or random password)


### App Roles

#### Employee
- Employees can only complete self-assessments or peer-assessments, not reviews
- Employees can view their self-assessments
- Employees can view peer-assessments assigned to them that are not yet complete

#### Manager
- All managers can view all submitted or accepted `Assessments`
- All managers can accept submitted `Assessments` for Employees assigned to them
- All managers can review all accepted `Assessments` for Employees assigned to them
- All managers can edit Employee's data fields.

#### Admins
- Admins can create and edit question config
- Admins can create and edit Assessment Assignments
- Admins can [Accept] `Assessments`
- Admins can archive questions and assessments by archiving a `Review Period`


## Questions
questions are a set of questions, headers, footers and settings for a given `Review Period`
question sets can be either self or peer and are used in self assessments or peer assessments
questions can be modified by admins
questions are saved in valkey or postgres

### rough example
```jsonish
reviewPeriod: (something like 2025 or 2Q25)
header:       (customized intro text, instructions, support markdown)
target:       self|peer
status:       active|archived
questions: [
  {
    number:   (just an index)
    type:     subjective | ranking | narrative
    category: 
    question: (the actual question)
  } 
]
footer:      (followup steps, links, support markdown)
```

### multiple choice answers

subjective
- strongly agree|somewhat agree|somewhat disagree|strongly disagree|don't know
ranking
- 1|2|3|4|n/a
narrative 
- essay questions, markdown compatible text field

### import and export
[Import] [Export] (admin only)
- import-upload/export-download questions for a given `Review Period` as csv or json


## Assignments

purpose: to assign peer reviewers to reviewees
show 3 columns
Employee | Manager | Assigned peer reviewer
pulldowns for each assignment
[Import] [Export] (admin only - import-upload/export-download entire assessment data as csv or json)

### Assessments

assessments come in two types, self and peer that can be determined by comparing employee and assessor
  assessor = self
  assessor != peer
assessments are matched by the reviewPeriod and the employee being assessed and who did the assessment
```
reviewPeriod: 2025 or 25Q2 or similar
employee: (the name of the employee being assessed)
assessor: (the name of the self/manager/staff who did the assessment)
status:   new|draft|submitted|accepted|reviewed|archived
responses: [
  {
    number:    (index that matches the question)
    response:  (text version of the response, be it a rank/number, subjective or narrative)
  }
  ... repeat for each response
]
```

## Archive
purpose: allow admins to archive and unarchive entire `Review Periods`

list of `Review Periods`    [Archive|Unarchive]
