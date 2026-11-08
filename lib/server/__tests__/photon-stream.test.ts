import { afterEach, describe, expect, it, vi } from "vitest";
import { inboundFromStream, photonInboundMode } from "../photon-stream";

const SPACE = "any;-;+15551234567";

afterEach(() => vi.unstubAllEnvs());

describe("Spectrum inbound over the streaming connection", () => {
  it("picks webhook when a signing secret is set, stream otherwise, off without credentials", () => {
    vi.stubEnv("SPECTRUM_PROJECT_ID", ""); vi.stubEnv("SPECTRUM_PROJECT_SECRET", ""); vi.stubEnv("SPECTRUM_WEBHOOK_SECRET", "");
    vi.stubEnv("PHOTON_PROJECT_ID", ""); vi.stubEnv("PHOTON_PROJECT_SECRET", ""); vi.stubEnv("PROJECT_ID", ""); vi.stubEnv("PROJECT_SECRET", "");
    vi.stubEnv("SPECTRUM_INBOUND", "");
    expect(photonInboundMode()).toBe("off");
    vi.stubEnv("SPECTRUM_PROJECT_ID", "p"); vi.stubEnv("SPECTRUM_PROJECT_SECRET", "s");
    expect(photonInboundMode()).toBe("stream");
    vi.stubEnv("SPECTRUM_WEBHOOK_SECRET", "w");
    expect(photonInboundMode()).toBe("webhook");
    vi.stubEnv("SPECTRUM_INBOUND", "stream");
    expect(photonInboundMode()).toBe("stream");
  });

  it("answers only inbound text from a configured Space", () => {
    vi.stubEnv("PHOTON_PERSONA_SPACES_JSON", JSON.stringify({ maya: SPACE }));
    const text = (direction: string, body = "How many months are left?") => ({ id: "m1", direction, content: { type: "text", text: body } });
    expect(inboundFromStream({ id: SPACE }, text("inbound"))).toMatchObject({ personaId: "maya", text: "How many months are left?", eventId: "m1" });
    expect(inboundFromStream({ id: SPACE }, text("outbound"))).toBeUndefined(); // our own reply
    expect(inboundFromStream({ id: SPACE }, { id: "m2", direction: "inbound", content: { type: "attachment" } })).toBeUndefined();
    expect(inboundFromStream({ id: SPACE }, text("inbound", "   "))).toBeUndefined();
    expect(inboundFromStream({ id: "any;-;+15550000000" }, text("inbound"))).toBeUndefined(); // unknown Space: no account data
  });
});
