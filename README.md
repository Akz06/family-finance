# Family Finance

This repository contains the Family Finance transaction-ingestion API.

## Backend
Private Node.js + Express API for receiving transaction-alert messages from iPhone Shortcuts and storing parsed transactions in Railway PostgreSQL.

### Features
- Bearer-token protected API
- SMS ingestion with SHA-256 duplicate fingerprint
- Conservative transaction classification
- OTP/promotional message exclusion
- Review queue for uncertain messages
- PostgreSQL persistence
- Health, transaction-list and monthly-summary endpoints

### Deploy on Railway
1. Add a PostgreSQL service to the Railway project.
2. Add this repository as a Node.js service.
3. Add `DATABASE_URL` as a Railway reference to the PostgreSQL service's `DATABASE_URL`.
4. Set `FAMILY_FINANCE_API_TOKEN` to a random secret of at least 32 characters.
5. Set `NODE_ENV=production`.
6. Deploy and generate a public domain for the API service only. Keep PostgreSQL private.
7. Run `migrations/001_initial.sql` once against the database using Railway's query tool or CLI.
8. Verify `GET /api/v1/health`.

### API endpoints
- `GET /api/v1/health` (public health check)
- `POST /api/v1/messages` (Bearer token required)
- `GET /api/v1/transactions?limit=50` (Bearer token required)
- `GET /api/v1/summary/monthly?month=YYYY-MM` (Bearer token required)

See [iPhone Shortcut setup](docs/SHORTCUT-SETUP.md).

### Important limitations
- SMS formats differ by bank and can change. The included parser is a starter parser, not a complete bank-specific parser.
- iOS Shortcuts message automations have trigger/filter constraints. Test your iOS version and configure sender/content filters as needed.
- The starter stores raw message text for audit. Review privacy and retention before enabling broad capture.
- Credit-card outstanding balances are not yet updated from SMS; statement/bill reconciliation is required.
