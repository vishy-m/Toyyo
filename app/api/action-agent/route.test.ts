import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const draftInput = {
  mode: "draft", name: "Sam", vehicle: { year: 2020, model: "RAV4", mileage: 78_000 },
  issue: "The brakes grind when stopping", estimate: 950, recommendation: "keep", provider: "Demo Toyota",
  task: "quote", channel: "both", tone: "concise", followUp: "none",
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("action agent builder", () => {
  it("builds previews without sending and returns the fixed voicemail destination", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await POST(new Request("http://localhost/api/action-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draftInput) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.voicemailRecipient).toBe("+14699801996");
    expect(body.plan.emailDraft).toContain("Subject:");
    expect(body.plan.voicemailScript).toContain("automated message");
  });

  it("refuses to execute a selected channel without approval", async () => {
    const response = await POST(new Request("http://localhost/api/action-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "execute", channel: "voicemail", emailDraft: "Unused email", voicemailScript: "Approved script text", approveEmail: false, approveVoicemail: false, idempotencySource: "test-run" }) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Approve");
  });

  it("accepts the full approved draft payload before delivery", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    const longDraft = "Approved outreach. ".repeat(80);
    const response = await POST(new Request("http://localhost/api/action-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "execute", channel: "voicemail", emailDraft: longDraft, voicemailScript: "This is an approved automated message.", approveEmail: false, approveVoicemail: true, idempotencySource: JSON.stringify({ longDraft }) }) }));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.errors[0]).toContain("Twilio voicemail is not configured");
  });

  it("uses Twilio's permitted trial template parameters", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest"); vi.stubEnv("TWILIO_AUTH_TOKEN", "secret"); vi.stubEnv("TWILIO_FROM_NUMBER", "+17372583478");
    const request = new Request("http://localhost/api/action-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "execute", channel: "voicemail", emailDraft: "Unused email", voicemailScript: "Approved automated message", approveEmail: false, approveVoicemail: true, idempotencySource: "trial-call" }) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "CAtest", status: "queued" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request);
    expect(response.status).toBe(200);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const params = new URLSearchParams(options.body as string);
    expect([...params.keys()]).toEqual(["To", "From", "Url"]);
    expect(params.get("Url")).toBe("https://webhooks.twilio.com/v1/Voice/Template/voice_text_to_speech");
    expect((await response.json()).voicemail.trialTemplate).toBe(true);
  });

  it("uses the approved custom script after trial mode is disabled", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest"); vi.stubEnv("TWILIO_AUTH_TOKEN", "secret"); vi.stubEnv("TWILIO_FROM_NUMBER", "+17372583478"); vi.stubEnv("TWILIO_TRIAL_MODE", "false");
    const request = new Request("http://localhost/api/action-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "execute", channel: "voicemail", emailDraft: "Unused email", voicemailScript: "Approved automated message", approveEmail: false, approveVoicemail: true, idempotencySource: "paid-call" }) });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "CAtest", status: "queued" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await POST(request);
    const params = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect([...params.keys()]).toEqual(["To", "From", "Twiml"]);
    expect(params.get("Twiml")).toContain("Approved automated message");
  });
});
