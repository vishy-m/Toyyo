# Toyyo: The Walkaround

Design document for Toyyo's landing page, guided onboarding and car motion.
Written to be handed to implementing agents: **Codex owns the backend** (section 9), **Claude owns the frontend** (section 10), and the phased plan is in section 11.
Status: draft 2 (2026-11-08), revised after review by Gemini (planning) and Grok (user critique); see section 13. Owner: Vishruth.

---

## 1. Why this exists

Today the landing page (`components/story/Story.tsx`) is a scroll story around a persistent 3D car (`components/stage/CarStage.tsx`, poses in `lib/client/director.ts`). It works, but the motion has no purpose:

1. **The camera order is arbitrary.** Chapters jump: driver side (`sideWide`) → front wheel (`tiresWide`) → head-on (`frontWide`) → rear (`rearWide`). Each chapter picked the car part its copy talks about, not a path a person could walk.
2. **Chapters are not connected.** A chapter scrubs `from → to`, but nothing joins one chapter's `to` with the next chapter's `from`. At every boundary the camera eases (k = 3.4/s) straight from, say, the engine close-up to the rear view: a cut that slides.
3. **Layout and motion are unrelated.** The copy alternates right/left/right/left by fixed rule, and the car flips sides to make room. The car moves because the copy moved, not the other way round.
4. **The opener is busy.** The first screen carries the model name, a situation sentence, a recommendation, and three buttons. It explains before it attracts.

The goal: the first screen catches the eye with almost no text, and then the car **guides** the visitor through every part of Toyyo. Every camera move points at something, the copy always fills the space the car just left, and every step has something to touch.

## 2. What we learned from the references

All three references were studied from their shipped code (bundles downloaded and read) and measured live (element transforms sampled along the scroll). Numbers below are from that code, not guessed from screenshots.

### 2.1 lab.chakibmzn.com/35mm (Canon F-1, Awwwards SOTD)

Stack: Astro, three.js, GSAP + ScrollTrigger + SplitText, Lenis (wrapper `#scroll-container`, default `lerp 0.1`), cannon-es physics.

| Moment | What the code does |
|---|---|
| Camera section | Pinned for **3 viewport heights** (`start "top top"`, `end innerHeight*3 center`, `scrub: true`). Over that range the model turns **one full revolution plus a bit** (`rotation.y → 3.931 + 2π`) while it translates (`x 1, y 1, z −3`). |
| Exploded view | In the **second half** of the same timeline (`delay .5, duration .5`) each lens element slides out along the lens axis. The object opens itself up to explain itself. |
| Hand-off to interaction | `onLeave`: enable hover on parts, **auto-select one part** (`rubber_ring`) so the visitor sees what hover does, show the spec card and "Hover on a lens part". `onEnterBack` undoes it. |
| Reassembly | From `innerHeight*4` to the section end the parts scrub back together. |
| Section exit | A Sobel edge-detect pass (`uYprogress 0 → 1`) wipes the model into line art while a mask fades in; the camera "dives into" the body to reach the film. |
| Text | Never scrubbed. Lines are split, masked, revealed when visible: `yPercent 100 → 0`, `expo.out`, `0.7 s`, stagger `0.12`, delay `0.3`. Body copy: `0.6 s`, stagger `0.05`. |
| HUD | Corner brackets, live `fps`, `W×H`, a running timer, a scroll percent and a tick ruler along the bottom. |
| Play | Film canisters fall with real physics when their section reaches the top. |

Take: **one object, one continuous camera move; the object opens up to explain itself; scroll drives the 3D, time drives the text; hand the visitor an already-selected example before asking them to interact.**

### 2.2 integratedbio.com

Stack: WordPress, GSAP + ScrollTrigger + SplitText + MorphSVG, Lenis (`lerp 0.1, duration 1.2`, on the GSAP ticker, `lagSmoothing(0)`), Unicorn Studio WebGL background. Reduced motion stops Lenis entirely.

| Moment | What the code does |
|---|---|
| Hero reveal | The background opens from a point: `clipPath inset(50%) → inset(0 round 20px)`, `2 s`, `expo.inOut`, delay `0.3`. Heading lines rise `y 110% → 0`, `power2.out`, `0.8 s`, stagger `0.05`; button at `+0.4 s`. |
| Background | Pinned behind everything; while scrolling it dims (`0.875 → 0.6`) and grows (`1 → 1.2`). |
| **Pinned stepper** | Pins for `items × 1000 px` (`scrub: true`). A progress bar fills (`scaleX`), an index reads `01, 02…`. On a step change the old lines leave (`y −30`, `autoAlpha 0`, `power4.out`, `0.4 s`, stagger `0.05`) and **0.5 s later** the new ones enter (`y 30 → 0`, `power4.out`, `0.5 s`). Within a step, characters brighten `0.4 → 1` with scroll. |
| In-view reveals | `opacity 0, y 20 → 1, 0`, `0.8 s`, `power2.out`, stagger `0.05`, at `top 80%`, desktop only. |
| Cards | `expo.out`, `1 s`, stagger `0.15`; contents after `0.6 s`, stagger `0.2`. |

Take: **the pinned stepper with a progress bar, index counter, and a strict exit-then-enter rhythm. This is the onboarding skeleton.** Plus the clip-path hero reveal.

### 2.3 dg-cinema.com/en (DID Global Cinema)

Stack: Webflow IX2, jQuery, Swiper, Lenis 1.0.23 (`lerp 0.1, wheelMultiplier 0.7`, `smoothTouch false`). Measured: 47 scroll-into-view interactions, 2 page-start, 9 click.

| Moment | What the code does |
|---|---|
| Preloader | Scrolling is **locked** while a counter runs `0 → 100%` in exactly `1.5 s`, then unlocked. |
| Hero frame | Viewfinder brackets frame the page; the photo window grows from `0` to full over `1.5 s`. A `3 . 2 . 1 . 0 . 1 . 2 . 3` slate counts; a live clock runs in the corner. |
| Film strip | An endless photo strip (`speed 5000`, linear); keeps drifting at a constant rate while you scroll. |
| Reveals | `opacity 0 → 1`, `y ≈ 10 px → 0`, `500 ms`, `easeOut`, as each enters. Label first, heading next, body last (≈ 150 px of scroll apart). |
| Image pairs | Side images slide toward the centre (`±10 rem → 0`, `500 ms`); art images settle `x −3 rem → 0` over `1.5 s`. |

Take: **cinematic framing (brackets, slate, live readouts); a short intro; small, consistent reveal distances (10 px), not big flying text.**

### 2.4 Shared patterns

* Lenis at `lerp 0.1` everywhere; DG also slows the wheel (`0.7`).
* 3D and pinned sections are **scrubbed**; text is **time-based**.
* Reveals are short and small: `y 10 to 30 px` or a masked line rise, `0.5 to 0.8 s`, ease-out, stagger `0.05`.
* A HUD/frame layer that reports progress.
* One thing moves at a time; everything else holds still.

## 3. Principles

**P1. The car is the guide, and it walks one path.** Every shot is a point on one continuous camera path around the car (section 5). No step starts anywhere the previous one did not end. Going forward always moves the camera the same way round the car.

**P2. Copy follows the car into the space it left.** The car owns part of the screen and the copy owns the rest. When the car moves to a new place, the copy enters from the side the car is moving **away from**, travelling in the **same direction**, about 120 ms behind, as if the camera panned across both. The car changes place **only when the act changes** (section 4), never between steps inside an act.

**P3. Motion leads, text follows.** In each step the camera travels, arrives, and holds. The callout line draws to the hotspot on arrival; the copy enters 250 ms later. On leaving, the copy exits first (0.4 s), then the camera moves.

**P4. Scroll scrubs the car; time animates the text.** Camera and car are scrubbed by scroll (reversible, exact). Copy reveals are triggered by step changes and run on their own clock, so text is never half-visible because someone stopped scrolling.

**P5. Every move points at something.** Each step has a hotspot or a map, and a callout. If the camera moves and nothing new is pointed at, the move is cut.

**P6. Every step has one real decision to touch.** The control changes a number the visitor cares about (dollars, miles, points, a verdict), arrives already set to a working example (35mm's auto-select), and its result shows in the HUD readout. No hover-only effects, no settings switches dressed up as features.

**P7. Progress is always visible, and so is the exit.** The HUD shows where you are, what is left, and how to leave (section 7). Ticks are named after decisions, not camera positions.

**P8. Quiet first, and never hold the visitor hostage.** The hero has a wordmark, one line, one button. The intro can be skipped by any scroll, key, or click.

**P9. Reduced motion is a first-class path.** No Lenis, no scrubbing; steps cut between still poses with a 200 ms crossfade; text appears without movement; the stepper becomes Next/Back buttons.

## 4. Structure: four compositions, three changes

```
/   Act I    Hero                               car RIGHT,  copy LEFT (wordmark, line, button)
    Act II   Alongside (pinned stepper)         car LEFT,   copy RIGHT column
               S1 Driver    front quarter
               S2 Driving   front wheel     (score + insurance price)
               S3 Lease     driver door
    Act III  From above (same stepper)          car CENTRE, copy in a BOTTOM band
               S4 Trips     overhead, trips drawn on the ground
               S5 Repair    over the hood
               S6 Your move front, low, the upgrade parked beside it
    → enter the app
/moves /finances /driving /repair               car RIGHT (parked), content LEFT
```

The car changes place exactly three times, each at an act change: right → left (hero to S1), left → centre (S3 to S4, as the camera rises over the roof), centre → right (finale to the app). Each change follows P2:

| Change | Car moves | Copy enters from | Copy travels |
|---|---|---|---|
| Hero → S1 | right → left | right edge | leftward |
| S3 → S4 | left → centre, and up | bottom | upward |
| S6 → app | centre → right | left edge | rightward |

* First visit: `/` plays the hero intro, then the stepper.
* Returning visitor who finished or skipped: `/` shows the hero; its one button reads "Open my dashboard", and a quiet link reads "Walk around again".
* The existing Guided tour / Summary switch is removed. Summary's content already lives on the Moves page.
* `?tour=1` forces the Walkaround (demos).

## 5. The path

Coordinates: car at the origin, nose toward +Z, driver side +X (as in `director.ts`). The camera walks **from the front, down the driver side toward the rear, rises over the roof, and comes down over the hood to the front.** One loop, one direction, the order a technician walks a car.

```
                      S4 overhead
                    ↗            ↘
     W1 rear quarter, rising       S5 over the hood
              ↑                        ↓
          S3 driver door           S6 front, low (your move)
              ↑
          S2 front wheel
              ↑
          S1 front quarter, pulled back
              ↑
          Hero: front quarter, close
```

Why the car sits on the left during Act II: with the camera on the +X side looking at the car, screen-right is the car's rear (−Z). Walking toward the rear moves the car leftward on screen. The layout matches what the walk physically produces.

### 5.1 Stations and waypoints

Poses are starting values for tuning (format as `Pose` in `director.ts`; `offset` is the car's screen position, negative x = left, positive y = up). **Only these offsets apply to the Walkaround**; the legacy shots in `director.ts` (`tiresWide` etc.) are retired with the old story.

| # | Tick label | eye | target | fov | offset | Hotspot | Scroll (travel + hold) | HUD readout |
|---|---|---|---|---|---|---|---|---|
| H | (none) | 7.3, 2.4, 8.4 | 0, 0.62, 0 | 29 | +0.20, −0.02 | none | 100 vh | intro gauge, then empty |
| S1 | Driver | 9.6, 2.3, 5.2 | 0, 0.65, 0 | 30 | −0.22, 0 | none | 80 + 90 | driver name |
| S2 | Driving | 6.1, 1.2, 5.9 | 0.9, 0.38, 1.35 | 30 | −0.24, 0 | tires | 40 + 150 | score → monthly premium |
| S3 | Lease | 7.0, 3.6, 1.8 | 0.25, 1.0, 0.55 | 30 | −0.24, 0 | odometer | 40 + 150 | miles at lease end |
| W1 | (waypoint) | 7.0, 4.8, −7.2 | 0, 0.7, 0 | 29 | (blend) | none | part of S4 travel | |
| S4 | Trips | 0.8, 17.5, −1.5 | 0, 0, 0 | 28 | 0, +0.12 | none (ground map) | 70 + 90 | trips, 90 days |
| S5 | Repair | 0.6, 5.2, 7.6 | 0, 0.75, 1.4 | 30 | 0, +0.14 | engine | 50 + 150 | verdict |
| S6 | Your move | 0, 1.3, 10.5 | 0, 0.75, 0 | 27 | 0, +0.10 | none | 50 + 100 | payment delta |

Travel is long only for the first move (so the path reads) and the rise over the roof (the big change); every other travel is short. Hold length follows the control: a click needs about 90 vh, a slider about 150 vh. Total ≈ 1,250 vh including the hero.

On phones (portrait): the car sits in the top 45 % and the copy in a bottom sheet for all acts; act changes resize the sheet instead of swapping sides (Act II sheet 55 %, Act III sheet 40 % so the map and the car have room). Every hold is 100 vh.

### 5.2 Camera mechanics

* **Splines, not lerps.** One `THREE.CatmullRomCurve3` (`centripetal`) through all `eye` points including W1, and one through all `target` points. W1 exists so the curve rises behind the car and over the roof: a direct S3 → S4 lerp would pass through the cabin. `fov`, `offset`, `yaw` interpolate per segment with smoothstep.
* **One scroll source.** Lenis drives the native window scroll; a single `tourProgress` MotionValue is updated from Lenis's `scroll` event and read by both the DOM (stepper, HUD) and `useFrame` (camera). Nothing else measures the scroll.
* **Travel and hold.** Within a station, the curve parameter moves during the travel (`easeInOutCubic`) and holds still for the hold.
* **Damping** stays in `CarStage` (k = 3.4/s), so scrubbing still feels weighted.
* **Snap, with a direction and a lockout.** When scrolling stops for 180 ms inside a travel segment, Lenis scrolls **in the direction of the last flick** to the next hold start (`duration 0.9`, `easeInOutQuart`); if the last movement was smaller than 4 % of the segment, it stays put. While a snap runs, an `isSnapping` flag ignores the scroll events it generates, and any user wheel/touch cancels it.
* **Idle life.** At a hold, the car breathes: ±0.6° yaw drift plus pointer parallax (existing). The turntable spin belongs to the hero only and stops the moment the stepper starts.
* **Render cost.** Keep `frameloop="always"` while the stage is visible (the idle drift needs it), pause when hidden or when a replay overlay is open (existing). Cap DPR at 1.5 on phones.

### 5.3 Hero intro (time-based, runs once per visit, skippable)

| t (s) | What happens | From |
|---|---|---|
| 0.0 | Black stage, HUD brackets at the centre. A tachometer-style gauge sweeps `0 → redline → idle` (an engine start, not a number the visitor needs to read). `Skip` is visible. | DG preloader |
| 0.9 | The stage opens from the centre: `clip-path inset(50%) → inset(0 round 20px)`, 1.6 s, `expo.inOut`; the brackets ride out to the corners with it. | IB hero |
| 1.0 | The car rolls in from −Z with wheels spinning (existing "in" phase, 1.1 s), headlights on. | existing |
| 2.0 | Wordmark letters rise in a mask: `yPercent 100 → 0`, 0.7 s, `expo.out`, stagger 0.05. The line follows (0.6 s). | 35mm titles |
| 2.4 | Button fades up 10 px, 0.5 s. Turntable starts (0.06 rad/s). Scroll cue appears. | DG |

Any wheel, touch, key or click before 2.4 s jumps straight to the end state. Scroll is never locked for more than this sequence, and never under reduced motion.

Hero copy, all of it:

> **Toyyo**
> The one money move your car needs.
> [ See my next move ]

## 6. The stations

Act II copy is a 440 px column on the right; Act III copy is a bottom band (a 12-column grid: heading and figure on the left, the control in the middle, the link on the right). Each station has: a small label, a heading (one sentence, ≤ 9 words, the number **is** the point), one key figure, one control, one link into the app.

Copy rhythm (IB): exit `y −30`, 0.4 s, `power4.out`, stagger 0.05 → 0.25 s gap → enter `y 30 → 0`, 0.5 s, `power4.out`, stagger 0.05. The heading does not animate after it has entered; during the hold the **key figure** brightens from 0.5 to 1.

All stations read and write one shared store, `useTourStore` (zustand, like the existing stores): `personaId`, `consent`, `driving.fixedFactor`, `lease.monthlyMiles`, `repair.problem`, `repair.estimate`. Stations can be reached in any order (ticks, keys, back-scroll), so no station assumes another was visited; each has its own default.

### S1 Driver

* **Decision:** whose car this is.
* **Control:** four cards, each with name, car, and its stake in one line ("Lease, 3,100 miles over", "Loan, 18 months left", …). Clicking one swaps the car with the existing drive-off / roll-in (0.8 s out, 1.1 s in) and repaints it. Keys `1` to `4`. The first persona is pre-selected.
* **Heading:** "Choose the driver these numbers belong to."
* **Readout:** driver name.
* **Data:** personas (exists), stake line from B1.

### S2 Driving

* **Decision:** what to fix in your driving, and what it is worth.
* **Control:** the factor rows are the control. Pick one (Braking, Acceleration, Night miles…); the score rises by that factor's impact and the price row updates. Pre-selected: the worst factor.
* **Price row (insurance folded in here):** three filled prices: today's premium, usage-based at today's score, usage-based with the chosen fix. Clicking one sets the HUD readout. Under the usage-based price, one line: "Uses your driving data. Turn off" (the consent switch; off greys the two usage-based prices with the reason).
* **Heading:** "Hard braking costs you the most points." (persona-specific from B1)
* **Hotspot:** tires, callout shows the score.
* **Data:** `drivingFacts`, `insuranceFacts`, what-if `scoreImprovement` grid (B2).

### S3 Lease

* **Decision:** what your mileage will cost at lease end (payoff timing for loans).
* **Control:** a miles-per-month slider (500 to 2,500) in the copy column (no 3D drag). The HUD odometer rolls, the allowance bar fills, the overage dollars update. Pre-set to the persona's real pace. Loans: an extra-principal slider (0 to 300) moves the payoff date instead.
* **Heading:** "At this pace you'll finish 3,100 miles over."
* **Hotspot:** odometer.
* **Data:** `contractFacts`, what-if `monthlyMiles` / `extraPrincipal` grids (B2).

### S4 Trips

* **Decision:** which driving actually drives the bill.
* **Scene:** the camera has risen over the roof; the car sits small at the centre; the last 90 days of trips are drawn as lines on the ground around it (three.js lines from B4's local coordinates: no map tiles in the stage). Line brightness = how often the route is driven.
* **Control:** click a trip line (or `Tab` through the top 5). The camera stays put; the line highlights, and the readout shows that trip's miles against the monthly allowance and the points it cost. Pre-selected: the most frequent route.
* **Heading:** "The morning I-35 commute is your bill."
* **Link:** "Replay any trip" → `/driving` (full map replay lives there).
* **Data:** B4 trips overview.

### S5 Repair

* **Decision:** repair or replace.
* **Scene:** the camera comes down over the hood. On arrival, once, over 0.4 s, the body's paint fades to a translucent "ghost" (a material swap on the body meshes: low opacity, desaturated), while the engine area stays solid. It then holds still; nothing animates while the visitor drags.
* **Control:** problem chips (Brakes / Transmission / AC / Battery) move the hotspot to that area; an estimate slider ($300 to $6,000) flips the verdict between "Repair it" and "Time to replace", with the break-even point marked on the track. Pre-set: Transmission, $2,400.
* **Heading:** "A $2,400 transmission repair beats a new car."
* **Hotspot:** engine (moves per chip; anchors added in `CarModel` for brakes and battery if missing).
* **Data:** B5 verdict grid; protection cost shown under the verdict as a single line.

### S6 Your move

* **Decision:** do the move.
* **Scene:** the camera settles low at the front; the recommended car rolls in and parks beside this one (existing preview), with the **payment delta** between them under each car.
* **Heading:** the move itself, e.g. "Return the lease early."
* **Control:** one primary button, "Start this move" (opens the existing accept flow). A quiet link: "See every option" (`/moves`). The copilot stays available from the shell's Ask button as it is everywhere else.
* **Exit:** "Open my dashboard" (or the end of the scroll) moves the car to the right and the app's content enters from the left (P2).

## 7. HUD

A fixed layer above the canvas, pointer-transparent except its controls. Cinematic (DG viewfinder, 35mm readouts), but every readout is a car instrument:

* **Corner brackets** (1 px, 18 px arms). During the intro they start at the centre and ride out with the clip-path.
* **Top left:** `TOYYO` and the step: `03 / 06 Lease`.
* **Bottom:** a tick ruler (one tick per 10 % of the tour, a long labelled tick per station: Driver, Driving, Lease, Trips, Repair, Your move) with a filled progress bar (`scaleX`). Labels are buttons: click to travel there (Lenis `scrollTo`, 1.2 s, `easeInOutQuart`).
* **Bottom right:** the station readout in tabular mono figures; it rolls between values.
* **Top right:** `Skip`, always visible, including during the intro.
* **Keys:** `←/→` or `J/K` move one station; `1` to `4` pick a driver on S1; `Esc` skips.

Type: the existing display face for headings; a mono face for the HUD only. Brackets and ticks in `--ink-3`; the active tick and progress fill in `--accent`.

## 8. Motion spec (single source of truth)

| Token | Value | Use |
|---|---|---|
| `scroll.lerp` | 0.1 | Lenis |
| `scroll.wheelMultiplier` | 0.8 | Lenis |
| `station.*` | see 5.1 | stepper lengths |
| `camera.ease` | `easeInOutCubic` over the travel | scrubbed |
| `camera.damping` | k = 3.4 /s | `CarStage` |
| `copy.exit` | `y −30`, opacity 0, 0.4 s, `power4.out`, stagger 0.05 | step change |
| `copy.gap` | 0.25 s | step change |
| `copy.enter` | `y 30 → 0`, opacity, 0.5 s, `power4.out`, stagger 0.05 | step change |
| `copy.follow` | `±40 px → 0` in the car's direction, +120 ms after the car starts | act change only |
| `figure.hold` | opacity 0.5 → 1 across the hold | key figure |
| `title.enter` | masked `yPercent 100 → 0`, 0.7 s, `expo.out`, stagger 0.05 | hero wordmark |
| `reveal.small` | `y 10 → 0`, opacity, 0.5 s, ease-out | buttons, labels |
| `stage.open` | `inset(50%) → inset(0 round 20px)`, 1.6 s, `expo.inOut` | hero intro |
| `callout.draw` | line scales 0 → 1, 0.35 s, on arrival | hotspots |
| `ghost.in` | body opacity 1 → 0.18, 0.4 s, once on arrival at S5 | repair |
| `snap` | idle 180 ms, last-flick direction, min 4 %, 0.9 s, `easeInOutQuart` | stepper |
| `reduced` | cuts + 200 ms crossfade; no Lenis | everything |

Implementation: Lenis (new dependency, `lenis@1.3.x`). Keep `motion` (already used) for text and DOM; no GSAP. Line splitting: a small `SplitLines` component (measure line breaks with a `Range` on resize).

## 9. Backend (Codex)

The frontend must never wait on the network while the visitor drags. The backend's job: serve station content in one request, precompute slider results, remember where the visitor is.

**B1. Tour payload.** `GET /api/tour?personaId=maya` → `TourPayload`:
```ts
type StationId = "driver" | "driving" | "lease" | "trips" | "repair" | "move";
interface TourPayload {
  personaId: string;
  personas: Array<{ id: string; name: string; car: string; stake: string }>; // S1 cards
  stations: Array<{
    id: StationId;
    tick: string;              // "Lease"
    heading: string;           // one sentence, ≤ 9 words, persona-specific
    figure?: { value: number; unit?: string; caption: string };
    hudReadout: { label: string; value: number; format: "miles" | "usd" | "score" | "count" | "text"; text?: string };
    callout?: { hotspot: Hotspot; text: string };
    link: { href: string; label: string };
    defaults: Record<string, number | string>; // pre-set control values (worst factor, real pace, …)
    available: boolean;        // false when consent hides it
    unavailableReason?: string;
  }>;
}
```
Move the persona-specific copy logic out of `components/story/facts.ts` into `lib/engines/tour.ts` (pure, unit tested); the route and any client code both use it. Zod-validate the query; 404 for unknown personas. Headings must pass a length check (≤ 9 words) in tests.

**B2. What-if grids.** `POST /api/whatif/grid`, body `{ personaId, moveType, control, min, max, step }` → `{ control, values: number[], results: Array<{ value: number; headline: number; optionIds: string[]; deltas: Record<string, number> }> }`. One request per control on station entry; sliders then read the grid locally. Controls: `monthlyMiles` (500 to 2500, step 100), `extraPrincipal` (0 to 300, step 25), `scoreImprovement` (0 to 20, step 1; S2 maps a chosen factor to its impact and looks it up). Reuse the engines behind `/api/whatif`. At most 101 points per grid; cache by `(personaId, consentHash, moveType, control, min, max, step)` in a small in-memory LRU. Target under 40 ms server time per grid.

**B3. Onboarding state.** `GET /api/onboarding` and `PUT /api/onboarding` with `{ personaId?, consent?, lastStation?, completedAt?, skippedAt? }`. Stored in an httpOnly, `SameSite=Lax`, signed cookie (`toyyo_onboarding`, HMAC-SHA256 with `ONBOARDING_SECRET`, 180 days); no database. Verification is constant-time and wrapped so any bad or tampered cookie reads as "no state" (never throws). The `/` server component reads it to choose the hero button and the starting persona with no flash. Slider values are **not** persisted; only persona, consent, last station, completion. Dev fallback secret with a console warning when `ONBOARDING_SECRET` is unset.

**B4. Trips overview.** `GET /api/trips?personaId=` → `{ origin: { lat, lng }, trips: Array<{ id; points: [x: number, z: number][]; miles; startedAt; scoreDelta; routeKey; count }> }`. Points are local metres from `origin`, projected (equirectangular is fine at city scale), scaled so the bounding box fits a 12 m square around the car, simplified (Douglas-Peucker, ≤ 200 points per trip, ≤ 60 trips). `routeKey`/`count` group repeated routes so the UI can brighten frequent ones and pre-select the most frequent.

**B5. Repair verdict.** `POST /api/repair/verdict` wrapping `analyzeRepairDecision` → `{ verdict: "repair" | "replace"; breakEven: number; reason: string; protectionMonthly?: number }`, plus a grid form `{ problem, min: 300, max: 6000, step: 100 }` → verdict per estimate, so the slider is local.

**B6. Types, tests, docs.** New shapes in `lib/types.ts`; Zod schemas beside the routes; unit tests for `tour.ts`, the grid builder, trip projection/simplification, and the cookie signer (existing `__tests__` folders); route tests for 400/404 and a tampered cookie. No new runtime dependencies.

Codex does not touch `components/`, `app/(dashboard)/` pages, or `lib/client/director.ts`.

## 10. Frontend (Claude)

| Task | Summary |
|---|---|
| F1 | Lenis provider in the dashboard shell (off under reduced motion); one `tourProgress` MotionValue fed by Lenis's `scroll` event. |
| F2 | `lib/client/path.ts`: eye/target splines from the station table (with W1); `useTourProgress()` → `{ station, u, inHold, act }`; the director samples the path instead of blending shot pairs. |
| F3 | `components/tour/Walkaround.tsx`: the pinned stepper (exit/enter rhythm, snap with lockout, keys). Replaces `Tour` in `Story.tsx`; `Summary` and the mode switch go. |
| F4 | `components/tour/Hud.tsx`: brackets, step label, tick ruler with named ticks and progress, readout, skip. |
| F5 | `components/tour/HeroIntro.tsx`: the skippable intro (5.3) and the quiet hero. |
| F6 | `useTourStore` and the station widgets S1 to S6, reading B1/B2/B5. |
| F7 | S5 ghost material swap and any missing hotspot anchors (brakes, battery) in `CarModel`. |
| F8 | S4 ground lines from B4 (drei `<Line>`), brightness by frequency, click/Tab selection. |
| F9 | App pages reuse station poses: Moves = S1, Finances = S3, Driving = S4, Repair = S5, all with the car parked right (offset +0.25), so page changes walk the same loop. |
| F10 | Phones: top 45 % car, bottom sheet, act changes resize the sheet; 100 vh holds; DPR cap 1.5. |
| F11 | Reduced-motion path (P9), keyboard access, focus order; Lighthouse performance ≥ 85 on `/`. |

## 11. Build plan

Each phase ends with something runnable. Codex and Claude run in parallel where marked.

| Phase | Codex (backend) | Claude (frontend) | Done when |
|---|---|---|---|
| 1 | B1 tour payload + `tour.ts` + tests | F1 Lenis + `tourProgress`; F2 path with W1 | `/api/tour?personaId=maya` returns valid JSON; a debug page scrubs the camera along the loop with no jumps (acceptance 1). |
| 2 | B2 grids, B5 verdict | F3 stepper, F4 HUD, F5 hero intro (with B1 fixtures until merged) | Full scroll from hero to S6 with copy rhythm, snap, ticks, skip. |
| 3 | B3 onboarding cookie, B4 trips | F6 station widgets on live B1/B2/B5 | Every control pre-set and live; no network on drag. |
| 4 | B6 hardening, route tests | F7 ghost, F8 ground lines, F9 app poses | S4 and S5 scenes complete; app pages share the loop. |
| 5 | Review support | F10 phones, F11 reduced motion, perf | Acceptance criteria pass on desktop and a phone. |

Interfaces are agreed up front (section 9 types) so Claude builds against fixtures while Codex builds the routes.

## 12. Acceptance criteria

1. From the hero to S6 the camera never jumps: logging the camera eye per frame while scrolling at constant speed shows no frame-to-frame step over 0.25 m, and the eye never enters the car's bounding box.
2. The car's screen position changes region exactly three times (hero → S1, S3 → S4, S6 → app); within an act it stays in its region.
3. Every station has a hotspot callout or the ground map, and a control pre-set to a working example on arrival; its result shows in the HUD readout.
4. The hero shows only the wordmark, one line, one button (plus HUD); any input during the intro skips to its end.
5. Controls update within one frame (no network on drag).
6. Reduced motion: no scroll-linked animation; every station reachable with Next/Back.
7. A returning visitor's `/` renders the right persona and button on the server (no flash); a tampered cookie is ignored.
8. Back-scrolling reverses scrubbed motion exactly and re-enters copy from the top.

## 13. Review log

Draft 1 was reviewed by Gemini (`gemini-3.5-flash-lite`; planning, risks, gaps) and Grok (user-centred critique, copy). Changes in draft 2:

* **Stations cut from 6 + finale to 6 total.** The insurance station repeated the driving station's punchline and the "rear bumper" had nothing to do with a premium (Grok). Insurance prices now sit in S2 as filled numbers; consent is one line under them.
* **Acts regrouped.** Three side views in a row read as one long profile (Grok). Act II keeps three side stations; the overhead, hood, and final move form Act III with the car centred and copy in a bottom band.
* **P2 corrected.** Draft 1 said copy enters "from the side the car is travelling toward". That contradicts the intended feel; copy now follows the car into the space it left.
* **Weak interactions replaced (Grok):** hover-to-glow tires → choose the factor to fix; camera fly-along on a trip → click a line, camera stays, readout explains it; continuous x-ray → one 0.4 s ghost on arrival; three finale buttons → one "Start this move" plus a quiet link.
* **Ticks named by decision** (Driver, Driving, Lease…), not camera position (Grok).
* **Intro shortened and skippable;** the gauge no longer counts a mileage the visitor has not been introduced to (Grok).
* **Variable scroll lengths:** long travel only where the picture changes (Grok).
* **Snap gets a direction and a lockout** (Grok, Gemini).
* **W1 waypoint** so the spline arcs over the roof (Gemini).
* **One scroll source** (`tourProgress` from Lenis) for DOM and `useFrame` (Gemini).
* **Shared `useTourStore`;** stations reachable in any order (Gemini).
* **S4 draws trip lines in three.js** from local coordinates instead of map tiles (Gemini); the full map replay stays on `/driving`.
* **S5 ghost is a material swap,** not a Sobel post-processing pass (Gemini).
* **Cookie verification never throws** (Gemini).
* **Not taken:** replacing the spline with piecewise blends (Gemini). Piecewise blends are what produce today's sliding cuts; `CatmullRomCurve3` is a few lines of three.js.

## 14. Open questions

1. Persona-specific hero line, or one line for everyone? (Draft: one line for everyone.)
2. Keep `/tfs` (staff view) out of the Walkaround? (Draft: yes, footer link only.)
3. Should "Start this move" in S6 require the visitor to have finished every station? (Draft: no.)
