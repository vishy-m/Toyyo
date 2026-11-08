"use client";

import clsx from "clsx";
import { CalendarClock, KeyRound, ShieldPlus, Umbrella } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Skeleton } from "@/components/ui/Skeleton";
import { consentLabel, moveLabel } from "@/lib/client/format";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData, EngineResult, MoveOption, MoveType } from "@/lib/types";

export const moveIcon: Record<MoveType, typeof KeyRound> = {
  "lease-end": KeyRound,
  insurance: Umbrella,
  payment: CalendarClock,
  protection: ShieldPlus,
};

const ORDER: MoveType[] = ["lease-end", "insurance", "payment", "protection"];

export function bestOption(data: DashboardData, e: EngineResult): MoveOption | undefined {
  const ranked = data.ranked.find((r) => r.moveType === e.moveType);
  if (ranked) {
    const o = e.options.find((x) => x.id === ranked.optionId);
    if (o) return o;
  }
  const better = e.options
    .filter((o) => o.eligible && o.id !== e.baselineOptionId && (o.savingsVsBaseline ?? 0) > 0)
    .sort((a, b) => (b.savingsVsBaseline ?? 0) - (a.savingsVsBaseline ?? 0))[0];
  return better ?? e.options.find((o) => o.id === e.baselineOptionId) ?? e.options[0];
}

function headline(o: MoveOption): { value: number; unit: string; tone: "good" | "ink" } | null {
  const s = o.savingsVsBaseline ?? 0;
  if (o.upgradeModel && o.monthlyCost) return { value: o.monthlyCost, unit: "/mo", tone: "ink" };
  if (s > 0) return { value: s, unit: o.moveType === "insurance" ? "/yr saved" : " saved", tone: "good" };
  if (o.monthlyCost) return { value: o.monthlyCost, unit: "/mo", tone: "ink" };
  return null;
}

export function MoveTiles({ data }: { data?: DashboardData }) {
  const setOpenMove = useUiStore((s) => s.setOpenMove);
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:gap-4 2xl:grid-cols-4">
        {ORDER.map((m) => (
          <Skeleton key={m} className="h-[150px] rounded-xl" />
        ))}
      </div>
    );
  }
  const topType = data.ranked[0]?.moveType;
  return (
    <nav aria-label="Your moves" className="grid grid-cols-2 gap-3 lg:gap-4 2xl:grid-cols-4">
      {ORDER.map((m) => {
        const e = data.engines[m];
        const o = bestOption(data, e);
        const Icon = moveIcon[m];
        const h = o && o.eligible ? headline(o) : null;
        const isTop = m === topType;
        const rank = data.ranked.findIndex((r) => r.moveType === m);
        const notApplicable = !o || (!o.eligible && e.options.every((x) => !x.eligible));
        return (
          <button
            key={m}
            type="button"
            onClick={() => setOpenMove(m)}
            aria-label={`${moveLabel[m]}: ${o?.title ?? "no options"}. Open details`}
            className={clsx(
              "group glass relative flex min-h-[150px] flex-col justify-between rounded-xl p-4 text-left transition-[translate,scale,border-color] duration-[300ms,400ms,200ms] ease-[var(--ease-highlight),var(--ease-press),var(--ease-ui-color)] hover:-translate-y-0.5 active:scale-[0.985] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 hover:border-ink-3 sm:p-5",
              isTop && "glow-accent",
              notApplicable && "opacity-70",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-2">
                <Icon size={16} className={isTop ? "text-accent-ink" : "text-ink-3"} />
                {moveLabel[m]}
              </span>
              {isTop ? (
                <span className="text-xs font-medium text-accent-ink">Recommended</span>
              ) : rank > 0 ? (
                <span className="num text-xs text-ink-3">Rank {rank + 1}</span>
              ) : null}
            </div>
            <div className="mt-3">
              {h ? (
                <div className={clsx("num text-[26px] leading-none font-semibold sm:text-[30px]", h.tone === "good" ? "text-good" : "text-ink")}>
                  $<AnimatedNumber value={h.value} />
                  <span className="ml-0.5 text-[13px] font-medium text-ink-3">{h.unit}</span>
                </div>
              ) : (
                <div className="num text-[22px] leading-none font-semibold text-ink-3">{notApplicable ? "n/a" : "—"}</div>
              )}
              <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-ink-2">
                {notApplicable ? (o?.ineligibleReason ?? "Not available") : o?.title}
              </p>
              {e.limitedBy?.length ? <p className="mt-1.5 text-[11px] font-medium text-warn">Limited: {e.limitedBy.map((c) => consentLabel[c].toLowerCase()).join(", ")} off</p> : null}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
