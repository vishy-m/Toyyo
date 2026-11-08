# Synthetic Next Move scenarios

All customer records, prices, APRs, insurance factors and business-value estimates
are fabricated demo inputs. The scenario clock is fixed at **2026-10-27**.
There are no runtime valuation, routing, bank or insurer requests.

## Regeneration

```sh
python3 scripts/data/seed-reference.py
npx tsx scripts/data/gen-trips.ts
npx vitest run lib/engines
npx tsc --noEmit -p lib/engines/tsconfig.check.json
```

`reference/routes.json` pins the OSRM geometry, distance and source URL for each
public-place route. With that file present, trip generation requires no network
and is byte-identical. Delete selected cache entries to explicitly refresh those
routes. New route requests have a timeout and a deterministic interpolated
fallback, recorded as `source: "fallback"`. The shipped showcases all use OSRM.
Routing never uses private residences. JSON fixtures are checked into the source
tree by the coordinator; the Task 01 agent does not commit.

The 90-day window is July 29–October 26 UTC. Trip scores use the same exported
Drive Pulse-style formula as the engines, not Toyota's proprietary algorithm.
Three older monthly buckets are explicitly extrapolated; the recent buckets
cover 30-day periods. Events annotate score penalties and lie on replay paths.
Mileage and telemetry use separate seeded random streams, so tuning events does
not alter the mileage history. Maya's rush-hour commutes include braking and
acceleration, and Dallas runs include speeding. Her final eight trips model a
recent smoother-driving streak. Only Raj's outbound Big Bend showcase is
deliberately spotless; his other trips retain occasional driving penalties.

## Material scenario assumptions

- Maya's 41,200-mile odometer is inconsistent with the brief's roughly 4,000-mile
  projected overage if her lease started at zero. The synthetic used/demo lease
  therefore starts at **7,500 miles**, explicitly recorded in `rates.json` and
  each lease option's math. Her 36,000-mile allowance is miles *driven during the
  lease*: the odometer limit is 43,500. Her contract rate is **$0.25/excess mile**.
  The contract field is the only pricing source for excess mileage. At 1,464.72
  mi/month, projected excess is **3,558.88 mi** (about 4k); the **$889.72** mileage
  charge plus **$350** disposition fee gives a **$1,239.72** return invoice.
  The 7,500-mile starting assumption retains positive equity (**$48.75**) and a
  **$1,288.47** buyout advantage with the corrected contract rate. At 900 mi/month,
  excess falls to **1,300 mi** and the return invoice to **$675**.
- Buyout advantage is return invoice plus equity, where equity is market value
  minus the tax-inclusive buyout. It compares immediate net asset positions;
  it does not claim lifetime savings or include future finance interest, repairs
  or resale changes. New-lease estimates exclude tax/registration/dealer fees.
- `monthsAhead` changes the projection horizon from today, capped at remaining
  lease months; `monthlyMiles` changes projected usage. Neither advances the
  fixed scenario clock or changes the contractual deadline.
- Jordan's default insurer-sharing consent is off. Private coaching is allowed
  with driving consent; UBI amounts and savings are withheld until both driving
  and insurer-sharing consent are on. A +15-point scenario is conditional, not a
  promise or a recommendation to switch immediately.
- Garcias' ToyotaCare is a synthetic maintenance-coverage scenario starting
  2024-12-15. Maintenance expiry is not factory repair-warranty expiry. Optional
  protection prices have **no invented claims savings**. Trailhead trips and
  urban categories are exposure proxies, not evidence of damage or coverage.
- Ranking compares one eligible action per move type. Monetary impact is capped
  savings / $1,500 (insurance uses annual savings / $600). Nonmonetary coaching,
  timing and lifestyle actions use explicit usefulness constants in `rank.ts`.
  Weighted priority fit, deadline urgency and confidence multiply that impact.
  The ranker never reads `intendedBestMove` or branches on persona ID.
- Hardship recommendations require a specialist callback. TFS contribution,
  retention and avoided-call figures are illustrative assumptions, not observed
  business outcomes.

`getPersona`, `getTrips`, `getTrip` and `getCashflow` return defensive copies.
Runtime consent/preferences must be passed to `buildDashboard` / `runWhatIf`.
Driving consent off removes trip lists, inferred lifestyle tags and insights;
banking consent off returns `cashflow: null`.
