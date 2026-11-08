# Task 02: Agent + API backend (Codex)

Read first: `.plans/tasks/README.md` (ownership, runtime rules, promised exports), `lib/types.ts` (the API payloads at the bottom are the contract), and spec §5.2–5.4 (agent panel, why, accept), §6 (agent), §9 (responsible AI), §10 (architecture).

**You own:** `lib/agent/**`, `lib/server/**`, `app/api/**`. Edit nothing else.
**Depends on task 01** (running in parallel): import `buildDashboard`, `runWhatIf`, `computeTfsMetrics` from `@/lib/engines` and the loaders from `@/lib/data`, using the exact names in README. Until they exist, put a temporary stub in `lib/server/engines-shim.ts` that re-exports from `@/lib/engines` when present. Do not write engine logic yourself. Check STATUS.md for 01's progress and switch to the real imports as soon as they land.

## Deliverables

### 1. Runtime store: `lib/server/store.ts`
In-memory (module-level, survives hot reload via `globalThis`), keyed by persona:
`preferences` (seeded from persona JSON), `consent`, `drafts`, `recommendations`, `packets`, `acceptedOptionIds`, and a cached `AgentPanelState` per persona. `resetPersona(id)` for demos.

### 2. Preference learning: `lib/server/learning.ts`
Deterministic rules from spec §6.5: accept → +0.1 to the option's dominant priority (renormalize to sum 1); dismiss `too-expensive` → +monthlyPayment; `not-now` → suppress for session; `not-relevant` → add the moveType to `suppressedMoveTypes`; style changes set detailLevel/format. Every change appends a human-readable `LearnedItem` ("You prefer lower monthly payments, from dismissing the refinance card as too expensive"). Seed driving-derived learned items from `DrivingSummary.lifestyleTags` on first load.

### 3. API routes (`app/api/**/route.ts`, Next 16 route handlers; read `node_modules/next/dist/docs/` for the current route-handler and dynamic-params API)
- `GET /api/persona/[id]` → `DashboardData` = `buildDashboard(id, store runtime)`.
- `GET /api/trips/[tripId]` → full `Trip`.
- `POST /api/whatif` (`WhatIfRequest`) → `EngineResult`.
- `POST /api/actions` (`ActionRequest`) → `ActionResponse`. Accept creates a `HandoffPacket` (customer summary, numbers from the option's `math`/`assumptions`, consented data, stated preferences) for both `self-service` and `specialist-callback`.
- `GET /api/tfs` → `TfsData`.
- `GET /api/agent/initial?personaId=` → `AgentPanelState`: top 3 ranked options → `Recommendation`s, drafted by one Claude call (below), **cached per persona** in the store so the demo never waits twice. Also warm all 4 personas in the background on the first request.
- `POST /api/agent` (`AgentChatRequest`) → `text/event-stream`; each SSE `data:` line is one JSON `AgentStreamEvent`; always end with `{type:"done"}`.
Validate every request body with zod. Return 400 on bad input, never throw HTML.

### 4. The agent: `lib/agent/*`
- **SDK:** `@anthropic-ai/sdk` 1.3 (TypeScript). Key from `ANTHROPIC_API_KEY` (set in the shell env; Next also loads `.env`).
- **Model:** `claude-opus-5-5`, `thinking: { type: "adaptive" }`, `output_config: { effort: "low" }` for chat latency (Opus 5.5 defaults to medium; low suits chat). Make model and effort env-configurable (`AGENT_MODEL`, `AGENT_EFFORT`).
- **Refusal fallback:** use `client.beta.messages.stream(...)` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`. Always check `stop_reason` (`refusal` → emit an `error` event with a friendly message; never run tools from that turn).
- **Loop:** a manual streaming loop (`client.beta.messages.stream` + `stream.on("text")` to emit `text` deltas + `await stream.finalMessage()`), handling `end_turn`, `tool_use`, `pause_turn`, `max_tokens`, `refusal`. Return **all** tool results for a turn in one user message; failed tools → `is_error: true`. `max_tokens` ~16000. Cap at ~8 iterations. Use SDK types (`Anthropic.MessageParam`, `Anthropic.Tool`, `Anthropic.ToolUseBlock`, `Anthropic.ToolResultBlockParam`); catch typed errors (`Anthropic.RateLimitError`, `Anthropic.APIError`) and don't string-match messages.
- **Tools** (spec §6.3), each with a zod-validated input; `strict: true` with `additionalProperties: false`:
  `get_customer_snapshot`, `get_driving_summary`, `get_cashflow_summary` (respects banking consent), `compute_lease_end_options`, `compute_insurance_options`, `compute_payment_options`, `compute_protection_options` (each takes optional `overrides` → `runWhatIf`), `get_trip_insights`, `rank_moves`, `create_draft` (→ `draft` event + store), `update_preference` (→ `learned` event), and UI-action tools `open_trip_replay`, `focus_vehicle_hotspot`, `set_whatif`, `open_move` (→ `ui_action` events, return `"ok"`). Emit `tool` start/done events so the UI can show activity.
- **System prompt** (`lib/agent/prompt.ts`): stable part first (role, rules: plain language; never state a number that isn't in a tool result from this conversation; recommend, never decide; offer a TFS specialist on high-stakes moves; "guidance, not financial advice"; respect consent; honor `detailLevel`/`format`), then the persona snapshot + preferences + consent. Put `cache_control` on the stable prefix.
- **Number grounding** (`lib/agent/grounding.ts`, spec §6.4): extract every `$` amount, percentage and mileage from the assistant's text; each must match (after rounding to whole dollars / one decimal) some number in this turn's tool results or the persona/dashboard data. On failure: regenerate once with a corrective system note; still failing → replace that recommendation's `why` with the option's template `summary` and set `grounded: false`. Log violations with `console.warn`. Unit-test the extractor and matcher (vitest, `lib/agent/__tests__`).
- **Initial drafts:** one call per persona that turns the top 3 ranked `MoveOption`s into `Recommendation`s (title/action/why/impactLabel/urgencyLabel) via **structured output** (`output_config.format` JSON schema, zod), then grounding. If the API key is missing or the call fails → template-only recommendations (`grounded: false`), so the UI always works offline.

### 5. Verify
- `npx tsc --noEmit`, `npx vitest run lib/agent lib/server`.
- With the shared dev server on :3000: `curl -s localhost:3000/api/persona/maya | head -c 500`; `curl -N -X POST localhost:3000/api/agent -H 'content-type: application/json' -d '{"personaId":"maya","message":"What if I drive 900 miles a month?"}'` shows text deltas, tool events, a `set_whatif` ui_action, and `done`.
- Record in STATUS.md: the endpoints that work, sample latency for `/api/agent/initial` cold vs cached, and any requests.
