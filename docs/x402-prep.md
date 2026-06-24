# x402 Prep for Obsidian Abyss

This is the pre-rollout plan for machine-paid access.

## Goal

Add a separate agent-facing paid surface without touching:

- `/contact`
- `/wallet-beta-request`
- `/beta/*`
- `/admin/*`
- `/billing/*`

Human access stays invite-based. Agentic access will be a separate x402 surface.

## Planned agent routes

- `GET /agent/backtesting`
- `POST /agent/advisor/message`
- `GET /agent/lookup`

## Discovery endpoints

The API now exposes two read-only discovery endpoints:

- `GET /x402/status`
- `GET /agent/catalog`
- `GET /agent/backtesting`

These return the planned x402 configuration, the intended route split, and the current enablement state.

## Environment variables

- `X402_ENABLED`
- `X402_FACILITATOR_URL`
- `X402_NETWORK`
- `X402_RECEIVING_ADDRESS`
- `X402_CURRENCY`
- `X402_AMOUNT`
- `X402_BUILDER_CODE`
- `PUBLIC_API_URL`

## Rollout order

1. Decide the first paid route.
2. Choose the network, facilitator, currency, and receiving address.
3. Wire the 402 challenge/response behavior.
4. Add payment verification and settlement.
5. Smoke test one client.
6. Expand to backtesting and lookup.

## Notes

- x402 is an open payment protocol built around HTTP `402 Payment Required`, with a `PAYMENT-REQUIRED` challenge header and client retry flow. The recommended protocol version is v2, and facilitators can verify and settle payments for resource servers.
- The current code in this repo protects the first paid route with x402 middleware when enabled. It still needs real deployment values and a payment test run.
