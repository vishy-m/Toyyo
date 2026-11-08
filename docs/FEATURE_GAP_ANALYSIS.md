# Feature gap analysis

Baseline: `77d5d7fefa22460bdb29b71692228d40d4c79246`, inspected 2026-11-08. 'Existing' means source-inspected and, where applicable, covered by the current 109 passing tests; it does not certify browser, live-provider or deployment behavior.

| Capability | Current status / concrete evidence | Gap and priority |
|---|---|---|
| Personalize | Four personas, JSON contracts, preferences, driving/cashflow consent and deterministic rank | **P0:** 20 canonical profiles absent; no source-aware identity or recall/vulnerability/marketing fields |
| Simplify | WhyDrawer, option cards, assumptions/math, lease chart and what-if sliders | **P0:** distinguish net-asset advantage from savings; generic 'Total today' can label a lifetime/36-month amount; provenance needed |
| Guide | HTTP accept/dismiss, idempotent packets, specialist mode, next-step UI and TFS packet view | **P0:** UI promises callback/started action despite simulated packet; hardship self-service button contradicts server rejection |
| Value | TFS retention/value/calls formulas and assumption disclosures | **P0 confirmed production failure:** static /api/tfs returns zero packets after successful accept; also not canonical value-driver model; seeded recommendation can disagree with runtime |
| Canonical data | No supplied CSVs referenced by application loader | **P0:** adapter, validated joins, decimal/null rules, four-state eligibility and C001–C020 tests |
| Scenario integrity | TypeScript engines compute from local tables, with source assumptions | **P0:** cannot represent preapproved Toyota fixture scenarios through newly computed terms; preserve separate source modes |
| Safety / Guardian | Recurring shortfall blocks other payment choices; hardship self-service rejected in applyAction | **P0:** no recall-first policy, vulnerable gate, >=2-missed gate, marketing-consent gate, or global no-upsell enforcement |
| Income stress | Mileage, months, score, principal and due-day controls already exist | **P0:** income scenario absent; source income absent; implement affordability-only delta/reset in assigned work |
| AI | Gemini default, Anthropic optional, validated tools, structured initial cards, bounded loop, numeric scanner, templates | **P0:** live credentials/model access unverified; numeric presence alone insufficient for semantic safety; old six-second fallback target unmet. OpenAI is not present and not assumed necessary |
| Alternative explanations | Cards include trade-offs, assumptions and Why? | **P1:** explicit comparative 'why not this choice' reasoning and canonical ineligibility reasons |
| Lease journey | Real local lease-end engine, mileage inputs and source comparison data | **P0 preserve:** Toyyo Maya/Raj behavior; **P1:** tailored canonical lease presentation after null handling works |
| Repair calculator | Four-step client form and real local calculations; three decision paths | **P0 risk:** prices, repair table, depreciation, rates and eligibility not from Toyota pack; no central policy; cannot claim fixture-verified recommendations |
| Repair integrations | Quote picker, shop choices, Connect, Car Fund, specialist preview | **Placeholder/simulation:** file name only, no parsing/upload; shops are hardcoded; Connect changes UI boolean only; fund in React state; no bank product, booking, message or callback |
| 3D vehicle | Persistent CarStage, persona transition, model resolution, preview and reduced-motion hooks | **Preserve:** code exists; not every exact model ships; browser/GPU/performance acceptance still needed |
| Maps / replay | Mapbox and MapLibre adapters, route playback/HUD/events/heatmap, SVG fallback | **P0 demo verification:** no-token is not offline; remote tiles/CDN worker; rehearse real venue path plus 2D fallback |
| Frontend data | Typed fetch/SSE and automatic mock fallback; footer marks mock endpoint count | **P0:** no runtime response schemas; fallback on 404/network/5xx can hide failed integration; duplicated personas in mock metadata |
| Error/privacy handling | Zod input schemas, HTTP errors, consent revocation clears generated evidence | **P0:** browser/profile-switch and concurrent consent/action tests needed; no authenticated customer isolation (synthetic-only) |
| State/persistence | In-memory global store, client caches and local theme/mode preference | **Known demo limitation:** shared persona state within process, resets on restart, not reliable across multiple instances |
| Testing | Eight test files / 109 tests passed; lint, generated-route TypeScript and production build pass; targeted HTTP smoke executed | **P0:** production sponsor packet visibility fails despite green tests/build; no checked-in browser E2E or CI, no canonical cases or comprehensive HTTP suite |
| Hardware / Photon | No matching implementation or dependencies found | **Unassigned integration:** do not invent contracts, choose hardware or implement messaging; request actual delegated specification |

## Previous PRD changes

| Earlier assumption | Updated treatment |
|---|---|
| Empty repo needing full scaffold | Clone and preserve working Next.js application; no second frontend |
| Python/FastAPI/Pydantic backend | Keep TypeScript route handlers, engines and Zod; propose additions at existing seams |
| C001 Maya as initial default | Preserve Toyyo Maya lease identity; canonical C001 is a distinct loan customer |
| One fixed date | Label each source's snapshot: Toyyo 2026-10-27, canonical 2026-11-07 |
| OpenAI integration required | Gemini/Anthropic already exist; explain-only safety remains required; provider changes await delegation |
| Broad new UI requirements | Reuse current story, stage, cards, drawers, agent and sponsor view; only assigned gaps get UI changes |
| Predetermined developer roles | All new ownership TBD; historical .plans assignments are not today's team delegation |
| Build all 20 customers immediately | Agree adapter/contract and a small canonical slice, pass regression, then expand |
| Toyota financial values recalculated | Supplied scenario amounts/eligibility authoritative for canonical mode; Toyyo tables cannot override them |

## Critical defects to queue, not fix in this phase

0. **Production sponsor packets are stale:** build classifies `/api/tfs` as static. In production smoke, accept returns 200 with a packet, but a subsequent sponsor fetch still returns zero packets. This breaks the stated Guide → Value demo. Review the installed Next route/cache documentation and add a production-mode regression when assigned; no-store response headers alone did not prevent prerendering.
1. **Misleading confirmation:** `AcceptModal` says 'A specialist will call you' / 'We've started…'; server packet correctly says none was scheduled. Make every visible and screenreader success message explicitly simulated.
2. **Wrong financial label:** `MoveDrawer.optionHeadline`, Story facts and AcceptModal use generic savings/total language across differently scoped metrics. Type or label each metric precisely; do not present lease asset advantage as lifetime savings.
3. **Protection gap:** hardship gating is payment-local, and a specialist option can still coexist with insurance/protection/upgrade sales. Add policy before all ranking/action/explanation paths as required by source data.
4. **Conflicting eligibility:** current refinance eligibility relies mostly on loan/history consent, not the canonical LTV/rate/missed/term checks or provided eligibility states. Deterministic math alone is not verified eligibility.
5. **Repair provenance:** replacement APRs, repair values and refinance eligibility are hardcoded, including defaults derived from cashflow assumptions. Quarantine as a separate illustrative calculator or ground it through an assigned data integration; do not present its outputs as Toyota fixture offers.
6. **Mock divergence:** failed API calls can succeed with independently seeded mocks, including reused replay routes. Canonical flow must carry provenance and fail visibly on source mismatch.

## Original package conflicts retained for integration

- C016's golden autopay/self-service answer conflicts with the hard vulnerable-person human-support gate: protection takes precedence; document intentional test-oracle mismatch.
- HUMAN/AUTOPAY/PAYOFF offer IDs have no matching option rows; guidance must not fabricate scenario records. EARLYEND/EXTENDLEASE also do not directly match offer IDs.
- The old OpenAPI's required Option primary cannot describe guidance/no-offer; its Money regex is overescaped. These are historical-contract defects to resolve if adapting those schemas, not a reason to change current endpoints without review.
- Canonical stored percentages may be rounded differently from derived affordability. Preserve source fields and label computed values separately.
- Original XLSX, challenge slide and full rubric were not present. Available CSV/JSON and user-stated criteria remain usable.
