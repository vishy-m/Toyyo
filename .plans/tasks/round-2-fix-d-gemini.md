# Fix D: switch the agent's LLM from Claude to Gemini (Codex, task 02 ownership)

**Why:** the Anthropic and OpenAI accounts both have no credits; the user will not add any. A Gemini key works (verified Oct 27: `gemini-3.5-flash` answered a test request).

Same rules as `.plans/tasks/README.md`: only edit `lib/agent/**`, `lib/server/**`, `app/api/**`; no `npm install` / `next dev` / `next build` (shared dev server on :3000); no commits; log a "Round 2 · Fix D" entry under 02 in STATUS.md.

## Setup already done by the coordinator
- `@google/genai` 2.31 is installed. Read `node_modules/@google/genai/README.md` and `node_modules/@google/genai/dist/genai.d.ts` before writing calls. Follow the documented API (`new GoogleGenAI({ apiKey })`, `ai.models.generateContentStream(...)`, function declarations / function calling, `responseMimeType: "application/json"` + `responseSchema` / `responseJsonSchema` for structured output); don't guess.
- Key: `.env` has **`GEMINI_API`** (non-standard name). Read `process.env.GEMINI_API_KEY ?? process.env.GEMINI_API`. Never log it.

## Requirements
1. **Provider abstraction** in `lib/agent/llm/`: a small interface the loop uses (`streamTurn({ system, messages, tools }) → text deltas + tool calls + finish reason`, `generateJson(schema, prompt)`), with a **Gemini implementation as the default** (`AGENT_PROVIDER=gemini`). Keep the existing Anthropic code as a second implementation selected by `AGENT_PROVIDER=anthropic`; don't delete it. Default model `gemini-3.5-flash` (`AGENT_MODEL` overrides; `gemini-3.1-pro-preview` is the "smarter" option).
2. **Tool loop parity:** same 15 tools (convert the zod/JSON schemas to Gemini `functionDeclarations`; Gemini's schema subset doesn't support everything, e.g. no `additionalProperties`, so convert carefully and keep zod validation on the inputs). Handle parallel function calls (return all `functionResponse` parts together), the iteration cap, safety/blocked finish reasons (treat like the old `refusal` path: friendly `error` event, no tool execution), and errors.
3. **Same SSE contract** (`AgentStreamEvent`): text deltas, tool start/done, drafts, ui_actions, learned, done. Keep the existing grounding check, buffering, and corrective retry exactly as they are; they operate on text and don't care which provider wrote it.
4. **Initial recommendations** via Gemini structured JSON output, validated with the same zod schema, then grounding; per-persona cache unchanged.
5. **Rate limits / failures:** the free tier may return 429 or 503. Retry once with a short backoff, then fall back to the existing offline template path (including Fix B's intent router), so the demo never breaks. Keep `/api/agent/initial` cached so the stage demo never waits on a cold call; warm all four personas once at server start/first request.
6. **Tests:** unit-test the schema conversion and the Gemini response → event mapping with a mocked client (no live calls in tests). Existing tests must keep passing.
7. **Live verification** against :3000 with curl. This is the first time the real LLM path runs end to end, so check it properly:
   - `GET /api/agent/initial?personaId=maya` returns grounded LLM-written recommendations (`grounded: true`) whose numbers match the engines;
   - `POST /api/agent` "What if I drive 900 miles a month?" → tool events, `set_whatif`, grounded text, `done`;
   - "Show me the trip that hurt my score most" for jordan → `open_trip_replay`;
   - log the latency for each, and how often grounding needed a retry.
   Reset persona caches after switching so stale template text isn't served.
8. Update `.plans/next-move-copilot-spec.md`? **No.** The coordinator does that. Just report the final model, env vars and latencies in STATUS.md.
