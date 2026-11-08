// Demo: text the proactive lease-mileage warning to the phone mapped in PHOTON_PERSONA_SPACES_JSON.
// Usage: npm run demo:text -- [personaId=maya] [baseUrl=http://localhost:3000]
// Needs LEASE_DEMO_SECRET in .env and the dev server running. Resets the conversation first, so it can be re-run.
const [personaId = "maya", baseUrl = process.env.DEMO_BASE_URL || "http://localhost:3000"] = process.argv.slice(2);
const secret = process.env.LEASE_DEMO_SECRET?.trim();
if (!secret) {
  console.error("Set LEASE_DEMO_SECRET in .env first.");
  process.exit(1);
}
const call = async (body) => {
  const response = await fetch(`${baseUrl}/api/lease-conversation`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ personaId, ...body }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${body.action} failed (${response.status}): ${json.error ?? "unknown error"}`);
  return json;
};
try {
  await call({ action: "reset" });
  const flow = await call({ action: "evaluate" });
  const sent = flow.messages?.at(-1);
  if (!sent) console.log(`No text sent: ${personaId} is not on pace to exceed the lease limit by 1,000+ miles.`);
  else console.log(`Mileage text ${sent.delivery === "accepted" ? "sent to the phone" : "simulated (no Spectrum Space mapped for this persona)"}:\n\n${sent.text}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
