"use client";

import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { bestOption, moveIcon } from "@/components/dashboard/MoveTiles";
import { moveLabel } from "@/lib/client/format";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData, MoveOption, MoveType } from "@/lib/types";

const ORDER: MoveType[] = ["lease-end", "insurance", "payment", "protection"];
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function figure(o: MoveOption): { text: string; note: string; tone: "good" | "ink" } | null {
  const s = o.savingsVsBaseline ?? 0;
  if (o.upgradeModel && o.monthlyCost) return { text: money(o.monthlyCost), note: "a month", tone: "ink" };
  if (s > 0) return { text: money(s), note: o.moveType === "insurance" ? "saved a year" : "saved", tone: "good" };
  if (o.monthlyCost) return { text: money(o.monthlyCost), note: "a month", tone: "ink" };
  return null;
}

/**
 * The four moves as one ranked list: what the move is, the best option, its figure. A row opens
 * the comparison drawer. Ranked order, recommended first.
 */
export function MoveList({ data, onFocus }: { data: DashboardData; onFocus?: (m: MoveType | null) => void }) {
  const setOpenMove = useUiStore((s) => s.setOpenMove);
  const ranked = data.ranked.map((r) => r.moveType);
  const order = [...ranked, ...ORDER.filter((m) => !ranked.includes(m))];
  return (
    <ol className="divide-y divide-line" onMouseLeave={() => onFocus?.(null)}>
      {order.map((m, i) => {
        const e = data.engines[m];
        const o = bestOption(data, e);
        const Icon = moveIcon[m];
        const f = o && o.eligible ? figure(o) : null;
        const isTop = i === 0 && ranked[0] === m;
        const na = !o || e.options.every((x) => !x.eligible);
        return (
          <li key={m}>
            <button
              type="button"
              onMouseEnter={() => { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) onFocus?.(m); }}
              onFocus={() => onFocus?.(m)}
              onClick={() => setOpenMove(m)}
              className={clsx("group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-5 text-left transition-[scale] duration-400 ease-press active:scale-[0.985] motion-reduce:active:scale-100 sm:gap-x-4", na && "opacity-60")}
            >
              <span className={clsx("grid size-10 place-items-center rounded-lg", isTop ? "bg-accent text-white" : "bg-[var(--glass-hi)] text-ink-2")}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] whitespace-nowrap text-ink-3">
                  {moveLabel[m]}
                  {isTop && <span className="ml-2 font-semibold text-accent-ink">Recommended</span>}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[18px] leading-snug font-semibold text-ink sm:truncate sm:text-[20px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">
                  {na ? (o?.ineligibleReason ?? "Not available") : o?.title}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {f && (
                  <span className="text-right">
                    <span className={clsx("num block text-[20px] leading-none font-bold", f.tone === "good" ? "text-good" : "text-ink")}>{f.text}</span>
                    <span className="mt-1 block text-[13px] text-ink-3">{f.note}</span>
                  </span>
                )}
                <ChevronRight size={18} className="hidden text-ink-3 sm:block transition-[translate,color] duration-[300ms,200ms] ease-[var(--ease-highlight),var(--ease-ui-color)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0 group-hover:text-ink" aria-hidden />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
