# Toyota FutureProof / Toyyo — updated PRD

Date: 2026-11-08. Baseline: `main`, commit `77d5d7fefa22460bdb29b71692228d40d4c79246` from the teammate's Toyyo repository. Status: adaptation proposal and inspected baseline, not authorization to implement delegated features.

## Authority and status vocabulary

The latest user request makes Toyyo the official application baseline. Preserve its working application and visual direction. The previous FutureProof package supplies challenge requirements and canonical financing fixtures, not a requirement to replace this implementation with Next.js plus FastAPI. No original PRD, source code, dependency manifest, deployment or team assignment is changed by these documents.

- **Existing:** source is present; verification limits are stated. A status-board claim alone is not new verification.
- **Required:** previously stated challenge/product/safety constraint, adapted here; some remain unimplemented.
- **Proposed:** implementation or contract decision awaiting team agreement and ownership.
- **Stretch:** optional after core integration and checks pass.

Original documents, data, prompts and four project skills are preserved byte-for-byte at `../../reference_materials/Toyota_FutureProof_Codex_Package/`. The earlier `../../docs/IMPLEMENTATION_PLAN.md` remains historical and is superseded for future implementation by this Toyyo-based proposal. Existing workspace skills and the unrelated `cbre-foresight` application remain untouched.

## Vision and value proposition

Help a Toyota owner answer “Given my situation today, what's the smartest next move for me and my Toyota?” through an explainable dashboard connecting ownership, driving patterns and financial choices. Keep the 3D vehicle and trip replay as useful entry points into decisions. Show customer costs and trade-offs, one appropriate next step, and a separately labeled illustration of TFS value.

All records and financial actions are synthetic. This is an independent concept prototype with no Toyota account access, underwriting, live insurance quote, real callback or financial transaction.

## Current application

| Area | Existing functionality | Evidence / limits |
|---|---|---|
| Customer shell | Four persona selector, theme switch, guided scroll tour/summary, persistent vehicle stage | `DashboardShell`, `TopBar`, `Story`, CSS tokens; visual fidelity not newly certified |
| Ownership | `/finances` contract/cash-flow/insurance views, `/moves` ranked choices and comparisons | Next.js API and deterministic engines; does not load C001–C020 |
| Driving | `/driving`, score factors, history, showcase replay and heatmap | 537 local synthetic trips, 20 showcase routes; map tiles/worker still require network |
| Decisions | Lease end, payments, insurance coaching/UBI, protection; what-if controls and reset | Deterministic TypeScript engines, rank breakdown, assumptions and math |
| Agent | SSE chat, 15 validated tools, initial recommendation cache, drafts, style/preferences, learned-item deletion | Gemini default, Anthropic selectable; numeric checks and offline templates; no OpenAI adapter |
| Guide | Accept/dismiss, simulated self-service or specialist packet | Server stores packets; hardship self-service rejected; UI still offers that button |
| Sponsor view | `/tfs` packet UI, acceptance and assumed retention/value/call metrics | Production smoke confirms static `/api/tfs` hides newly accepted packets; demo blocker. No real measured outcomes |
| Repair | `/repair` symptom → estimate → finances → plan | Working client calculator, but hardcoded prices/rates and simple eligibility are outside canonical Toyota fixtures |
| Visual sandbox | `/lab`, car/replay/heatmap components and asset tooling | Development route; not a customer requirement |

The four actual personas are Maya (2023 Camry lease), Garcias (RAV4 Hybrid loan), Jordan (GR Supra loan), and Raj (Tacoma lease). Older Toyyo prose describes Jordan as a Corolla driver; shipped JSON is the inspected behavior. Toyyo's clock is 2026-10-27. Canonical Toyota fixtures are dated 2026-11-07. Neither should silently advance to the execution date.

## Users and journeys

1. Lease owner: select Toyyo Maya → inspect mileage → compare return/buyout/re-lease → adjust monthly miles → review assumptions → prepare a simulated next step.
2. Loan owner: select Garcias → review refinance against current payment and fees → inspect the calculation → create a simulated packet.
3. Driver: select Jordan → private coaching → explicitly opt into insurer sharing before personalized UBI amounts → understand possible premium increases.
4. Lifestyle comparison: select Raj → replay an existing trip → inspect vehicle-fit trade-offs and current lease allowance; no claim of actual protection coverage.
5. **Required, missing canonical flow:** load C001 Maya's RAV4 loan without confusing her with Toyyo Maya; compare only supplied scenarios, then demonstrate hardship, recall and no-marketing cases using C002/C014, C009 and C011.

The original C001 refinance journey is still a required integration target, not evidence that Toyyo's Maya persona is wrong or permission to overwrite it.

## Toyota evaluation criteria

| Criterion | Existing evidence | Required improvement |
|---|---|---|
| Personalize | Persona data, consent, trip insights, preferences and deterministic ranking | Canonical customer/account/situation integration; avoid cross-profile display/action races |
| Simplify | Comparison cards, why drawer, math, assumptions and trade-offs | Precise metric labels; source provenance; approved/review/caution distinction; grounded alternative explanation |
| Guide | Confirm/dismiss, self-service/specialist packets and TFS view | Truthful demo receipt; human-only hardship UI; server-wide protection gates |
| Value | Separate sponsor view with disclosed multipliers | Attribute canonical metrics to value drivers; distinguish reference benchmark from session outcome and actual revenue |

The original challenge slide and full judging rubric were not supplied. This assessment uses the challenge wording and four criteria in the user's request and preserved documentation; no extra official scoring weights are assumed.

## Functional requirements and acceptance

| ID | Priority/status | Requirement and acceptance |
|---|---|---|
| R01 | P0 existing/protect | Existing four personas, routes, comparisons, consent and simulated packet behavior retain passing regression tests. Keep the current frontend. |
| R02 | P0 required/missing | Integrate canonical CSV facts behind an agreed adapter. All 20 customers and 142 scenario pairs validate; missing lease amounts remain null; no silent substitution from Toyyo mock profiles. |
| R03 | P0 required/missing | C001 shows $668.51 current payment, $611.66 REFI, -$56.85 monthly change and -$2,444.62 supplied total-cost delta. Do not recompute provided terms from Toyyo rate tables. |
| R04 | P0 required/partial | Multi-state eligibility: Y actionable, Review specialist-only, Caution warning/non-approved, N ineligible. Server validates each selected action and its source customer/scenario. |
| R05 | P0 required/partial | Recall first; vulnerable, >=2 missed payments or expressed hardship → human help without sales alternatives. Marketing consent N suppresses new-vehicle pitches. Test all entry points including chat, direct API, fallback and repair. |
| R06 | P0 required/missing | Income -20% affects derived affordability only; terms/eligibility/baseline recommendation unchanged; reset restores baseline. Reject invalid income and unknown selections. |
| R07 | P0 required/partial | AI explains vetted results only. Ground amounts, units, action eligibility and semantic claims. Missing key, timeout and unsafe output return deterministic guidance. Existing Gemini/Anthropic support is preserved; adding OpenAI requires explicit assignment. |
| R08 | P0 required/partial | Every receipt says demo only, no message/callback scheduled and no Toyota account change. No contact PII is requested. Disable hardship self-service in the UI as well as rejecting it server-side. |
| R09 | P0 required/partial | Preserve current why drawer and comparison UI; separate payment, lifetime cost, lease net-asset advantage and scheduled outflow. No invented equity/depreciation forecasts. |
| R10 | P0 required/partial | Sponsor metrics list source/date/formula/assumptions and remain outside customer ranking. Runtime preferences/consent must not be contradicted by seed-based sponsor calculations. |
| R11 | P0 required/partial | Runtime response validation, retryable errors and explicit source/mode indication. Never treat a failed canonical finance request as successful unrelated mock data. |
| R12 | P1 proposed | Dedicated canonical selector, stronger Guardian surface, detailed alternative comparisons and printable summary, reusing existing patterns; actual component work awaits assignments. |

## Nonfunctional requirements

- Reproducible npm-lockfile installation, generated Next.js route types, lint, TypeScript and current Vitest suite pass. Production build must pass in a correctly provisioned environment before deployment readiness is claimed.
- Existing engine outputs are fast and deterministic; original targets remain <2 s local dashboard and <500 ms median deterministic response, subject to measurement. No new latency claim was measured in this audit.
- Current AI transports allow 45-second provider timeouts and eight tool iterations; original six-second graceful-fallback target is not implemented. Agree a demo latency budget and cap requests before relying on live AI.
- Browser acceptance at 375/768/1440px, keyboard/focus/dialog behavior, chart text equivalent and reduced motion. Existing support is source-inspected, not an accessibility certification.
- Keys server-side; no real PII, transactions or external communication. Synthetic demo state is shared per process/persona, not authenticated per user; it is not a production account architecture.
- Financial precision must be specified for the canonical adapter. Existing engines use JavaScript numbers; preserve source decimal strings and use integer minor units for supported derived money calculations if the team approves. Do not import the old Python Decimal requirement mechanically.
- Core financial flow must work without an AI key. Offline map behavior is a separate requirement: MapLibre without a token still uses tiles and a CDN worker; exercise the SVG/2D fallback.

## Testing and demonstration

Current environment/check outcomes are recorded in `IMPLEMENTATION_PLAN_UPDATED.md`. Existing 109 tests cover engines, providers/tool loops, grounding, state and integration; no checked-in Playwright suite or CI workflow was found in Toyyo. Add targeted canonical fixture/policy/HTTP and browser cases only in an assigned implementation milestone.

Production build, lint and TypeScript pass. Targeted production HTTP smoke passes page delivery, persona engines, mileage what-if, no-key recommendation and simulated acceptance, but fails the sponsor packet refresh: `/api/tfs` is static and returns zero packets after acceptance. Fix and regression-test that boundary before claiming a working end-to-end sponsor demonstration. HTML 200 responses are not browser/GPU/accessibility certification.

Demo baseline: Maya mileage comparison → why/math → what-if and reset → persona change → one showcase replay → simulated packet → sponsor assumptions. Add canonical C001 refinance and protected C014/C009/C011 cases after integration passes. Use a local no-key fallback; record a backup only from the actual working application. Preserve the visual signature, and do not add fresh financial projections for presentation effect.

## Ownership and unresolved decisions

Developer ownership is deliberately unassigned; see the table in `IMPLEMENTATION_PLAN_UPDATED.md`. Need team decisions on the canonical profile entry point, source namespaces/contract extension, allocated integration tasks, selected AI provider and actual remaining demo time. Backend, AI, hardware, Photon, calculations and new UI implementation are out of scope for this inspection task.
