# AUREVIX — Next build steps

## Phase 1: Local pilot (this starter)
- Test owner setup, login/register, role permissions, job post/assignment/submission/approval.
- Use only dummy/manual payment records; do not collect real money through this code.
- Recruit 3–5 real clients and a small worker group.

## Phase 2: Harden before public launch
- Move from SQLite to managed PostgreSQL and add migrations.
- Add email verification, password reset, CSRF protection strategy, session-store hardening, audit events, backup/restore tests, logging and monitoring.
- Add file upload with MIME/size limits, malware scanning, private object storage and signed download URLs.
- Add client terms, worker agreement, privacy notice, refund/dispute policy and data retention schedule.
- Add operational tools for dispute queues, worker assignment, revisions, and immutable payment ledger.

## Phase 3: Payment integration (after provider approval)
- Select provider after written confirmation that Bangladesh business, marketplace model, and cross-border customer payments are supported.
- Verify server-side webhooks/signatures, idempotency, payment status polling, refunds, chargebacks, daily settlement reconciliation.
- Use provider-supported marketplace/connected-account payout or legally approved settlement structure. Do not label a home-grown wallet as escrow.
- Keep client funds, platform fees and worker payable balances as separate ledger entries.
- Require dual approval for payout and refunds; log all admin actions.

## Phase 4: Scale
- Add international localization/currency display, analytics, client repeat orders, verified portfolios, ratings, and support ticketing.
- Add external client acquisition pipeline and CRM tracking.
