import Stripe from 'stripe';

// Stripe membership billing. Entirely inert until STRIPE_SECRET_KEY + STRIPE_PRICE_ID
// are set in the environment, so this can ship before billing is configured.

let stripeClient = null;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function isBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function isWebhookConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export async function createMembershipCheckout({ email }) {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    const error = new Error('Billing is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const successUrl =
    process.env.BILLING_SUCCESS_URL || 'https://www.obsidianabyss.com/access.html?checkout=success';
  const cancelUrl =
    process.env.BILLING_CANCEL_URL || 'https://www.obsidianabyss.com/access.html?checkout=cancelled';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    ...(email ? { customer_email: email } : {}),
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: { metadata: { product: 'obsidian-abyss-membership' } },
    metadata: { product: 'obsidian-abyss-membership' }
  });

  return { url: session.url, id: session.id };
}

export function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    const error = new Error('Billing webhook is not configured.');
    error.statusCode = 503;
    throw error;
  }

  // Throws on bad signature — caller returns 400.
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// Reduce a Stripe event to a simple action the API can act on.
// Returns one of:
//   { action: 'grant',  email, customerId, subscriptionId }
//   { action: 'revoke', customerId, subscriptionId }
//   { action: 'ignore' }
export function interpretWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object || {};
      if (s.mode && s.mode !== 'subscription') return { action: 'ignore' };
      const email = s.customer_details?.email || s.customer_email || null;
      const name = s.customer_details?.name || null;
      return {
        action: 'grant',
        email,
        name,
        customerId: typeof s.customer === 'string' ? s.customer : s.customer?.id || null,
        subscriptionId: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id || null
      };
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object || {};
      return {
        action: 'revoke',
        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
        subscriptionId: sub.id || null
      };
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object || {};
      const stillActive = ['active', 'trialing', 'past_due'].includes(sub.status);
      return {
        action: stillActive ? 'ignore' : 'revoke',
        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
        subscriptionId: sub.id || null
      };
    }
    default:
      return { action: 'ignore' };
  }
}
