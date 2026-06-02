# Revu File Management

File Management is the admin workspace for backups and supported transfer flows.

## What lives here

- manual and automatic backups
- the stored backup archive
- backup download, upload, restore, and delete actions
- import and export flows for supported admin-managed data

## Backups

## Automatic backups

The deployment stack includes a backup sidecar that can take scheduled backups without a browser session.

The File Management UI controls:

- `enabled` or `disabled`
- schedule
- retention count

Supported schedule values are:

- `1hr`
- `3hr`
- `6hr`
- `12hr`
- `daily`
- `weekly`

Retention keeps only the newest retained archive files.

## Stored backup archive

The stored backup archive is the shared retained backup location used by both:

- scheduled automatic backups
- manual backup creation from the UI

From the UI, admins can:

- show stored backups
- create a new backup immediately
- download a stored backup
- upload a backup file for restore
- restore a stored or uploaded backup
- delete a stored backup

For non-browser admin work from the deployment checkout, use `./backuptool.sh`:

- `./backuptool.sh list`
- `./backuptool.sh delete <backup-file>`
- `./backuptool.sh preserve [backup-file|latest] [destination-dir]`
- `./backuptool.sh show-config`
- `./backuptool.sh set-config --autobackup on|off --schedule daily --keep 14`

That tool runs through the existing Docker backup sidecar and shared backup volumes instead of reaching into container internals manually.

## Restore scopes

Restore actions support replace-style restores for the supported slices of data:

- `all`
- `users`
- `questions`
- `reviews`

Operationally, the backup plumbing uses the internal sidecar endpoints by default:

- `/internal/backups/export`
- `/internal/backups/restore`

That internal path is intended for the Docker-only backup sidecar and avoids depending on an admin session token for scheduled backups.

## Archive and handoff storage

The deployment stack uses three named backup volumes:

- `backup-archive` for retained backup files
- `backup-handoff` for upload/download handoff files
- `backup-config` for scheduler config and last-run status

The API and backup sidecar both read the shared status file so the UI can reflect the latest backup and restore timestamps.

## Import and export functions

## Employees

File Management supports JSON and CSV transfer flows for local users.

Notes:

- exporting local users rotates each exported account to a generated one-time passcode
- those exported users are signed out immediately

Use this with care and treat it as an administrative credential event, not a passive reporting export.

## Question sets

File Management supports JSON and CSV export/import for question-set data so admins can:

- move question definitions between environments
- save an external copy before a large change
- load prepared question-set content back into the app

## Assignments

File Management supports JSON and CSV transfer for assignments so admins can:

- export the current assignment map
- bulk update assignments externally
- re-import the updated mapping

## Suggested admin practice

1. Take a backup before a bulk import or restore.
2. Use exports from the current app version as the preferred import template.
3. Treat restore operations as replacement actions, not partial merges.
4. Keep automatic backups enabled in deployed environments unless there is a clear reason not to.
