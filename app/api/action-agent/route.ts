import { z } from "zod";
import { createHash } from "node:crypto";
import { getClient } from "@/lib/agent/client";
import { actionPlanSchema, fallbackActionPlan } from "@/lib/agent/action-agent";

const planRequestSchema = z.strictObject({
  mode: z.literal("plan"),
  name: z.string().trim().min(1).max(80),
  vehicle: z.strictObject({ year: z.number().int(), model: z.string().trim().min(1).max(80), mileage: z.number().int().nonnegative() }),
  issue: z.string().trim().min(5).max(500),
  estimate: z.number().nonnegative(),
  recommendation: z.enum(["keep", "trade", "refinance"]),
  provider: z.string().trim().min(1).max(120),
});

const ACTION_RECIPIENT = "saikottamasu123@gmail.com";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function emailParts(draft: string) {
  const subjectMatch = draft.match(/^Subject:\s*([^\n]+)\n*/i);
  const subject = subjectMatch?.[1]?.trim() || "Your Toyyo Action Agent brief";
  const text = subjectMatch ? draft.slice(subjectMatch[0].length).trim() : draft.trim();
  const paragraphs = text.split(/\n{2,}/).map(paragraph => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#17211b"><div style="border-bottom:3px solid #d71920;padding:20px 0"><strong style="font-size:20px">Toyyo Action Agent</strong></div><div style="padding:24px 0">${paragraphs}</div><div style="border-top:1px solid #d9dedb;padding-top:14px;font-size:12px;color:#66706a">Generated from your repair-or-replace plan. Confirm all prices, availability, and repair details independently.</div></div>`;
  return { subject, text, html };
}

async function sendActionEmail(draft: string, idempotencySource: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  const email = emailParts(draft);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `toyyo-action/${createHash("sha256").update(idempotencySource).digest("hex").slice(0, 32)}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "Toyyo Action Agent <onboarding@resend.dev>",
      to: [ACTION_RECIPIENT],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Resend rejected the email.");
  return { id: body.id as string, recipient: ACTION_RECIPIENT };
}

async function compactJson(prompt: string, maxTokens: number) {
  const client = getClient();
  if (!client) return null;
  const response = await client.beta.messages.create({
    model: process.env.ACTION_AGENT_MODEL ?? "claude-haiku-5-5",
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: "Return only compact valid JSON. Do not add markdown. Never invent prices, appointments, warranties, providers, or completed actions. The user must approve all outreach.",
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content.filter(block => block.type === "text").map(block => block.text).join("");
  return JSON.parse(text);
}

export async function POST(request: Request) {
  try {
    const input = planRequestSchema.parse(await request.json());
      const fallback = fallbackActionPlan(input);
      let plan = fallback;
      let provider = "local-fallback";
      try {
        const generated = await compactJson(`Create a short action plan from this data. Use exactly 3 tasks: review the plan, prepare a formatted action brief, and email it to the user's own inbox. The draft asks for a written estimate and does not claim to book or authorize repairs. JSON shape: {"objective":string,"tasks":[{"id":string,"title":string,"detail":string}],"draft":string}. Data: ${JSON.stringify(input)}`, 700);
        plan = actionPlanSchema.parse(generated);
        provider = "claude-haiku-5-5";
      } catch {}
      try {
        const delivery = await sendActionEmail(plan.draft, JSON.stringify(input));
        return Response.json({ plan, provider, delivery });
      } catch (error) {
        return Response.json({ plan, provider, deliveryError: error instanceof Error ? error.message : "Email delivery failed." });
      }
  } catch {
    return Response.json({ error: "The action request was incomplete." }, { status: 400 });
  }
}
