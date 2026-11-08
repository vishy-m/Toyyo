# Task 03: Dashboard + agent panel UI (Claude subagent)

Read first: `.plans/tasks/README.md` (ownership, runtime rules, integration seams), `lib/types.ts`, `lib/client/ui-store.ts`, and spec §5 (all of it: layout, agent panel, Why panel, accept flow, 3D/interactive layer, TFS view), §11 (demo script), §14 (what we borrow from competitors).

**You own:** `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/tfs/**`, `components/dashboard/**`, `components/agent/**`, `components/ui/**`, `lib/client/**` (not `ui-store.ts`), `lib/mock/**`. Edit nothing else.

## Design direction (spec §5.5.4)
Premium dark "showroom": near-black background, glassy panels, generous spacing, Toyota red `#EB0A1E` **only** as an accent; light mode via `prefers-color-scheme` plus a toggle. Distinctive type (pick a refined display face plus a clean UI face via `next/font/google`). Spring motion with `motion` 14 (150–400 ms UI, count-up numbers), nothing gratuitous. Respect `prefers-reduced-motion` (set `useUiStore.reducedMotion`). Large tap targets, visible focus states, keyboard reachable. Must be easy to use: the user should understand the screen in 5 seconds. It's a concept prototype: use no Toyota logos; put "Concept prototype · synthetic data" in the footer.

## Deliverables

### 1. Data layer: `lib/client/api.ts` + `lib/mock/*`
- Typed fetchers for every endpoint in `lib/types.ts` (`getDashboard`, `getTrip`, `getAgentInitial`, `streamAgent` (SSE parser that yields `AgentStreamEvent`s), `postAction`, `postWhatIf`, `getTfs`).
- **Mocks** in `lib/mock/` for all four personas (realistic numbers from spec §4; Maya's buyout saves ~$1,120, etc.), including one mock `Trip` with a ~200-point path near Austin for task 04 to use. Behavior: try the real API; on network/404/5xx fall back to mocks (log once). `NEXT_PUBLIC_USE_MOCKS=1` forces mocks. When tasks 01/02 land (watch STATUS.md), confirm the real data renders.
- A mock `streamAgent` that simulates text deltas, a tool event, and a `ui_action`, so the panel can be built before the backend exists.

### 2. Page shell: `app/layout.tsx`, `app/page.tsx`, `components/dashboard/*`
Layout from spec §5.1: top bar (persona switcher with avatar + one-line situation, "TFS view" link, theme toggle); main dashboard (left/center); **agent panel** on the right (collapsible; becomes a bottom sheet under 1024px). Sections:
- **Vehicle card**: hosts `<HeroCar vehicle=… upgradePreview=…/>` from task 04 via `next/dynamic(() => import("@/components/three/HeroCar"), { ssr: false, loading: <skeleton/> })`. Until 04's file exists, render a placeholder in `components/dashboard/HeroCarSlot.tsx` that switches to the dynamic import when the file is present (coordinate via STATUS.md). Below it: model, odometer, contract summary.
- **Contract card**: lease/loan status, months-left ring, payment, mileage vs allowance bar.
- **Driving life**: trip list (filters: worst score / longest / road trips) + `<TripHeatmap/>` from task 04 (same dynamic-import pattern) + driving score gauge with factors + smooth-streak chip + "Replay" buttons that call `useUiStore.openReplay`. When `replay` is set, show `<RideReplay trip=… onClose=…/>` (04) as a large overlay/modal; you fetch the full `Trip` via `getTrip`.
- **Money**: payment history sparkline, cash flow (or "Limited: banking data off" when `cashflow === null`), insurance cost.
- **Next-move tiles**: Lease · Insurance · Payment · Protection. Each opens a **move detail drawer** (`useUiStore.openMove`) with the option comparison cards side by side (recommended one glows), trade-offs on hover, and **what-if controls** (monthly miles slider, lease months-ahead time slider with an animated projected-vs-allowance chart (Recharts), extra principal, due-day picker, score-improvement slider) bound to `useUiStore.whatIf` → debounced `postWhatIf` → animated numbers. Agent `set_whatif` actions move these same sliders, so the user sees what the agent changed.
- Small "✨ Ask" buttons on widgets → `useUiStore.askAgent({widget})`.
- **Persona switch**: `setPersona` + refetch; numbers count to new values; (04 handles the car drive-off/roll-in).
- **Consent sheet** (header button "Your data"): plain-language toggles for driving / banking / payment history / share with insurers → `postAction set_consent` → refetch; affected cards show the "Limited" state.

### 3. Agent panel: `components/agent/*` (spec §5.2–5.4)
- Opens with `getAgentInitial` (skeletons while loading). Sections: **Your next move** (top 1–3 `Recommendation` cards), **Drafts**, **What I've learned** (deletable chips → `delete_learned`), **Chat**.
- Recommendation card: title, one-line action, impact chip, urgency chip, buttons **Accept**, **Edit** (prefills chat "Adjust this: …"), **Dismiss** (reason chips: too expensive / not now / not relevant / already done → `dismiss`), **Why?**
- **Why panel** (drawer): built from the matching `MoveOption` in `DashboardData.engines` (data used, math, assumptions, trade-offs, confidence) + footer "Guidance, not financial advice · Talk to a TFS specialist". Show a small "✓ numbers verified" badge when `grounded`.
- **Accept flow**: confirmation modal with a pre-filled summary → for `highStakes` options both "Do it myself" and "Have a specialist call me" → `accept` → success state + chip flies into a "Next steps" tray; the returned `HandoffPacket` is visible in the TFS view.
- **Chat**: streams `streamAgent`; renders text deltas (markdown), tool activity ("Running lease-end numbers…"), drafts and learned items inline; `ui_action` events → `useUiStore.dispatchUiAction`. Includes `agentContext` when the user came from an "Ask" button. Suggested prompts as chips ("What if I drive less?", "Show the trip that hurt my score most", "Compare my lease-end options").
- Style controls (detail level: brief / standard / show math; format) → `set_style`.

### 4. TFS Insight view: `app/tfs/page.tsx` (spec §5.6)
Table/cards per persona: recommended move, accepted (live), retention likelihood, projected value, calls avoided, open packets; click a packet to open its full contents; assumptions box. Clean, "internal tool" feel, sharing the design tokens.

### 5. Verify
- `npx tsc --noEmit` clean for your files.
- Screenshot http://localhost:3000 and http://localhost:3000/tfs (dark and light, 1440px and 390px wide). Use the in-app browser (`superset browser open/screenshot`, workspace `$SUPERSET_WORKSPACE_ID`, always `--target new-tab`) or a headless tool if available. Fix anything ugly, cramped, or overlapping. Check the browser console for errors.
- Walk the demo script (spec §11) end to end on mocks, then on the real API once 01/02 are ready.
- STATUS.md entry: what works, screenshots taken, and requests (e.g. to 04 for prop changes, to 02 for payload gaps).
