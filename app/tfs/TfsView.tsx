"use client";

import { spring, transition as motionTransition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { motion } from "motion/react";
import { ArrowLeft, Inbox, PhoneCall, RefreshCw, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Chip } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Overlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { initials, ShiftMark } from "@/components/dashboard/TopBar";
import { getTfs } from "@/lib/client/api";
import { consentLabel, moveLabel, shortDate, timeOfDay, usd } from "@/lib/client/format";
import { useReducedMotionSync } from "@/lib/client/hooks";
import { mockPersonas } from "@/lib/mock/personas";
import type { HandoffPacket, TfsData } from "@/lib/types";

function Kpi({ label, value, format, note }: { label: string; value: number; format?: (n: number) => string; note?: string }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-ink">{label}</h2>
      <div className="num mt-1.5 text-[28px] leading-none font-semibold text-ink sm:text-[32px]">
        <AnimatedNumber value={value} format={format} />
      </div>
      {note && <div className="mt-1.5 text-xs text-ink-3">{note}</div>}
    </div>
  );
}

function PacketDrawer({ packet, onClose }: { packet: HandoffPacket | null; onClose: () => void }) {
  const p = packet ? mockPersonas[packet.personaId] : null;
  return (
    <Drawer
      open={!!packet}
      onClose={onClose}
      width={560}
      labelledBy="packet-title"
      title="Handoff packet"
      subtitle={packet && p ? `${p.name}, ${moveLabel[packet.moveType]}, ${shortDate(packet.createdAt)}, ${timeOfDay(packet.createdAt)}` : null}
    >
      {packet && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Chip tone={packet.mode === "specialist-callback" ? "warn" : "good"} icon={packet.mode === "specialist-callback" ? <PhoneCall size={12} /> : <UserRound size={12} />}>
              {packet.mode === "specialist-callback" ? "Call the customer back" : "Customer finishing self-service"}
            </Chip>
            <Chip tone="quiet">#{packet.id.slice(0, 8)}</Chip>
          </div>
          <section>
            <h3 className="mb-2 text-[15px] font-semibold text-ink">Customer summary</h3>
            <p className="text-[15px] leading-relaxed text-ink">{packet.customerSummary}</p>
          </section>
          {packet.numbers.length > 0 && (
            <section>
              <h3 className="mb-2 text-[15px] font-semibold text-ink">Numbers the customer saw</h3>
              <dl className="divide-y divide-line rounded-lg border border-line">
                {packet.numbers.map((n) => (
                  <div key={n.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-ink-2">{n.label}</dt>
                    <dd className="num text-right font-medium text-ink">{n.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-[15px] font-semibold text-ink">Data the customer agreed to share</h3>
            <div className="flex flex-wrap gap-1.5">
              {packet.consentedData.length ? packet.consentedData.map((c) => <Chip key={c}>{consentLabel[c]}</Chip>) : <span className="text-sm text-ink-3">Contract details only</span>}
            </div>
          </section>
          {packet.statedPreferences.length > 0 && (
            <section>
              <h3 className="mb-2 text-[15px] font-semibold text-ink">In their own words</h3>
              <ul className="space-y-1.5 text-sm text-ink">
                {packet.statedPreferences.map((s) => (
                  <li key={s} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="rounded-lg bg-[var(--glass-hi)] p-4 text-[13px] text-ink-2">No re-asking needed: the specialist starts with the move, the math and the customer&apos;s preferences.</p>
        </div>
      )}
    </Drawer>
  );
}

export function TfsView() {
  useReducedMotionSync();
  const reduced = useShouldReduceMotion();
  const number = useTempoTransition(spring.number);
  const [data, setData] = useState<TfsData | null>(null);
  const [open, setOpen] = useState<HandoffPacket | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTfs = useCallback(() => getTfs().then(setData), []);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchTfs();
    } finally {
      setRefreshing(false);
    }
  }, [fetchTfs]);

  // Live: poll so a packet accepted in the customer view shows up here without a reload.
  useEffect(() => {
    void fetchTfs();
    const t = setInterval(() => void fetchTfs(), 6000);
    return () => clearInterval(t);
  }, [fetchTfs]);

  const m = data?.metrics ?? [];
  const totalValue = m.reduce((a, x) => a + x.projectedValue, 0);
  const avgRetention = m.length ? m.reduce((a, x) => a + x.retentionLikelihood, 0) / m.length : 0;
  const calls = m.reduce((a, x) => a + x.callsAvoided, 0);
  const packets = data?.packets ?? [];
  const assumptions = Array.from(new Map(m.flatMap((x) => x.assumptions).map((a) => [a.label, a])).values());

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-[var(--glass)]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink-2 hover:bg-[var(--glass-hi)] hover:text-ink">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Customer view</span>
          </Link>
          <span className="h-6 w-px bg-line" aria-hidden />
          <ShiftMark className="size-6 text-ink" />
          <h1 className="font-display text-[17px] text-ink">TFS Insight</h1>
          <span className="hidden text-sm text-ink-3 md:inline">Internal view</span>
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-[var(--glass-hi)] hover:text-ink"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={clsx(refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Live</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-xl bg-[var(--glass)]">
          <div className="grid grid-cols-2 gap-6 p-5 sm:p-8 lg:grid-cols-4 lg:gap-8">
            {data ? (
              <>
                <Kpi label="Projected value retained" value={totalValue} format={(n) => usd(n)} note="across 4 customers" />
                <Kpi label="Avg retention likelihood" value={avgRetention * 100} format={(n) => `${Math.round(n)}%`} />
                <Kpi label="Service calls avoided" value={calls} format={(n) => (Math.round(n * 10) / 10).toString()} />
                <Kpi label="Open handoff packets" value={packets.length} />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
            )}
          </div>

          <section aria-labelledby="customers-h" className="border-t border-line py-6 sm:py-8">
            <h2 id="customers-h" className="px-5 pb-4 text-[15px] font-semibold text-ink sm:px-8">
              Customers
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs text-ink-3">
                    <th className="px-5 py-2.5 font-medium sm:px-8">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Recommended move</th>
                    <th className="px-3 py-2.5 font-medium">Accepted</th>
                    <th className="px-3 py-2.5 text-right font-medium">Retention</th>
                    <th className="px-3 py-2.5 text-right font-medium">Value</th>
                    <th className="px-3 py-2.5 text-right font-medium">Calls avoided</th>
                    <th className="px-5 py-2.5 text-right font-medium sm:px-8">Packets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {!data &&
                    [0, 1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td colSpan={7} className="px-6 py-3">
                          <Skeleton className="h-6" />
                        </td>
                      </tr>
                    ))}
                  {m.map((x) => {
                    const p = mockPersonas[x.personaId];
                    return (
                      <tr key={x.personaId}>
                        <td className="px-5 py-3.5 sm:px-8">
                          <div className="flex items-center gap-3">
                            <span className="grid size-8 place-items-center rounded-md bg-ink text-[12px] font-semibold text-bg" aria-hidden>
                              {initials(p.name)}
                            </span>
                            <div>
                              <div className="font-medium text-ink">{p.name}</div>
                              <div className="text-xs text-ink-3">
                                {p.vehicle.year} {p.vehicle.model}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-ink">{x.recommendedMove}</td>
                        <td className="px-3 py-3.5">{x.accepted ? <Chip tone="good">Accepted</Chip> : <span className="text-ink-3">Not yet</span>}</td>
                        <td className="px-3 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line sm:block">
                              <motion.span
                                className="block h-full w-full rounded-full bg-ink-2"
                                initial={false}
                                animate={{ transform: `translateX(-${100 - x.retentionLikelihood * 100}%)` }}
                                transition={reduced ? motionTransition.instant : number}
                              />
                            </span>
                            <span className="num font-semibold text-ink">{Math.round(x.retentionLikelihood * 100)}%</span>
                          </div>
                        </td>
                        <td className="num px-3 py-3.5 text-right font-semibold text-ink">{usd(x.projectedValue)}</td>
                        <td className="num px-3 py-3.5 text-right text-ink">{Math.round(x.callsAvoided * 10) / 10}</td>
                        <td className="num px-5 py-3.5 text-right text-ink sm:px-8">{x.openPackets}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 border-t border-line lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section aria-labelledby="packets-h" className="p-5 sm:p-8">
              <h2 id="packets-h" className="mb-4 text-[15px] font-semibold text-ink">
                Handoff packets
              </h2>
              {packets.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-2 px-6 py-10 text-center">
                  <Inbox size={22} className="text-ink-3" />
                  <p className="text-sm text-ink">No packets yet</p>
                  <p className="max-w-[40ch] text-[13px] text-ink-3">When a customer accepts a move in the customer view, its packet lands here with everything a specialist needs.</p>
                  <Link href="/" className="mt-2 text-[13px] font-medium text-ink underline decoration-line-2 underline-offset-4">
                    Go accept a move
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {packets.map((pk) => {
                    const p = mockPersonas[pk.personaId];
                    return (
                      <li key={pk.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(pk)}
                          className="flex w-full items-center gap-3 rounded-lg border border-line p-3.5 text-left transition-colors duration-200 ease-ui-color hover:border-line-2 hover:bg-[var(--glass-hi)]"
                        >
                          <span className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", pk.mode === "specialist-callback" ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
                            {pk.mode === "specialist-callback" ? <PhoneCall size={16} /> : <UserRound size={16} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink">
                              {p.name}, {moveLabel[pk.moveType]}
                            </div>
                            <div className="truncate text-xs text-ink-3">{pk.customerSummary}</div>
                          </div>
                          <span className="shrink-0 text-xs text-ink-3">{timeOfDay(pk.createdAt)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="assump-h" className="border-t border-line p-5 sm:p-8 lg:border-t-0 lg:border-l">
              <h2 id="assump-h" className="mb-4 text-[15px] font-semibold text-ink">
                Assumptions
              </h2>
              <dl className="space-y-3">
                {assumptions.map((a) => (
                  <div key={a.label}>
                    <dt className="text-xs text-ink-3">{a.label}</dt>
                    <dd className="mt-0.5 text-[13px] leading-snug text-ink-2">{a.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 border-t border-line pt-4 text-xs text-ink-3">Simulated multipliers for a concept prototype. Not measured outcomes.</p>
            </section>
          </div>
        </div>
      </main>
      <PacketDrawer packet={open} onClose={() => setOpen(null)} />
    </div>
  );
}
