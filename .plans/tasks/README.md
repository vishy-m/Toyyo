# Next Move Copilot: task breakdown and team rules

Source of truth for the product: `.plans/next-move-copilot-spec.md`. Read it first, especially the sections your task names.

Four agents work **in parallel in the same repo**. They stay out of each other's way through **strict file ownership** and the **shared contract** in `lib/types.ts`.

| # | Task | Agent | Owns (only edit these) |
|---|---|---|---|
| 01 | Data + engines | **Codex** | `data/**`, `scripts/data/**`, `lib/data/**`, `lib/engines/**` |
| 02 | Agent + API backend | **Codex** | `lib/agent/**`, `lib/server/**`, `app/api/**` |
| 03 | Dashboard + agent panel UI | **Claude subagent** | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/tfs/**`, `components/dashboard/**`, `components/agent/**`, `components/ui/**`, `lib/client/**` (except `ui-store.ts`, see below), `lib/mock/**` |
| 04 | 3D car + 3D ride replay | **Claude subagent** | `components/three/**`, `components/map/**`, `public/models/**`, `scripts/models/**`, `app/lab/**` |

Shared files, already written by the coordinator. **Do not edit without a STATUS.md request:**
- `lib/types.ts`: every data shape and API payload.
- `lib/client/ui-store.ts`: zustand store bridging the agent panel ↔ 3D (hotspots, replay, what-if, ui_action dispatch).
- `package.json` / lockfile: **all dependencies are already installed. Do not run `npm install`.** If you truly need a new package, add a request to STATUS.md and the coordinator installs it.
- `.env` (git-ignored): `MAPBOX`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_MAP_PROVIDER=mapbox`. `ANTHROPIC_API_KEY` comes from the shell environment.

## Runtime rules
- One shared dev server already runs at **http://localhost:3000** (started by the coordinator; hot reload). **Do not start another `next dev`, and do not run `next build`**: Next 16 locks `.next/`.
- Verify with `npx tsc --noEmit`, `npx vitest run <your dir>`, `curl localhost:3000/...`, and (UI tasks) screenshots of localhost:3000.
- This is **Next.js 16.4 + React 19.3 + Tailwind v4**, with breaking changes from older Next. Read `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/` before writing routes or layouts. Route handlers live in `app/api/**/route.ts`.
- Do not commit. The coordinator commits after integration.
- Key installed libraries: `@anthropic-ai/sdk` 1.3, `zod` 4, `zustand` 5, `motion` 14, `recharts` 3, `three` 0.186, `@react-three/fiber` 9, `@react-three/drei` 10, `mapbox-gl` 3.33, `maplibre-gl` 6, `@deck.gl/*` 9.4, `@turf/turf` 7, `lucide-react`, `clsx`, `vitest` 5, `tsx`, `@gltf-transform/cli`.

## Integration seams (who calls what)

```
data/*.json ──► lib/data (01) ──► lib/engines (01) ──► buildDashboard() ──► app/api/persona/[id] (02)
                                                  └──► runWhatIf()       ──► app/api/whatif (02)
lib/server/store (02): runtime preferences, consent, drafts, packets
lib/agent (02): Claude tool loop ──► app/api/agent (SSE AgentStreamEvent) ──► components/agent (03)
                                                         ui_action events ──► lib/client/ui-store ──► components/three|map (04)
components/dashboard (03) mounts <HeroCar/> and <RideReplay/> from 04 via next/dynamic(ssr:false)
```

**Frontend tasks (03, 04) must not block on the backend.** 03 owns `lib/mock/**`: typed mock `DashboardData` / `AgentPanelState` / `Trip` fixtures, behind `lib/client/api.ts` with `NEXT_PUBLIC_USE_MOCKS` (default: try the API, fall back to mocks on error). Once 01/02 land, the real API replaces the mocks with no UI change.

**Exact exports each task promises (others code against these names):**

01 → `lib/data/index.ts`
```ts
getPersona(id: PersonaId): Persona
listPersonas(): Persona[]
getTrips(id: PersonaId): Trip[]
getTrip(tripId: string): Trip | undefined
getCashflow(id: PersonaId): CashflowSummary
```
01 → `lib/engines/index.ts`
```ts
buildDashboard(personaId: PersonaId, runtime: { preferences: Preferences; consent: Persona["consent"] }): DashboardData
runWhatIf(personaId: PersonaId, moveType: MoveType, overrides: WhatIfOverrides, runtime: {...same}): EngineResult
computeTfsMetrics(personaId: PersonaId, accepted: boolean, packets: HandoffPacket[]): TfsMetrics
```
02 → HTTP API exactly as typed at the bottom of `lib/types.ts`:
`GET /api/persona/[id]`, `GET /api/trips/[tripId]`, `GET /api/agent/initial?personaId=`, `POST /api/agent` (SSE), `POST /api/actions`, `POST /api/whatif`, `GET /api/tfs`.

04 → React components (default exports, client-only):
```ts
components/three/HeroCar.tsx       props: { vehicle: Vehicle; upgradePreview?: MoveOption["upgradeModel"]; className?: string }
components/map/RideReplay.tsx      props: { trip: Trip; onClose(): void; className?: string }
components/map/TripHeatmap.tsx     props: { trips: Omit<Trip,"path"|"events">[]; fullTrips?: Trip[]; onSelectTrip(id: string): void; className?: string }
```
They read and write `useUiStore` (activeHotspot, replay, reducedMotion) for agent-driven camera moves.

## STATUS.md protocol
Each agent appends to `.plans/tasks/STATUS.md` under its own heading:
- when you start, at each milestone, and when done: what works and how you verified it;
- **Requests:** anything you need from another task or the coordinator (contract change, package, a missing export). Never edit another task's files. Write the request and work around it with a local stub in your own folder.
Read STATUS.md when you start and again before you finish, in case another agent asked you for something.
