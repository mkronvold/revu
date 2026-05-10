CREATE TABLE workflow_settings (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
  markdown text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('all', 'managers', 'admin only')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO workflow_settings (id, markdown, visibility)
VALUES (
  TRUE,
  '### New `Review Period` begins
- HR Admin generates a `Review Period` and `Question Sets` for Self-assessment and Peer-assessment
- Managers assign peers to assess employees
- All Employees complete and submit Self-Assessments and Peer-Assessments assigned to them
- Managers accept and review submitted Assessments and add their comments
- Completed Reviews are finalized by HR Admin
- When the `Review Period` is complete, HR Admin archives them.',
  'all'
)
ON CONFLICT (id) DO NOTHING;
