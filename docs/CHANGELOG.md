# Changelog

## 50413aa - 2026-06-04
- Made the sidebar Build id link to `docs/CHANGELOG.md` on GitHub so deployed revisions jump directly to release notes

## 5e8e2b1 - 2026-06-04
- Changed assessment print output to use black text throughout the printed document instead of muted gray metadata and empty-state copy

## 3f77838 - 2026-06-04
- Tightened assessment print spacing so the metadata box prints with lighter styling and better padding, while the multiple-choice table and narrative responses paginate without overlapping near page breaks

## 526af9f - 2026-06-02
- Refined assessment printing so multiple-choice questions now print as a compact borderless `Question | Response` table with only the selected response, while the print stylesheet avoids blank leading pages and no longer forces category-by-category page breaks

## a021630 - 2026-06-02
- Added `backuptool.sh` for Docker-backed backup administration from the deployment checkout, including listing, deleting, preserving, showing backup config, and updating automatic-backup schedule and retention settings through the shared backup sidecar

## caa8796 - 2026-06-02
- Added a Print action to self and peer assessment dialogs, included assessment status in the dialog metadata, and introduced a print-only layout that removes UI chrome, tightens spacing, and renders multiple-choice responses in a cleaner document-style format

## 21205a5 - 2026-05-10
- Made the admin Assessments page open the assessment form from any row click, added an admin-only delete action, and introduced full admin override editing so admins can update responses/notes and move assessments directly between draft, submitted, accepted, ready-for-meeting, scheduled, and concluded states

## bea9637 - 2026-05-10
- Fixed inactive-to-active question-set copying so questions with blank categories are normalized to uncategorized instead of failing API validation

## ecc654e - 2026-05-10
- Updated workflow docs and default workflow content so README, navigation copy, and seeded markdown now describe the dashboard-led `new` → `draft` → `submitted` → `accepted` → `ready_for_meeting` → `scheduled` → `concluded` lifecycle without the old review-queue wording
- Refreshed the admin-only Assessments page around the new workflow lifecycle so summaries, filters, row details, and override actions now track not started / incomplete, submitted, accepted, ready for meeting, scheduled, and concluded work without the old reviewed terminology
- Reworked dashboard workflow dialogs so accepted sets open a Ready for meeting summary, ready sets open a status-only Schedule review meeting dialog, reviewer/admin follow-up uses role-aware conclusion and reopen dialogs, and submitted assessments now confirm Return to incomplete before sending work back
- Removed the dedicated Reviews route, redirected legacy `/reviews` links back to Dashboard, and folded manager/reviewer/admin workflow actions into new dashboard sections that reflect submitted, accepted, ready-for-meeting, scheduled, and concluded lifecycle work
- Added the next workflow schema migration for employee reviewer assignments, meeting-phase assessment states, reviewer-specific conclusion columns, and stricter archived/read-only assessment guards
- Extended the shared workflow contracts and examples for reviewer1/reviewer2 assignments, meeting-driven assessment statuses, and reviewer-specific conclusion metadata so downstream overhaul work can build on the new model
- Wired the API store and routes into the workflow-overhaul lifecycle so employee reviewer assignments persist, review subjects/reviewers gain the right visibility, assessment sets move together through ready/scheduled/concluded, and reviewer 1 / reviewer 2 can conclude independently
- Fixed set conclusion gating so employees with only one assigned reviewer can still advance to `Concluded` once that reviewer completes every active assessment
- Added reviewer 1 / reviewer 2 to the employee directory, detail dialog, edit validation, dashboard assignment summary, and employee import/export transfer payloads so reviewer assignments are managed alongside managers and assessors
- Added self and peer assessment summary totals above the admin Assessment List so admins can see not started, incomplete, submitted, accepted, ready-for-meeting, scheduled, and concluded counts at a glance
- Added end, assessment due, and review due dates to review periods, updated the Questions admin editor labels, and surfaced the new due dates in the dashboard workflow sections

## 00308f9 - 2026-05-10
- Stacked the workflow editor textarea above its preview and synced preview scrolling to the editor scroll position

## 83319b5 - 2026-05-10
- Renamed the subjective response option from “Don’t know” to “Neutral” in the workflow/question editor and subjective assessment displays

## 4007944 - 2026-05-10
- Simplified workflow page and editor copy, hid sidebar-visibility details from non-editors, and tuned the workflow editor textarea to use more of the dialog height with vertical-only resizing

## cba02df - 2026-05-10
- Enabled GFM table rendering in shared markdown content so workflow pages and previews render markdown tables correctly

## d8014be - 2026-05-10
- Refreshed the workflow page from the latest foundation snapshot whenever it is reopened so browser-to-browser workflow edits show up without a full page reload
- Fixed the workflow editor dialog sizing so its footer stays scrollable and the Cancel action remains reachable on shorter screens

## eabaca4 - 2026-05-10
- Fixed question-set saves so removing or reordering peer questions no longer trips the unique display-order constraint during updates

## 3ea276d - 2026-05-10
- Fixed the web workspace scripts to rebuild `@revu/contracts` before running so the UI no longer keeps stale transfer schemas after pulling export/import changes

## 89161d0 - 2026-05-10
- Finished the remaining File Management transfer flows so question sets and assignments now export/import real JSON/CSV files, including username-based assignment mapping and review-period upserts

## 7914873 - 2026-05-10
- Fixed question-set CSV/JSON export so the File Management UI now downloads real files instead of only showing a stub notice

## b78ed4f - 2026-05-10
- Added `LCM.md`, a weekly image-refresh workflow, Dependabot-based dependency automation with safe automerge, and a cron-friendly `autoupdate.sh --once` mode so Revu can refresh CVE fixes in base images and pinned dependencies with minimal manual intervention

## c9752b9 - 2026-05-10
- Removed the deployment web port from `docker-compose.yml` and documented that direct host bindings should only come from a separate override when the stack is not staying behind the reverse proxy

## dc671f7 - 2026-05-10
- Updated `autoupdate.sh` to verify the full Compose stack is already running on launch and start it through `up.sh` before entering the update loop when needed

## 52b71bb - 2026-05-10
- Renamed the admin Assessments page from **Assessment Queue** to **Assessment List** and added a live search box to filter the list

## 2bf40c6 - 2026-05-10
- Added a live employee-directory search box and renamed the employee detail action to **Make Inactive** so it matches the existing inactive-status behavior

## bca7e00 - 2026-05-10
- Added Review Period page removal controls so admins can delete a period after a confirmation summary that spells out how many question sets, assessments, and assignments will be removed with it

## f13c222 - 2026-05-10
- Replaced File Management's direct backup-now and restore cards with a Show backups dialog that lists stored backup files and supports immediate snapshot creation, upload, download, restore, and delete actions from one place

## 47263e6 - 2026-05-10
- Added a new admin-only `Review Period` page above File Management, moved review-period lifecycle controls there, and removed add/edit period actions from Questions so that page keeps question-category work separate from review-period management

## 2b5f898 - 2026-05-10
- Combined File Management review-period lifecycle actions into one always-open card that includes archive, inactive-period management, and archived-period restore controls

## a39695e - 2026-05-10
- Swapped the nested question editor footer actions so `Save question` now sits before `Cancel`

## f2636df - 2026-05-10
- Expanded the Questions review-period header control so the status button gets a wider frame and stays to the left of the pulldown until narrower layouts force wrapping

## a1867eb - 2026-05-10
- Fixed Winter Nights contrast on the Assessment Queue so assessment type, assessor, and review status render with themed text again

## 3b8cd06 - 2026-05-10
- Added explicit `Cancel` and `Save question` actions to the nested question editor dialog, and moved the question preview into the response-type section so the prompt and control preview stay together

## 83b9dc8 - 2026-05-10
- Updated the Questions review-period picker control so the status button stays to the left of the pulldown when space allows, shows live `Make active` for inactive periods, shows disabled `Archived` for archived periods, and shows a disabled highlighted `Active` state for the active period

## 70e2021 - 2026-05-10
- Removed question-set titles from the dashboard assessment forms, kept uncategorized questions headerless there, and moved the assessment editor surfaces back onto the shared theme palette instead of hard-coded light backgrounds

## b08a3ff - 2026-05-10
- Updated `autoupdate.sh` so its wait loop polls for keyboard input and pressing `r` triggers an immediate update check instead of waiting for the full interval

## 7f0a684 - 2026-05-10
- Added `VITE_ENABLE_QUESTION_SET_STATUS` to hide question-set status by default, remove that status from the Questions UI when disabled, and auto-treat saved/copied question sets as active without deleting the underlying status code path
- Added a `Make active` action for inactive review periods on Questions, and added a confirmed `Delete set` reset inside the question-set editor that clears a set back to a blank question set with no questions

## 613c295 - 2026-05-10
- Moved question-set copying into the edit dialog, now show it for archived periods too, rename the action to the active review period label, standardize modal action placement around a universal upper-right Close button, let assessment Submit save partial draft changes when needed, and relax review-period deadline validation so assessment/review due dates can fall outside the review window
- Removed the bottom dismiss button from the Questions question-set editor so the dialog closes only from the header control or backdrop

## 0399907 - 2026-05-09
- Tightened assessment syncing so inactive employees and inactive assessors no longer get new assessments, stale not-started pairings are removed during sync, employee deactivation clears active not-started assessments immediately, and the Assessments action now says `Clear not started assessments`

## 0f1ec2a - 2026-05-09
- Deleting an employee now removes assessments where they were the review subject while preserving completed peer feedback they authored for other employees, which remains linked to the tombstone and renders as `deleted user`

## 3b45833 - 2026-05-09
- Removed the `Assessor 1:` and `Assessor 2:` prefixes from the dashboard hero assessor summary

## 2c9dafa - 2026-05-09
- Moved assessment-sync controls onto the Assessments page, renamed that view to `Assessment Queue`, and added a confirmed clear action that removes ready-to-start assessments from the active review period

## 28f33c1 - 2026-05-09
- Updated `autoupdate.sh` to restart through `up.sh`, so automatic refreshes apply the same migration and bootstrap path as manual startups

## 4da9323 - 2026-05-09
- Removed the `Assessor 1:` and `Assessor 2:` prefixes from the stacked assessor values in the employee directory column
- Fixed inactive employee tombstone deletes so review-period assignment and assessment references no longer block deletion; those historical links now stay attached to the hidden tombstone row

## 172570e - 2026-05-09
- Added inactive-period question-set copying into the current active review cycle, reshaped the dashboard into an active-period action queue that matches the Reviews table layout, and rebuilt assessment authoring dialogs with grouped category sections plus document-style scale responses

## 63ad7f2 - 2026-05-09
- Allowed deleting inactive employees even when active employee relationships still point at them, kept those manager/assessor references attached to the hidden tombstone row, and now render missing tombstone-backed names as `deleted user`

## 05f2e0b - 2026-05-09
- Stopped the sign-in screen from defaulting to the old seeded `ada.admin` username after seeded accounts are hidden, and now remember the last successfully used username in browser local storage
- Moved workflow markdown and visibility into shared API-backed persistence so updates now survive refreshes and appear in other browsers, and included workflow settings in backup restore scopes that already replace review configuration

## 3a55db7 - 2026-05-09
- Split employee reviewer assignments into manager plus assessor 1/assessor 2 across the API, UI, import/export flows, and migration backfill, added active/inactive review periods with a sync-assessments action that creates any missing self and peer assessments for the active cycle, removed the Reviews queue review-period column now that only one period can be active, and added an admin-only Assessments page that shows every assessment in the active review period

## d842fd6 - 2026-05-09
- Added a self-service sidebar profile editor so clicking your username opens a dialog for updating your own full name, email, and password

## a8e7ad1 - 2026-05-09
- Linked the sign-in `Revu` title to the GitHub repository, updated the heading to use the company name, removed the old explanatory copy, and now hide seeded API accounts once those built-in users are no longer active

## 477675d - 2026-05-09
- Added admin delete-from-edit support for employees, backed by hidden database tombstones so deleted employees drop out of lists and dialogs without reusing hard deletes
- Updated the password-management dialog copy so the manual password action consistently says `Set password` and prompts for a new password

## bb2c64d - 2026-05-09
- Added spacing and wrapping inside detail-grid fields so long employee detail values like email addresses no longer collide with adjacent dialog fields

## c38aa5e - 2026-05-09
- Added API outage recovery detection that polls `/health` and shows a `New version. Refresh Now` button in the signed-in sidebar card after the API comes back

## e632106 - 2026-05-09
- Realigned the Reviews queue and Employee directory columns with shared grid tracks and moved the employee table header onto the same themed header surface as Reviews

## 70b1fd5 - 2026-05-09
- Allowed uppercase employee usernames while keeping login and username uniqueness checks case-insensitive, including upgrading older employee username constraints on first write

## 99752a9 - 2026-05-09
- Auto-create the persistent `question_categories` table on first use so category editing still works on older databases before the new migration has been applied

## e21dc12 - 2026-05-09
- Fixed the employee directory table so headers and row columns share the same grid alignment

## 1f40413 - 2026-05-09
- Persisted question categories independently of question rows, added an Edit question categories dialog on Questions, and included the saved category list in backup export/restore flows

## fa8ce98 - 2026-05-09
- Added editable automatic-backup settings for enable/disable, backup period, and retention count in File Management, and wired the backup sidecar plus Compose volumes to the shared scheduler config

## 6929720 - 2026-05-09
- Added unsaved-change confirmation when closing the workflow editor dialog after editing markdown or visibility

## 7d466bb - 2026-05-09
- Unified all modal windows to the same shared width as the Employee Detail popup

## dc45527 - 2026-05-09
- Moved the admin-only Edit workflow control onto the Workflow page and removed the old workflow card from File Management while keeping the shared markdown editor behavior intact

## 4d188bb - 2026-05-09
- Refined question-editor response-type helpers so subjective shows checkbox choices, ranking shows radio choices, and narrative uses the updated written self-rating guidance

## 32b2c76 - 2026-05-09
- Reworked the question editor to use category pulldowns with a nested new-category dialog, warn before closing unsaved question-set edits, expand the Question field, and align the question editor controls consistently

## c25564d - 2026-05-09
- Widened the question-set edit dialog to use the full shared modal width budget while leaving other modal sizing unchanged

## e2690d9 - 2026-05-09
- Added a sidebar collapse toggle that preserves navigation controls and shifted the main web dialogs to percentage-based widths that widen further when the sidebar is collapsed

## e9b0d9f - 2026-05-09
- Replaced the sidebar workflow markdown card with a main Workflow nav item, added persisted workflow visibility controls in File Management, and renamed the backup status section to Automatic backups

## 4838803 - 2026-05-09
- Polished Questions, Reviews, and Employees together by moving question-set editing into modal dialogs with nested question editing, tightening the review and employee directories into denser single-table layouts, and shifting review/password actions fully into the corresponding dialogs

## c5302a3 - 2026-05-09
- Made modal window surfaces fully opaque across every theme while leaving the shared modal backdrop behavior unchanged
- Moved more sidebar, workflow, review-response, question-set, and warning surfaces onto the shared theme palette so non-light themes no longer leak hardcoded light/slate colors

## 5234742 - 2026-05-09
- Added editable workflow markdown in File Management with a preview/edit modal, removed the old File Management scope card, and made the Workflow page plus sidebar card render from the shared saved content

## 7399802 - 2026-05-09
- Rebuilt Reviews into a single table-style queue sorted by next step, moved review actions into modal dialogs, and removed the old in-page review panel cards
- Rebuilt Employees into the same table/dialog interaction model, unified button colors across the app, and removed the dashboard assessment editor card in favor of queue-launched dialogs
- Merged Archive and Backups into a new File Management workspace, moved employee and question import/export controls there, and added a markdown-rendered Workflow card plus full Workflow page

## 4298ae1 - 2026-05-09
- Added an admin Backups page with live backup status, backup-now/download, upload, and replace-style restore actions for all data, users, questions, or reviews, backed by the new backup API/runtime helpers
- Added persisted question-category suggestions plus markdown rendering for question-set headers and prompts, and scrolled Edit set directly into the question editor
- Removed the Assignments navigation, added Backups to Administration, tightened Employees manager/assessor selection rules, and added explicit local-user export modes for rotating passcodes or preserving passwords and sessions

## 6e92269 - 2026-05-09
- Matched Summer Nights employee roster rows to the pulldown tone, removed the persistent selected-row highlight, auto-scrolled roster selections into the employee view, and moved Import/Export users below that detail panel
- Tinted the dashboard Assessment Queue category cards with the shared themed surface so Summer Nights uses the same sand-in-shadow tone there too

## 05edb7b - 2026-05-09
- Renamed the sidebar status area to Last Response, kept the latest workflow/admin response in one shared card, and let it clear automatically after 2 minutes
- Moved the remaining workflow result notices into the sidebar, made the full Theme card clickable, and shifted Summer Nights surfaces to a darker sand-in-shade tone

## 7389011 - 2026-05-09
- Fixed question-set updates to preserve referenced question ids and reject removing questions that already have recorded assessment responses
- Reworked the dashboard header and assessment queue into a denser combined layout, removed the Integrated API auth mode badge, and added a collapsible single-row queue list

## 92e1a7a - 2026-05-09
- Fixed `autoupdate.sh` so unattended restarts also apply Postgres migrations and seed the example dataset when the database is empty
- Fixed deployment bootstrap so `./up.sh` applies Postgres migrations before the API comes up and seeds the example dataset automatically on an empty database

## 1bdec75 - 2026-05-09
- Fixed the GitHub Actions validate job by starting Postgres in CI and applying SQL migrations before workspace validation

## 28043be - 2026-05-09
- Tightened the sidebar signed-in card again, moved Employees under Administration, added an inline Theme label, and relocated admin status/results notices into the sidebar

## af69686 - 2026-05-09
- Switched the API from in-memory fixtures to Postgres-backed persistence for employees, auth sessions, review periods, question sets, assignments, assessments, and responses
- Added `reset-to-example.sh` plus example-data seeding so persistent deployments, local development, and tests can return to the same known dataset
- Simplified Employees import/export into browser-upload import with JSON/CSV autodetection and direct `.json` / `.csv` downloads
- Added a sidebar Build revision card sourced from the published image revision/runtime config

## 41aba6c - 2026-05-09
- Polished the sidebar by shrinking the REVU wordmark, tightening the signed-in card, simplifying nav labels, adding space before Administration, and trimming the theme card copy

## 178be54 - 2026-05-09
- Reworked the Employees roster into a table-style layout with Name, Role, Email, Manager, Assessor, and retained Edit/Password actions

## 1bedfbf - 2026-05-09
- Darkened the Summer Nights theme overall to feel like dusk instead of bright late-evening, with deeper sand and rock tones while keeping the warm beach-at-sunset direction
- Updated `autoupdate.sh` to check GHCR manifest digests before pulling so Compose only downloads and restarts when `api` or `web` actually changed

## 6fba832 - 2026-05-09
- Warmed up the Summer Nights theme to feel like hot late-evening sun on the beach with mojito and mai tai card colors and sand/rock tones

## 327074e - 2026-05-09
- Added a Summer Nights theme and fixed Winter Nights dashboard overview contrast

## a166889 - 2026-05-09
- Simplified the Employees roster into single-line entries and localized password dialog/account timestamps

## ab9f06f - 2026-05-09
- Tightened the sidebar brand row, utility panel placement, signed-in card spacing, and global button height
- Replaced the sidebar light/dark toggle with a cycling multi-theme switcher and added Spring, Summer, Autumn, and Winter Nights palettes

## 5c8a4db - 2026-05-09
- Fixed deployed runtime company-name branding so the sidebar title reads the current `.env` value instead of a cached default

## ca017ba - 2026-05-09
- Refined the Reviews screen terminology, queue density, status display, and subjective response formatting
- Added a root `test.sh` helper to run the full workspace validation flow

## a6fb0da - 2026-05-09
- Reworked the dashboard, reviews, employees, questions, assignments, and archive admin screens into the new single-column, collapsible layouts
- Wired the web login flow into backend-enforced password reset and password change handling
- Added local user import/export UI for the new backend contracts, including export warnings and one-time passcode messaging
- Added a persisted dark mode toggle to the sidebar

## 8d2b055 - 2026-05-08
- Added multi-stage Docker images for the API and web app
- Added GitHub Actions image publishing to GHCR
- Split Docker Compose into deployment defaults plus a source-development override
- Ignored editor backup and Office document artifacts
- Removed tracked backup and Office source files from the repository

## badb015 - 2026-05-08
- Tightened Docker Compose port exposure and added service health checks
- Added `up.sh` and `down.sh` helpers for deployment compose lifecycle

## ccc99d6 - 2026-05-08
- Added Docker Compose service aliases and external proxy network wiring

## 47f826c - 2026-05-08
- Renamed Docker Compose containers to the `revu-*` convention

## ef6965c - 2026-05-08
- Moved the external proxy network attachment to `revu-web` and kept the API internal

## f485d01 - 2026-05-08
- Updated the web nginx proxy target to use the internal `revu-api` service alias

## aa44485 - 2026-05-08
- Made deployed web branding read `VITE_COMPANY_NAME` at container startup

## 128a043 - 2026-05-08
- Added company-name branding from `VITE_COMPANY_NAME` and made the workspace title link home

## 05c166b - 2026-05-08
- Updated `up.sh` to fast-forward from git and reconcile `.env` keys against `.env.example`

## 82b0b41 - 2026-05-08
- Initial Revu application baseline
- Added API-first TypeScript monorepo with Fastify API, React/Vite web app, and shared contracts
- Implemented auth, employee admin, review period/question/assignment admin, and assessment/review workflows
- Added root documentation, local workflow scripts, and validation commands
