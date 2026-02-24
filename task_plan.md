# Task Plan

## Phase B — Blueprint
- Goal: capture discovery inputs, research reference implementations, and lock the canonical data schema before any tooling.
- Checklist:
  - [x] Capture initial discovery answers.
  - [x] Gather ING DiBa export sample metadata (column names, formats) for schema confirmation.
  - [ ] Document JSON schemas (input transactions, normalized transactions, dashboard payload) in gemini.md and get approval.
  - [ ] Research open-source household ledger dashboards for inspiration and note findings in findings.md.
  - [ ] Obtain user sign-off on Blueprint before moving to Link.

## Phase L — Link
- Goal: verify all integrations and credentials, especially ING export ingestion and any hosting targets.
- Checklist:
  - [ ] Confirm GitHub repo path and access pattern for uploaded ING exports (CSV sync + versioning semantics).
  - [ ] Validate Supabase database connection details once provisioned; store secrets in .env.
  - [ ] Build minimal handshake scripts in tools/ (no business logic) to ensure file ingestion + Supabase writes succeed, plus Vercel env variable propagation.

## Phase A — Architect
- Goal: codify SOPs inside architecture/ and map deterministic tool responsibilities.
- Checklist:
  - [ ] Draft ingestion + aggregation SOPs covering edge cases (duplicate uploads, category edits, idempotency).
  - [ ] Define Navigation-layer routing logic and state expectations.
  - [ ] Update gemini.md invariants whenever SOPs change.

## Phase S — Stylize
- Goal: deliver a modern household dashboard web UI with polished formatting and localization-ready copy.
- Checklist:
  - [ ] Specify layout + component library (or custom CSS) decisions.
  - [ ] Document payload formats for the dashboard (cards, charts, tables) and ensure alignment with schemas.
  - [ ] Gather user feedback on visual design before production deployment.
  - [ ] Implement site-wide login protection (User: Julian).

## Phase T — Trigger
- Goal: deploy the automation, wire up scheduled ingestion, and document maintenance procedures.
- Checklist:
  - [ ] Document the Vercel deployment workflow (preview vs production) and GitHub integration.
  - [ ] Configure cron/webhook triggers for new export ingestion.
  - [ ] Update gemini.md maintenance log with operational runbook.
