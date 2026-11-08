"use client";

// The landing page, in one of two modes the visitor chooses:
// - Guided tour: pinned chapters, the camera moves around the car as you scroll and the copy
//   lights up as you read.
// - Summary: the car stands still beside the headline; everything else is plain text on one sheet.

import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import clsx from "clsx";
import { Eye, EyeOff, Info } from "lucide-react";
import Link from "next/link";
import { motion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoveList } from "@/components/pages/MoveList";
import { DragSurface, ScrubNumber, ScrubReveal, ScrubText } from "@/components/stage/Interact";
import { useScrollShot } from "@/components/stage/hooks";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Sheet } from "@/components/ui/Sheet";
import { SHOTS, useDirector, type ShotName } from "@/lib/client/director";
import { useOverlayStore } from "@/lib/client/overlay-store";
import { useDashboard } from "@/lib/client/use-dashboard";
import { useUiStore } from "@/lib/client/ui-store";
import type { DashboardData } from "@/lib/types";
import { contractFacts, drivingFacts, insuranceFacts, miles, money, nextMove, protectionFacts, situation } from "./facts";

export function Story() {
  const { data } = useDashboard();
  const mode = useUiStore((s) => s.overviewMode);
  const setMode = useUiStore((s) => s.setOverviewMode);

  // Restore the visitor's last choice (stored per browser).
  useEffect(() => {
    try {
      const m = localStorage.getItem("nm-overview");
      if (m === "tour" || m === "summary") setMode(m);
    } catch {
      /* private mode */
    }
  }, [setMode]);

  // Leaving the landing page: put the preview car away.
  useEffect(() => () => useDirector.getState().setPreview(undefined), []);

  if (!data) return <div className="h-[calc(100dvh-var(--hdr))]" aria-busy />;
  return mode === "summary" ? <Summary key={`s-${data.persona.id}`} data={data} /> : <Tour key={`t-${data.persona.id}`} data={data} />;
}

// ---------------------------------------------------------------- shared pieces

function ModeSwitch() {
  const mode = useUiStore((s) => s.overviewMode);
  const setMode = useUiStore((s) => s.setOverviewMode);
  const opts = [
    { v: "tour" as const, label: "Guided tour" },
    { v: "summary" as const, label: "Summary" },
  ];
  return (
    <div role="radiogroup" aria-label="How to show this page" className="inline-flex rounded-lg bg-[var(--glass-hi)] p-1">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={mode === o.v}
          onClick={() => {
            setMode(o.v);
            window.scrollTo({ top: 0 });
          }}
          className={clsx(
            "h-9 rounded-md px-3.5 text-[14px] font-semibold transition-colors",
            mode === o.v ? "bg-[var(--glass)] text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The opening screen, shared by both modes: the car's name, where things stand, the next move. */
function Opening({ data, motionStyle }: { data: DashboardData; motionStyle?: { y: MotionValue<number>; opacity: MotionValue<number> } }) {
  const setOpenMove = useUiStore((s) => s.setOpenMove);
  const openWhy = useOverlayStore((s) => s.openWhy);
  const setPreview = useDirector((s) => s.setPreview);
  const [preview, setPreviewOn] = useState(false);
  const v = data.persona.vehicle;
  const { opt, sentence } = nextMove(data);
  const upgrade = opt?.upgradeModel;

  useEffect(() => {
    setPreview(preview ? upgrade : undefined);
  }, [preview, upgrade, setPreview]);

  return (
    <div className="relative h-[calc(100dvh-var(--hdr))] overflow-hidden">
      <DragSurface className="absolute inset-x-0 top-0 h-[46%] lg:inset-y-0 lg:right-0 lg:left-[46%] lg:h-auto" />
      <div className="pointer-events-none relative mx-auto flex h-full w-full max-w-[1440px] flex-col px-5 pt-5 pb-8 sm:px-10 lg:pt-8">
        <div className="pointer-events-auto self-end lg:self-start">
          <ModeSwitch />
        </div>
        <motion.div style={motionStyle} className="mt-auto max-w-[640px] lg:my-auto">
          <h1 className="font-display text-[clamp(49px,5.8vw,88px)] leading-[0.92] tracking-[-0.04em] text-balance text-ink">
            {v.year} {v.model.replace(/^Toyota /, "")}
          </h1>
          <p className="mt-5 max-w-[36ch] text-[20px] leading-snug text-ink-2">{situation(data)}</p>

          {opt && (
            <div className="pointer-events-auto mt-9 border-l-[3px] border-accent pl-5">
              <p className="text-[15px] text-ink-3">We recommend</p>
              <p className="mt-1 text-[25px] leading-tight font-bold tracking-[-0.015em] text-ink">{opt.title}</p>
              <p className="mt-1.5 text-[16px] text-ink-2">{sentence}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" size="lg" onClick={() => setOpenMove(opt.moveType)}>
                  Compare options
                </Button>
                <Button variant="outline" size="lg" onClick={() => openWhy(opt.id)}>
                  <Info size={16} />
                  Why this move
                </Button>
                {upgrade && (
                  <Button variant="ghost" size="lg" onClick={() => setPreviewOn((p) => !p)} aria-pressed={preview}>
                    {preview ? <EyeOff size={16} /> : <Eye size={16} />}
                    {preview ? "Hide the new car" : `Park a ${upgrade.name.replace(/^\d{4} Toyota /, "")} beside it`}
                  </Button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function barColor(tone: "warn" | "good" | "data") {
  return tone === "warn" ? "bg-warn" : tone === "good" ? "bg-good" : "bg-data";
}

function BarTrack({ marker, children }: { marker?: number; children: ReactNode }) {
  return (
    <div className="relative mt-5 h-2 w-full rounded-full bg-[var(--glass-hi)] ring-1 ring-line ring-inset">
      <div className="absolute inset-0 overflow-hidden rounded-full">{children}</div>
      {marker != null && <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded bg-ink" style={{ left: `${marker * 100}%` }} aria-hidden />}
    </div>
  );
}

/** A bar that fills as the chapter scrolls. */
function ScrubBar({ progress, to, tone, marker }: { progress: MotionValue<number>; to: number; tone: "warn" | "good" | "data"; marker?: number }) {
  const reduced = useShouldReduceMotion();
  // The bar is full width and slides in from the left: a translate on the compositor, its rounded
  // end never stretched. Under reduced motion it shows its value at once.
  const end = `${(Math.min(1, to) - 1) * 100}%`;
  const x = useTransform(progress, [0.2, 0.62], reduced ? [end, end] : ["-100%", end]);
  return (
    <BarTrack marker={marker}>
      <motion.div className={clsx("absolute inset-0 rounded-full", barColor(tone))} style={{ x }} />
    </BarTrack>
  );
}

/** The same bar, still. */
function StaticBar({ to, tone, marker }: { to: number; tone: "warn" | "good" | "data"; marker?: number }) {
  return (
    <BarTrack marker={marker}>
      <div className={clsx("absolute inset-0 rounded-full", barColor(tone))} style={{ transform: `translateX(${(Math.min(1, to) - 1) * 100}%)` }} />
    </BarTrack>
  );
}

// ---------------------------------------------------------------- tour

function Chapter({
  id,
  from,
  to,
  calloutText,
  side,
  children,
}: {
  id: string;
  from: ShotName;
  to: ShotName;
  calloutText?: string;
  side: "left" | "right";
  children: (p: MotionValue<number>) => ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const progress = useScrollShot(ref, from, to, { calloutText });
  const fadeOpacity = useTransform(progress, [0, 0.05, 0.95, 1], [0, 1, 1, 0]);
  return (
    <section ref={ref} id={id} className="relative h-[300vh]">
      <div className="sticky top-[var(--hdr)] flex h-[calc(100dvh-var(--hdr))] items-end overflow-hidden lg:items-center">
        {/* Fades the car out under the copy while the chapter is pinned. */}
        <motion.div
          aria-hidden
          style={{ opacity: fadeOpacity }}
          className={clsx(
            "pointer-events-none absolute inset-0 hidden from-[var(--bg)] from-[34%] to-transparent to-[58%] lg:block",
            side === "right" ? "bg-gradient-to-l" : "bg-gradient-to-r",
          )}
        />
        <div className={clsx("relative mx-auto flex w-full max-w-[1440px] px-5 sm:px-10", side === "right" ? "lg:justify-end" : "lg:justify-start")}>
          <div className="story-copy w-full max-w-[460px] pb-10 lg:pb-0">{children(progress)}</div>
        </div>
      </div>
    </section>
  );
}

const chapterHeading = "font-display text-[clamp(31px,3.1vw,45px)] leading-[1.06] tracking-[-0.025em] text-ink";
const bigFigure = "num text-[clamp(49px,5.2vw,76px)] leading-none font-bold tracking-[-0.035em] text-ink";
const midFigure = "num text-[clamp(39px,3.8vw,61px)] leading-none font-bold tracking-[-0.035em]";

function Tour({ data }: { data: DashboardData }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useUiStore((s) => s.reducedMotion);
  const progress = useScrollShot(ref, "hero", "heroLift", { calloutText: "" });
  const y = useTransform(progress, [0, 0.7], reduced ? [0, 0] : [0, -120]);
  const opacity = useTransform(progress, [0.25, 0.7], reduced ? [1, 1] : [1, 0]);

  useEffect(() => {
    useDirector.getState().setPose(SHOTS.hero, "");
  }, []);

  const contract = contractFacts(data);
  const drive = drivingFacts(data);
  const prot = protectionFacts(data);
  const ins = insuranceFacts(data);
  const max = Math.max(1, ...drive.factors.map((f) => Math.abs(f.impact)));

  return (
    <>
      <section ref={ref} aria-label="Your car" className="relative h-[170vh]">
        <div className="sticky top-[var(--hdr)]">
          <Opening data={data} motionStyle={{ y, opacity }} />
        </div>
      </section>

      {contract && (
        <Chapter id="ch-contract" from="sideWide" to="odometer" side="right" calloutText={`${miles(data.persona.vehicle.odometer)} mi today`}>
          {(p) => (
            <ScrubReveal progress={p}>
              <ScrubText as="h2" text={contract.line} progress={p} className={chapterHeading} />
              <p className={clsx(bigFigure, "mt-9")}>
                {contract.kind === "loan" && "$"}
                <ScrubNumber progress={p} from={contract.figureFrom} to={contract.figure} />
                {contract.figureUnit && <span className="ml-2 text-[0.32em] font-semibold text-ink-3">{contract.figureUnit}</span>}
              </p>
              <p className="mt-2 text-[16px] text-ink-2">{contract.figureCaption}</p>
              <ScrubBar progress={p} to={contract.bar} tone={contract.tone} marker={contract.marker} />
              <div className="mt-2 flex justify-between text-[14px] text-ink-3">
                <span>{contract.barLabels[0]}</span>
                <span>{contract.barLabels[1]}</span>
              </div>
              <Link href={contract.link.href} className="story-link mt-8">
                {contract.link.label}
              </Link>
            </ScrubReveal>
          )}
        </Chapter>
      )}

      <Chapter id="ch-driving" from="tiresWide" to="tires" side="left" calloutText={drive.on ? drive.callout : "Driving data off"}>
        {(p) =>
          drive.on ? (
            <ScrubReveal progress={p}>
              <ScrubText as="h2" text={drive.line} progress={p} className={chapterHeading} />
              <div className="mt-9 flex items-end gap-8">
                <div>
                  <p className={bigFigure}>
                    <ScrubNumber progress={p} from={0} to={drive.score} />
                  </p>
                  <p className="mt-2 text-[16px] text-ink-2">driving score out of 100</p>
                </div>
                {drive.streak >= 3 && <p className="mb-1 text-[16px] font-semibold text-good">{drive.streak} smooth trips in a row</p>}
              </div>
              {drive.factors.length > 0 && (
                <ul className="mt-7 space-y-3" aria-label="What lowers your score most">
                  {drive.factors.map((f) => (
                    <li key={f.factor} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-[16px]">
                      <span className="text-ink-2">{f.factor}</span>
                      <FactorBar progress={p} share={Math.abs(f.impact) / max} />
                      <span className="num text-right font-bold text-warn">{f.impact.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/driving" className="story-link mt-8">
                See every trip
              </Link>
            </ScrubReveal>
          ) : (
            <ScrubReveal progress={p}>
              <ScrubText as="h2" text="Driving data is off, so your score and trips stay private." progress={p} className={chapterHeading} />
              <p className="mt-4 text-[16px] text-ink-2">Lease math uses your contract allowance instead. Turn it on under Your data in the top bar.</p>
            </ScrubReveal>
          )
        }
      </Chapter>

      <Chapter id="ch-protection" from="frontWide" to="engine" side="right" calloutText={prot.callout}>
        {(p) => (
          <ScrubReveal progress={p}>
            <ScrubText as="h2" text={prot.line} progress={p} className={chapterHeading} />
            {prot.prot?.monthlyCost != null ? (
              <>
                <p className={clsx(bigFigure, "mt-9")}>
                  $<ScrubNumber progress={p} from={0} to={prot.prot.monthlyCost} />
                  <span className="ml-2 text-[0.32em] font-semibold text-ink-3">a month</span>
                </p>
                <p className="mt-2 max-w-[40ch] text-[16px] text-ink-2">for extended service coverage.</p>
              </>
            ) : (
              <p className="mt-6 text-[16px] text-ink-2">No extra coverage is recommended for this car right now.</p>
            )}
            <Link href="/moves" className="story-link mt-8">
              Compare coverage
            </Link>
          </ScrubReveal>
        )}
      </Chapter>

      <Chapter id="ch-insurance" from="rearWide" to="seat" side="left" calloutText={ins.callout}>
        {(p) => (
          <ScrubReveal progress={p}>
            <ScrubText as="h2" text={ins.line} progress={p} className={chapterHeading} />
            <div className="mt-9 grid grid-cols-2 gap-6">
              <div>
                <p className={clsx(midFigure, "text-ink")}>
                  $<ScrubNumber progress={p} from={0} to={ins.ins.monthlyPremium} />
                </p>
                <p className="mt-2 text-[16px] text-ink-2">a month now, {ins.ins.carrier.replace(/ \(simulated\)$/, "")}</p>
              </div>
              {ins.quote != null && (
                <div>
                  <p className={clsx(midFigure, ins.cheaper ? "text-good" : "text-warn")}>
                    $<ScrubNumber progress={p} from={0} to={ins.quote} range={[0.2, 0.6]} />
                  </p>
                  <p className="mt-2 text-[16px] text-ink-2">usage-based quote</p>
                </div>
              )}
            </div>
            <Link href="/moves" className="story-link mt-8">
              Compare insurance
            </Link>
          </ScrubReveal>
        )}
      </Chapter>

      <Finale data={data} />
    </>
  );
}

function FactorBar({ progress, share }: { progress: MotionValue<number>; share: number }) {
  const reduced = useShouldReduceMotion();
  const end = `${(share - 1) * 100}%`;
  const x = useTransform(progress, [0.3, 0.6], reduced ? [end, end] : ["-100%", end]);
  return (
    <span className="overflow-hidden rounded-full bg-[var(--glass-hi)]" aria-hidden>
      <motion.span className="block h-1.5 rounded-full bg-warn" style={{ x }} />
    </span>
  );
}

function Finale({ data }: { data: DashboardData }) {
  const ref = useRef<HTMLElement>(null);
  const setOpenMove = useUiStore((s) => s.setOpenMove);
  const openWhy = useOverlayStore((s) => s.openWhy);
  const progress = useScrollShot(ref, "finale", "finaleClose", { calloutText: "" });
  const { opt, sentence } = nextMove(data);
  return (
    <>
      <section ref={ref} aria-labelledby="finale-h" className="relative h-[200vh]">
        <div className="sticky top-[var(--hdr)] h-[calc(100dvh-var(--hdr))] overflow-hidden">
          <DragSurface className="absolute inset-x-0 bottom-0 h-[52%]" />
          <ScrubReveal
            progress={progress}
            inAt={[0.02, 0.14]}
            outAt={[1, 1]}
            className="pointer-events-none relative mx-auto flex max-w-[900px] flex-col items-center px-5 pt-[7vh] text-center sm:px-10"
          >
            <p className="text-[17px] text-ink-2">So, the move worth making now:</p>
            <h2 id="finale-h" className="font-display mt-3 text-[clamp(39px,5.2vw,76px)] leading-[0.98] tracking-[-0.04em] text-balance text-ink">
              {opt ? opt.title : "Nothing urgent right now"}
            </h2>
            <p className="mt-4 text-[19px] text-ink-2">{sentence}</p>
            {opt && (
              <div className="pointer-events-auto mt-7 flex flex-wrap justify-center gap-2">
                <Button variant="primary" size="lg" onClick={() => setOpenMove(opt.moveType)}>
                  Compare options
                </Button>
                <Button variant="outline" size="lg" onClick={() => openWhy(opt.id)}>
                  <Info size={16} />
                  Why this move
                </Button>
              </div>
            )}
          </ScrubReveal>
        </div>
      </section>
      <section aria-labelledby="all-moves-h" className="relative z-[2] bg-[var(--bg)] before:pointer-events-none before:absolute before:inset-x-0 before:-top-28 before:h-28 before:bg-gradient-to-t before:from-[var(--bg)] before:to-transparent">
        <div className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-8">
        <Sheet>
          <Panel title={<span id="all-moves-h">Every move, ranked</span>}>
            <MoveList data={data} />
          </Panel>
        </Sheet>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- summary

function Summary({ data }: { data: DashboardData }) {
  useEffect(() => {
    useDirector.getState().setPose(SHOTS.heroStill, "");
  }, []);
  const contract = contractFacts(data);
  const drive = drivingFacts(data);
  const prot = protectionFacts(data);
  const ins = insuranceFacts(data);
  const lead = "max-w-[52ch] text-[19px] leading-snug text-ink";
  return (
    <>
      <Opening data={data} />
      <div className="relative z-[2] bg-[var(--bg)] before:pointer-events-none before:absolute before:inset-x-0 before:-top-28 before:h-28 before:bg-gradient-to-t before:from-[var(--bg)] before:to-transparent">
        <div className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-8">
        <Sheet>
          {contract && (
            <Panel title={contract.title}>
              <p className={lead}>{contract.line}</p>
              <dl className="mt-6 grid max-w-[640px] grid-cols-2 gap-6">
                <div>
                  <dt className="text-[14px] text-ink-3">{contract.kind === "lease" ? "Odometer at lease end" : "Still owed"}</dt>
                  <dd className="num mt-1 text-[31px] leading-none font-bold text-ink">
                    {contract.kind === "lease" ? `${miles(contract.figure)} mi` : money(contract.figure)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[14px] text-ink-3">Monthly payment</dt>
                  <dd className="num mt-1 text-[31px] leading-none font-bold text-ink">{money(data.persona.contract.monthlyPayment)}</dd>
                </div>
              </dl>
              <div className="max-w-[640px]">
                <StaticBar to={contract.bar} tone={contract.tone} marker={contract.marker} />
                <div className="mt-2 flex justify-between text-[14px] text-ink-3">
                  <span>{contract.barLabels[0]}</span>
                  <span>{contract.barLabels[1]}</span>
                </div>
              </div>
              <Link href={contract.link.href} className="story-link mt-6">
                {contract.link.label}
              </Link>
            </Panel>
          )}
          <Panel title="Driving">
            {drive.on ? (
              <>
                <p className={lead}>
                  {drive.line} Your driving score is <strong className="num">{drive.score}</strong> out of 100
                  {drive.streak >= 3 ? `, with ${drive.streak} smooth trips in a row.` : "."}
                </p>
                {drive.factors.length > 0 && (
                  <p className="mt-3 max-w-[60ch] text-[16px] text-ink-2">
                    What lowers it most: {drive.factors.map((f) => `${f.factor.toLowerCase()} (${f.impact.toFixed(1)})`).join(", ")}.
                  </p>
                )}
                <Link href="/driving" className="story-link mt-6">
                  See every trip
                </Link>
              </>
            ) : (
              <p className={lead}>Driving data is off, so your score and trips stay private.</p>
            )}
          </Panel>
          <Panel title="Protection">
            <p className={lead}>{prot.line}</p>
            {prot.prot?.monthlyCost != null && (
              <p className="mt-3 text-[16px] text-ink-2">
                Extended service coverage would cost <strong className="num text-ink">{money(prot.prot.monthlyCost)}</strong> a month.
              </p>
            )}
          </Panel>
          <Panel title="Insurance">
            <p className={lead}>{ins.line}</p>
          </Panel>
          <Panel title="Every move, ranked">
            <MoveList data={data} />
          </Panel>
        </Sheet>
        </div>
      </div>
    </>
  );
}
