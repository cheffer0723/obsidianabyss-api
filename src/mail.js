import nodemailer from 'nodemailer';
import { env } from './env.js';

const smtpHost = env.smtp.host;
const smtpPort = env.smtp.port;
const smtpSecure = env.smtp.secure;
const smtpUser = env.smtp.user;
const smtpPass = env.smtp.pass;
const mailFrom = env.smtp.from;
const mailTo = env.smtp.to;

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
      `Experience level: ${submission.experienceLevel || ''}`,
      `Access mode: ${submission.accessMode || ''}`,
      `Preferred assets: ${submission.preferredAssets || ''}`,
      `Preferred exchange/wallet: ${submission.preferredExchange || ''}`,
      `Automation comfort: ${submission.automationComfort || ''}`,
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
      `Experience level: ${submission.experienceLevel || ''}`,
      `Access mode: ${submission.accessMode || ''}`,
      `Preferred assets: ${submission.preferredAssets || ''}`,
      `Preferred exchange/wallet: ${submission.preferredExchange || ''}`,
      `Automation comfort: ${submission.automationComfort || ''}`,
      '',
      'Notes:',
      submission.notes || ''
    ].join('\n')
  });

  return { sent: true };
}

export async function sendBetaInviteEmail({ email, name, inviteUrl, expiresAt }) {
  if (!transporter) {
    return { sent: false, reason: 'mail_not_configured' };
  }

  await transporter.sendMail({
    from: mailFrom,
    to: email,
    replyTo: mailFrom,
    subject: 'Your Obsidian Abyss closed beta access link',
    text: [
      `Hello ${name || 'there'},`,
      '',
      'Your Obsidian Abyss closed beta access is ready.',
      'This link opens the gated beta area and redeems your invite:',
      inviteUrl,
      '',
      `This invite expires: ${expiresAt}`,
      '',
      'Access starts in paper mode and remains research-only.',
      'No wallet keys, custody, or autonomous live trading are enabled through this invite.',
      '',
      'If the link expires, reply to this email and we can issue a fresh one.',
      '',
      'Obsidian Abyss'
    ].join('\n')
  });

  return { sent: true };
}
