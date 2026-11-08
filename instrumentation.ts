// Runs once when a Next.js server instance starts (https://nextjs.org/docs/app/guides/instrumentation).
// In "stream" mode it opens the Spectrum streaming connection so inbound iMessages are answered without a public
// webhook URL. Node runtime only: the Spectrum SDK does not run on the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VITEST === "true") return;
  const { photonInboundMode, startPhotonStream } = await import("./lib/server/photon-stream");
  const mode = photonInboundMode();
  console.info(`[photon] inbound mode: ${mode}`);
  // Not awaited: register must finish before the server can take requests; the stream lives for the process.
  if (mode === "stream") void startPhotonStream();
}
