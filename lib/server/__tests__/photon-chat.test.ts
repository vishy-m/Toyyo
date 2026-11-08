import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateLease, getLeaseConversation } from "../lease-conversation";
import { getPhotonChatHistory, handlePhotonMessage } from "../photon-chat";
import { personaForPhotonSpace } from "../photon";
import { verifyPhotonSignature } from "../photon-webhook";
import { GET as getLeaseRoute, POST as postLeaseRoute } from "../../../app/api/lease-conversation/route";

const saved = {
  secret: process.env.SPECTRUM_WEBHOOK_SECRET,
  spaces: process.env.PHOTON_PERSONA_SPACES_JSON,
  singleSpace: process.env.PHOTON_SPACE_ID,
};
afterEach(() => {
  if (saved.secret === undefined) delete process.env.SPECTRUM_WEBHOOK_SECRET; else process.env.SPECTRUM_WEBHOOK_SECRET = saved.secret;
  if (saved.spaces === undefined) delete process.env.PHOTON_PERSONA_SPACES_JSON; else process.env.PHOTON_PERSONA_SPACES_JSON = saved.spaces;
  if (saved.singleSpace === undefined) delete process.env.PHOTON_SPACE_ID; else process.env.PHOTON_SPACE_ID = saved.singleSpace;
});

describe("Photon chat interface", () => {
  it("answers a free-form account question and deduplicates a replayed message", async () => {
    const first = await handlePhotonMessage("garcia", "What are my payment options?", "freeform-1");
    expect(first.duplicate).toBe(false);
    const history = getPhotonChatHistory("garcia");
    expect(history).toHaveLength(2);
    expect(history[1].role).toBe("assistant");
    expect(history[1].text).toMatch(/payment|refinanc/i);
    expect((await handlePhotonMessage("garcia", "What are my payment options?", "freeform-1")).duplicate).toBe(true);
    expect(getPhotonChatHistory("garcia")).toHaveLength(2);
  });

  it("routes only an explicit lease command through the confirmation state", async () => {
    await evaluateLease("maya");
    await handlePhotonMessage("maya", "Could you explain my lease?", "question-1");
    expect(getPhotonChatHistory("maya").at(-1)?.role).toBe("assistant");
    await handlePhotonMessage("maya", "OPTIONS", "command-1");
    expect(getPhotonChatHistory("maya").at(-1)?.text).toContain("BUYOUT");
    await handlePhotonMessage("maya", "I want to switch", "command-2");
    expect(getLeaseConversation("maya").optionId).toBe("lease-end:upgrade");
    await handlePhotonMessage("maya", "Yes, that works", "command-3");
    expect(getLeaseConversation("maya").stage).toBe("offer");
    expect(getPhotonChatHistory("maya").at(-1)?.text).toContain("CONFIRM SWITCH");
    await handlePhotonMessage("maya", "STOP", "command-4");
    expect((await evaluateLease("maya")).stage).toBe("declined");
    await handlePhotonMessage("maya", "START", "command-5");
    expect(getLeaseConversation("maya").stage).toBe("idle");
  });

  it("rejects an invalid Spectrum signature and ignores an unmapped Space", async () => {
    process.env.SPECTRUM_WEBHOOK_SECRET = "test-signing-secret";
    process.env.PHOTON_PERSONA_SPACES_JSON = JSON.stringify({ maya: "any;-;+15551234567" });
    expect(personaForPhotonSpace("any;-;+15550000000")).toBeUndefined();
    expect(personaForPhotonSpace("any;-;+15551234567")).toBe("maya");
    const body = JSON.stringify({ event: "messages", space: { id: "any;-;+15551234567" }, message: { id: "spc-msg-1", direction: "inbound", content: { type: "text", text: "hello" } } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = { "x-spectrum-timestamp": timestamp, "x-spectrum-signature": "v0=invalid", "x-spectrum-webhook-id": "hook-1" };
    await expect(verifyPhotonSignature(new Request("http://localhost/api/photon/webhook", { method: "POST", headers, body }), body)).rejects.toThrow("Invalid Spectrum webhook signature");
    const signature = `v0=${createHmac("sha256", "test-signing-secret").update(`v0:${timestamp}:${body}`).digest("hex")}`;
    await expect(verifyPhotonSignature(new Request("http://localhost/api/photon/webhook", { method: "POST", headers: { ...headers, "x-spectrum-signature": signature }, body }), body)).resolves.toBe("hook-1");
  });

  it("does not bind an unconfigured Space to a customer and protects dealer controls", async () => {
    delete process.env.PHOTON_PERSONA_SPACES_JSON;
    delete process.env.PHOTON_SPACE_ID;
    expect(personaForPhotonSpace("any;-;+15550000000")).toBeUndefined();
    expect((await getLeaseRoute(new Request("http://localhost/api/lease-conversation?personaId=maya"))).status).toBe(401);
    expect((await postLeaseRoute(new Request("http://localhost/api/lease-conversation", {
      method: "POST", body: JSON.stringify({ action: "approve", personaId: "maya" }),
    }))).status).toBe(401);
  });
});
