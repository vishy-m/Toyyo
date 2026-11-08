# Toyyo architecture — inspected baseline and proposed seams

Inspected 2026-11-08 at `main` / `77d5d7fefa22460bdb29b71692228d40d4c79246`. This is documentation, not an implemented migration.

## Existing runtime

```text
Next.js App Router (one TypeScript application)
  dashboard layout → DashboardShell → Story / Moves / Finances / Driving / Repair
  Zustand data-store + ui-store + overlay-store + camera director
       ↓ lib/client/api.ts (fetch + SSE, automatic mock fallback)
  app/api/** route handlers (Zod request validation)
       ↓
  lib/server/dashboard + actions + learning + process-local runtime store
       ↓
  lib/engines (lease/payment/insurance/protection + deterministic rank)
       ↓
  lib/data → static persona/cashflow/trip/reference JSON

  lib/agent → validated tools → engines and allowed state/UI operations
           → Gemini default / Anthropic optional → grounding → templates on failure
           → SSE text, tools, recommendations, drafts, learned items, UI actions

Browser visuals: R3F/Three vehicle stage; Recharts comparisons; Mapbox replay
                or MapLibre/deck.gl; 2D car/route fallback
```

There is no Python service, separate database, real TFS API, Photon connection, hardware connection, real bank link, live insurer quote or OpenAI provider in this baseline. Keep the single Next.js app unless assigned work demonstrates a concrete need for another service.

## Stack and repository responsibilities

Locked core: Next 16.4.3, React/React DOM 19.3.0, TypeScript 5.9.3; Tailwind v4, Zod, Zustand, Motion/@animate-ui, Recharts, Three/R3F/drei, Mapbox/MapLibre/deck.gl, Gemini and Anthropic SDKs. npm with package-lock v3. Local verification used Node 22.14.0/npm 10.9.2.

| Boundary | Paths / responsibilities |
|---|---|
| Routes | `/`, `/moves`, `/finances`, `/driving`, `/repair`; standalone `/tfs` and `/lab` |
| Persistent shell | `app/(dashboard)/layout.tsx`, `DashboardShell`; vehicle stage remains mounted and is active on the landing page |
| UI | `components/dashboard`, `components/agent`, `components/ui`, `components/story`, `components/pages`; application tokens in `app/globals.css` |
| State | `lib/client/data-store.ts` caches persona dashboards, chat and next steps; ui-store bridges controls/replay; overlay-store handles dialogs; director handles stage poses |
| API | Seven HTTP endpoint families under `app/api`; typed payloads in `lib/types.ts`, request Zod schemas in `lib/server/schemas.ts` |
| Domain | `lib/engines/*` pure TypeScript math, ranking and TFS assumptions; `repair-advisor.ts` is invoked directly in the client |
| Server state | `lib/server/store.ts` global process-level map per persona; consent, preferences, drafts, panels and packets; resets across server lifetime/instances |
| AI | `lib/agent/llm`, `loop`, `tools`, `recommendations`, `grounding`, offline intent routing and diagnostics |
| Visuals | `components/stage`, `three`, `map`; local model manifest with body-style fallbacks; model preparation scripts |

## Data flow and actual contracts

`getPersona/getTrips/getCashflow` return defensive copies of four JSON fixtures. `buildDashboard` applies runtime consent/preferences, calls engines, computes rank and returns DashboardData. The server layer suppresses accepted/dismissed options and redacts revoked evidence. The client caches by persona and can temporarily display lastDashboard while a new persona loads; action/profile binding needs browser regression coverage.

Engine MoveOption exposes numeric monthlyCost/totalCost/savingsVsBaseline, boolean eligible, assumptions/math/dataUsed and highStakes. It cannot natively express canonical Review/Caution states. PersonaId is a four-value union and has no canonical ID namespace. Annual income, marketing consent, vulnerable flag and recall status are absent from that model.

AI may call deterministic tools, create drafts, update explicit preferences and dispatch UI events. It cannot accept a move: acceptance is a user-confirmed HTTP action. Initial cards are structured JSON and cached per persona/provider/options. Chat buffers and checks model output before SSE emission. A number's presence in evidence is not proof that its unit, customer, meaning or eligibility claim is correct; strengthen this boundary for canonical integration.

## Visual system to preserve

Overpass font through next/font/google, paint-inspired neutral canvas/sheets, black typography, red #EB0A1E accents, blue data and semantic green/amber; light/dark modes. These neutral treatments are project choices, not a claim that the full palette is official Toyota branding. Keep existing components, layouts, guided-tour/summary modes and purposeful motion. Do not replace them with the earlier proposed generic dashboard. Google font retrieval is a build-time network dependency.

Mapbox uses a public browser token. Missing/invalid token selects MapLibre, not a wholly offline map: tiles come from OpenFreeMap and worker code from unpkg. Local trip geometry avoids runtime routing requests. Missing hero models resolve through local generic GLB fallbacks; Camry/Supra assets exist but not all vehicles have exact models. Preserve credits; the manifest differs from older plan descriptions and includes noncommercial license labels, so do not repeat the old blanket 'all CC BY' claim.

## Proposed adaptation, pending ownership

1. Keep existing routes and domain services. Add a **source-aware adapter**, in an agreed new module, for canonical Toyota CSVs. Preserve separate Toyyo/canonical identities and dates; no name-based joins.
2. Agree an explicit discriminated source/identity contract and canonical finance DTO with decimal-string amounts, four-state eligibility, provenance, scenario ID distinct from offer ID, and guidance-only/no-offer result. Do not force unsupported bank/trip/insurance fields into C001–C020.
3. Apply deterministic policy before ranking, explanation and action in the canonical path; reuse it across future UI, chat and direct HTTP calls. Retain existing engines for Toyyo's separately disclosed illustrative driving scenarios.
4. Extend API/client types additively with team approval. Prefer shared same-origin route handlers and existing UI patterns, not a second frontend or automatic old `/api/v1` reimplementation.
5. Treat income what-if separately from current mileage/score/principal controls; no repricing or eligibility change. Numeric values must come from source scenarios or explicitly permitted affordability arithmetic.
6. Keep current AI providers. Any provider addition belongs to its assigned owner; all providers use the same vetted facts, policy and fallback. Do not send unconsented data or treat raw customer text as instructions.
7. Keep process-local state for the single-machine demo; document shared sessions/reset behavior. Persistent storage, authentication and service extraction are optional future decisions, not prerequisites to integrate the dataset.

## Known constraints / ADR changes

- Old ADR Next.js+FastAPI is superseded by this baseline; old Decimal/Pydantic mandates become precision/validation requirements, not mandatory Python dependencies.
- Old API examples/OpenAPI are references with known flaws; `lib/types.ts` and actual handlers describe today's wire contract. Future changes require explicit review and tests.
- Mock fallback can hide HTTP failures and diverge from canonical facts; canonical finance must fail visibly instead of switching sources silently.
- Hardship currently locks down payment choices based on banking shortfall; it is not an application-wide recall/vulnerability/marketing gate.
- TFS metrics rebuild a seeded dashboard, which may disagree with changed runtime preferences/consent; acceptance packets and display labels need end-to-end consistency checks.
- **Confirmed production defect:** with Cache Components enabled, the build prerenders `/api/tfs` as static. Production GET returns the empty build-time packet list even after a successful POST accept returns a real in-memory packet. Request-time behavior must be restored by the assigned owner using the installed Next.js guidance; no implementation change was made here.
- No automatic financial actions, new messaging integrations or deployment modifications are authorized in this task.

## Next.js operating requirement

AGENTS.md requires reading installed `node_modules/next/dist/docs/` before code edits. Installed route-handler, deployment, installation, font and route-type documentation was consulted during verification. Run `npx next typegen` before standalone TypeScript in a fresh clone. Historic .plans instructions about already-installed packages/shared servers describe the teammate's old session; the user's explicit environment-install/build instruction governs this fresh isolated clone.
