# Security exceptions registry

Accepted vulnerability or policy exceptions for Revu. Expired rows block release until renewed or remediated.

| ID  | Service / surface | Finding | Owner | Rationale            | Mitigation | Expiry (UTC) | Status |
| --- | ----------------- | ------- | ----- | -------------------- | ---------- | ------------ | ------ |
| —   | —                 | —       | —     | No active exceptions | —          | —            | —      |

## How to add an exception

1. Open or update a row before merging a change that would otherwise violate scan policy.
2. Fill every column. Use a real owner (person or team) and a dated expiry.
3. Link the finding ID from Trivy/GHSA/CVE when available.
4. Remove or mark `remediated` when the underlying image or dependency is fixed.

## Lane B bot churn

- The `base-image-cve-fix` workflow opens digest PRs when fixed findings exist and a newer same-tag digest is available.
- To accept residual risk without chasing a pin: add a row here and, if needed, close the bot PR with a comment linking the exception ID.
- Do not auto-merge medium/low digest PRs; leave them for human review or close with an exception.
- Crit/high with a known newer digest should not be exceptioned solely to wait for the weekly Dependabot batch.
