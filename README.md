# Obsidian Abyss API

Backend API for Obsidian Abyss.

## Local Development

```bash
npm install
npm run dev
```

## Endpoints

- `GET /health`
- `POST /contact`
- `POST /wallet-beta-request`
- `GET /admin/contact-requests`
- `GET /admin/wallet-beta-requests`

Admin endpoints require:

```http
Authorization: Bearer <ADMIN_TOKEN>
```

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
