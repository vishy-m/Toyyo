"use client";

import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { BadgeCheck, CornerDownRight, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Overlay";
import { findOption, useDataStore } from "@/lib/client/data-store";
import { moveLabel, prettyNums } from "@/lib/client/format";
import { useOverlayStore } from "@/lib/client/overlay-store";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData, MoveOption } from "@/lib/types";

const confidenceText: Record<MoveOption["confidence"], string> = {
  high: "All the data this needs is on file and the deadline is clear.",
  medium: "Some inputs are estimates (simulated prices or future habits).",
  low: "Key data is missing or turned off, so treat this as a rough guide.",
};

function widgetFor(source: string): { id: string; label: string } | null {
  const s = source.toLowerCase();
  if (/trip|driv|score|lifestyle|mileage trend/.test(s)) return { id: "w-driving", label: "Driving life" };
  if (/lease|loan|contract|toyotacare|vehicle|market/.test(s)) return { id: "w-contract", label: "Contract" };
  if (/cash|bank|payment|insurance|policy/.test(s)) return { id: "w-money", label: "Money" };
  return null;
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 text-[13px] font-semibold text-ink-2">{children}</h3>;
}

export function WhyDrawer({ data }: { data?: DashboardData }) {
  const reduced = useShouldReduceMotion();
  const id = useOverlayStore((s) => s.whyOptionId);
  const openWhy = useOverlayStore((s) => s.openWhy);
  const openAccept = useOverlayStore((s) => s.openAccept);
  const setOpenMove = useUiStore((s) => s.setOpenMove);
  const personaId = useUiStore((s) => s.personaId);
  const rec = useDataStore((s) => s.agent[personaId]?.recommendations.find((r) => r.optionId === id));
  const o = id ? findOption(data, id) : undefined;
  const ranked = data?.ranked.find((r) => r.optionId === id);

  const goTo = (wid: string) => {
    openWhy(null);
    setOpenMove(null);
    setTimeout(() => {
      const el = document.getElementById(wid);
      el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      el?.focus({ preventScroll: true });
    }, 250);
  };

  return (
    <Drawer
      open={!!o}
      onClose={() => openWhy(null)}
      labelledBy="why-title"
      width={560}
      title="Why am I seeing this?"
      subtitle={
        o ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-ink">{o.title}</span>
            <Chip tone="neutral">{moveLabel[o.moveType]}</Chip>
            {(rec?.grounded ?? true) && (
              <Chip tone="good" icon={<BadgeCheck size={12} />}>
                Numbers verified
              </Chip>
            )}
          </span>
        ) : null
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">This is guidance, not financial advice.</p>
          {o && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                openWhy(null);
                openAccept(o.id);
              }}
            >
              <PhoneCall size={14} />
              Talk to a TFS specialist
            </Button>
          )}
        </div>
      }
    >
      {o && (
        <div className="space-y-7">
          {rec?.why && <p className="text-[15px] leading-relaxed text-ink">{rec.why}</p>}
          {!rec?.why && <p className="text-[15px] leading-relaxed text-ink">{o.summary}</p>}

          {o.math.length > 0 && (
            <section>
              <H>Key numbers</H>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {o.math.map((m) => (
                  <li key={m.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink">{m.label}</div>
                      <div className="num mt-0.5 text-[12.5px] break-words text-ink-3">{prettyNums(m.formula)}</div>
                    </div>
                    <div className="num text-base font-semibold text-ink">{prettyNums(m.result)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <H>Data used</H>
            <ul className="space-y-1.5">
              {o.dataUsed.map((d) => {
                const w = widgetFor(d.source + " " + d.detail);
                return (
                  <li key={d.source + d.detail} className="flex items-start gap-2.5 text-sm">
                    <CornerDownRight size={14} className="mt-0.5 shrink-0 text-ink-3" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-ink capitalize">{d.source}</span>
                      <span className="text-ink-2">: {d.detail}</span>
                    </div>
                    {w && (
                      <button type="button" onClick={() => goTo(w.id)} className="shrink-0 text-xs font-medium text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink">
                        See {w.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {o.assumptions.length > 0 && (
            <section>
              <H>Assumptions</H>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {o.assumptions.map((a) => (
                  <div key={a.label}>
                    <dt className="text-xs text-ink-3">{a.label}</dt>
                    <dd className="text-sm text-ink">{prettyNums(a.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {o.tradeoffs.length > 0 && (
            <section>
              <H>What you give up</H>
              <ul className="space-y-1.5 text-sm text-ink-2">
                {o.tradeoffs.map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <H>Confidence</H>
            <div className="flex items-start gap-3">
              <Chip tone={o.confidence === "high" ? "good" : o.confidence === "medium" ? "neutral" : "warn"} className="capitalize">
                {o.confidence}
              </Chip>
              <p className="text-sm text-ink-2">{confidenceText[o.confidence]}</p>
            </div>
          </section>

          {ranked && (
            <section>
              <H>How it ranked (#{ranked.rank})</H>
              <div className="space-y-2">
                {(
                  [
                    ["Money impact", ranked.breakdown.impact],
                    ["Fits your priorities", ranked.breakdown.preferenceFit],
                    ["Urgency", Math.min(1, ranked.breakdown.urgency / 1.5)],
                    ["Confidence", ranked.breakdown.confidence],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="grid grid-cols-[130px_1fr] items-center gap-3 text-xs">
                    <span className="text-ink-2">{label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-line">
                      <span className={clsx("block h-full rounded-full bg-ink-2")} style={{ width: `${Math.max(4, Math.min(100, v * 100))}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">Ranked by fixed rules, not by the AI. The AI only explains.</p>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
