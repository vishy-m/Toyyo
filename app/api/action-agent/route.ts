import { createHash } from "node:crypto";
import { z } from "zod";
import { getClient } from "../../../lib/agent/client";
import { actionPlanSchema, fallbackActionPlan } from "../../../lib/agent/action-agent";

const channelSchema = z.enum(["email", "voicemail", "both"]);
const draftRequestSchema = z.strictObject({
  mode: z.literal("draft"), name: z.string().trim().min(1).max(80),
  vehicle: z.strictObject({ year: z.number().int(), model: z.string().trim().min(1).max(80), mileage: z.number().int().nonnegative() }),
  issue: z.string().trim().min(5).max(500), estimate: z.number().nonnegative(), recommendation: z.enum(["keep", "trade", "refinance"]),
  provider: z.string().trim().min(1).max(120), task: z.enum(["quote", "availability", "warranty", "follow_up", "callback"]),
  channel: channelSchema, tone: z.enum(["concise", "friendly", "formal"]), followUp: z.enum(["none", "once", "remind", "ask"]),
});
const executeRequestSchema = z.strictObject({
  mode: z.literal("execute"), channel: channelSchema,
  emailDraft: z.string().min(1).max(1800), voicemailScript: z.string().min(1).max(900),
  approveEmail: z.boolean(), approveVoicemail: z.boolean(), idempotencySource: z.string().min(1).max(5000),
});

const ACTION_RECIPIENT = "saikottamasu123@gmail.com";
const VOICEMAIL_RECIPIENT = "+14699801996";
const TRIAL_VOICE_TEMPLATE = "https://webhooks.twilio.com/v1/Voice/Template/voice_text_to_speech";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

function emailParts(draft: string) {
  const subjectMatch = draft.match(/^Subject:\s*([^\n]+)\n*/i);
  const subject = subjectMatch?.[1]?.trim() || "Toyyo Action Agent request";
  const text = subjectMatch ? draft.slice(subjectMatch[0].length).trim() : draft.trim();
  const html = text.split(/\n{2,}/).map(paragraph => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  return { subject, text, html };
}

async function sendActionEmail(draft: string, source: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  const email = emailParts(draft);
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `toyyo-action/${createHash("sha256").update(source).digest("hex").slice(0, 32)}` }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "Toyyo Action Agent <onboarding@resend.dev>", to: [ACTION_RECIPIENT], ...email }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Email delivery failed.");
  return { id: body.id as string, recipient: ACTION_RECIPIENT };
}

async function sendVoicemail(script: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) throw new Error("Twilio voicemail is not configured.");
  const trialMode = process.env.TWILIO_TRIAL_MODE !== "false";
  const form = trialMode
    ? new URLSearchParams({ To: VOICEMAIL_RECIPIENT, From: from, Url: TRIAL_VOICE_TEMPLATE })
    : new URLSearchParams({ To: VOICEMAIL_RECIPIENT, From: from, Twiml: `<Response><Pause length="2"/><Say>${escapeXml(script)}</Say></Response>` });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Voicemail delivery failed.");
  return { id: body.sid as string, recipient: VOICEMAIL_RECIPIENT, status: body.status as string, trialTemplate: trialMode };
}

async function compactJson(prompt: string) {
  const client = getClient();
  if (!client) return null;
  const response = await client.beta.messages.create({ model: process.env.ACTION_AGENT_MODEL ?? "claude-haiku-5-5", max_tokens: 1000, thinking: { type: "adaptive" }, output_config: { effort: "low" }, system: "Return only compact valid JSON. Use only supplied facts. Never claim outreach happened. Both drafts must say no work is authorized. The voicemail must disclose that it is automated and sent with the user's permission.", messages: [{ role: "user", content: prompt }] });
  return JSON.parse(response.content.filter(block => block.type === "text").map(block => block.text).join(""));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.mode === "draft") {
      const input = draftRequestSchema.parse(body);
      let plan = fallbackActionPlan(input);
      try {
        plan = actionPlanSchema.parse(await compactJson(`Build an outreach workflow. Return {"objective":string,"tasks":[{"id":string,"title":string,"detail":string}],"emailDraft":string,"voicemailScript":string}. Include 4 tasks: review, prepare, approve, send. Configuration: ${JSON.stringify(input)}`));
      } catch {}
      return Response.json({ plan, voicemailRecipient: VOICEMAIL_RECIPIENT });
    }

    const input = executeRequestSchema.parse(body);
    const wantsEmail = input.channel === "email" || input.channel === "both";
    const wantsVoicemail = input.channel === "voicemail" || input.channel === "both";
    if ((wantsEmail && !input.approveEmail) || (wantsVoicemail && !input.approveVoicemail)) return Response.json({ error: "Approve every selected channel first." }, { status: 400 });
    const result: { email?: unknown; voicemail?: unknown; errors?: string[] } = {};
    const errors: string[] = [];
    if (wantsEmail) try { result.email = await sendActionEmail(input.emailDraft, input.idempotencySource); } catch (error) { errors.push(error instanceof Error ? error.message : "Email failed."); }
    if (wantsVoicemail) try { result.voicemail = await sendVoicemail(input.voicemailScript); } catch (error) { errors.push(error instanceof Error ? error.message : "Voicemail failed."); }
    if (errors.length) result.errors = errors;
    return Response.json(result, { status: errors.length && !result.email && !result.voicemail ? 502 : 200 });
  } catch {
    return Response.json({ error: "The action request was incomplete." }, { status: 400 });
  }
}
