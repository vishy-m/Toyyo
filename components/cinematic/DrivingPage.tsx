"use client";

import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { Activity, ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import rates from "@/data/reference/rates.json";
import { fuelPerMonth, TYPICAL_ANNUAL_MILES } from "@/lib/cinematic/alerts";
import { mostInstructive } from "@/lib/cinematic/trip-pick";
import { getTrip } from "@/lib/client/api";
import { categoryLabel, consentLabel, miles, monthLabel, shortDate, usd } from "@/lib/client/format";
import type { DashboardData, Trip } from "@/lib/types";
import { useScenario } from "./OwnershipTools";
import { useConsentToggle } from "./use-consent";

const RideReplay = dynamic(() => import("@/components/map/RideReplay"), {
  ssr: false,
  loading: () => <p className="dash-muted">Loading the drive…</p>,
});

interface Props {
  data: DashboardData;
  /** The car's paint colour on the map; falls back to the persona's paint. */
  paintHex?: string;
  backHref: string;
  onBack(): void;
  onReload(): void;
}

type TripRow = DashboardData["trips"][number];

export function DrivingPage({ data, paintHex, backHref, onBack, onReload }: Props) {
  const { driving, trips, tripInsights, persona } = data;
  const reduced = useShouldReduceMotion();
  const consent = useConsentToggle(persona.id, onReload);
  const [all, setAll] = useState(false);
  const recent = useMemo(() => [...trips].sort((a, b) => b.start.localeCompare(a.start)), [trips]);
  const replayable = useMemo(() => recent.filter((trip) => trip.showcase), [recent]);
  const [listed, setListed] = useState("");
  const [replayId, setReplayId] = useState("");
  const defaultId = mostInstructive(recent)?.id ?? "";
  const playing = replayable.some((trip) => trip.id === replayId) ? replayId : defaultId;
  const highlighted = listed || playing;
  const listedTrip = recent.find((trip) => trip.id === listed);
  const [full, setFull] = useState<{ id: string; trip?: Trip; error?: string }>({ id: "" });

  useEffect(() => {
    document.getElementById("driving-heading")?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!persona.consent.driving || !playing) return;
    let cancelled = false;
    getTrip(playing).then((trip) => {
      if (!cancelled) setFull({ id: playing, trip });
    }).catch((reason: unknown) => {
      if (!cancelled) setFull({ id: playing, error: reason instanceof Error ? reason.message : "This drive could not be loaded." });
    });
    return () => { cancelled = true; };
  }, [playing, persona.consent.driving]);

  function choose(trip: TripRow) {
    setListed(trip.id);
    if (trip.showcase) setReplayId(trip.id);
  }

  const on = persona.consent.driving;
  const empty = !on || (driving.totalMiles === 0 && trips.length === 0);
  const compact = useMemo(() => {
    const keep = new Set([...recent.slice(0, 4), ...replayable].map((trip) => trip.id));
    return recent.filter((trip) => keep.has(trip.id));
  }, [recent, replayable]);
  const shown = all ? recent.slice(0, 40) : compact;
  const factors = [...driving.scoreFactors].filter((factor) => factor.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 3);
  const maxMonth = Math.max(1, ...driving.monthlyMiles.map((month) => month.miles));
  const loaded = full.id === playing ? full.trip : undefined;
  const replayError = full.id === playing ? full.error : undefined;
  const playingRow = recent.find((trip) => trip.id === playing);
  const fuel = fuelPerMonth(driving.avgMonthlyMiles, persona.vehicle.mpg, rates.gasPricePerGallon);
  const typical = fuelPerMonth(TYPICAL_ANNUAL_MILES / 12, persona.vehicle.mpg, rates.gasPricePerGallon);
  const sharing = persona.consent.shareWithInsurers && data.engines.insurance.limitedBy === undefined;
  const coaching = data.engines.insurance.options.find((option) => option.id === "insurance:coaching");
  const insightTrips = tripInsights.slice(0, 2);

  return (
    <div className="drv">
      <div className="dash-bar-row">
      <a className="dash-back" href={backHref} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onBack(); } }}>
        <ArrowLeft size={18} aria-hidden="true" /> Back to dashboard
      </a>
      <h2 id="driving-heading" tabIndex={-1} className="dash-page-title"><Activity size={22} aria-hidden="true" /> Driving</h2>
      </div>

      {empty ? (
        <p className="dash-muted">{on ? "No trips yet. Once drives are recorded, they show up here with a replay." : "Driving data is off, so trips, the score and the replay stay hidden. Turn it on below to see them."}</p>
      ) : (
        <>
          <section className="drv-insights" aria-label="Driving insights">
            <dl>
              <div><dt>Driving score</dt><dd>{Math.round(driving.score)}<small> / 100</small></dd></div>
              <div><dt>Fuel a month</dt><dd>{usd(fuel)}<small> vs {usd(typical)} typical</small></dd></div>
              <div><dt>Smooth streak</dt><dd>{driving.smoothStreak}<small> {driving.smoothStreak === 1 ? "trip" : "trips"} in a row</small></dd></div>
            </dl>
            <ul className="drv-notes">
              {insightTrips.map((insight) => {
                const target = recent.find((trip) => trip.id === insight.relatedTripId && trip.showcase);
                return (
                  <li key={insight.id}>{insight.text}{target && target.id !== playing && <> <button type="button" className="drv-link" onClick={() => choose(target)}>Replay that drive</button></>}</li>
                );
              })}
              <li>
                {sharing && coaching ? coaching.summary : "Insurance quotes stay off until you choose to share your driving data with insurers."}
              </li>
            </ul>
          </section>

          <div className="drv-split">
            <section className="drv-report" aria-label="Driving report">
              <h3 className="dash-label">What moves your score</h3>
              {factors.length > 0 ? (
                <ul className="drv-factors">
                  {factors.map((factor) => (
                    <li key={factor.factor}><strong>{factor.factor}</strong><span>{factor.impact.toFixed(1)} pts</span></li>
                  ))}
                </ul>
              ) : <p className="dash-muted">Nothing is pulling the score down right now.</p>}

              <h3 className="dash-label">Recent drives</h3>
              <ul className="drv-trips">
                {shown.map((trip) => (
                  <li key={trip.id}>
                    <button type="button" className={`drv-trip${trip.id === highlighted ? " is-on" : ""}`} aria-pressed={trip.id === highlighted} onClick={() => choose(trip)}>
                      <span><strong>{trip.destinationLabel}</strong><small>{shortDate(trip.start)} · {categoryLabel[trip.category]}{trip.showcase ? " · Replay" : ""}</small></span>
                      <span className="drv-miles">{miles(trip.miles)}</span>
                      <span className={`drv-score${trip.score < 75 ? " is-low" : ""}`} aria-label={`Trip score ${trip.score}`}>{trip.score}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {recent.length > compact.length && (
                <button type="button" className="dash-more" onClick={() => setAll((value) => !value)}>{all ? "Show fewer drives" : `Show more drives (${Math.min(40, recent.length) - compact.length} more)`}</button>
              )}
              <h3 className="dash-label">Miles a month</h3>
              <ul className="drv-months" aria-label="Miles per month, last six months">
                {driving.monthlyMiles.map((month) => (
                  <li key={month.month}><span>{monthLabel(month.month)}</span><span className="drv-bar" aria-hidden="true"><span style={{ width: `${(month.miles / maxMonth) * 100}%` }} /></span><span className="drv-val">{Math.round(month.miles).toLocaleString("en-US")}</span></li>
                ))}
              </ul>

            </section>

            <section className="drv-stage" aria-label="Drive replay">
              <h3 className="dash-label">{playingRow ? `Replay · ${playingRow.destinationLabel}, ${shortDate(playingRow.start)}` : "Replay"}</h3>
              {replayError && <p className="dash-muted" role="alert">{replayError}</p>}
              {!replayError && !loaded && playing && <p className="dash-muted">Loading this drive…</p>}
              {!playing && <p className="dash-muted">None of the recorded drives has a full route to replay yet.</p>}
              {loaded && loaded.path.length > 1 && (
                <RideReplay key={loaded.id} trip={loaded} paintHex={paintHex ?? persona.vehicle.paintHex} inline autoPlay={!reduced} onClose={() => {}} />
              )}
              {loaded && loaded.path.length <= 1 && <p className="dash-muted">This drive has no route to replay.</p>}
              {listedTrip && !listedTrip.showcase && (
                <p className="dash-muted drv-quiet" role="status">{listedTrip.destinationLabel} ({shortDate(listedTrip.start)}) was recorded without a detailed route, so it can’t be replayed. Pick a drive marked Replay.</p>
              )}
            </section>
          </div>

          <section className="drv-tune" aria-label="Make it yours">
            <h3 className="dash-label">Make it yours</h3>
            <div className="drv-tune-grid">
              <CoachingControl data={data} allowed={sharing} />
              <MilesControl data={data} />
            </div>
          </section>
        </>
      )}

      <div className="drv-consents">
        <label className="dash-check">
          <input type="checkbox" checked={persona.consent.driving} disabled={consent.busy} onChange={(event) => void consent.setConsent("driving", event.target.checked)} />
          {consentLabel.driving}
        </label>
        <label className="dash-check">
          <input type="checkbox" checked={persona.consent.shareWithInsurers} disabled={consent.busy} onChange={(event) => void consent.setConsent("shareWithInsurers", event.target.checked)} />
          {consentLabel.shareWithInsurers}
        </label>
      </div>
      {consent.error && <p className="dash-muted" role="alert">{consent.error}</p>}
      <p className="dash-muted">Fuel assumes {usd(rates.gasPricePerGallon, { cents: true })}/gal and {persona.vehicle.mpg} mpg. A typical driver covers {TYPICAL_ANNUAL_MILES.toLocaleString("en-US")} mi/yr (US average, FHWA). The score is synthetic. Turning driving data off hides trips here and in the estimates. Nothing is sent to an insurer in this demo.</p>
    </div>
  );
}

function CoachingControl({ data, allowed }: { data: DashboardData; allowed: boolean }) {
  const [gain, setGain] = useState(10);
  const { result, state } = useScenario(data.persona.id, "insurance", { scoreImprovement: gain }, allowed);
  const improved = result?.options.find((option) => option.id === "insurance:ubi-improved");
  const target = Math.min(100, Math.round(data.driving.score) + gain);
  return (
    <div className="drv-scenario">
      <h4 className="drv-sub">If your score improved</h4>
      <label htmlFor="drv-gain">Points gained <strong>+{gain}</strong></label>
      <input id="drv-gain" type="range" min={0} max={30} step={5} value={gain} onChange={(event) => setGain(Number(event.target.value))} />
      <p className="dash-muted" aria-live="polite">
        {!allowed ? "Insurance quotes stay off until you choose to share your driving data with insurers."
          : state === "error" ? "The estimate could not be refreshed."
          : improved?.monthlyCost != null ? `At a score of ${target}, an illustrative driving-based premium is about ${usd(improved.monthlyCost)}/mo, against ${usd(data.persona.insurance.monthlyPremium)}/mo today. A scenario, not a quote.`
          : "Estimating…"}
      </p>
    </div>
  );
}

function MilesControl({ data }: { data: DashboardData }) {
  const contract = data.persona.contract;
  const lease = contract.kind === "lease";
  const allowance = contract.kind === "lease" ? contract.annualMileageAllowance / 12 : 1125;
  const base = Math.round((data.driving.avgMonthlyMiles || allowance) / 50) * 50;
  const [monthly, setMonthly] = useState(Math.min(2800, Math.max(300, base || 1000)));
  const { result, state } = useScenario(data.persona.id, "lease-end", { monthlyMiles: monthly }, lease);
  const ret = result?.options.find((option) => option.id === "lease-end:return");
  const fuel = fuelPerMonth(monthly, data.persona.vehicle.mpg, rates.gasPricePerGallon);

  return (
    <div className="drv-scenario">
      <h4 className="drv-sub">If the miles changed</h4>
      <label htmlFor="drv-miles">Miles per month <strong>{monthly.toLocaleString("en-US")}</strong></label>
      <input id="drv-miles" type="range" min={300} max={2800} step={50} value={monthly} onChange={(event) => setMonthly(Number(event.target.value))} />
      <p className="dash-muted" aria-live="polite">
        Fuel would be about {usd(Math.round(fuel))}/mo at {data.persona.vehicle.mpg} mpg and {usd(rates.gasPricePerGallon, { cents: true })}/gal.
        {lease && (state === "error" ? " The lease estimate could not be refreshed." : ret ? ` Returning the car at this pace: about ${usd(ret.totalCost ?? 0)} in excess miles and fees.` : " Estimating the lease return…")}
        {" "}An estimate, not a quote.
      </p>
    </div>
  );
}
