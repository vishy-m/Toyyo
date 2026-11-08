# Proactive lease conversation demo

The lease comparison page includes a mileage alert and a two-step text confirmation. It uses the same contract, odometer, consented 90-day trip trend, and lease options as the rest of Toyyo. A 1,000-mile projected overage triggers a warning. Updating the odometer rechecks the projection; a scheduled caller can POST `/api/lease-conversation/scan` with `Authorization: Bearer <CRON_SECRET>` after new driving data arrives.

The demo sequence is `OPTIONS` → `SWITCH` or `BUYOUT` → `CONFIRM SWITCH` or `CONFIRM BUYOUT` → simulated dealer approval. Confirmation creates the existing TFS handoff packet. Dealer approval updates the runtime vehicle and contract, and shows the estimated monthly payment and first payment date. No real application or dealer transmission occurs. Runtime state is in memory and resets on server restart.

Without Spectrum settings, messages appear in the on-page simulator. This demo uses Stable Spectrum (`spectrum-ts`), whose dashboard shows a project id and a project secret. It does not use a Photon v2 `pho_sk_` API key. Set these server-only environment variables:

```text
SPECTRUM_PROJECT_ID=<uuid from project settings>
SPECTRUM_PROJECT_SECRET=<project secret>
SPECTRUM_WEBHOOK_SECRET=<signing secret saved when the webhook was registered>
CRON_SECRET=...
```

Register `https://<your-host>/api/photon/webhook` as a Spectrum message webhook. The handler verifies `X-Spectrum-Signature` over the raw body before accepting a reply. With no Space map, inbound texts use Maya and the conversation id from that delivery. It routes ordinary questions through the existing agent and lease commands through the confirmation workflow; see `PHOTON_CHATBOT.md`. A resolved SDK send means Spectrum accepted the message, not that the phone displayed it. A production deployment needs authenticated account linking and durable storage.

The simulated data pack is synthetic, as are the lease prices. New-lease estimates exclude taxes, registration, dealer fees and any higher-mileage allowance quote. The displayed new payment is a demo estimate; the customer must review actual dealer terms.

Spectrum docs: https://photon.codes/docs/spectrum-ts/introduction and https://photon.codes/docs/webhooks/verifying-signatures
