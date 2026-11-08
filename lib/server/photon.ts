import { HttpError } from "./http";
import type { PersonaId } from "../types";

const personaIds: PersonaId[] = ["maya", "garcia", "jordan", "raj"];
const spacePattern = /^[A-Za-z0-9:;+._@-]{1,200}$/;

export interface PhotonSpaceRef {
  id: string;
  phone?: string;
}

function firstEnv(...names: string[]): string | undefined {
  return names.map(name => process.env[name]?.trim()).find(Boolean);
}

export function spectrumCredentials() {
  return {
    projectId: firstEnv("SPECTRUM_PROJECT_ID", "PHOTON_PROJECT_ID", "PROJECT_ID"),
    projectSecret: firstEnv("SPECTRUM_PROJECT_SECRET", "PHOTON_PROJECT_SECRET", "PROJECT_SECRET"),
  };
}

/** Static identity binding for the synthetic demo; never select an account from message text. */
export function photonSpaces(): Partial<Record<PersonaId, string>> {
  const raw = firstEnv("PHOTON_PERSONA_SPACES_JSON", "SPECTRUM_PERSONA_SPACES_JSON");
  if (raw) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new HttpError(503, "Invalid PHOTON_PERSONA_SPACES_JSON configuration."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(503, "Invalid PHOTON_PERSONA_SPACES_JSON configuration.");
    const spaces: Partial<Record<PersonaId, string>> = {};
    for (const id of personaIds) {
      const space = (parsed as Record<string, unknown>)[id];
      if (space !== undefined) {
        if (typeof space !== "string" || !spacePattern.test(space)) throw new HttpError(503, `Invalid Photon Space for ${id}.`);
        spaces[id] = space;
      }
    }
    if (new Set(Object.values(spaces)).size !== Object.values(spaces).length) throw new HttpError(503, "Photon Spaces must map to one persona each.");
    return spaces;
  }
  const space = firstEnv("PHOTON_SPACE_ID", "SPECTRUM_SPACE_ID");
  const id = firstEnv("PHOTON_PERSONA_ID", "SPECTRUM_PERSONA_ID") as PersonaId | undefined;
  return space && spacePattern.test(space) && id && personaIds.includes(id) ? { [id]: space } : {};
}

const remembered = new Map<PersonaId, PhotonSpaceRef>();

export function rememberPhotonSpace(personaId: PersonaId, space: PhotonSpaceRef) {
  if (!spacePattern.test(space.id)) return;
  const phone = space.phone && space.phone !== "shared" ? space.phone : undefined;
  remembered.set(personaId, { id: space.id, ...(phone ? { phone } : {}) });
}

export function personaForPhotonSpace(spaceId: string): PersonaId | undefined {
  const configured = photonSpaces();
  return Object.entries(configured).find(([, space]) => space === spaceId)?.[0] as PersonaId | undefined;
}

export function spaceForPersona(personaId: PersonaId): PhotonSpaceRef | undefined {
  const mapped = photonSpaces()[personaId];
  const seen = remembered.get(personaId);
  if (mapped) return { id: mapped, ...(seen?.id === mapped && seen.phone ? { phone: seen.phone } : {}) };
  return undefined;
}

export function assertPhotonReady(personaId: PersonaId) {
  const { projectId, projectSecret } = spectrumCredentials();
  if (!projectId || !projectSecret || !spaceForPersona(personaId)) throw new HttpError(503, "Spectrum outbound messaging is not fully configured.");
}

interface SpectrumSender {
  space: { get: (id: string, params?: { phone?: string }) => Promise<{ send: (text: string) => Promise<unknown> }> };
}

const clients = new Map<string, Promise<SpectrumSender>>();

async function spectrumSender(): Promise<SpectrumSender | undefined> {
  const { projectId, projectSecret } = spectrumCredentials();
  if (!projectId || !projectSecret) return undefined;
  let pending = clients.get(projectId);
  if (!pending) {
    pending = (async () => {
      const { Spectrum } = await import("spectrum-ts");
      const { imessage } = await import("spectrum-ts/providers/imessage");
      const app = await Spectrum({
        projectId,
        projectSecret,
        providers: [imessage.config()],
        webhookSecret: firstEnv("SPECTRUM_WEBHOOK_SECRET", "SPECTRUM_SIGNING_SECRET", "PHOTON_WEBHOOK_SECRET"),
      });
      return { space: imessage(app).space };
    })();
    clients.set(projectId, pending);
    pending.catch(() => { if (clients.get(projectId) === pending) clients.delete(projectId); });
  }
  return pending;
}

/** Sends through Stable Spectrum. Resolving means the SDK accepted the send, not that the phone displayed it. */
export async function sendPhotonText(personaId: PersonaId, text: string, _idempotencyKey: string, requireLive = false): Promise<"accepted" | "simulated"> {
  const { projectId, projectSecret } = spectrumCredentials();
  const space = spaceForPersona(personaId);
  if (!projectId || !projectSecret || !space) {
    if (requireLive) throw new HttpError(503, "Spectrum outbound messaging is not fully configured.");
    return "simulated";
  }
  try {
    const sender = await spectrumSender();
    if (!sender) throw new HttpError(503, "Spectrum outbound messaging is not fully configured.");
    const live = await sender.space.get(space.id, space.phone ? { phone: space.phone } : undefined);
    await live.send(text);
    return "accepted";
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Spectrum could not accept the message.");
  }
}
