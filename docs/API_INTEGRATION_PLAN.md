# API and data integration plan

Inspected 2026-11-08 at `77d5d7fefa22460bdb29b71692228d40d4c79246`. All extensions below are proposals, not implemented endpoints. Developer assignments remain TBD.

## Current API inventory

Same-origin Next.js route handlers; payload types in `lib/types.ts`; strict Zod request validation in `lib/server/schemas.ts`. Errors are `{error: string, issues?: {path, message}[]}`: invalid inputs generally 400, unknown trip/option 404, revoked trip access 403, unexpected failures 500. Do not document the old FastAPI error envelope as current behavior.

| Method / path | Input | Actual response/behavior |
|---|---|---|
| GET `/api/persona/[id]` | maya / garcia / jordan / raj | DashboardData: persona, driving, nullable cashflow, four engines, ranked, tripInsights, trip summaries and runtime preferences; warms initial panels via `after` |
| GET `/api/trips/[tripId]` | Recorded trip ID | Full Trip geometry/events, or 404; driving consent required, else 403 |
| GET `/api/agent/initial?personaId=maya` | Four-value personaId | AgentPanelState: recommendations, drafts, learned; cached structured explanation or template; warms all personas |
| POST `/api/agent` | `{personaId,message,context?:{widget?,optionId?,tripId?}}` | SSE `data:` JSON: text/tool/recommendations/draft/ui_action/learned/error/done; keepalive comments; route maxDuration 300 seconds |
| POST `/api/whatif` | `{personaId,moveType,overrides}` | EngineResult; monthlyMiles/monthsAhead/extraPrincipal/paymentDueDay/scoreImprovement; no income input |
| POST `/api/actions` | Discriminated accept/dismiss/delete_learned/set_consent/set_style | `{ok,preferences,packet?,learned?}`; eligible accept produces idempotent simulated packet; hardship self-service rejected |
| GET `/api/tfs` | None | `{metrics,packets}` for all four demo personas; process-local state |

**Production behavior differs from the intended `/api/tfs` contract:** `next build` prerenders it static; `next start` smoke returned zero packets both before and after `/api/actions` successfully returned a created packet. Queue a request-time rendering/caching correction and production acceptance test with the assigned owner. This audit did not modify route code.

Current clients assert response types rather than validate them. `lib/client/api.ts` uses mock fallback on network/404/5xx and forced mocks with NEXT_PUBLIC_USE_MOCKS=1; other ordinary 4xx errors propagate. Agent failures may invoke a scripted client fallback as well as the server's distinct deterministic offline path. A successful HTTP response means the route worked, not that a live model was used.

## Preserve before extending

- Keep route names, SSE event semantics, UI-action bridge and confirmed-action boundary intact unless all consumers agree on a change.
- Add runtime response validation in assigned work; reject invalid source amounts/identities rather than coercing to zero or silently using a different fixture.
- Keep existing Zod bounds, persona/tool scoping, consent filtering, cancellation, grounding retry and template behavior covered by tests.
- Request TypeScript changes through the shared contract owner. The historical ownership table in .plans does not assign today's developers.

## Source-of-truth matrix

| Data | Current source | Required integration rule |
|---|---|---|
| Four Toyyo profiles | `data/personas/*.json` | Preserve IDs, vehicles, scenario date and existing demo behavior |
| Trips/cashflow | `data/trips`, `data/cashflow`, pinned routes | Toyyo-only; do not fabricate telemetry or banking history for C001–C020 |
| Canonical profile/account/vehicle/situation | Preserved package `reference_data/data/*.csv` | Join customer_id; enforce one related row per profile, matching account.vehicle_id and unique keys |
| Canonical finance options | `option_scenarios.csv` | Use exact amounts and eligibility state; do not re-underwrite from Toyyo credit tables |
| Offers | `offers_catalog.csv` | Explicit option→offer mapping; guidance-only offers need no fabricated option row |
| Rate sheet | `rate_sheet.csv` | Reference only; never interpolate new canonical scenario terms without an agreed methodology |
| Golden answers | `golden_answers.csv` | Regression/evaluation oracle only; not recommendation code or AI system instructions |
| Impact | `value_drivers.csv` and explicit assumptions | Separate benchmark/calculated illustration from actual events and revenue |
| Repair/insurance/protection prices | Toyyo local constants/JSON | Separate illustrative domain; cannot be presented as canonical financing offers |

## Proposed adapter and shared DTO decisions

Agree these before implementation; exact file names and route naming remain team decisions.

1. Add a source identity such as `{source:"toyyo"|"toyota_pack",id:string,datasetAsOf:string}` at the boundary. Validate IDs against source membership. `maya` is not `C001`, even though both names are Maya.
2. Keep original CanonicalCustomer, CanonicalVehicle, CanonicalAccount and CanonicalSituation DTOs available rather than forcing absent fields into Persona. Identify account loan/lease explicitly, preserve nullable APR/balance/residual and annual income for affordability.
3. CanonicalScenario: customer/scenario IDs, optional mapped offer ID, original raw eligibility plus `eligible|review|caution|ineligible`, decimal-string payment/change/upfront/total delta, assumptions, trade-off, summary and source provenance.
4. CanonicalDecision: `kind:"scenario"|"guidance"|"no_eligible_option"`, nullable selected scenario, alternatives, deterministic reason codes, safety flags and one next-step descriptor. Human guidance is an action, not a made-up finance quote.
5. Canonical action input identifies source/customer/decision/action and optionally scenario; server recomputes policy, rejects stale/ineligible choices and produces a demo-only receipt. Existing HTTP accept semantics must not silently grant a financial approval.
6. Canonical simulation accepts customer ID, bounded income delta and optional eligible selected scenario; emits baseline/derived affordability, unchanged-terms indicator and warning. It must not mutate fixture objects or produce new rates, term, eligibility, vehicle value or quotes.
7. Preserve source money as normalized two-decimal strings. Render with currency formatting at the edge. Agree integer-minor-unit or another reviewed precision approach for derived money; affordability percentages have a separately documented rounding rule. Missing is null, never zero.

No code or public endpoint is created by this proposal. Prefer additive handlers/adapters inside the existing Next.js app; do not implement old `/api/v1` endpoints wholesale or stand up FastAPI just to match older prose.

## Deterministic policy boundary

Order: safety recall → human protection (vulnerable, >=2 missed, explicit hardship) → consent/eligibility → goal-aware ranking of comparable scenarios → explanation → mock next step. Keep all applicable warnings even when one has top priority. Block sales alternatives, not only sales primary recommendations, for protected customers. Review/Caution/N must not be converted to approved by the LLM, UI, fallback or action endpoint.

For C001, use existing supplied REFI terms ($611.66 payment, -$56.85 monthly change, -$2,444.62 total-cost delta). At -20% income use $46,400 derived annual income; payment share is 17.29% for current payment and 15.82% for REFI, without changing either scenario. Present a rounded-source versus derived-percent distinction where necessary.

## AI and external integration boundaries

Current AI provider configuration is Gemini by default and Anthropic optionally; live availability is not verified by this audit. Do not replace providers, create OpenAI infrastructure or implement delegated agents during this phase. Any assigned provider must receive only vetted consented facts and allowed action descriptors. Source text is data, not executable instructions. Validate schema, units/numbers, policy claims and action validity; unsupported content falls back without blank screens or false 'live AI' labels.

Hardware and Photon are absent from inspected code. Before an assigned integration begins, its owner must supply transport/auth, event schema and version, producer/consumer identity, timestamps/units, retry/duplicate rules, disconnect handling and the demonstration intent. Hardware events cannot fabricate eligibility or mutate financial terms. No messaging send is authorized by this plan.

## Contract and integration acceptance

- Existing 109 tests, lint and generated-route TypeScript remain green.
- Validate 20 customers, 142 distinct scenario pairs, required joins, CSV/JSON parity, nullable leases, malformed rows and cross-source identity rejection.
- Exact C001 values; C002/C014/C016 protection; C009 recall-first; C011 no marketing/phone preference; no eligible option and every non-Y state handled.
- API tests exercise HTTP handlers as well as pure engines, including malformed JSON, unknown IDs, denied choices, stale action, all applicable safety gates and no-key explanation.
- Simulation -20%, reset, -100% rejection, unknown option and nonpositive income cases preserve baseline terms.
- Browser tests trace source → endpoint → rendered figures → simulation → correctly labeled mock receipt; prevent persona-switch mix-ups and automatic wrong-source fallback.
- Existing Toyyo mileage, coaching, consent revocation, replay and packet flows remain operational. CI/browser work awaits an owner; no new test library added in this audit.
