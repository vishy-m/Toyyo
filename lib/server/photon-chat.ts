import { runAgent } from "../agent/loop";
import type { AgentStreamEvent, PersonaId } from "../types";
import { getLeaseConversation, rehydrateLease, replyToLease, resumeProactiveLease, stopProactiveLease } from "./lease-conversation";
import { assertPhotonReady, sendPhotonText } from "./photon";

type Turn = { role: "user" | "assistant"; text: string };
const root = globalThis as typeof globalThis & { __toyyoPhotonChat?: { history: Map<PersonaId, Turn[]>; processed: Set<string>; inFlight: Map<string, Promise<void>>; queue: Map<PersonaId, Promise<void>> } };
const store = root.__toyyoPhotonChat ??= { history: new Map(), processed: new Set(), inFlight: new Map(), queue: new Map() };
store.queue ??= new Map(); // Preserve state across development hot reloads.
export function getPhotonChatHistory(personaId: PersonaId): Turn[] { return structuredClone(store.history.get(personaId) ?? []); }

async function sendAnswer(personaId: PersonaId, answer: string, eventId: string, requireLive: boolean) {
  const text = answer.trim() || "I couldn't complete that answer. Please try again with a shorter question.";
  // Photon accepts one plain-text body per call; keep each segment readable on a phone.
  const parts: string[] = [];
  let remaining = text.slice(0, 3600);
  while (remaining.length) {
    let cut = Math.min(remaining.length, 900);
    if (cut < remaining.length) {
      const boundary = remaining.lastIndexOf(" ", cut);
      if (boundary > cut / 2) cut = boundary;
    }
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }
  for (let i = 0; i < parts.length; i++) await sendPhotonText(personaId, parts[i], `toyyo-chat-${eventId}-${i}`, requireLive);
  return text;
}

async function processMessage(personaId: PersonaId, text: string, eventId: string, requireLive: boolean) {
  if (requireLive) assertPhotonReady(personaId);
  const raw = text.trim();
  // An explicit lease reply rebuilds the conversation if this server instance never saw the warning (serverless).
  const leaseReply = /^(OPTIONS|MENU|[1-4][.)]?|SWITCH|BUYOUT|CONFIRM SWITCH|CONFIRM BUYOUT)$/i.test(raw);
  const flow = leaseReply ? rehydrateLease(personaId, raw.toUpperCase()) : getLeaseConversation(personaId);
  const command = /^SHOW (ME )?(MY )?OPTIONS[.!]?$/i.test(raw) ? "OPTIONS"
    : flow.stage === "offer" && /^(I (?:WANT|WOULD LIKE)(?: TO)? (?:SWITCH|CHANGE CARS)|LET'S SWITCH)[.!]?$/i.test(raw) ? "SWITCH"
    : flow.stage === "offer" && /^(I (?:WANT|WOULD LIKE)(?: TO)? (?:BUY OUT|BUYOUT)|LET'S BUY OUT)[.!]?$/i.test(raw) ? "BUYOUT"
    : raw.toUpperCase();
  const history = store.history.get(personaId) ?? [];
  const remember = (answer: string) => store.history.set(personaId, [...history, { role: "user", text }, { role: "assistant", text: answer }].slice(-12));

  if (command === "STOP") {
    if (flow.stage === "warning" || flow.stage === "offer") {
      const updated = await replyToLease(personaId, text, eventId);
      remember(updated.messages.findLast(item => item.direction === "out")?.text ?? "Proactive alerts stopped.");
    } else {
      stopProactiveLease(personaId);
      remember(await sendAnswer(personaId, "Toyyo: Proactive lease alerts are off. Text START to resume them, or ask a question any time.", eventId, requireLive));
    }
    return;
  }
  if (command === "START") {
    resumeProactiveLease(personaId);
    remember(await sendAnswer(personaId, "Toyyo: Proactive lease alerts are back on. Ask about your car or lease whenever you like.", eventId, requireLive));
    return;
  }
  // Lease commands: the numbered plans (1-4), the list, and the confirm words. Anything else goes to the agent.
  const choiceNumber = /^[1-4][.)]?$/.test(command) ? command.charAt(0) : command;
  if ((flow.stage === "warning" && /^(OPTIONS|MENU|YES|NO|[1-4]|SWITCH|BUYOUT)$/.test(choiceNumber)) || (flow.stage === "offer" && /^(OPTIONS|MENU|NO|[1-4]|SWITCH|BUYOUT|CONFIRM SWITCH|CONFIRM BUYOUT)$/.test(choiceNumber))) {
    const updated = await replyToLease(personaId, choiceNumber, eventId);
    remember(updated.messages.findLast(item => item.direction === "out")?.text ?? "Your lease choice was updated.");
    return;
  }
  if (flow.stage === "offer" && flow.optionId && /^(YES|YES,? THAT WORKS|SOUNDS GOOD|I AGREE)[.!]?$/i.test(raw)) {
    const choice = flow.optionId === "lease-end:upgrade" ? "SWITCH" : "BUYOUT";
    remember(await sendAnswer(personaId, `Toyyo: To create the simulated dealer packet for the option you reviewed, reply CONFIRM ${choice}. No contract changes until the demo dealer approves it.`, eventId, requireLive));
    return;
  }
  if (flow.stage === "dealer-review" && /^(APPROVE|CONFIRM|YES)$/.test(command)) {
    remember(await sendAnswer(personaId, "Toyyo: Your simulated packet is waiting for the demo dealer's decision. A customer reply cannot approve it.", eventId, requireLive));
    return;
  }

  let answer = "";
  let error = "";
  await runAgent({ personaId, message: text }, (event: AgentStreamEvent) => {
    if (event.type === "text") answer += event.delta;
    if (event.type === "error") error = event.message;
  }, undefined, history);
  const sent = await sendAnswer(personaId, answer || error, eventId, requireLive);
  remember(sent);
}

/** Shared entry point for verified Photon deliveries and local simulated inbound tests. */
export async function handlePhotonMessage(personaId: PersonaId, text: string, eventId: string, requireLive = false) {
  const key = `${personaId}:${eventId}`;
  if (store.processed.has(key)) return { duplicate: true };
  const pending = store.inFlight.get(key);
  if (pending) { await pending; return { duplicate: true }; }
  const prior = store.queue.get(personaId) ?? Promise.resolve();
  const task = prior.catch(() => {}).then(() => processMessage(personaId, text, eventId, requireLive));
  store.inFlight.set(key, task);
  store.queue.set(personaId, task);
  try { await task; store.processed.add(key); return { duplicate: false }; }
  finally { store.inFlight.delete(key); if (store.queue.get(personaId) === task) store.queue.delete(personaId); }
}
