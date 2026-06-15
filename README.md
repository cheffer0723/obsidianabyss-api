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
