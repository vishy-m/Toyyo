"use client";

import { useEffect, useState } from "react";
import type { PersonaId } from "@/lib/types";
import type { LeaseConversation as Conversation } from "@/lib/server/lease-conversation";
import { actLease, loadLease } from "./lease-actions";

async function request(personaId: PersonaId, action?: "evaluate" | "reply" | "approve" | "mileage", text?: string, odometer?: number): Promise<Conversation> {
  return action ? actLease(personaId, action, text, odometer) : loadLease(personaId);
}

export function LeaseConversation({ personaId, currentOdometer, onApproved }: { personaId: PersonaId; currentOdometer: number; onApproved: () => Promise<void> }) {
  const [flow, setFlow] = useState<Conversation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [odometer, setOdometer] = useState(currentOdometer);
  useEffect(() => { let active = true; request(personaId).then(value => { if (active) setFlow(value); }).catch(reason => { if (active) setError(String(reason)); }); return () => { active = false; }; }, [personaId]);
  const act = async (action: "evaluate" | "reply" | "approve" | "mileage", text?: string) => {
    setBusy(true); setError("");
    try {
      const updated = await request(personaId, action, text, action === "mileage" ? odometer : undefined);
      setFlow(updated);
      if (action === "mileage") await onApproved();
      if (updated.stage === "approved") await onApproved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the conversation."); }
    finally { setBusy(false); }
  };
  return <section className="ownership-conversation" aria-label="Proactive lease conversation">
    <h2>Before the miles add up</h2>
    <p className="ownership-muted">Use recent driving to spot a lease overage early, then follow the text conversation through a simulated dealer decision.</p>
    {flow?.stage === "idle" && <button className="ownership-secondary" disabled={busy} onClick={() => void act("evaluate")}>Check mileage and draft text</button>}
    {flow?.stage !== "approved" && flow?.stage !== "dealer-review" && <div className="ownership-inline-actions"><label className="ownership-small">Updated odometer <input type="number" min={currentOdometer} max={500000} value={odometer} onChange={event => setOdometer(Number(event.target.value))} /></label><button className="ownership-text-button" disabled={busy || !Number.isInteger(odometer) || odometer < currentOdometer} onClick={() => void act("mileage")}>Update mileage</button></div>}
    {flow && flow.projectedExcessMiles > 0 && <p className="ownership-small">Projected overage: {flow.projectedExcessMiles.toLocaleString()} miles · Estimated charge: ${flow.projectedOverageCharge.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}
    {flow?.stage === "idle" && flow.projectedExcessMiles > 0 && flow.projectedExcessMiles < 1000 && <p className="ownership-small">The current pace is below the 1,000-mile alert threshold.</p>}
    {flow?.messages.length ? <div className="ownership-conversation-messages" aria-live="polite">{flow.messages.map((entry, index) => <p key={index} className={entry.direction === "in" ? "is-inbound" : "is-outbound"}><strong>{entry.direction === "in" ? "You" : "Toyyo"}</strong> {entry.text}<small>{entry.delivery === "accepted" ? "Accepted by Photon; delivery pending" : entry.delivery === "simulated" ? "Demo text" : "Demo reply"}</small></p>)}</div> : null}
    {flow?.stage === "warning" && <div className="ownership-inline-actions"><button className="ownership-secondary" disabled={busy} onClick={() => void act("reply", "OPTIONS")}>Reply OPTIONS</button><button className="ownership-text-button" disabled={busy} onClick={() => void act("reply", "STOP")}>Reply STOP</button></div>}
    {flow?.stage === "offer" && <div className="ownership-inline-actions"><button className="ownership-secondary" disabled={busy} onClick={() => void act("reply", "SWITCH")}>Explore switch</button><button className="ownership-secondary" disabled={busy} onClick={() => void act("reply", "BUYOUT")}>Explore buyout</button>{flow.optionId && <button className="ownership-primary" disabled={busy} onClick={() => void act("reply", flow.optionId === "lease-end:upgrade" ? "CONFIRM SWITCH" : "CONFIRM BUYOUT")}>Confirm reviewed option</button>}</div>}
    {flow?.stage === "dealer-review" && <div className="ownership-message"><p>Simulated dealer packet {flow.packet?.id.slice(0, 8)} is ready. It includes the chosen option, calculated terms, consented sources and stated preferences.</p><button className="ownership-secondary" disabled={busy} onClick={() => void act("approve")}>Simulate dealer approval</button></div>}
    {flow?.stage === "approved" && <p className="ownership-message">Approved in this demo. Your account now shows the new contract. First estimated payment date: {flow.nextPaymentDue}.</p>}
    {flow?.stage === "declined" && <p className="ownership-message">Conversation ended. Your vehicle and contract were not changed.</p>}
    {error && <p className="ownership-message ownership-error" role="alert">{error}</p>}
  </section>;
}
