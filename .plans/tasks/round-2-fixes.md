# Round 2: fixes found during integration

Same rules as `.plans/tasks/README.md`: strict file ownership; no `npm install`, `next dev` or `next build` (shared dev server on :3000); no commits; log progress under your heading in `.plans/tasks/STATUS.md` (add a "Round 2" sub-entry). Baseline commit: `db93d1a`.

## Fix A: Task 01 data + engines (Codex). Owns `data/**`, `scripts/data/**`, `lib/data/**`, `lib/engines/**`
1. **Maya's driving score reads as fake.** Today: score 100, 143-trip smooth streak, factors ≈ 0. Target: aggregate **~80–84**, a realistic streak (single digits to low teens), and 2–3 visible factors (e.g. hard braking in I-35 rush hour, some speeding on the weekend Dallas runs). Regenerate trips deterministically (seeded). Keep her showcase trip `maya-001` replay-worthy (a few events on the path). Check the other personas for the same problem (only Raj's Big Bend trip should be spotless; his overall score can be high, but not a perfect 100 streak across everything).
2. **Excess-mile rate is inconsistent.** Maya's contract says `overageRatePerMile: 0.25`, but the engine math used $0.20. Use **the contract's rate everywhere** (one source of truth; remove the special $0.20 assumption). Re-tune Maya's numbers so buyout still beats return by **~$1,000–1,300** and she is still ~4k miles over. Update the expected values in tests.
3. Keep the assumption label **"Lease starting odometer"** exactly as is (task 03's charts read it).
4. All engine tests pass and tsc is clean. Post the **new** key numbers per persona in STATUS.md (pitch team needs them).

## Fix B: Task 02 agent + API (Codex). Owns `lib/agent/**`, `lib/server/**`, `app/api/**`
1. **Recommendation `action` text is mangled**: `GET /api/agent/initial?personaId=maya` returns "Review buy out your camry se with a TFS specialist." and "Review review extended service coverage and its next steps." Fix the template-fallback builder: keep the option title's original casing ("Buy out your Camry SE"), never double a verb ("Review review"), and produce a natural one-line action (e.g. "Start a buyout quote before Jan 28", "Ask a TFS specialist about extended coverage"). Add a unit test over all four personas' fallback recommendations (no lowercased model names, no repeated first word).
2. **`impactLabel` must always be derived from the engine's own numbers** (`savingsVsBaseline` / `monthlyCost` / etc. of that option), so the card and the hero never disagree. Add a test that compares, for each persona, the dollar figure in `impactLabel` with the engine option.
3. **Offline chat must still drive the demo.** With no Anthropic credits, the template fallback for chat must still recognize mileage what-ifs ("what if I drive less", "drive 900 miles a month", "fewer miles", "less driving") → run `runWhatIf` with `monthlyMiles` (parsed number or ~900 default) → emit `ui_action set_whatif` + `open_move lease-end` + a grounded templated answer. Also handle "show the trip that hurt my score most" → `open_trip_replay` with the worst showcase trip and its worst event `t`, and "compare my lease-end options" → `open_move`. Unit-test the intent router.
4. After Fix A lands (watch STATUS.md), call `resetPersona` for all personas (or restart caches) so `/api/agent/initial` reflects the new numbers. Verify with curl against :3000.

## Fix C: Task 04 3D (Claude subagent). Owns `components/three/**`, `components/map/**`, `public/models/**`, `scripts/models/**`, `app/lab/**`
1. **Three WebGL views at once:** while `useUiStore.replay` is non-null, pause HeroCar rendering (`frameloop="never"` or equivalent) and pause/hide the TripHeatmap animation; resume on close.
2. **Mapbox road labels draw over the replay car:** fix layer ordering/slots (e.g. model layer in the `top` slot, or `showRoadLabels: false` / dimmed labels during replay) so the car is always on top.
3. Re-check the console on the real dashboard (http://localhost:3000, not just /lab) for the "synchronously unmount a root" warning when HeroCar mounts and on persona switch; fix if still present.
4. Verify with screenshots on the real dashboard: replay open over the dashboard, car on top of labels; persona switch is clean.
