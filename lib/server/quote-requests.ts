import { randomUUID } from "node:crypto";
import { getPersona } from "@/lib/data";
import type { PersonaId } from "@/lib/types";
import { classifyRepair } from "@/lib/engines/repair-advisor";
import { extractForms, fillForm, findMailto, hasCaptcha, pickQuoteForm } from "@/lib/cinematic/form-agent";
import { summarizeQuote, type QuoteSummary } from "@/lib/cinematic/quote-reply";
import { isSandboxShop, sandboxShop, shopReply, type SandboxSlug } from "@/lib/cinematic/sandbox-shops";
import { HttpError } from "./http";

export interface QuoteRequest {
  id: string; personaId: PersonaId; shopId: string; shopName: string; issue: string;
  status: "sending" | "sent" | "replied" | "failed"; channel: "form" | "email" | null;
  steps: { at: string; text: string }[]; filled: { label: string; value: string }[];
  reply: { subject: string; body: string; summary: QuoteSummary } | null;
  error?: string;
}
interface Delivery { requestId: string; slug: SandboxSlug; name: string; issue: string; vehicleYear: number; vehicleMake: string; vehicleModel: string; relay: string; submittedAt: number; deliverAt: number }
interface QuoteStore { requests: Map<string, QuoteRequest>; shopInboxes: Map<SandboxSlug, Delivery[]>; relayInbox: Map<string, { subject: string; body: string }> }
const globalStore = globalThis as unknown as { __toyyoQuoteStore?: QuoteStore };
const store = (globalStore.__toyyoQuoteStore ??= { requests: new Map(), shopInboxes: new Map(), relayInbox: new Map() });
const step = (request: QuoteRequest, text: string) => request.steps.push({ at: new Date().toISOString(), text });
const delay = () => Math.max(0, Number(process.env.SANDBOX_REPLY_DELAY_MS) || 30_000);
export const relayFor = (id: string) => `quotes+${id}@toyyo.demo`;

export function receiveSandboxQuote(slug: SandboxSlug, input: { name: string; email: string; issue: string; vehicleYear: number; vehicleMake: string; vehicleModel: string }) {
  const match = /^quotes\+([0-9a-f-]{36})@toyyo\.demo$/i.exec(input.email);
  if (!match || !store.requests.has(match[1])) throw new HttpError(403, "Only Toyyo demo relay addresses are accepted.");
  const request = store.requests.get(match[1])!;
  if (request.shopId !== `sandbox/${slug}`) throw new HttpError(403, "Quote request does not belong to this demo shop.");
  if (store.shopInboxes.get(slug)?.some((entry) => entry.requestId === request.id)) throw new HttpError(409, "Quote already received.");
  const now = Date.now();
  const delivery: Delivery = { requestId: request.id, slug, ...input, relay: input.email, submittedAt: now, deliverAt: now + delay() };
  store.shopInboxes.set(slug, [...(store.shopInboxes.get(slug) ?? []), delivery]);
  return delivery;
}

export function getQuoteRequest(id: string): QuoteRequest | null {
  const request = store.requests.get(id);
  if (!request) return null;
  if (request.status === "sent") {
    const slug = request.shopId.slice(8) as SandboxSlug;
    const delivery = store.shopInboxes.get(slug)?.find((entry) => entry.requestId === id);
    if (delivery && Date.now() >= delivery.deliverAt) {
      const reply = shopReply(slug, delivery);
      store.relayInbox.set(delivery.relay, reply);
      request.reply = { ...reply, summary: summarizeQuote(reply.body) };
      request.status = "replied";
      step(request, `Reply received at ${delivery.relay}`);
    }
  }
  return request;
}

function safeOwnUrl(path: string, origin: string, expectedPath: string) {
  const base = new URL(origin);
  if (!/^https?:$/.test(base.protocol) || base.pathname !== "/" || base.search || base.hash) throw new HttpError(400, "Invalid app origin.");
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.pathname !== expectedPath || url.search || url.hash || url.username || url.password) throw new HttpError(403, "Demo shop URL is not allowed.");
  return url;
}

export async function startQuoteRequest({ personaId, shopId, issue, origin }: { personaId: PersonaId; shopId: string; issue: string; origin: string }): Promise<QuoteRequest> {
  if (!isSandboxShop(shopId)) throw new HttpError(403, "Automatic quotes work with demo shops only.");
  const slug = shopId.slice(8) as SandboxSlug, shop = sandboxShop(slug)!;
  const persona = getPersona(personaId);
  const id = randomUUID();
  const request: QuoteRequest = { id, personaId, shopId, shopName: shop.name, issue, status: "sending", channel: null, steps: [], filled: [], reply: null };
  store.requests.set(id, request);
  try {
    const website = safeOwnUrl(`/sandbox-shop/${slug}`, origin, `/sandbox-shop/${slug}`);
    step(request, `Opened ${shop.name} demo website`);
    const page = await fetch(website, { redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!page.ok) throw new Error("Demo shop website could not be opened.");
    const html = await page.text();
    const form = !hasCaptcha(html) ? pickQuoteForm(extractForms(html)) : null;
    const relay = relayFor(id);
    if (form) {
      request.channel = "form";
      step(request, `Found quote form: ${form.fields.length} fields`);
      const profile = { name: persona.name, email: relay, phone: "(555) 010-0142", vehicleYear: persona.vehicle.year, vehicleMake: persona.vehicle.make, vehicleModel: persona.vehicle.model, mileage: persona.vehicle.odometer, category: classifyRepair(issue, persona.vehicle.year).category, issue };
      const result = fillForm(form, profile);
      if (result.unmapped.length) throw new Error(`Required fields could not be filled: ${result.unmapped.join(", ")}`);
      request.filled = result.filled;
      step(request, `Filled ${result.filled.map((field) => field.label).join(", ")}`);
      const action = safeOwnUrl(form.action, origin, `/api/sandbox-shop/${slug}/quote`);
      const submitted = await fetch(action, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(result.values), redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!submitted.ok) throw new Error("Demo shop quote form rejected the request.");
      step(request, "Submitted quote form");
    } else {
      step(request, hasCaptcha(html) ? "Quote form blocked by CAPTCHA" : "No usable quote form found");
      const mailto = findMailto(html);
      if (!mailto || mailto !== shop.email) throw new Error("No allowed demo shop email address was found.");
      request.channel = "email";
      request.filled = [{ label: "To", value: mailto }, { label: "Reply-to", value: relay }, { label: "Name", value: persona.name }, { label: "Vehicle", value: `${persona.vehicle.year} ${persona.vehicle.make} ${persona.vehicle.model}` }, { label: "Issue", value: issue }];
      receiveSandboxQuote(slug, { name: persona.name, email: relay, issue, vehicleYear: persona.vehicle.year, vehicleMake: persona.vehicle.make, vehicleModel: persona.vehicle.model });
      step(request, `Emailed ${shop.name} demo inbox at ${mailto}`);
    }
    request.status = "sent";
    step(request, "Waiting for the shop's reply");
  } catch (error) {
    request.status = "failed";
    request.error = error instanceof Error ? error.message : "Unable to request a quote.";
    step(request, request.error);
  }
  return request;
}
