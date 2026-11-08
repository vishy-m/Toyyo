import { handlePhotonMessage } from "./photon-chat";
import { personaForPhotonSpace, rememberPhotonSpace, resetSpectrumConnection, spectrumConnection, spectrumCredentials } from "./photon";
import { spectrumWebhookSecret } from "./photon-webhook";
import type { PersonaId } from "../types";

/**
 * How inbound Spectrum messages reach Toyyo.
 * - "webhook": Spectrum POSTs signed events to /api/photon/webhook (needs a public URL and a registered webhook).
 * - "stream": the server keeps the SDK's streaming connection open (`spectrum.messages`); works on localhost with
 *   no tunnel or webhook registration. Needs one long-running server process (not serverless).
 * - "off": no inbound handling.
 * SPECTRUM_INBOUND overrides; otherwise a configured webhook secret means webhook, else stream when credentials exist.
 */
export function photonInboundMode(): "stream" | "webhook" | "off" {
  const forced = process.env.SPECTRUM_INBOUND?.trim().toLowerCase();
  if (forced === "stream" || forced === "webhook" || forced === "off") return forced;
  const { projectId, projectSecret } = spectrumCredentials();
  if (!projectId || !projectSecret) return "off";
  return spectrumWebhookSecret() ? "webhook" : "stream";
}

interface StreamSpace { id?: string; phone?: string }
interface StreamMessage { id?: string; direction?: string; content?: { type?: string; text?: string } }

/** The persona and text for an inbound text message from a configured Space; undefined for anything to ignore. */
export function inboundFromStream(space: StreamSpace, message: StreamMessage): { personaId: PersonaId; text: string; eventId: string; space: { id: string; phone?: string } } | undefined {
  if (message.direction !== "inbound" || message.content?.type !== "text" || !message.id || !space.id) return undefined;
  const text = message.content.text?.trim();
  if (!text) return undefined;
  const personaId = personaForPhotonSpace(space.id);
  if (!personaId) return undefined; // unknown Space: no account data
  return { personaId, text, eventId: message.id, space: { id: space.id, phone: space.phone } };
}

const root = globalThis as typeof globalThis & { __toyyoPhotonStream?: Promise<void> };

/** Starts (once per server process) the loop that answers inbound Spectrum messages over the streaming connection. */
export function startPhotonStream(): Promise<void> {
  root.__toyyoPhotonStream ??= (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const connection = await spectrumConnection();
        if (!connection) { console.warn("[photon] stream not started: Spectrum credentials are missing."); return; }
        console.info("[photon] listening for Spectrum messages over the streaming connection.");
        attempt = 0;
        for await (const [space, message] of connection.app.messages) {
          const inbound = inboundFromStream(space as StreamSpace, message as StreamMessage);
          if (!inbound) continue;
          rememberPhotonSpace(inbound.personaId, inbound.space);
          // Not awaited: one slow agent reply must not stall the stream. handlePhotonMessage dedupes by message id and
          // queues per persona, exactly as for webhook deliveries.
          console.info(`[photon] inbound message for ${inbound.personaId} (${inbound.eventId})`);
          void handlePhotonMessage(inbound.personaId, inbound.text, inbound.eventId, true)
            .then((result) => console.info(`[photon] ${result.duplicate ? "duplicate ignored" : "reply sent"} for ${inbound.personaId} (${inbound.eventId})`))
            .catch((error: unknown) => console.error("[photon] could not answer an inbound message:", error instanceof Error ? error.message : error));
        }
        console.warn("[photon] Spectrum stream ended; reconnecting.");
      } catch (error) {
        console.error("[photon] Spectrum stream error; reconnecting:", error instanceof Error ? error.message : error);
      }
      await resetSpectrumConnection();
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))));
    }
  })();
  return root.__toyyoPhotonStream;
}
