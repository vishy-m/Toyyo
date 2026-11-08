import { afterEach, describe, expect, it, vi } from "vitest";
import { grokProvider } from "../llm/grok";
import { getProvider } from "../llm";

afterEach(() => vi.unstubAllGlobals());

describe("Grok text-only fallback", () => {
  it("sends no tools, disables response storage, and returns a plain answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "completed", output: [
      { type: "message", content: [{ type: "output_text", text: "Your lease has four months left." }] },
    ] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await grokProvider("test-key").streamTurn({
      system: [{ type: "text", text: "Use only account data." }],
      messages: [{ role: "user", text: "When does my lease end?" }], tools: [{ name: "approve_lease", strict: true, input_schema: { type: "object" } }],
    });
    expect(result.finishReason).toBe("end_turn");
    expect(result.calls).toEqual([]);
    expect(result.text).toContain("four months");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.store).toBe(false);
    expect(request.tools).toBeUndefined();
  });
  it("is available when Gemma has no key", () => {
    vi.stubEnv("AGENT_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API", "");
    vi.stubEnv("XAI_API_KEY", "test-key");
    expect(getProvider()).not.toBeNull();
    vi.unstubAllEnvs();
  });
});
