import { verifySpectrumSignature } from "@spectrum-ts/core/webhook";
import { HttpError } from "./http";

/** Stable Spectrum signing secret from project webhook registration. */
export function spectrumWebhookSecret(): string | undefined {
  return [process.env.SPECTRUM_WEBHOOK_SECRET, process.env.SPECTRUM_SIGNING_SECRET, process.env.PHOTON_WEBHOOK_SECRET]
    .map(value => value?.trim())
    .find(Boolean);
}

function headerMap(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  return headers;
}

/**
 * Verifies a Stable Spectrum delivery with the SDK verifier.
 * https://photon.codes/docs/webhooks/verifying-signatures
 */
export async function verifyPhotonSignature(request: Request, raw: string | Uint8Array) {
  const secret = spectrumWebhookSecret();
  if (!secret) throw new HttpError(503, "Spectrum webhook is not configured.");
  const headers = headerMap(request);
  const rawBody = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  const result = await verifySpectrumSignature({ rawBody, headers, secret });
  if (!result.ok) throw new HttpError(result.reason === "missing-headers" ? 400 : 401, "Invalid Spectrum webhook signature.");
  return headers["x-spectrum-webhook-id"] ?? headers["x-spectrum-timestamp"] ?? "";
}
