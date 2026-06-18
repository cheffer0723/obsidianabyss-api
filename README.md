# Obsidian Abyss API

Backend API for Obsidian Abyss.

## Local Development

```bash
npm install
npm run dev
```

## Production Smoke Test

```bash
npm run smoke:prod
```

The smoke test checks the public site, admin page, API health, CORS, and protected admin list endpoints. It reads `ADMIN_TOKEN` from the environment or `.env.local`.

To create labeled test records, mark them reviewed, and verify admin notes:

```bash
npm run smoke:prod -- --submit --patch-status --patch-admin-notes
```

To run a live Abyss Guide advisor call:

```bash
npm run smoke:prod -- --check-advisor
```

## Endpoints

- `GET /health`
- `POST /contact`
- `POST /wallet-beta-request`
- `POST /advisor/message`
- `POST /beta/invites/redeem`
- `GET /beta/session`
- `POST /beta/logout`
- `GET /beta/catalog`
- `GET /beta/dashboard`
- `GET /beta/backtesting`
- `POST /beta/advisor/message`
- `GET /admin/contact-requests`
- `GET /admin/wallet-beta-requests`
- `POST /admin/contact-requests/:id/invite`
- `POST /admin/wallet-beta-requests/:id/invite`
- `GET /admin/beta-members`
- `PATCH /admin/contact-requests/:id/status`
- `PATCH /admin/wallet-beta-requests/:id/status`
- `PATCH /admin/contact-requests/:id/notes`
- `PATCH /admin/wallet-beta-requests/:id/notes`
- `GET /admin/strategies`
- `GET /admin/execution-intents`
- `GET /admin/risk-checks`
- `GET /admin/agent-runs`
- `GET /admin/testnet/connectors`
- `GET /admin/testnet/balance-checks`
- `POST /admin/testnet/balance-checks/run`
- `GET /admin/testnet/transactions`

Admin endpoints require:

```http
Authorization: Bearer <ADMIN_TOKEN>
```

Request statuses:

- `new`
- `reviewed`
- `approved`
- `beta-ready`
- `accepted`
- `rejected`
- `not-fit-yet`

Contact and wallet beta submissions accept these optional lead-qualification fields:

- `experienceLevel`
- `accessMode`
- `preferredAssets`
- `preferredExchange`
- `automationComfort`

## Database

Set `DATABASE_URL` to a Postgres connection string. The API creates these tables automatically on startup:

- `contact_requests`
- `wallet_beta_requests`
- `strategies`
- `execution_intents`
- `risk_checks`
- `agent_runs`
- `testnet_connectors`
- `testnet_balance_checks`
- `testnet_transactions`

The strategy, intent, risk, and run tables are read-only admin scaffolding for simulation-mode pipeline review. Seeded records are placeholders only:

- no wallet signatures
- no exchange keys
- no live order placement
- no autonomous execution

## Email Notifications

Set Microsoft 365 SMTP variables to email new submissions after they are saved:

- `SMTP_HOST=smtp.office365.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=contact@obsidianabyss.com`
- `SMTP_PASS=<mailbox password or app password>`
- `MAIL_FROM=contact@obsidianabyss.com`
- `MAIL_TO=contact@obsidianabyss.com`

Email failures do not block database saves.

This first backend stores no wallet secrets, performs no wallet signatures, and has no trading permissions.

## Abyss Guide Advisor

The advisor endpoint powers the public Abyss Guide chat. It is a preview-only sales/advisory layer: it can explain the catalog and recommend a likely setup fit, but it must not expose real signals, thresholds, alert history, strategy internals, wallet actions, or trading instructions.

There is no free product tier. Public visitors can try the teaser guide, then request closed beta access. Paid access starts at `$9.99/month` once users are approved and billing is enabled.

Set these variables to enable it:

- `ANTHROPIC_API_KEY=<api key>`
- `ADVISOR_MODEL=claude-haiku-4-5` optional; defaults to `claude-haiku-4-5`

Request:

```http
POST /advisor/message
Content-Type: application/json
```

```json
{
  "mode": "preview",
  "messages": [
    {
      "role": "user",
      "content": "I am new and interested in BTC. I want to be cautious."
    }
  ]
}
```

The endpoint does not accept wallet keys, execute trades, or manage funds.

## Closed Beta Access

The closed beta flow is invite-only:

1. A lead is submitted through `/contact` or `/wallet-beta-request`
2. Admin marks the request `approved`, `beta-ready`, or `accepted`
3. Admin issues an invite
4. The invite email points to `beta.html?invite=<token>`
5. Redeeming the invite creates a beta session

Environment variables used by this flow:

- `BETA_APP_URL=https://www.obsidianabyss.com/beta.html`
- `BETA_SESSION_COOKIE_NAME=obsidian_beta_session` optional
- `BETA_INVITE_HOURS=168` optional; default 7 days
- `BETA_SESSION_HOURS=336` optional; default 14 days

The beta session is API-backed and intended for the static site at `obsidianabyss.com` calling the Railway API with credentials.
`GET /beta/dashboard` is the member-safe aggregation endpoint for the closed-beta surface. It returns the v1 setup catalog, paper-mode scaffolds, recent risk and run state, testnet readiness, and explicit guardrails without exposing admin-only internals.
`GET /beta/backtesting` is the member-safe backtesting lab payload. It currently exposes synthetic scenario decks, readiness checkpoints, and research queue status. It does not expose audited historical performance or live trading capability.

## Base Sepolia Testnet

The testnet connector is read-only by default. It stores a public wallet address, checks Base Sepolia balance through JSON-RPC, and records the result for admin review.

Defaults:

- `BASE_SEPOLIA_RPC_URL=https://sepolia.base.org`
- `BASE_SEPOLIA_CHAIN_ID=84532`
- `BASE_SEPOLIA_WALLET_ADDRESS=0xD0c7ac431D98e47230EF86E3391128D3aD0C6b13`
- `BASE_SEPOLIA_EXPLORER_URL=https://sepolia-explorer.base.org`

Run a live read-only testnet balance check:

```bash
npm run smoke:prod -- --check-testnet-balance
```

This does not submit transactions, request signatures, or use private keys.
