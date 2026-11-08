"use client";

import clsx from "clsx";
import { Bot, Check, LoaderCircle, Mail, MapPin, PhoneCall, Play, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { demoProviders, type ActionPlan } from "@/lib/agent/action-agent";
import { analyzeRepairDecision, classifyRepair, type RepairAdvisorInput } from "@/lib/engines/repair-advisor";

type ActionForm = RepairAdvisorInput & { city: string; shopName: string };
type Task = "quote" | "availability" | "warranty" | "follow_up" | "callback";
type Channel = "email" | "voicemail" | "both";
type Tone = "concise" | "friendly" | "formal";
type FollowUp = "none" | "once" | "remind" | "ask";
const VOICEMAIL_NUMBER = "(469) 980-1996";
const selectClass = "mt-1.5 h-11 w-full rounded-lg border border-line-2 bg-[var(--glass-hi)] px-3 text-sm text-ink";

export function ActionAgent({ form, customerName }: { form: ActionForm; customerName: string }) {
  const result = useMemo(() => analyzeRepairDecision(form), [form]);
  const estimate = classifyRepair(form.issue, form.vehicle.year, form.manualQuote);
  const providers = demoProviders[form.city] ?? demoProviders.Austin;
  const [provider, setProvider] = useState(form.shopName || providers[0].name);
  const [task, setTask] = useState<Task>("quote");
  const [channel, setChannel] = useState<Channel>("email");
  const [tone, setTone] = useState<Tone>("concise");
  const [followUp, setFollowUp] = useState<FollowUp>("none");
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [voicemailScript, setVoicemailScript] = useState("");
  const [approveEmail, setApproveEmail] = useState(false);
  const [approveVoicemail, setApproveVoicemail] = useState(false);
  const [building, setBuilding] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<{ email?: { recipient: string }; voicemail?: { recipient: string; trialTemplate?: boolean }; errors?: string[] } | null>(null);

  const wantsEmail = channel === "email" || channel === "both";
  const wantsVoicemail = channel === "voicemail" || channel === "both";
  const resetDraft = () => { setPlan(null); setApproveEmail(false); setApproveVoicemail(false); setDelivery(null); setError(""); };

  const build = async () => {
    setBuilding(true); setError(""); setDelivery(null);
    try {
      const response = await fetch("/api/action-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "draft", name: customerName, vehicle: form.vehicle, issue: form.issue, estimate: estimate.estimate, recommendation: result.recommendation, provider, task, channel, tone, followUp }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not build the agent.");
      setPlan(body.plan); setEmailDraft(body.plan.emailDraft); setVoicemailScript(body.plan.voicemailScript);
      setApproveEmail(false); setApproveVoicemail(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not build the agent."); }
    finally { setBuilding(false); }
  };

  const execute = async () => {
    setRunning(true); setError(""); setDelivery(null);
    try {
      const response = await fetch("/api/action-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "execute", channel, emailDraft, voicemailScript, approveEmail, approveVoicemail, idempotencySource: JSON.stringify({ provider, task, channel, emailDraft, voicemailScript }) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? body.errors?.join(" ") ?? "Outreach failed.");
      setDelivery(body);
      if (body.errors?.length) setError(body.errors.join(" "));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Outreach failed."); }
    finally { setRunning(false); }
  };

  const approved = (!wantsEmail || approveEmail) && (!wantsVoicemail || approveVoicemail);

  return (
    <div className="space-y-6">
      <div><p className="text-[13px] font-medium text-ink-3">Step 5 of 5</p><h2 className="font-display mt-1 text-2xl text-ink sm:text-[28px]">Build an agent</h2><p className="mt-2 text-sm text-ink-2">Configure, preview, approve, then run.</p></div>

      <section className="rounded-xl border border-line p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Bot size={17} />Configuration</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-2">Task<select value={task} onChange={event => { setTask(event.target.value as Task); resetDraft(); }} className={selectClass}><option value="quote">Request a written quote</option><option value="availability">Ask for availability</option><option value="warranty">Confirm warranty details</option><option value="follow_up">Follow up on a quote</option><option value="callback">Request a callback</option></select></label>
          <label className="text-xs font-medium text-ink-2">Contact method<select value={channel} onChange={event => { setChannel(event.target.value as Channel); resetDraft(); }} className={selectClass}><option value="email">Email</option><option value="voicemail">Voicemail</option><option value="both">Email and voicemail</option></select></label>
          <label className="text-xs font-medium text-ink-2">Tone<select value={tone} onChange={event => { setTone(event.target.value as Tone); resetDraft(); }} className={selectClass}><option value="concise">Concise</option><option value="friendly">Friendly</option><option value="formal">Formal</option></select></label>
          <label className="text-xs font-medium text-ink-2">Follow-up<select value={followUp} onChange={event => { setFollowUp(event.target.value as FollowUp); resetDraft(); }} className={selectClass}><option value="none">No follow-up</option><option value="once">Follow up once</option><option value="remind">Remind me</option><option value="ask">Ask me first</option></select></label>
        </div>
        <div className="mt-5"><h3 className="text-xs font-medium text-ink-2">Provider</h3><div className="mt-2 grid gap-2 sm:grid-cols-3">{providers.map(item => <button key={item.name} type="button" onClick={() => { setProvider(item.name); resetDraft(); }} className={clsx("rounded-lg border p-3 text-left", provider === item.name ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}><MapPin size={14} className="text-ink-3" /><span className="mt-2 block text-sm font-medium text-ink">{item.name}</span><span className="mt-1 block text-xs text-ink-3">{item.detail}</span></button>)}</div></div>
        {wantsVoicemail && <p className="mt-4 flex items-center gap-2 text-xs text-ink-3"><PhoneCall size={14} />Voicemail destination: {VOICEMAIL_NUMBER}</p>}
        <Button variant="primary" className="mt-5" onClick={build} disabled={building}>{building ? <><LoaderCircle size={15} className="animate-spin" />Building…</> : <><Sparkles size={15} />Build workflow</>}</Button>
      </section>

      {plan && <>
        <section className="rounded-xl border border-line p-5"><h3 className="text-sm font-semibold text-ink">Workflow</h3><p className="mt-2 text-sm text-ink-2">{plan.objective}</p><ol className="mt-4 grid gap-2 sm:grid-cols-4">{plan.tasks.map((item, index) => <li key={item.id} className="rounded-lg bg-[var(--glass-hi)] p-3"><span className="text-xs font-semibold text-accent-ink">{index + 1}</span><div className="mt-1 text-sm font-medium text-ink">{item.title}</div><p className="mt-1 text-xs text-ink-3">{item.detail}</p></li>)}</ol></section>
        <div className={clsx("grid gap-4", channel === "both" && "lg:grid-cols-2")}>
          {wantsEmail && <section className="rounded-xl border border-line p-5"><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Mail size={15} />Email preview</h3><textarea value={emailDraft} onChange={event => { setEmailDraft(event.target.value); setApproveEmail(false); }} rows={11} className="mt-3 w-full resize-y rounded-lg border border-line-2 bg-[var(--glass-hi)] p-3 text-sm leading-relaxed text-ink" /><label className="mt-3 flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={approveEmail} onChange={event => setApproveEmail(event.target.checked)} />Approve email</label></section>}
          {wantsVoicemail && <section className="rounded-xl border border-line p-5"><h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><PhoneCall size={15} />Voicemail preview</h3><p className="mt-1 text-xs text-ink-3">To {VOICEMAIL_NUMBER}</p><textarea value={voicemailScript} onChange={event => { setVoicemailScript(event.target.value); setApproveVoicemail(false); }} rows={11} className="mt-3 w-full resize-y rounded-lg border border-line-2 bg-[var(--glass-hi)] p-3 text-sm leading-relaxed text-ink" /><label className="mt-3 flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={approveVoicemail} onChange={event => setApproveVoicemail(event.target.checked)} />Approve voicemail</label></section>}
        </div>
        <Button variant="primary" onClick={execute} disabled={!approved || running}>{running ? <><LoaderCircle size={15} className="animate-spin" />Running…</> : <><Play size={15} />Run approved workflow</>}</Button>
      </>}

      {delivery && <div className="rounded-lg border border-good bg-good-soft p-4 text-sm text-good"><Check size={15} className="mr-2 inline" />{delivery.email && `Email sent to ${delivery.email.recipient}. `}{delivery.voicemail?.trialTemplate ? `Twilio trial test call started to ${VOICEMAIL_NUMBER}. Upgrade Twilio to send the custom script.` : delivery.voicemail ? `Voicemail call started to ${VOICEMAIL_NUMBER}.` : ""}</div>}
      {error && <p role="alert" className="text-sm text-accent-ink">{error}</p>}
    </div>
  );
}
