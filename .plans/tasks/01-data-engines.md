# Task 01: Synthetic data + deterministic engines (Codex)

Read first: `.plans/tasks/README.md` (ownership, runtime rules, promised exports), `lib/types.ts`, and spec sections §4 Personas, §6.5–6.6 (preferences, ranking), §7 Engines, §8 Data, §14 (Drive Pulse / TFS wording).

**You own:** `data/**`, `scripts/data/**`, `lib/data/**`, `lib/engines/**`. Edit nothing else.
**Goal:** every number in the product comes from here. Pure, deterministic, unit-tested TypeScript. No LLM, no randomness at runtime (seeded generation only, committed output).

## Deliverables

### 1. Reference data: `data/reference/*.json`
- `market-values.json`: simulated private-party value by model/year/odometer band, for: 2023 Camry SE, 2022 RAV4 Hybrid XLE, 2024 Corolla LE, 2021 Tacoma TRD Off-Road, plus upgrade targets 4Runner TRD Off-Road (2025), Highlander Hybrid (2025), Camry (2026). Plausible 2026 USD values.
- `model-prices.json`: MSRP, typical 36-mo lease payment, 60-mo finance payment at a given APR, for current models incl. the upgrade targets, plus `modelAsset` path (`/models/<slug>.glb`) and `bodyStyle`.
- `rates.json`: APR by credit tier (excellent/good/fair/building), refi fees, autopay discount 0.25%, disposition fee $350, purchase option fee $300, TX motor vehicle sales tax 6.25%, gas price $3.05/gal.
- `insurance-tiers.json`: score bands → UBI multiplier (e.g. ≥90: 0.78, 80–89: 0.88, 70–79: 1.0, 60–69: 1.12, <60: 1.25), base premium per persona vehicle.

### 2. Personas: `data/personas/{maya,garcia,jordan,raj}.json` (shape: `Persona`)
Follow spec §4. Tune the numbers so each persona's **top-ranked move is unambiguous** and matches `intendedBestMove`:
- **maya**: 2023 Camry SE lease, 36 mo / 12k mi/yr, 4 months left, $389/mo, odometer ≈ 41,200 (projected ~4k over). Buyout should beat returning by roughly **$1,000–1,300** (equity positive). Credit good. Paint: Supersonic Red `#B3122E`.
- **garcia**: 2022 RAV4 Hybrid XLE loan, 60 mo, 31 left, 6.9% APR, credit improved to excellent → refinance is top. ToyotaCare expiring within 2 months → protection is #2. Life event: new baby. Paint: Blueprint `#2B3F5C`.
- **jordan**: 2024 Corolla LE loan (bodyStyle sedan), age 22, credit "building", premium $248/mo, score ~68 with late-night driving and hard braking → insurance (UBI + coaching) is top, **but** the engine must report honestly that UBI at the *current* score would cost more, and that it saves money once the score reaches ≥80. The recommendation is "coach first, then switch." Payday biweekly Friday but due date the 3rd → due-date shift is #2. Paint: Celestite `#8FA9B8`.
- **raj**: 2021 Tacoma TRD Off-Road lease ending in 7 months, *under* allowance (no overage), lots of highway and trailhead miles → lease-end **upgrade to 4Runner TRD** (`upgradeModel` set) is top; tire & wheel protection is #2. Paint: Army Green `#5B6142`.
Consent defaults: all true except jordan `shareWithInsurers: false` (the demo can flip it on). Preferences seed: sensible weights per persona (maya flexibility-leaning, garcia monthlyPayment, jordan monthlyPayment, raj lifestyleFit).

### 3. Trips: `scripts/data/gen-trips.ts` → `data/trips/<persona>.trips.json` (shape: `Trip[]`)
- ~90 days per persona, seeded PRNG (e.g. mulberry32), reproducible: `npx tsx scripts/data/gen-trips.ts`.
- Patterns per persona (Texas): maya, downtown Austin ↔ Round Rock commute on I-35 weekdays + Dallas weekends; garcia, San Antonio daycare/errands + 1 Big Bend camping trip; jordan, Houston short urban trips, many after 10pm; raj, Austin + Hill Country trailheads (Enchanted Rock, Pedernales Falls) + 1 Big Bend run.
- **Start points are generic public places** (e.g. Congress Ave & 6th St), never homes. `destinationLabel` is coarse.
- **~5 showcase trips per persona** (`showcase: true`) get real road geometry: fetch from the OSRM demo server `https://router.project-osrm.org/route/v1/driving/{lng,lat;lng,lat}?overview=full&geometries=geojson` (or Mapbox Directions with `MAPBOX` from `.env`) **at generation time only**, simplify to ≤ ~1500 points, and assign `secondsFromStart` from a speed profile (highway vs city). If the network fails, fall back to a smoothed interpolated path so the script never breaks. Non-showcase trips get a simplified path (≤ 50 points).
- Events (`hard-brake`, `fast-accel`, `harsh-corner`, `speeding-start/end`) placed deliberately on showcase trips (e.g. jordan's worst trip has 3 hard brakes at night; raj's Big Bend trip is clean, smooth and long). Each event has `lngLat` on the path and a `scoreDelta`.
- Per-trip `score` uses the same Drive Pulse-style formula as the insurance engine (import it, don't duplicate).
- Commit the generated JSON. Keep each file < 2 MB.

### 4. Cashflow: `data/cashflow/<persona>.json` (shape: `CashflowSummary`)

### 5. Loaders: `lib/data/index.ts`
Exports exactly as promised in README (`getPersona`, `listPersonas`, `getTrips`, `getTrip`, `getCashflow`). Static JSON imports (works in Next route handlers and vitest). No `fs` at runtime.

### 6. Engines: `lib/engines/*.ts` + `lib/engines/index.ts`
Pure functions, spec §7:
- `driving.ts`: `computeDrivingSummary(persona, trips)` → `DrivingSummary` (6-month monthly miles: extrapolate older months from the 90-day pattern; category miles; top destinations; mileage-weighted score; scoreFactors with plain-language detail; smoothStreak; lifestyleTags from the rules in spec §6.5).
- `score.ts`: Drive Pulse-style per-trip score (harsh braking, fast accel, harsh cornering per 100 mi, speeding %, night %). Exported for the generator.
- `lease-end.ts`: return / buyout / re-lease / upgrade (spec §7.1, TFS invoice wording: "Excess mileage charge", "Excess wear and use (est.)", "Disposition fee"). `buyout = residual + purchaseOptionFee + salesTax`. `equity = marketValue − buyoutPrice`. Honors `overrides.monthlyMiles` and `overrides.monthsAhead`. Deadline = lease end − 30 days. Loan personas: return an EngineResult with `eligible: false` options and reason.
- `insurance.ts`: current vs UBI at current score vs UBI at improved score (`overrides.scoreImprovement`); coaching; honest downside. If `shareWithInsurers` or `driving` consent is off → `limitedBy` set and UBI options marked ineligible with a reason.
- `payment.ts`: refinance (by credit tier), extra principal (`overrides.extraPrincipal`, default $50), due-date shift (needs `banking` consent, else limitedBy), autopay, hardship flag → specialist only.
- `protection.ts`: ToyotaCare expiry projection (date or miles, whichever first), extended service contract fit, tire & wheel fit (trailhead/pothole share).
- `insights.ts`: `TripInsight[]` (hybrid fuel saved vs comparable gas model, destination patterns, vehicle-fit hooks), template-rendered.
- `rank.ts`: spec §6.6 `score = normalizedImpact × Σ(priorityWeight × moveFit) × urgencyBoost × confidence`; drop `suppressedMoveTypes`; return the breakdown.
- `tfs.ts`: `computeTfsMetrics`, with simple stated assumptions (e.g. buyout retains ~4.2 more years; refi keeps the loan in-house; each self-service accept avoids ~1.5 calls).
- `index.ts`: `buildDashboard`, `runWhatIf`, `computeTfsMetrics` exactly as promised. `buildDashboard` applies runtime consent (banking off → `cashflow: null`) and runtime preferences, and returns `trips` without `path`/`events`.
- Every `MoveOption` fills `summary`, `tradeoffs`, `assumptions`, `math` (label/formula/result strings with real numbers), `dataUsed`, `confidence`, `highStakes`. These feed the UI's "Why am I seeing this" panel and the LLM grounding check, so make them complete and human-readable.

### 7. Tests: `lib/engines/__tests__/*.test.ts` (vitest)
- Each persona's `ranked[0].moveType === persona.intendedBestMove`.
- Maya buyout `savingsVsBaseline` within $1,000–1,300; Raj has no overage; Jordan UBI at current score costs more and at +15 score costs less.
- What-if: Maya `monthlyMiles: 900` lowers the overage; consent off → `limitedBy`.
- Determinism: `buildDashboard` twice → deep-equal.
Run: `npx vitest run lib/engines`. Also `npx tsc --noEmit` must pass for your files.

## Done when
- `npx tsx scripts/data/gen-trips.ts` regenerates data deterministically; JSON is committed in `data/`.
- All tests pass; tsc is clean.
- STATUS.md has your entry: what each persona's top 2 moves and key numbers are (the pitch team needs them), plus any requests.
