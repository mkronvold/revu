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
