import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'));
    }
  })
);

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(4000)
});

const walletBetaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  walletAddress: z.string().trim().max(160).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal(''))
});

function validate(schema, payload) {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return { data: parsed.data };
  }

  return {
    error: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message
    }))
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'obsidianabyss-api',
    timestamp: new Date().toISOString()
  });
});

app.post('/contact', (req, res) => {
  const result = validate(contactSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  // TODO: Wire this to email or a database once the provider is selected.
  res.status(202).json({
    ok: true,
    message: 'Contact request accepted.',
    request: {
      name: result.data.name,
      email: result.data.email
    }
  });
});

app.post('/wallet-beta-request', (req, res) => {
  const result = validate(walletBetaSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  // This endpoint does not request signatures, custody assets, or execute trades.
  res.status(202).json({
    ok: true,
    message: 'Wallet beta request accepted.',
    request: {
      name: result.data.name,
      email: result.data.email
    }
  });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  if (err.message === 'Origin is not allowed by CORS') {
    res.status(403).json({ ok: false, error: err.message });
    return;
  }

  res.status(500).json({ ok: false, error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`obsidianabyss-api listening on ${port}`);
});
