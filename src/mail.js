import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFrom = process.env.MAIL_FROM || smtpUser;
const mailTo = process.env.MAIL_TO || mailFrom;

const transporter =
  smtpHost && smtpUser && smtpPass && mailFrom && mailTo
    ? nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      })
    : null;

export function isMailConfigured() {
  return Boolean(transporter);
}

export async function sendContactNotification({ request, submission }) {
  if (!transporter) {
    return { sent: false, reason: 'mail_not_configured' };
  }

  await transporter.sendMail({
    from: mailFrom,
    to: mailTo,
    replyTo: submission.email,
    subject: `Obsidian Abyss contact request #${request.id}`,
    text: [
      'New Obsidian Abyss contact request',
      '',
      `Request ID: ${request.id}`,
      `Created: ${request.created_at}`,
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      '',
      'Message:',
      submission.message
    ].join('\n')
  });

  return { sent: true };
}

export async function sendWalletBetaNotification({ request, submission }) {
  if (!transporter) {
    return { sent: false, reason: 'mail_not_configured' };
  }

  await transporter.sendMail({
    from: mailFrom,
    to: mailTo,
    replyTo: submission.email,
    subject: `Obsidian Abyss wallet beta request #${request.id}`,
    text: [
      'New Obsidian Abyss wallet beta request',
      '',
      `Request ID: ${request.id}`,
      `Created: ${request.created_at}`,
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      `Wallet address: ${submission.walletAddress || ''}`,
      '',
      'Notes:',
      submission.notes || ''
    ].join('\n')
  });

  return { sent: true };
}
