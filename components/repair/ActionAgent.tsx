"use client";

import clsx from "clsx";
import { Bot, Check, Clipboard, LoaderCircle, MailCheck, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { demoProviders, type ActionPlan, type ActionTaskStatus } from "@/lib/agent/action-agent";
import { analyzeRepairDecision, classifyRepair, type RepairAdvisorInput } from "@/lib/engines/repair-advisor";

type ActionForm = RepairAdvisorInput & { city: string; shopName: string };

function statusLabel(status: ActionTaskStatus) {
  if (status === "completed") return "Done";
  if (status === "needs_approval") return "Your approval";
  if (status === "running") return "Working";
  return "Queued";
}

export function ActionAgent({ form, customerName }: { form: ActionForm; customerName: string }) {
  const result = useMemo(() => analyzeRepairDecision(form), [form]);
  const estimate = classifyRepair(form.issue, form.vehicle.year, form.manualQuote);
  const providers = demoProviders[form.city] ?? demoProviders.Austin;
  const [provider, setProvider] = useState(form.shopName || providers[0].name);
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ActionTaskStatus>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<{ id: string; recipient: string } | null>(null);
  const [modelUsed, setModelUsed] = useState("");

  const start = async () => {
    setCreating(true); setError(""); setDelivery(null);
    try {
      const response = await fetch("/api/action-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "plan", name: customerName, vehicle: form.vehicle, issue: form.issue, estimate: estimate.estimate, recommendation: result.recommendation, provider }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The agent could not start.");
      setPlan(body.plan);
      setModelUsed(body.provider);
      setDelivery(body.delivery ?? null);
      setStatuses(Object.fromEntries(body.plan.tasks.map((task: { id: string }) => [task.id, body.delivery ? "completed" : "pending"])));
      if (body.deliveryError) setError(`The plan was created, but email delivery failed: ${body.deliveryError}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The agent could not start.");
    } finally { setCreating(false); }
  };

  const copyDraft = async () => {
    if (plan) await navigator.clipboard.writeText(plan.draft);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-medium text-ink-3">Step 5 of 5</p>
        <div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl text-ink sm:text-[28px]">Action Agent</h2><Chip tone="accent">Autonomous outreach</Chip></div>
        <p className="mt-2 max-w-[65ch] text-sm text-ink-2">Turn your recommendation into an active workflow. The agent prepares and emails the action brief automatically without authorizing repairs or appointments.</p>
      </div>

      {!plan ? <>
        <div className="grid gap-3 sm:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-accent bg-accent-soft p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-accent-ink"><Sparkles size={16} />Recommended mission</div>
            <h3 className="mt-3 text-lg font-semibold text-ink">Get a written quote and validate the plan</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">Start from the current “{result.options.find(option => option.path === result.recommendation)?.title}” recommendation, contact one demo provider, then compare its response with the planning estimate.</p>
          </div>
          <div className="rounded-lg border border-line p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-ink"><ShieldCheck size={16} />Cost-controlled</div>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">One compact Haiku request creates the workflow and Resend emails it to the configured inbox. Provider lookup and financial calculations use local code.</p>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Choose a provider</h3>
          <p className="mt-1 text-xs text-ink-3">Demo directory for {form.city}. Confirm all details independently.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">{providers.map(item => <button key={item.name} type="button" onClick={() => setProvider(item.name)} className={clsx("rounded-lg border p-4 text-left", provider === item.name ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}><MapPin size={15} className="text-ink-3" /><span className="mt-2 block text-sm font-medium text-ink">{item.name}</span><span className="mt-1 block text-xs text-ink-3">{item.detail}</span></button>)}</div>
        </div>
        <Button variant="primary" onClick={start} disabled={creating}>{creating ? <><LoaderCircle size={15} className="animate-spin" />Creating action plan…</> : <><Bot size={16} />Start action agent</>}</Button>
      </> : <>
        <section className="rounded-lg border border-accent bg-accent-soft p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Current objective</p>
          <h3 className="mt-2 text-lg font-semibold text-ink">{plan.objective}</h3>
          <p className="mt-2 text-xs text-ink-3">Working with {provider} · {modelUsed === "local-fallback" ? "local fallback" : "Claude Haiku"}</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section>
            <h3 className="text-sm font-semibold text-ink">Task progress</h3>
            <ol className="mt-3 space-y-2">{plan.tasks.map((task, index) => { const status = statuses[task.id] ?? "pending"; return <li key={task.id} className="rounded-lg border border-line p-3.5"><div className="flex items-start gap-3"><span className={clsx("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", status === "completed" ? "bg-good text-white" : status === "needs_approval" ? "bg-accent text-white" : "bg-[var(--glass-hi)] text-ink-3")}>{status === "completed" ? <Check size={14} /> : index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="text-sm font-medium text-ink">{task.title}</div><span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-3">{statusLabel(status)}</span></div><p className="mt-1 text-xs leading-relaxed text-ink-3">{task.detail}</p></div></div></li>; })}</ol>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">Prepared outreach</h3>
            <div className="mt-3 whitespace-pre-line rounded-lg border border-line bg-[var(--glass-hi)] p-4 text-sm leading-relaxed text-ink-2">{plan.draft}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2"><Button onClick={copyDraft}><Clipboard size={15} />Copy</Button>{delivery && <span className="inline-flex items-center gap-1.5 rounded-lg bg-good-soft px-3 py-2 text-xs font-semibold text-good"><MailCheck size={14} />Sent to {delivery.recipient}</span>}</div>
            <p className="mt-2 text-xs text-ink-3">The email contains both properly formatted HTML and a plain-text fallback. Sending the brief does not authorize work, pricing, or an appointment.</p>
          </section>
        </div>
      </>}
      {error && <p role="alert" className="text-sm text-accent-ink">{error}</p>}
    </div>
  );
}
