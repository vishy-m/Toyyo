# Toyyo integration roadmap and environment verification

Date: 2026-11-08. Repository: https://github.com/vishy-m/Toyyo.git. Local clone: `/Users/advaith/Documents/ChatGPT/Hackutd-26/Toyyo`. Inspected branch: `main`. Commit: `77d5d7fefa22460bdb29b71692228d40d4c79246`.

## Completed scope

Cloned the official baseline; inspected routes, UI/state, engines, API, AI, fixtures, maps/models, tests and build configuration. Preserved 26 original package files at `../../reference_materials/Toyota_FutureProof_Codex_Package/`, with SHA256 byte parity verified. Original Downloads package, earlier plan, workspace skills, unrelated project, Toyyo source and tracked configuration remain unchanged. No commits, pushes, PRs, new components, services, agent implementation, financial logic or deployment changes were made.

Created the five requested documents here: PRD_UPDATED, ARCHITECTURE_UPDATED, FEATURE_GAP_ANALYSIS, IMPLEMENTATION_PLAN_UPDATED and API_INTEGRATION_PLAN. Existing `docs/design/stage-ground-fix.md` and .plans remain intact as historical context.

## Feature ownership — assignments deliberately unfilled

The real team has already delegated work; this table does not reassign it. Replace TBD only when supplied by the team.

| Workstream | Developer assignment | Shared dependencies / likely conflicts |
|---|---|---|
| Canonical fixture adapter and provenance | TBD | Persona/source ID contract, domain DTOs, existing lib/data and engines |
| Financial eligibility, ranking and Guardian | TBD | Canonical states, all actions/agent/fallback paths; do not duplicate policy |
| AI/provider/tool integration | TBD | lib/agent, server context, facts contract, SSE and safe UI actions |
| Backend routes / action receipts | TBD | app/api, lib/server, client DTOs, consent and packet schema |
| Existing frontend / canonical customer entry | TBD | TopBar, DashboardShell, Story, MoveDrawer, data/ui/overlay stores |
| 3D/maps/replay | TBD | Model manifest/assets, camera director, replay state, dynamic imports |
| Hardware | TBD | No implementation/contract found; need assigned interface first |
| Photon / messaging | TBD | No implementation/contract found; transport/event semantics undecided |
| Tests, CI and integration | TBD | Existing Vitest; future HTTP/browser suite and no-key demo |
| Dependency/build/deployment coordination | TBD | package/lockfile, next config, env, one shared build/dev owner |
| Demo / pitch | TBD | Rehearsed source-accurate facts, safety story, fallback and backup |

High-conflict files: `lib/types.ts`, `lib/server/schemas.ts`, `lib/client/api.ts`, `lib/client/ui-store.ts`, data-store, shared dashboard composition, manifests and lockfile. Agree a contract coordinator rather than letting each developer change these independently. Keep individual feature changes small and ownership-scoped. Use short `codex/` branches when implementation is assigned; do not push or open PRs at this checkpoint. Historical .plans four-agent roles are not current three-developer ownership.

## Proposed next milestones (await actual assignments)

| Order | Scope | Acceptance gate |
|---|---|---|
| 0 — this checkpoint | Baseline audit, setup and five updated documents | Source untouched; actual check results recorded; team can identify current versus missing functionality |
| 1 — contract agreement | Choose canonical source entry point, exact identity/finance/guidance DTOs and mapping; confirm owner interfaces | No Maya identity collision, no fabricated fields, four-state eligibility and no-offer/guidance represented; team reviews contract |
| 2 — one canonical slice | Assigned data/API/policy/UI work for C001 using existing application | CSV → Next handler → existing UI; exact amounts, deterministic recommendation, source disclosure; regression + HTTP + browser slice tests pass |
| 3 — protections and stress | Expand assigned canonical paths, consent/recall/hardship and affordability-only scenario/reset | C002/C009/C011/C014/C016 pass across recommendation, agent, actions and fallback; -20% changes no financing terms |
| 4 — demo integration | Correct truthful receipts/metric labels, optional assigned AI/hardware/Photon seams, impact attribution | No external action implied; no-key flow works; unready integrations isolated; all P0 checks green |
| 5 — freeze | Responsive/browser/accessibility checks, deploy only when separately authorized, rehearse and capture backup | Reliable complete demo, actual environment/build limitations disclosed, no feature creep |

Do not restart a fresh 24-hour scaffold schedule. Rebaseline against the actual remaining event time when the team provides it. Suggested remaining-effort allocation: 15% contracts/ownership, 40% one complete integration, 25% safety/regression/demo reliability, 20% freeze/rehearsal buffer. Stretch is allowed only after the assigned P0 slice passes; do not spend the remaining time replacing existing visuals or providers.

## Environment and commands

Package manager: npm; checked-in package-lock v3. Local Node 22.14.0, npm 10.9.2. Next.js installed documentation specifies Node >=20.9, but the full locked dependency set should be tested on the chosen Node runtime. No root README or .env.example is supplied by Toyyo; use this document for setup until the assigned owner adds them.

From the clone directory:

```sh
cd /Users/advaith/Documents/ChatGPT/Hackutd-26/Toyyo
npm ci
npx next typegen
npx tsc --noEmit --incremental false
npm run lint
npx vitest run
npm run build
```

After a successful build, `npm run start -- --port 3001` serves production locally. For development, `npm run dev -- --port 3001` avoids colliding with another workspace app on port 3000. Visit `http://localhost:3001`; customer routes are `/moves`, `/finances`, `/driving`, `/repair`, with sponsor `/tfs` and sandbox `/lab`. Avoid concurrent build/dev operations against the same .next output. Installed AGENTS guidance requires relevant Next docs before application edits.

The initial plain tsc fails in a fresh clone until Next route helpers are generated; `next typegen` resolved both missing LayoutProps errors with no source edits. These generated files and dependency/build output are ignored by Git.

## Environment variables (names only; no secrets collected)

No .env file shipped in the clone. Audit/verification uses no live AI credentials. Keys are not needed for deterministic engine tests or server offline narration.

| Variable | Use / fallback |
|---|---|
| AGENT_PROVIDER | gemini default; anthropic selectable; no-key path uses templates |
| GEMINI_API_KEY | Server key; GEMINI_API is supported as an alias |
| GEMINI_API | Alternate server key name used by older Toyyo setup |
| ANTHROPIC_API_KEY | Server key when Anthropic selected |
| AGENT_MODEL | Optional provider-specific override; source defaults gemini-3.5-flash / claude-opus-5-5; live access not tested |
| AGENT_EFFORT | Anthropic effort setting, default low |
| NEXT_PUBLIC_MAPBOX_TOKEN | Public browser Mapbox token; absent/non-pk selects MapLibre |
| NEXT_PUBLIC_MAP_PROVIDER | mapbox default or maplibre; tokenless still needs remote tiles/worker |
| NEXT_PUBLIC_USE_MOCKS | 1 forces independent client mocks; leave unset for real local handlers |
| MAPBOX | Historic setup alias; runtime code reads NEXT_PUBLIC_MAPBOX_TOKEN, not this alias directly |

Do not copy another checkout's .env or print inherited key values. `.superset/setup.sh` contains an optional copy-from-main-checkout step; it was not run. Do not put AI keys in NEXT_PUBLIC variables. No OPENAI_API_KEY, Photon or hardware configuration is consumed by current code.

## Verification ledger

| Check | Actual result |
|---|---|
| Clone / Git identity | Success; main / 77d5d7fefa22460bdb29b71692228d40d4c79246 |
| Original package preservation | 26 copied files, SHA256 byte parity verified; prior docs/skills untouched |
| npm ci | Initial sandbox attempt failed (npm Exit handler never called; cache/log write restriction). Approved outside-sandbox retry succeeded: 1190 packages installed; lockfile unchanged |
| npm run lint | PASS, exit 0 |
| tsc before generated route types | FAIL, two LayoutProps errors in layouts; environment-generation issue |
| next typegen then tsc | PASS, exit 0; no application fix required |
| vitest run | PASS, eight files / 109 tests, no live AI credentials required |
| npm audit | 22 findings: 14 moderate, eight high, zero critical. High entries include deck.gl/loading/texture dependency chain. No automatic dependency changes applied |
| Production build | PASS, exit 0, approved outside-sandbox retry: compile 6.7s, TypeScript 5.9s, 15 static pages. Initial sandbox compile was stopped after >4 minutes without progress. Build logged two generic API errors during prerendering; no application code changed |
| Production HTTP smoke | PASS for seven HTML routes, four persona APIs, Maya mileage what-if, no-key initial recommendations and simulated accept; see critical sponsor failure below |
| Production sponsor packet visibility | FAIL: /api/tfs is prerendered static. GET before accept: zero packets; POST accept: 200 with packet; GET after accept: still zero packets. This blocks the packet-to-sponsor demonstration despite a successful build |
| Live AI / Mapbox credentials | Not tested; no keys added or exposed |
| Browser E2E / accessibility / deployment | Not certified; no checked-in Playwright suite or Toyyo CI workflow found |

Audit findings are recorded for the dependency owner to assess in context; do not run audit fix --force or replace the teammate's dependencies during this inspection phase.

Production smoke details: `/`, `/moves`, `/finances`, `/driving`, `/repair`, `/tfs` and `/lab` return 200 HTML (not a browser interaction test). All four `/api/persona/[id]` calls return 200 and expected top moves: Maya buyout, Garcias refinance, Jordan coaching, Raj upgrade. Maya 900-mile what-if returns a $675 return invoice; `/api/agent/initial?personaId=maya` returns three template recommendations without an AI key. `/api/actions` creates a simulated buyout specialist packet with HTTP 200. `/api/tfs` nevertheless returns its static empty packet list. `/api/persona/C001` returns 400 because canonical IDs are unsupported.

The production server was started temporarily on 127.0.0.1:3001, isolated from other workspace servers. Starting/listening and local HTTP required approved sandbox escalation. The inspection's single acceptance modifies only demo process memory, never an account or external system. The server is stopped after verification, clearing that temporary state.

Queue the static sponsor endpoint issue as a P0 integration defect for the assigned owner. Follow installed Next.js Cache Components/route-handler documentation to choose the appropriate request-time boundary; validate accept → sponsor refresh under `next build` + `next start`, not only Vitest/dev. Do not assume a no-store response header makes a prerendered handler dynamic. No fix was applied in this phase.

## Stop boundary and next action

Stop after inspection, environment verification and documentation. Team should provide actual delegated tasks, source/contract decisions and remaining time; implementation must respect those assignments. The next useful engineering unit is a reviewed canonical-data contract followed by C001 through the existing Next.js app, while preserving current Toyyo regression behavior.
