"use client";

import { spring, transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { Flame, Play } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Chip } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { categoryLabel, monthLabel, shortDate, signed, timeOfDay } from "@/lib/client/format";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData, Trip } from "@/lib/types";
import { AskButton } from "./AskButton";
import { Limited } from "./MoneyCard";
import { TripHeatmapSlot } from "./TripHeatmapSlot";

type TripRow = Omit<Trip, "path" | "events">;
type Filter = "worst" | "longest" | "road";

function scoreTone(s: number) {
  return s >= 85 ? "text-good" : s >= 70 ? "text-ink" : "text-warn";
}

/** 240° gauge, Drive Pulse-style. */
function ScoreGauge({ score }: { score: number }) {
  const reduced = useShouldReduceMotion();
  const number = useTempoTransition(spring.number);
  const size = 168;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const arc = (240 / 360) * 2 * Math.PI * r;
  const circ = 2 * Math.PI * r;
  const tone = score >= 85 ? "var(--good)" : score >= 70 ? "var(--ink)" : "var(--warn)";
  return (
    <div className="relative" style={{ width: size, height: size * 0.86 }} role="img" aria-label={`Driving score ${score} out of 100`}>
      <svg width={size} height={size} className="absolute top-0 left-0" style={{ transform: "rotate(150deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={stroke} strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          initial={false}
          animate={{ strokeDashoffset: arc * (1 - score / 100) }}
          transition={reduced ? motionTransition.instant : number}
        />
      </svg>
      <div className="absolute inset-x-0 top-[34%] text-center">
        <div className="num text-[44px] leading-none font-semibold text-ink">
          <AnimatedNumber value={score} />
        </div>
        <div className="mt-1 text-[11px] text-ink-3">of 100</div>
      </div>
    </div>
  );
}

function TripList({ trips }: { trips: TripRow[] }) {
  const openReplay = useUiStore((s) => s.openReplay);
  const [filter, setFilter] = useState<Filter>("worst");
  const rows = useMemo(() => {
    const list = [...trips];
    if (filter === "worst") list.sort((a, b) => a.score - b.score);
    else if (filter === "longest") list.sort((a, b) => b.miles - a.miles);
    else return list.filter((t) => t.category === "road-trip" || t.category === "trailhead").sort((a, b) => b.miles - a.miles).slice(0, 6);
    return list.slice(0, 6);
  }, [trips, filter]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink-2">Trips, last 90 days</h3>
        <Segmented
          size="sm"
          label="Sort trips"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "worst", label: "Worst score" },
            { value: "longest", label: "Longest" },
            { value: "road", label: "Road trips" },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">No road trips in the last 90 days.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className={clsx("num w-9 shrink-0 text-right text-lg font-semibold", scoreTone(t.score))} aria-label={`Score ${t.score}`}>
                {t.score}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{t.destinationLabel}</div>
                <div className="truncate text-xs text-ink-3">
                  {categoryLabel[t.category]}, {shortDate(t.start)} at {timeOfDay(t.start)}, <span className="num">{t.miles.toLocaleString()}</span> mi
                  {t.hardBrakes > 0 && `, ${t.hardBrakes} hard ${t.hardBrakes === 1 ? "brake" : "brakes"}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openReplay({ tripId: t.id })}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink transition-colors duration-200 ease-ui-color hover:border-line-2 hover:bg-[var(--glass-hi)]"
                aria-label={`Replay trip to ${t.destinationLabel}`}
              >
                <Play size={13} className="fill-current" />
                Replay
                {t.showcase && <span className="size-1.5 rounded-full bg-accent" aria-label="3D" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonthlyMiles({ data }: { data: DashboardData }) {
  const c = data.persona.contract;
  const allowance = c.kind === "lease" ? Math.round(c.annualMileageAllowance / 12) : null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <h3 className="font-medium text-ink-2">Miles per month</h3>
        {allowance && <span className="text-xs text-ink-3">line = lease allowance</span>}
      </div>
      <div className="h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.driving.monthlyMiles.map((m) => ({ month: monthLabel(m.month), miles: Math.round(m.miles) }))} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 11 }} width={40} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(v))} />
            <Tooltip
              cursor={{ fill: "var(--line)" }}
              contentStyle={{ background: "var(--glass-strong)", border: "1px solid var(--line-2)", borderRadius: 12, color: "var(--ink)", fontSize: 12 }}
              formatter={(v) => [`${Number(v).toLocaleString()} mi`, "Driven"]}
            />
            <Bar dataKey="miles" radius={[6, 6, 2, 2]} fill="var(--ink-2)" isAnimationActive={false} />
            {allowance && <ReferenceLine y={allowance} stroke="var(--warn)" strokeDasharray="4 4" />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** What moves the score: one row per factor, a bar for its size. The engine's boilerplate
 *  sentence ("X contributes N points…") repeats the number, so only other notes are shown. */
function ScoreFactors({ factors }: { factors: DashboardData["driving"]["scoreFactors"] }) {
  const max = Math.max(1, ...factors.map((f) => Math.abs(f.impact)));
  return (
    <ul className="min-w-0 flex-1 divide-y divide-line border-y border-line" aria-label="What moves your score">
      {factors.map((f) => {
        const tenths = Math.round(f.impact * 10);
        const tone = tenths < 0 ? "bg-warn" : tenths > 0 ? "bg-good" : "bg-line-2";
        const note = /contributes/i.test(f.detail) ? null : f.detail;
        return (
          <li key={f.factor} className="py-2">
            <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
              <span className="truncate text-ink">{f.factor}</span>
              <span className="h-1.5 rounded-full bg-line" aria-hidden>
                <span className={clsx("block h-full rounded-full", tone)} style={{ width: `${(Math.abs(f.impact) / max) * 100}%` }} />
              </span>
              <span className={clsx("num text-right font-semibold", tenths < 0 ? "text-warn" : tenths > 0 ? "text-good" : "text-ink-3")}>{signed(f.impact)}</span>
            </div>
            {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function DrivingLife({ data }: { data?: DashboardData }) {
  const openReplay = useUiStore((s) => s.openReplay);
  if (!data) return <Skeleton className="h-[560px] rounded-xl" />;
  const d = data.driving;
  if (!data.persona.consent.driving) {
    return (
      <Panel title="Trips and driving">
        <Limited source="driving data" what="Trips, your driving score and mileage projections are hidden. Lease math uses your contract allowance instead." />
      </Panel>
    );
  }
  return (
    <Panel
      id="w-driving"
      title="Trips and driving"
      aside={
        <>
          {d.smoothStreak >= 3 && (
            <Chip tone="good" icon={<Flame size={12} />}>
              {d.smoothStreak} smooth trips in a row
            </Chip>
          )}
          <AskButton widget="driving" />
        </>
      }
    >
      <TripHeatmapSlot trips={data.trips} onSelectTrip={(id) => openReplay({ tripId: id })} topDestinations={d.topDestinations} city={data.persona.city} />

      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-medium text-ink-2">Driving score</h3>
          <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start">
            <div className="flex shrink-0 flex-col items-center">
              <ScoreGauge score={d.score} />
              <p className="-mt-1 text-xs text-ink-3">Simulated score</p>
            </div>
            <ScoreFactors factors={d.scoreFactors} />
          </div>
        </div>
        <div>
          <MonthlyMiles data={data} />
        </div>
      </div>

      {data.tripInsights.length > 0 && (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {data.tripInsights.map((i) => (
            <li key={i.id} className="rounded-lg border border-line p-3.5 text-[13px] leading-snug text-ink-2">
              {i.text}
              {i.relatedTripId && (
                <button type="button" onClick={() => openReplay({ tripId: i.relatedTripId! })} className="mt-1.5 block text-[13px] font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink">
                  Replay the trip
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <TripList trips={data.trips} />
      </div>
    </Panel>
  );
}
