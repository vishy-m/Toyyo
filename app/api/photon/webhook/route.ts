import { handlePhotonMessage } from "@/lib/server/photon-chat";
import { personaForPhotonSpace, rememberPhotonSpace } from "@/lib/server/photon";
import { errorResponse, json } from "@/lib/server/http";
import { verifyPhotonSignature } from "@/lib/server/photon-webhook";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const rawBytes = new Uint8Array(await request.arrayBuffer());
    const raw = new TextDecoder().decode(rawBytes);
    await verifyPhotonSignature(request, rawBytes);
    const event = JSON.parse(raw) as {
      event?: string;
      space?: { id?: string; phone?: string };
      message?: { id?: string; direction?: string; content?: { type?: string; text?: string } };
    };
    const text = event.message?.content?.type === "text" ? event.message.content.text : undefined;
    if (event.event !== "messages" || !event.space?.id || !event.message?.id || event.message.direction !== "inbound" || !text) {
      return json({ ok: true, ignored: true });
    }
    const personaId = personaForPhotonSpace(event.space.id);
    if (!personaId) return json({ ok: true, ignored: true });
    rememberPhotonSpace(personaId, { id: event.space.id, phone: event.space.phone });
    return json({ ok: true, ...await handlePhotonMessage(personaId, text, event.message.id, true) });
  } catch (error) { return errorResponse(error); }
}
