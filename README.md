# Toyyo

**Your car. Your next move, made clear.**

Toyyo is a Toyota Financial Services hackathon prototype that helps owners answer:

> Given my situation today, what’s the smartest next move for me and my Toyota?

It brings vehicle ownership, financing, driving insights and repair decisions into one experience. Customers can compare options, understand the assumptions behind a recommendation and explore a next step. A separate TFS view illustrates potential business value.

All supplied customer profiles, contracts, insurance figures and business outcomes are synthetic. Toyyo is an independent prototype, not an official Toyota product or a source of credit approval or financial advice.

## Features

- **Personalized Overview:** four demo owners, an interactive 3D vehicle, guided-tour and summary views, and ranked recommendations.
- **Moves and comparisons:** lease return, buyout and replacement scenarios; payment/refinance options; insurance and protection comparisons; assumptions, trade-offs and explanations.
- **What-if controls:** explore supported changes such as monthly mileage, projection horizon, extra principal, payment timing and driving-score improvement.
- **Finances:** account, payment and consent-aware cashflow information.
- **Driving:** trip history, scores, behavior insights, maps and vehicle replay using synthetic trips.
- **Repair or replace:** describe an issue, review demo repair research, compare keeping/trading/refinancing, adjust assumptions and explore financial life changes.
- **AI assistant:** Gemini or Anthropic, structured tools, explanation preferences and deterministic fallback when live AI is unavailable.
- **Repair planning workflow:** calculation, candidate scoring, optional Claude judgment/critique and a local fallback.
- **Action agent:** prepare service-request email/voicemail drafts and require explicit channel approval before executing configured outreach.
- **TFS view:** simulated handoff packets and modeled retention, relationship value and call avoidance.
- **Presentation:** responsive layouts, light/dark themes, Toyyo branding and local vehicle assets with fallback models.

### Demo owners

| Persona ID | Story | Vehicle |
|---|---|---|
| `maya` | Austin commuter approaching lease end | Camry SE |
| `garcia` | Family balancing financing and ownership needs | RAV4 Hybrid XLE |
| `jordan` | Houston driver exploring coaching and insurance | GR Supra 2.0 |
| `raj` | Hill Country explorer considering a different vehicle | Tacoma TRD Off-Road |

The original fixture clock is **October 27, 2026**. Read [the data guide](data/README.md) for exact assumptions, formulas, source geometry and regeneration details.

## Quick start

Use Node.js 22 LTS and npm. Keep the committed `package-lock.json`; install with `npm ci`.

```sh
git clone https://github.com/vishy-m/Toyyo.git
cd Toyyo
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If that port is occupied:

```sh
npm run dev -- --port 3004
```

Then open [http://localhost:3004](http://localhost:3004).

The financial fixture engines and deterministic assistant fallback can be explored without AI credentials. Live model calls, external maps and outbound communication have separate configuration and network requirements.

### Production mode

```sh
npm run build
npm run start -- --port 3004
```

Public environment variables are embedded at build time. Rebuild after changing map-provider settings or forced client-mock configuration. The root layout uses `next/font/google` for Overpass, so a fresh production build needs access to the Google font service.

## Configuration

Create an untracked `.env.local` in the repository root. Restart the development server after changing it. API credentials belong on the server; never prefix secrets with `NEXT_PUBLIC_` or commit them.

A minimal optional setup is:

```dotenv
# Copilot: grok, gemini or anthropic. Empty picks grok when XAI_API_KEY is set, else gemini.
AGENT_PROVIDER=
XAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# No Mapbox token needed for the MapLibre path
NEXT_PUBLIC_MAP_PROVIDER=maplibre
```

Leave credentials empty to use the available deterministic fallbacks.

| Variable | Purpose |
|---|---|
| `AGENT_PROVIDER` | Copilot provider: `grok`, `gemini` or `anthropic`. Empty selects `grok` when `XAI_API_KEY` is set, otherwise `gemini`. |
| `XAI_API_KEY` | Server-side xAI credential. Grok runs the copilot with tool calls. |
| `XAI_MODEL` | Grok model id; defaults to `grok-4.3`. |
| `GEMINI_API_KEY` | Server-side Gemini credential. `GEMINI_API` is a legacy alternative. |
| `ANTHROPIC_API_KEY` | Server-side Anthropic credential; also used by repair planning and action drafting. |
| `AGENT_MODEL` | Override the dashboard assistant model. |
| `AGENT_EFFORT` | Anthropic effort setting; defaults to `low`. |
| `PLANNING_MODEL` | Override the repair planning model. |
| `ACTION_AGENT_MODEL` | Override the action-drafting model. |
| `NEXT_PUBLIC_MAP_PROVIDER` | `mapbox` or `maplibre`; a missing usable Mapbox token selects MapLibre. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public Mapbox token for the browser; restrict its permitted origins in Mapbox. |
| `NEXT_PUBLIC_USE_MOCKS` | Set to `1` to force client-side mock responses; this bypasses backend behavior for supported endpoints. |
| `RESEND_API_KEY` | Enables configured email delivery from the repair action agent. |
| `RESEND_FROM_EMAIL` | Resend sender identity; use an address permitted by your provider account. |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier for the action agent’s voice-call path. |
| `TWILIO_AUTH_TOKEN` | Server-side Twilio credential. |
| `TWILIO_FROM_NUMBER` | Twilio sender phone number. |
| `TWILIO_TRIAL_MODE` | Defaults to trial behavior; setting `false` switches from the permitted trial template to generated speech content. |

The model defaults are configured in `lib/agent/llm/index.ts`, `lib/agent/client.ts`, `lib/agent/planning-workflow.ts` and `app/api/action-agent/route.ts`. Set overrides to models available to your provider account. Configured model names alone do not demonstrate successful live-provider access.

### Outreach behavior

Ordinary financial handoff packets are simulated. The separate repair action-agent execution route **can make real Resend and Twilio requests when credentials are configured**.

The current implementation uses fixed demo email and phone recipients in `app/api/action-agent/route.ts`. Selecting a displayed service provider does not dynamically route delivery to that business. Review the destinations before enabling credentials. Twilio trial mode uses a permitted template rather than the customized voicemail script. A successful submission is not proof of final delivery.

For a local demo that must send nothing, leave Resend and Twilio credentials unset and use draft previews. The execution route checks approval flags; this prototype is not an authenticated production outreach service.

## Demo walkthrough

1. Open the Overview and switch among the four owners.
2. Start with Maya’s Camry lease. Open **Compare options**, change the mileage projection and inspect the financial assumptions.
3. Open **Why this move?** to review supporting calculations and trade-offs.
4. Visit **Driving** to inspect synthetic trips, scores and replay. Explore **Finances** for account and cashflow context.
5. Visit **Repair or replace**. Describe an issue, compare paths and adjust the quote, savings or monthly budget. Try a supported life-event scenario.
6. Open the assistant to ask about the current owner’s options. Without credentials, demonstrate the deterministic fallback.
7. Review a simulated next-step packet and the separate `/tfs` view. Treat its business metrics as illustrative assumptions.
8. If demonstrating action-agent drafts, stop at the preview unless real outreach to the configured test destination is explicitly intended.

## Routes and API

### Pages

| Route | Purpose |
|---|---|
| `/` | Overview and personalized next moves |
| `/moves` | Move comparisons |
| `/finances` | Financing and cashflow context |
| `/driving` | Driving insights and trips |
| `/repair` | Repair-or-replace analysis and planning |
| `/tfs` | Simulated handoff and business-impact view |
| `/lab` | Visual/replay development playground |

### API routes

| Method | Endpoint | Responsibility |
|---|---|---|
| GET | `/api/persona/[id]` | Build a dashboard for an allowed persona ID |
| GET | `/api/trips/[tripId]` | Retrieve a synthetic trip |
| POST | `/api/whatif` | Compute supported scenario overrides |
| GET | `/api/agent/initial?personaId=maya` | Initial assistant panel |
| POST | `/api/agent` | Assistant interaction with streamed events |
| POST | `/api/actions` | Accept/dismiss, preferences and consent operations |
| GET | `/api/tfs` | Simulated packets and business metrics |
| POST | `/api/repair-research` | Validated demo repair knowledge-base lookup |
| POST | `/api/repair-plan` | Repair planning workflow |
| POST | `/api/action-agent` | Draft or explicitly approved outreach execution |

Shared contracts live in [lib/types.ts](lib/types.ts); dashboard request validation is in [lib/server/schemas.ts](lib/server/schemas.ts). Repair endpoints define their own request schemas. Use these contracts rather than guessing payloads.

## Architecture

Toyyo runs as one Next.js application with TypeScript route handlers. It does not require a separate Python backend or database to start.

```text
Pages and UI → Zustand client state → Next.js API routes
                                      ├─ deterministic financial/repair engines
                                      ├─ synthetic data loaders and runtime state
                                      └─ AI providers, tools and fallback explanations
```

| Location | Contents |
|---|---|
| `app/` | App Router pages, layouts, API handlers and global styles |
| `components/` | Dashboard, assistant, repair, shared UI, stage, map and 3D components |
| `lib/types.ts` | Shared domain and API types |
| `lib/data/` | Synthetic data access |
| `lib/engines/` | Calculations, ranking, repair analysis and modeled TFS outcomes |
| `lib/server/` | Dashboard assembly, request schemas, actions and runtime state |
| `lib/client/` | Client API integration, state stores and formatting |
| `lib/agent/` | Tools, model adapters, grounding, planning and fallback logic |
| `data/` | Synthetic accounts, reference values, cashflow and trip fixtures |
| `public/models/` | Optimized local vehicle assets and attribution manifest |
| `scripts/` | Data generation and model-preparation utilities |

Core stack: Next.js 16.4.3, React 19.3, TypeScript, Tailwind CSS v4, Zustand, Zod, Motion, Recharts, React Three Fiber/Three.js, Mapbox/MapLibre/deck.gl, Gemini/Anthropic SDKs and LangGraph for repair planning. Exact dependencies are pinned by the lockfile.

## Checks and tests

After installing dependencies:

```sh
npm run lint
npx vitest run
npm run build
npx tsc --noEmit
```

The production build generates Next.js route types used by the application; run it before a standalone TypeScript check in a fresh checkout. There is no `npm test` script: invoke Vitest directly.

Targeted examples:

```sh
npx vitest run lib/engines
npx vitest run lib/server/__tests__
npx vitest run lib/agent/__tests__
npx vitest run components/repair/WhatIfSimulator.test.ts
npx vitest run app/api/action-agent/route.test.ts
```

Tests cover financial engines, backend actions, consent, assistant fallback/grounding, repair scenarios and API behavior. Mocked provider tests do not establish that live email, voice or AI services work. Review the local configuration before running manual outreach tests.

For fixture regeneration, follow [data/README.md](data/README.md). The application runs from committed fixtures; regeneration is not required for setup.

## Prototype limitations and branch scope

- This README describes the committed `main` implementation. The separate Toyota 20-customer/C001 integration and Guardian/Photon persistence work are not included in this version of `main`; do not assume their routes or configuration are available here.
- Server consent, preferences and handoff packets currently use process-local memory. They can reset on restart and differ between server instances. Durable persistence and production TFS refresh require the separate integration work.
- Financial values are synthetic estimates, not live quotes, underwriting, account changes or guaranteed savings. Demo repair research is a local knowledge base, not a live diagnostic service or verified shop search.
- Repair cash projections and financing illustrations have explicit assumptions; they are not predictions of future vehicle values or real Toyota offers.
- Missing AI credentials use fallback behavior. Live AI requires network access, valid credentials and a supported model.
- MapLibre avoids a Mapbox credential requirement but still uses external map resources. Basemap rendering is not guaranteed offline. Local models/route fixtures and UI fallbacks do not make every feature fully offline.
- The app has no production customer authentication or verified Toyota account connection. Keep deployments scoped to synthetic demonstrations; real outreach endpoints need additional production controls.
- Some older UI action/metric labels may imply completion or upfront cost more strongly than the simulated backend supports. Confirm assumptions and use accurate demo narration.
- Business metrics are modeled opportunities, not observed retention, completed conversions or realized revenue.

## Troubleshooting

| Symptom | Check |
|---|---|
| Port already in use | Start with `npm run dev -- --port 3004` or choose another available port. |
| Assistant uses fallback | Check provider selection, its server-side key, model access and network availability. |
| Map is missing | Check network/WebGL, Mapbox token restrictions, or select `NEXT_PUBLIC_MAP_PROVIDER=maplibre`. |
| Build cannot fetch Overpass | Restore build-time access to Google Fonts and retry. |
| Environment change has no effect | Restart development; rebuild for `NEXT_PUBLIC_` changes in production. |
| State disappears after restart | Expected for this branch’s process-local runtime store. |
| Email/voice request fails | Check approved channels, provider credentials, sender permissions and configured demo destinations. |

## Contributing and asset attribution

Read [AGENTS.md](AGENTS.md) before changing application code, including its requirement to consult the installed version-specific Next.js documentation. Keep shared types consistent, preserve teammate-owned features, use focused branches and run checks appropriate to each change. Never commit `.env.local`, API keys or real customer data.

Inspect [public/models/manifest.json](public/models/manifest.json) for individual model sources and licenses. Some assets have usage restrictions; do not assume one license covers the entire repository. Preserve attribution and applicable map-provider credits when distributing or demonstrating the project.
