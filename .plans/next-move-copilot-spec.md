# Next Move Copilot — Spec

HackTX 2026 · Toyota Financial Services "What's Your Next Move?" challenge
Team: 3 people · Time budget: ~24h · Status: draft spec

---

## 1. One-liner

A Toyota owner dashboard that turns **how you actually drive** into **your smartest next financial move**: lease-end, insurance, payments and protection plans. An **agent side panel** knows everything about you, drafts recommendations, explains them the way you like, and lets you accept with one click.

> Challenge question: *"Given my situation today, what's the smartest next move for me and my Toyota?"*

## 2. Goals and non-goals

### Goals
- Answer the challenge question for each of 4 simulated customers with a different, well-justified best move for each.
- **Dashboard first, agent second:** the user can browse everything themselves. The agent is a tool beside the dashboard that does the work: it drafts, recommends and acts after approval.
- The agent **learns preferences** from explicit actions (accept / dismiss / edit) and implicit data (driving, payments), and the user can see and edit what it has learned.
- All dollar figures come from **deterministic engines**. The LLM ranks nothing by itself and invents no numbers. It explains and drafts.
- Show business value to TFS through an internal **TFS Insight view**.

### Non-goals
- Real integrations (no real TFS, bank, insurer, telematics or OBD).
- Real auth or multi-user persistence.
- Actually executing financial transactions. Every action is a mock confirmation plus a handoff packet.
- Voice UI (possible stretch only).

## 3. Mapping to judging criteria

| Criterion | How we hit it |
|---|---|
| **Personalize** | 4 hand-crafted personas with profile, vehicle, lease/loan, trip log and cash flow. Every insight cites that persona's data. |
| **Simplify** | Each recommendation card has a one-line "what to do", a plain-language "why", and an expandable "show the math" with assumptions and trade-offs. |
| **Guide** | Every card ends in a clear next step: **Accept** (mock self-service flow), **Talk to a person** (follow-up), or an **eligible offer**. |
| **Value** | The TFS Insight view shows retention likelihood, projected revenue and calls avoided per persona, with assumptions stated. |
| **Innovate responsibly** | Rules engine does the math and the LLM explains it; a number-grounding check; a "Why am I seeing this" panel; consent per data source; a not-financial-advice notice; human handoff on high-stakes moves. |
| **Working prototype + synthetic data** | Next.js app, JSON seed data, live Claude agent. |

## 4. Personas (synthetic)

Each persona is designed so that the **same kind of question produces a different best move**. That makes the persona-switch demo moment work.

| # | Persona | Vehicle / contract | Driving life | Intended best move |
|---|---|---|---|---|
| 1 | **Maya, 29, Austin commuter** | 2023 Camry SE lease, 36 mo / 12k mi/yr, **4 months left** | 1,450 mi/mo, I-35 commute, frequent weekend trips to Dallas | Lease-end: projected **~4k mi overage**. **Buy out** (equity positive) beats returning. |
| 2 | **The Garcias, 38/36, new baby** | 2022 RAV4 Hybrid loan, 60 mo, 31 mo left, 6.9% APR | Low miles, school/daycare trips, Big Bend camping 2×/yr | **Refinance** (credit improved) + ToyotaCare ending soon → extended protection. Trip tip: Grand Highlander Hybrid at a future trade-in. |
| 3 | **Jordan, 22, new driver** | 2024 Corolla loan, high insurance cost | Late-night driving, hard braking, short urban trips | **Usage-based insurance**: driving-score trend + coaching tips → projected premium drop; payment date aligned to payday. |
| 4 | **Raj, 45, road-tripper** | 2021 Tacoma TRD lease ending in 7 months | Lots of highway + unpaved trail miles, under the mileage allowance | **Re-lease / upgrade** to a 4Runner TRD or new Tacoma (miles to spare, so no overage); tire & wheel protection because of trail use. |

**Same-car moment for the demo (optional):** clone persona 1's lease onto a low-mileage driver to show that the move flips from *buy out* to *return and re-lease*.

## 5. UX

### 5.1 Layout

```
┌──────────────────────────────────────────────┬───────────────────────────┐
│ [Persona switcher ▾]   Next Move   [TFS view]│  AGENT PANEL  (collapsible)│
├──────────────────────────────────────────────┤                           │
│ Vehicle card: 2023 Camry SE · 41,210 mi       │  ▸ "Your next move"       │
│ Contract card: Lease · 4 mo left · $389/mo    │    draft plan (top 1–3)   │
│                                              │  ▸ Recommendation cards   │
│ ┌ Driving life ───────────┐ ┌ Money ────────┐ │    [Accept][Edit][✕][Why] │
│ │ map of trips (clustered) │ │ payment hist  │ │  ▸ Drafts (msgs, compares)│
│ │ miles/mo trend vs allow. │ │ cash-flow     │ │  ▸ What I've learned      │
│ │ driving score + factors  │ │ insurance cost│ │  ─────────────────────── │
│ └──────────────────────────┘ └──────────────┘ │  Chat: "what if I drive   │
│ Next-move tiles: Lease · Insurance · Payment ·│   less next year?"        │
│ Protection (each opens a detail page)         │                           │
└──────────────────────────────────────────────┴───────────────────────────┘
```

- **The dashboard works without the agent.** Tiles open detail pages with the engine output: tables, charts and assumptions.
- **The agent panel** on the right is always present and collapsible. It opens with drafts already computed for the current persona, so the user does no work to get value.
- **Contextual agent hooks:** each dashboard widget has a small "✨ Ask / Draft" button that opens the panel scoped to that widget (e.g. "Draft my lease-end options").

### 5.2 Agent panel sections
1. **Your next move:** the agent's top 1–3 recommended moves, ranked, each as a card.
2. **Recommendation cards.** Each card has:
   - Title + one-line action ("Buy out your Camry before lease end").
   - Impact chip (e.g. "Saves ~$1,120 vs returning"). The number comes from the engine.
   - Urgency chip ("Decide by Feb 14").
   - Buttons: **Accept**, **Edit** (redraft via chat), **Dismiss** (with a reason chip: *too expensive / not now / not relevant / already done*), **Why?**
3. **Drafts:** things the agent wrote for the user: a comparison table, a message to a TFS specialist, a reminder, or a payoff plan. Each one is editable and can be accepted.
4. **What I've learned:** a visible, editable list of inferred preferences (e.g. "Prefers lowest monthly payment", "Takes road trips to Hill Country ~monthly", "Wants short explanations"). The user can delete or correct any item, which is part of the responsible-AI story.
5. **Chat:** free-form questions and what-ifs; the agent redrafts its cards in place.

### 5.3 "Why am I seeing this" panel
For every recommendation:
- **Data used:** e.g. trip log (last 90 days), lease contract, payment history. Each item links to the dashboard widget.
- **Key numbers + formula:** e.g. projected overage = (projected odometer − allowance) × $0.25/mi.
- **Assumptions:** e.g. market value from a simulated valuation table; mileage trend holds.
- **Trade-offs:** what you give up with this choice.
- **Confidence:** High / Medium / Low, from deterministic rules (data completeness, time to deadline).
- **Footer:** "This is guidance, not financial advice. [Talk to a TFS specialist]."

### 5.4 Accept flow (Guide)
Accept → confirmation modal with a pre-filled summary (what will happen, cost, dates) → "Confirm (simulated)" →
- the customer sees a success state plus the next steps;
- a **handoff packet** is created and appears in the TFS view.

High-stakes moves (buyout, refinance, insurance switch) always show both **Do it myself** and **Have a specialist call me**.

### 5.5 3D and interactive layer

**Rule:** every 3D or interactive element must lead to a financial move or explain one. It should look great, and it should also do something for the pitch. Ease of use comes first: every 3D view has obvious controls, a one-click "reset view", and a 2D fallback.

#### 5.5.1 Hero 3D car (vehicle card)
- A react-three-fiber scene of the persona's vehicle type (sedan / SUV / truck), painted in the persona's car color, on a soft studio floor with a reflection and contact shadow. It rotates slowly when idle, can be dragged to orbit, and is zoom-limited.
- **Hotspots** (pulsing dots on the model) link to moves:
  - **Odometer/dash:** mileage vs lease allowance → Lease-end move.
  - **Tires:** trail/pothole exposure → Tire & wheel protection.
  - **Engine bay:** ToyotaCare expiry countdown → Protection move.
  - **Driver seat:** driving score → Insurance move.
  - Clicking a hotspot flies the camera to that spot, shows a small glass tooltip with the key number, and opens the matching card in the agent panel.
- **Persona switch transition:** the car drives off screen, the new persona's car rolls in, and the dashboard numbers count up to the new values. This dresses up the demo's wow moment.
- **Upgrade preview:** when a lease-end option suggests an upgrade (e.g. 4Runner TRD), a "Preview" button swaps the model next to the current one, with a side-by-side payment comparison under it.

#### 5.5.2 3D ride replay (Driving life)
- A **3D map** (tilted camera, 3D buildings, terrain, time-of-day lighting matching the trip's start time) with a **3D car model driving the actual route**.
- Controls: play/pause, a scrubber timeline, speed 1× / 10× / 60×, and camera modes **Chase cam** (default; follows behind the car), **Overhead** and **Free**.
- **Event markers on the timeline and map:** hard brake (red pulse), speeding segment (orange route color), night driving (lighting dims). When playback reaches an event, it slows down, and a callout explains the event's effect on the driving score and the estimated insurance cost ("This hard brake: −2 score pts").
- **HUD overlay:** current speed, trip miles, elapsed time, and the score change so far.
- **Trip list** beside the map with filters (worst score, longest, road trips). Hovering a trip previews its route as a glowing line; clicking it flies the camera to the start and plays the trip.
- **Heatmap mode:** all trips from the last 90 days as an animated trail layer, colored by category (commute / road trip / trailhead). This makes "places you've been" a single striking view, and it's the input to lifestyle tags.
- **Agent integration:** the agent can open a replay: "Show me the trip that hurt my score most" → the replay jumps to that event. Insurance and protection cards include a "Replay the trip" link.

#### 5.5.3 Interactive financial visuals
- **Lease-end time slider:** drag months forward. The odometer rolls, the projected mileage line crosses the allowance line, and the overage cost and buyout equity update live. The numbers come from the engine with overrides.
- **What-if controls** on each move detail page (monthly miles, extra payment amount, target payment date) give live engine recalculation and animated chart transitions. Chat what-ifs move these same controls, so the user can see what the agent changed.
- **Option comparison:** the return / buy out / re-lease / upgrade cards sit side by side; hovering highlights each card's trade-offs; the recommended card has a subtle glow.
- **Accept micro-interaction:** the card collapses into a check, and a confirmation chip flies to a "Next steps" tray.

#### 5.5.4 Visual style
- Dark, premium "showroom" look by default (near-black background, Toyota red `#EB0A1E` as the accent only, soft glass panels, generous spacing), with a light mode.
- Motion: spring-based, 150–400 ms for UI, longer camera flights (~1.2 s, eased). Nothing moves without a reason.
- **Ease of use:** large tap targets; every 3D view has a visible legend and a reset button; keyboard controls for replay (space = play/pause, ←/→ = scrub).
- **Accessibility and fallbacks:** `prefers-reduced-motion` turns off auto-rotation and camera flights (cuts instead); WebGL failure or a low-power device → static car image and a 2D route map; all numbers shown in 3D tooltips are also in the cards.

### 5.6 TFS Insight view (second tab)
- One row per persona: recommended move, accepted? (live), **retention likelihood**, **projected revenue / value retained**, **calls avoided**, open handoff packets.
- Click a packet to see what an agent would receive: customer summary, chosen move, numbers, the data consented to, and the customer's own stated preferences. No re-asking is needed, which shows reduced service effort.
- An assumptions box with simple stated multipliers (e.g. "buyout retains customer for avg 4.2 more years").

## 6. The agent

### 6.1 Principle
**Engines compute, ranker orders, LLM explains and drafts.** The LLM never produces a dollar figure that isn't in a tool output.

### 6.2 Model and runtime
- **Gemini** (`@google/genai`) with function calling, behind a provider abstraction (`lib/agent/llm/`). Default model `gemini-3.5-flash`; `AGENT_PROVIDER` (`gemini` | `anthropic`) and `AGENT_MODEL` override it. The key comes from `GEMINI_API` in `.env`. The Anthropic and OpenAI accounts have no credits (checked Oct 27), so Claude stays as a selectable implementation, not the default. If the LLM fails or is rate-limited, the offline template path plus the intent router keeps every demo step working.
- Next.js API route `/api/agent` runs the tool-use loop and streams responses to the panel.
- The system prompt includes: persona summary, preference profile, style settings, consent state, and the rules (cite tool outputs, no invented numbers, offer a human on high-stakes moves, plain language).

### 6.3 Tools

| Tool | Returns |
|---|---|
| `get_customer_snapshot(personaId)` | profile, vehicle, contract, consent state |
| `get_driving_summary(personaId, window)` | miles/mo, trend, trip categories, top destinations, driving score + factors |
| `get_cashflow_summary(personaId)` | payday cadence, average balance, payment-history flags (only if banking consent is on) |
| `compute_lease_end_options(personaId, overrides?)` | return / buy out / re-lease / upgrade with costs, equity, and the overage projection |
| `compute_insurance_options(personaId, overrides?)` | current vs usage-based quotes (simulated), savings, score drivers |
| `compute_payment_options(personaId, overrides?)` | refinance, extra principal, due-date shift, autopay; savings over the loan's life |
| `compute_protection_options(personaId)` | ToyotaCare expiry projection, extended service, tire & wheel fit |
| `get_trip_insights(personaId)` | lifestyle tips (fuel saved, trip patterns, vehicle fit) |
| `rank_moves(personaId)` | ordered moves with a score breakdown (deterministic) |
| `create_draft(type, content)` | saves a draft card (comparison / message / reminder / plan) |
| `open_trip_replay(tripId, focusEventId?)` | tells the UI to open the 3D replay at a trip/event (UI action, no data) |
| `focus_vehicle_hotspot(hotspot)` | flies the hero car camera to a hotspot (UI action) |
| `set_whatif(control, value)` | moves a what-if slider on screen so the user sees the agent's change |
| `accept_move(moveId)` | mock execution + handoff packet |
| `update_preference(key, value, source)` | records a learned or stated preference |

`overrides` lets the user run what-ifs ("what if I drive 900 mi/mo?") through the same deterministic math.

### 6.4 Number grounding guardrail
After each LLM response, a server-side check pulls every `$` amount, percentage and mileage out of the text and confirms that each one appears (after rounding) in the tool outputs from that turn. On failure, regenerate once; then fall back to a template-rendered card. For the demo, log violations to the console.

### 6.5 Preference learning
A preference profile is kept per persona, in memory and seeded from JSON:

```ts
type Preferences = {
  priorityWeights: { monthlyPayment: number; totalCost: number; flexibility: number; lifestyleFit: number }; // sum = 1
  detailLevel: "brief" | "standard" | "show-math";
  format: "bullets" | "table" | "story";
  lifestyleTags: string[];          // e.g. "road-tripper", "night-driver", "family"
  dismissed: { moveType: string; reason: string; at: string }[];
  accepted: { moveType: string; at: string }[];
  learned: { id: string; statement: string; source: "explicit" | "driving" | "payments" | "behavior"; confidence: number }[];
};
```

How it learns (all deterministic, so it's explainable):
- **Explicit:** Accept → +0.1 weight to that move's dominant priority; Dismiss "too expensive" → +monthlyPayment; "not now" → suppress for this session; "not relevant" → suppress the move type. Asking for "more detail" in chat → detailLevel up.
- **Driving data:** frequent trips over 150 mi → `road-tripper`; >20% night miles → `night-driver`; unpaved/trailhead destinations → `off-road`; child-care POIs → `family`.
- **Payments:** late or near-due payments → favor due-date shift; consistent extra payments → favor total cost.
- Every change adds a human-readable `learned` entry, shown in "What I've learned", and the user can delete it.

### 6.6 Ranking (deterministic)
`score = normalizedImpact × Σ(priorityWeight × moveFit) × urgencyBoost × confidence`, with suppressed move types removed. `rank_moves` returns the breakdown so the "Why" panel can show it.

## 7. Engines (TypeScript, pure functions, unit-tested)

### 7.1 Lease end
- `projectedOdometer = current + avgMonthlyMiles(last 3 mo) × monthsRemaining`
- `overageCost = max(0, projectedOdometer − totalAllowance) × overageRate` (default $0.25/mi)
- `buyoutPrice = residual + purchaseOptionFee + salesTax` (Texas motor vehicle sales tax 6.25%; this is the "out-the-door" figure the public lease buyout calculators use)
- `equity = simulatedMarketValue − buyoutPrice`
- Options:
  - **Return:** excess mileage charge + disposition fee ($350) + estimated excess wear and use. These are the same three line items as TFS's real lease-end invoice, so use that wording.
  - **Buy out:** buyoutPrice; financed payment estimate at a simulated APR; equity.
  - **Re-lease same model:** new payment estimate from a model price table.
  - **Upgrade:** 1–2 models matched to lifestyle tags.
- Output includes the trade-offs, the assumptions, and a deadline (lease end − 30 days).

### 7.2 Insurance
- Driving score 0–100, modeled on **Toyota's real Drive Pulse** (harsh braking, fast acceleration, harsh cornering → a score out of 100 aggregated across trips), plus % miles speeding, % night miles and annual miles. Each trip gets its own score; the aggregate is a mileage-weighted average. Call it a "Drive Pulse-style score (simulated)" in the UI.
- Insurance quotes use driving data only when the **"Share with insurers" consent** is on. This mirrors Toyota's real Insurance Connect consent, which is separate from Drive Pulse itself.
- **Show downside honestly:** usage-based insurance can raise premiums (reviews report that roughly 1 in 5 Snapshot users see an increase at renewal). If a persona's score projects a higher premium, the card says so and does not recommend switching.
- Usage-based quote = basePremium × tierMultiplier(score); show the savings vs the current premium.
- Coaching: top 2 factors to improve + projected savings if improved.
- **No ZIP or demographic inputs** in the scoring.

### 7.3 Payments
- **Refinance:** current APR vs a simulated eligible APR (from a simulated credit tier) → monthly and lifetime savings, with fees.
- **Extra principal:** $X/mo → months saved, interest saved.
- **Due-date shift:** align with the payday from cash-flow data (banking consent only).
- **Autopay discount:** 0.25% APR (simulated).
- **Hardship flag:** if cash flow shows a recurring shortfall, suggest talking to a specialist (no automated action).

### 7.4 Protection
- ToyotaCare (2 yr / 25k mi): projected expiry date = whichever comes first.
- Extended service contract fit: high miles + plans to keep the car (buyout/loan).
- Tire & wheel fit: off-road share or pothole-heavy urban driving.

### 7.5 Trip insights (the "fun" layer)
- Hybrid fuel saved vs a comparable gas model (miles × MPG delta × simulated gas price).
- Destination patterns ("4 Hill Country trips this quarter").
- Vehicle-fit hooks that feed lease-end upgrade options (e.g. off-road → 4Runner TRD).
- Each insight links to a financial move when relevant. Insights are a way into a move, not a separate feed.

## 8. Data

```
/data
  personas/
    maya.json        # profile, vehicle, contract, consent, preferences seed
    garcia.json
    jordan.json
    raj.json
  trips/
    maya.trips.json  # ~90 days of trips
    ...
  cashflow/
    maya.cashflow.json
  reference/
    market-values.json   # model/year/mileage → simulated value
    model-prices.json    # lease/finance estimates for upgrade options
    insurance-tiers.json
    rates.json           # simulated APR tiers, fees
```

Trip record:
```ts
type Trip = {
  id: string; start: string; end: string;           // ISO timestamps
  miles: number; highwayPct: number; nightPct: number;
  hardBrakes: number; speedingPct: number;
  destinationCategory: "commute" | "errand" | "childcare" | "road-trip" | "trailhead" | "other";
  destinationLabel: string;                          // e.g. "Big Bend NP" (coarse, no addresses)
  lat: number; lng: number;                          // destination centroid, coarse
  path: [number, number, number][];                  // [lng, lat, secondsFromStart] for replay
  events: { t: number; type: "hard-brake" | "speeding-start" | "speeding-end"; scoreDelta: number }[];
};
```

**Routes for replay:** at generation time (not during the demo), `scripts/gen-trips.ts` fetches real road geometry between chosen start/end points from a routing API (Mapbox Directions or the OSRM demo server), assigns timestamps from a speed profile, and injects events at deliberate points. The output is committed as JSON, so the demo needs no routing calls. Keep the full `path` only for ~5 showcase trips per persona; other trips store a simplified path for the heatmap.

Start points are generic public locations (e.g. a downtown intersection), never a home address. This is a deliberate privacy choice.

**3D assets (researched, Oct 27 2026; all CC BY 4.0, which allows commercial use with credit):**

| Use | Model | Faces | Link |
|---|---|---|---|
| Maya: 2023 Camry (hero) | Toyota Camry 2020 by ItsDiyor (same generation, XV70) | 177k | https://sketchfab.com/3d-models/toyota-camry-2020-236a5a6e2fa6420fbdf641f4800cd544 |
| Garcias: 2022 RAV4 Hybrid (hero) | 2021 Toyota RAV4 Hybrid by tonielpro520 | 172k | https://sketchfab.com/3d-models/2021-toyota-rav4-hybrid-de74fe4e98004c92b1103947597d1b53 |
| Jordan: compact (hero) | 2014 Toyota Corolla E180 by armoredwave (older generation), **or switch Jordan to a 2020 Prius** by ItsDiyor (matches the Camry's style) | 84k / 180k | https://sketchfab.com/3d-models/2014-toyota-corolla-e180-eu-with-interior-36f95efb0585464cae43a25a3b3392e8 · https://sketchfab.com/3d-models/toyota-prius-2020-ad0d925cb51040798d96f166db8c7f80 |
| Raj: Tacoma (hero) | 2019 Toyota Tacoma by David_Holiday (heavy, decimate it) | 519k | https://sketchfab.com/3d-models/2019-toyota-tacoma-8bb91f037ec64151ba72279c50ce5c20 |
| Raj upgrade preview: 4Runner | 2015 Toyota 4Runner by David_Holiday (5th gen, same body as 2014–2024) | 301k | https://sketchfab.com/3d-models/2015-toyota-4runner-ba1216e61c974d0195143edaaab274fd |
| Garcias upgrade preview | Toyota Highlander 2020 by ItsDiyor (no free Grand Highlander exists; only a paid Sketchfab Store model) | 201k | https://sketchfab.com/3d-models/toyota-highlander-2020-ff144d062f244a3ebfae71bc2a41564b |
| **Map car (replay), low-poly** | Toyota Tacoma TRD by LagzDesign | 26k | https://sketchfab.com/3d-models/toyota-tacoma-trd-f13b2c73a13147a69a6d2a83f72b2505 |
| Map car (sedan), low-poly | Toyota Prius 2012 by Doz3 | 19k | https://sketchfab.com/3d-models/toyota-prius-2012-04eaf6b288cc466785365b7d985e3b29 |
| Generic fallback | Kenney Car Kit (CC0, glTF included, 40+ low-poly vehicles) | tiny | https://kenney-assets.itch.io/car-kit |

Pipeline:
1. Download the glTF/GLB from Sketchfab. A free Sketchfab account is needed; every downloadable model gets an auto-converted glTF.
2. `npx @gltf-transform/cli optimize in.glb out.glb --compress draco --texture-compress webp --simplify --simplify-ratio 0.5` → target <5 MB and ≤150k faces for hero cars, ≤30k for the map car.
3. Open the model in https://gltf.report to check scale and orientation and to find the paint material name (needed for the persona color swap).
4. Put the credits in an on-page "3D model credits" footer (author + Sketchfab link + "CC BY 4.0"), as Sketchfab's guidelines ask.

Licenses cover the 3D files, not Toyota's trademarks. Present this as a concept prototype, not an official Toyota product. Skip any model labeled NonCommercial (e.g. Ddiaz's 2023 RAV4 Hybrid) or "AI-generated" (e.g. teenlin3's RAV4 2026 / 4Runner 2025).

Generate the trips with a small seeded script (`scripts/gen-trips.ts`) driven by per-persona parameters, so the patterns are deliberate and the output is reproducible.

**State:** in-memory store (module-level map keyed by persona) for preferences, drafts, accepted moves and handoff packets. It resets on server restart, which is acceptable for the demo.

## 9. Responsible AI

1. **Deterministic math, grounded LLM** (§6.4).
2. **Explainability:** a "Why am I seeing this" panel on every recommendation (§5.3).
3. **Consent per data source:** driving/location, banking/cash flow, payment history. Turning a source off excludes it from tools, and the affected cards say "Limited: location data off".
4. **Transparency of learning:** "What I've learned" is visible and editable (§6.5).
5. **Human in the loop:** nothing runs without Accept; high-stakes moves always offer a specialist; hardship signals route to a human only.
6. **Plain-language disclaimer:** guidance, not financial advice.
7. **Data minimization:** coarse destinations only; no addresses shown; no demographic or ZIP inputs to insurance scoring.

## 10. Architecture

- **Next.js (App Router) + TypeScript + Tailwind**, deployed to Vercel.
- **3D car:** `three` + `@react-three/fiber` + `@react-three/drei` (`useGLTF`, `OrbitControls`/`CameraControls`, `ContactShadows`, `Environment`, `Html` for hotspot tooltips).
- **3D map + replay (primary: Mapbox GL JS v3, pinned to the current 3.x, e.g. 3.33.0):**
  - Style: `mapbox://styles/mapbox/standard` (3D buildings, 3D landmarks, terrain). Set `lightPreset` (`dawn` / `day` / `dusk` / `night`) from the trip's start time via `map.setConfigProperty('basemap', 'lightPreset', …)`.
  - **Car on the route: Mapbox's native `model` source + `model` layer**, not deck.gl. This follows Mapbox's official "Add 3D model and animate along route" example (https://docs.mapbox.com/mapbox-gl-js/example/add-3d-model-and-animate-along-route/):
    - each frame, sample the route (turf `distance`/`bearing`) → `modelSource.setModels({ car: { uri, position, orientation: [0, 0, bearing + 90] } })`;
    - ease the position and bearing with a `mix()` low-pass filter so turns look smooth;
    - `model-type: 'location-indicator'` + a zoom-interpolated `model-scale`;
    - feature state can drive material overrides (e.g. brake lights glow red on a hard-brake event via `model-emissive-strength` on the tail-light material).
  - **Chase cam:** the free camera API (`map.getFreeCameraOptions()` → `camera.position = MercatorCoordinate.fromLngLat(behindCarOffset, altitude)` → `camera.lookAtPoint(car)` → `map.setFreeCameraOptions(camera)`), the same pattern as the official example.
  - Route trail: a GeoJSON line with `line-trim-offset` / `line-gradient` to "draw" the traveled part, colored by event type. Custom layers on Standard need `line-emissive-strength: 1` to stay bright at dusk/night.
  - Heatmap mode (all trips): deck.gl `TripsLayer` through `MapboxOverlay`. It's the only reason to include deck.gl, so drop it if heatmap mode is cut. Store timestamps as seconds from trip start (TripsLayer uses float32, so raw epoch values lose precision).
  - React: `react-map-gl` (mapbox entry point) or a thin `useEffect` wrapper around `mapboxgl.Map`. The wrapper is simpler for the rAF-driven model/camera code.
- **Fallback: MapLibre GL JS** (no token) + OpenFreeMap or MapTiler tiles. MapLibre has no native `model` layer, so the car uses deck.gl `ScenegraphLayer`, and the chase cam uses `jumpTo({center, bearing, pitch})` each frame. Wrap both in a `ReplayMap` interface (`setCar(pos, bearing)`, `setCamera(...)`, `setLight(preset)`) so switching is a single env flag: `NEXT_PUBLIC_MAP_PROVIDER=mapbox|maplibre`.
- **Charts and motion:** Recharts for the charts; `motion` (Framer Motion) for UI transitions, card animations and number count-ups.
- Lazy-load (`next/dynamic`, `ssr: false`) the 3D car and map so the dashboard shell paints instantly.
- `/lib/engines/*`: pure functions + Vitest tests.
- `/lib/agent/*`: tool definitions, system prompt builder, grounding check.
- `/lib/store.ts`: in-memory state.
- `/app/api/agent/route.ts`: streaming tool-use loop.
- `/app/api/actions/route.ts`: accept / dismiss / edit → preference updates + handoff packets.
- `/app/(customer)/page.tsx`: dashboard + agent panel. `/app/tfs/page.tsx`: TFS Insight view.
- Env: `ANTHROPIC_API_KEY`, `AGENT_MODEL`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_MAP_PROVIDER`. A working Mapbox public token is already in `.env` as `MAPBOX` (verified Oct 27: the Standard style and vector tiles both return 200). Rename it to `NEXT_PUBLIC_MAPBOX_TOKEN` when scaffolding Next.js, because the client bundle only sees `NEXT_PUBLIC_*` vars. `.env` is git-ignored.
- **UI action channel:** agent tools that act on the UI (`open_trip_replay`, `focus_vehicle_hotspot`, `set_whatif`) are streamed to the client as typed events and handled by a small client-side store (Zustand), which the 3D components subscribe to.

**Latency plan:** precompute the engine outputs and the initial draft cards when the persona loads (one agent call, cached in memory). Chat calls are incremental. Cache the first-load drafts per persona so the demo never waits on a cold call.

## 11. Demo script (3 min)

1. **(0:00)** The problem: owners don't know their next move; TFS gets calls it could have prevented.
2. **(0:20)** Open **Maya**. The 3D Camry rotates in her color. Click the odometer hotspot; the camera flies in to show the mileage running ahead of the allowance. The agent panel already has the draft: *"Buy out your Camry, saves ~$1,120 vs returning"*. Click **Why** to show the data, the math and the assumptions.
3. **(0:55)** Chat: *"What if I drive less for the next 4 months?"*. The agent moves the lease time slider on screen, reruns the engine, and the card redrafts live.
4. **(1:15)** **Wow moment:** switch to **Raj**. The Camry drives off and the Tacoma rolls in. Open the 3D replay of his Big Bend trip in chase cam at 60×: trail miles, terrain, no overage. Different driving life, different move: upgrade to a 4Runner TRD (preview swaps it in next to the Tacoma), plus a tire & wheel tip from trail trips.
5. **(1:50)** Dismiss a card with "too expensive". "What I've learned" updates and the next draft favors a lower monthly payment.
6. **(2:15)** **Accept** the move and confirm (simulated). Jump to the **TFS view**: the handoff packet is waiting, with retention and calls-avoided metrics.
7. **(2:40)** Responsible AI recap: engines do the math, every number is grounded, consent and learned preferences are visible, a human is always available.

## 12. Team split (3 people)

| Person | Owns |
|---|---|
| **A: Frontend + 3D** | Dashboard shell, visual style, hero 3D car + hotspots, 3D ride replay, persona transition, agent panel UI |
| **B: Data + engines** | Persona JSON, trip generator **with real routes + events**, 3D model sourcing, reference tables, the 4 engines + ranking, Vitest tests; then the what-if sliders + charts |
| **C: Agent + pitch** | Tool-use loop, system prompt, grounding check, preference learning, streaming, UI action channel; then the Why panel, accept modal, TFS view, demo script + slides |

3D is the biggest load, so A focuses on it and the shell; B and C pick up the 2D interactive pieces once their core work is done.

**Interface contract (agree in hour 1):** TypeScript types for `Persona`, `Trip`, `MoveOption`, `Recommendation`, `Preferences` and `HandoffPacket` in `/lib/types.ts`. B returns engine outputs in these shapes; A renders them; C feeds them to the agent.

## 13. Timeline (~24h)

| Hours | Milestone |
|---|---|
| 0–2 | Repo scaffold, shared types, persona sketches, layout wireframe; **3D spike:** a GLB car rendering + one route animating on the Mapbox/deck.gl map (confirms the risky part works early) |
| 2–8 | Engines + seed data + generated routes (B); dashboard shell + hero car (A); agent loop with 2 tools (C) |
| 8–14 | All tools wired; agent panel live with cards; ride replay with chase cam + events (A); Why panel; accept → packet |
| 14–18 | Preference learning; what-if sliders + lease time slider; hotspots; UI action channel; TFS view; grounding check |
| 18–21 | Polish (persona transition, count-ups, lighting), precompute/cache, reduced-motion + fallbacks, persona tuning |
| 21–24 | Demo rehearsal ×3 **on the demo laptop**, slides, deploy, backup screen recording |

**Cut list if behind (in order):** upgrade preview model swap → heatmap mode → consent toggles UI → time-of-day lighting → payment due-date shift → protection engine → TFS view metrics (keep packets only). Keep the hero car and the chase-cam replay of one showcase trip per persona; those are the visual signature.

## 14. Competitive research: what exists and what we borrow

Researched Oct 27 2026.

| Product | What it does well | Gap / what we learn | What we take |
|---|---|---|---|
| **Toyota Financial Services app** | Pay, view the account, lease-end FAQ search, e-sign + buy online in select states, request a payoff quote | Reactive: the customer has to know what to ask. No personalized recommendation, no link to how they drive | Use TFS's real vocabulary (End of Lease Options, payoff quote, Excessive Wear and Use, Excessive Mileage, Disposition Fee). Our pitch: "the same options, but we tell you which one fits you, and why." |
| **Toyota app: Drive Pulse + Insurance Connect** | Driving score out of 100 from harsh braking/acceleration/cornering; tips; separate consent for sharing with insurers | Owners on forums are unsure what's collected and how to turn it off. The score is a number with no financial meaning attached | Model our synthetic telematics on Drive Pulse (realistic, and the data plausibly exists at Toyota today). Make consent **more** legible than the real app: one screen, plain-language toggles, live effect shown. Connect the score to money ("+5 pts ≈ $X/yr"). |
| **UBI apps** (Progressive Snapshot, Travelers IntelliDrive, MetLife/TrueMotion, Plymouth Rock YUBI) | Per-trip score 1–100, trip map with harsh events highlighted, star ratings, tips, streaks ("distraction-free streak"), "Fitbit for driving" framing | Snapshot's in-car beep annoys users; ~20% see rate increases → distrust | Per-trip score + event highlights on the route (our 3D replay goes further than these 2D maps); a "smooth-driving streak" chip; coaching tips with a dollar value. Show the possible downside, so there's no bait-and-switch. |
| **Lease buyout calculators** (NerdWallet, CoPilot, LeaseEnd, MiniWebtool) | Out-the-door buyout = residual + purchase option fee + sales tax, compared with KBB/Edmunds market value | Static, generic, manual inputs; ignore projected mileage; not proactive | Use the same math (credible to judges). Our advantage: prefilled from the contract, projected forward from real driving, and shown before the customer thinks to ask. |
| **Bank AI assistants** (Bank of America Erica-style proactive insights; Q2 Andi) | Proactive nudges, conversational follow-up | Industry commentary: explanations are a must-have when advice affects credit or money; start AI on low-risk actions | Proactive drafts in the agent panel; a "Why" panel on everything; the agent only drafts, a human confirms; high-stakes moves go to a specialist. |
| **3D car configurators** (three.js / r3f demos, OEM configurators) | Camera flights between points of interest, day/night lighting toggle, camera moves into the driver's seat, color swaps | Pure marketing, with no link to ownership data | Hotspot camera flights, persona paint color swap, a "sit in the driver's seat" view for the driving-score hotspot. |
| **Mapbox flight-tracking demo** (official example) | A 3D model following a route, smooth camera follow, material light animation | — | The direct technical template for the ride replay (§10). |

**Our differentiation in one line:** existing tools are either about *driving* (scores, trips) or about *money* (payoffs, calculators). Next Move Copilot connects the two and acts on them, with explanations.

**Hackathon context:** the HackTX 2026 Devpost listing (https://hacktx26.devpost.com/) confirms the TFS "What's Your Next Move?" challenge with 3 winners and the judging emphasis on retention, revenue and reduced service effort. We found no public past TFS-challenge winners to learn from.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM latency or flakiness on stage | Precomputed first drafts; template fallback cards; recorded backup video |
| LLM invents numbers | Grounding check + template fallback |
| Personas don't produce clearly different moves | Tune the persona parameters until the ranking output is unambiguous; unit-test the expected top move per persona |
| Scope creep across 4 move types | Engines are small pure functions; the cut list is defined |
| "Creepy" perception of location + banking data | Coarse destinations, consent per source, visible learned preferences, no home start points |
| 3D performance on the demo laptop / projector | Draco-compressed models, capped DPR (`dpr={[1, 1.5]}`), pause the car scene when off-screen, test on the actual demo machine and plug the laptop into power |
| 3D eats the schedule | Hour 0–2 spike; strict cut list; the dashboard works fully in 2D, so 3D is layered on, never blocking |
| Mapbox token / venue Wi-Fi | Precache tiles by running through the demo once beforehand; MapLibre fallback; backup video |
| 3D makes the app harder to use | Every 3D view has a legend, a reset button and keyboard controls; key numbers are always also in plain cards |

## 16. Open questions

- Product name and branding (avoid implying an official Toyota/TFS product; say "concept prototype").
- Whether to add the same-car/different-driver comparison as a fifth persona or as a toggle.
- Whether chat redrafts should replace cards in place or add versions (recommend: in place, with "undo").
- Stretch: voice input in the agent panel.
- ~~Licensed Toyota models?~~ Resolved: CC-BY Toyota models found (§8). Still to decide: Corolla E180 vs switching Jordan to a Prius.
- ~~Mapbox vs MapLibre?~~ Resolved: Mapbox primary, MapLibre fallback behind `NEXT_PUBLIC_MAP_PROVIDER`.
- Mapbox account: signing up without a card puts it on a **demo trial with lower caps**. Adding a card unlocks the standard free tier (~50k web map loads/month; one load covers a session of up to 12 hours, so a hackathon will never reach it). Either is fine for the demo. Use a URL-restricted public token (`localhost:3000` + the Vercel domain).
