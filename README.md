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

To create labeled test records and mark them reviewed:

```bash
npm run smoke:prod -- --submit --patch-status
```

## Endpoints

- `GET /health`
- `POST /contact`
- `POST /wallet-beta-request`
- `GET /admin/contact-requests`
- `GET /admin/wallet-beta-requests`
- `PATCH /admin/contact-requests/:id/status`
- `PATCH /admin/wallet-beta-requests/:id/status`
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
