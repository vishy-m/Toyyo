"use client";

import { CarFront, CalendarClock, CheckCircle2, Fuel, Gauge, Percent, ShieldAlert, ShieldCheck, Wrench, Activity, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import rates from "@/data/reference/rates.json";
import { deriveSummary, sectionForAlert, type AlertIcon, type MonthlyCost } from "@/lib/cinematic/alerts";
import { getDashboard } from "@/lib/client/api";
import { usd } from "@/lib/client/format";
import type { CinematicVehicle } from "@/lib/cinematic/vehicles";
import type { DashboardData, DashboardPage, MoveType } from "@/lib/types";
import { CarChat } from "./CarChat";
import { CaseSection } from "./CaseSection";
import { DrivingPage } from "./DrivingPage";
import { FinancesPage } from "./FinancesPage";
import { RepairPage } from "./RepairPage";
import { carName, carPath, type SectionId } from "./sections";
import "./dashboard.css";

const ALERT_ICONS: Record<AlertIcon, { Icon: LucideIcon; label: string }> = {
  mileage: { Icon: Gauge, label: "Mileage" },
  fuel: { Icon: Fuel, label: "Fuel" },
  rate: { Icon: Percent, label: "Loan rate" },
  timing: { Icon: CalendarClock, label: "Payment date" },
  coverage: { Icon: ShieldAlert, label: "Coverage" },
  driving: { Icon: Activity, label: "Driving" },
};
const COST_ICONS: Record<MonthlyCost["id"], LucideIcon> = { payment: CarFront, insurance: ShieldCheck, fuel: Fuel, maintenance: Wrench };

/** Six digits, like a trip-meter: 041,200. */
function odometer(value: number) {
  return Math.round(value).toLocaleString("en-US").padStart(7, "0");
}

interface DashboardProps {
  vehicle: CinematicVehicle;
  /** "repairs", "driving" and "finances" open detail pages. Every other section shows the dashboard. */
  section: SectionId;
  onSectionChange(section: SectionId): void;
  /** Where the chat renders: a dock under the scrolling cluster, so content never scrolls behind it. Inline until it mounts. */
  chatDock?: HTMLElement | null;
}

const PAGE_HEADING: Record<DashboardPage, string> = {
  overview: "ownership-heading",
  repairs: "repair-heading",
  driving: "driving-heading",
  finances: "finances-heading",
};

function plainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function CarDashboard(props: DashboardProps) {
  return <Cluster key={props.vehicle.id} {...props} />;
}

function Cluster({ vehicle, section, onSectionChange, chatDock }: DashboardProps) {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [prefill, setPrefill] = useState<{ text: string; n: number }>({ text: "", n: 0 });

  useEffect(() => {
    let cancelled = false;
    getDashboard(vehicle.personaId).then((next) => {
      if (cancelled) return;
      if (next.persona.id !== vehicle.personaId) throw new Error("This car’s details could not be matched.");
      setData(next);
      setError("");
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "This car’s details could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [vehicle.personaId, attempt]);

  const openPage = useCallback((page: DashboardPage, issue?: string) => {
    if (page === "repairs" && issue) setPrefill((p) => ({ text: issue, n: p.n + 1 }));
    onSectionChange(page);
    requestAnimationFrame(() => document.getElementById(PAGE_HEADING[page])?.focus({ preventScroll: true }));
  }, [onSectionChange]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // Older agent actions point at a move; open the page that holds it.
  const openMove = useCallback((moveType: MoveType) => {
    const page: Record<MoveType, DashboardPage> = { "lease-end": "finances", payment: "finances", insurance: "driving", protection: "repairs" };
    openPage(page[moveType]);
  }, [openPage]);

  const summary = useMemo(() => (data ? deriveSummary(data, rates.gasPricePerGallon) : undefined), [data]);
  const lit = new Set(summary?.active.map((alert) => alert.icon));
  const severity = new Map(summary?.active.map((alert) => [alert.icon, alert.severity]));
  const maxCost = Math.max(1, ...(summary?.costs.map((cost) => cost.amount ?? 0) ?? []));
  const detail = section === "repairs" || section === "driving" || section === "finances";
  const go = (next: SectionId) => (event: MouseEvent) => {
    if (!plainClick(event)) return;
    event.preventDefault();
    onSectionChange(next);
  };

  return (
    <section className={`dash${detail ? " is-detail" : ""}${data?.caseFile ? " has-case" : ""}`} aria-labelledby="ownership-heading">
      <header className="dash-head">
        <h1 id="ownership-heading" tabIndex={-1}>{carName(vehicle)}</h1>
        <p className="dash-odo" aria-label={data ? `Odometer ${Math.round(data.persona.vehicle.odometer).toLocaleString("en-US")} miles` : "Odometer"}>
          <span className="dash-odo-digits" aria-hidden="true">{data ? odometer(data.persona.vehicle.odometer) : "–––,–––"}</span>
          <span className="dash-odo-unit" aria-hidden="true">mi</span>
        </p>
      </header>

      {error && (
        <div className="dash-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => { setError(""); setAttempt((n) => n + 1); }}>Try again</button>
        </div>
      )}

      {data && section === "repairs" && (
        <RepairPage key={`${vehicle.id}-${prefill.n}`} initialIssue={prefill.text} data={data} backHref={carPath(vehicle.id, "overview")} onBack={() => { onSectionChange("overview"); requestAnimationFrame(() => document.getElementById("ownership-heading")?.focus({ preventScroll: true })); }} />
      )}
      {data && section === "driving" && (
        <DrivingPage data={data} paintHex={vehicle.model.paint?.color} backHref={carPath(vehicle.id, "overview")} onBack={() => { onSectionChange("overview"); requestAnimationFrame(() => document.getElementById("ownership-heading")?.focus({ preventScroll: true })); }} onReload={reload} />
      )}
      {data && section === "finances" && (
        <FinancesPage data={data} backHref={carPath(vehicle.id, "overview")} onBack={() => { onSectionChange("overview"); requestAnimationFrame(() => document.getElementById("ownership-heading")?.focus({ preventScroll: true })); }} onReload={reload} />
      )}

      {!error && !summary && <p className="dash-loading" role="status">Reading your car…</p>}

      {summary && !detail && (
        <div className="dash-body">
          <div className="dash-top">
          <ul className="dash-lights" aria-label="Warning lights">
            {(Object.keys(ALERT_ICONS) as AlertIcon[]).map((key) => {
              const { Icon, label } = ALERT_ICONS[key];
              const state = lit.has(key) ? severity.get(key) : undefined;
              const destination = sectionForAlert(key);
              const status = state === "act" ? "act soon" : state === "watch" ? "worth a look" : "clear";
              return (
                <li key={key}>
                  {state ? (
                    <a href={carPath(vehicle.id, destination)} className={`dash-light is-${state}`} aria-label={`${label}: ${status}. Open ${destination}.`} onClick={go(destination)}>
                      <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="dash-light">
                      <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                      <span className="dash-sr">{label}: {status}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <nav className="dash-actions" aria-label="Actions">
            <a href={carPath(vehicle.id, "repairs")} onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onSectionChange("repairs");
            }}><Wrench size={20} strokeWidth={1.75} aria-hidden="true" /> Repairs</a>
          </nav>
          </div>

          {data?.caseFile && <CaseSection kase={data.caseFile} />}

          {summary.alerts.length > 0 ? (
            <div className="dash-alerts-wrap"><h2 className="dash-label">{data?.caseFile ? "Also worth knowing" : "Alerts"}</h2>
            <ul className="dash-alerts" aria-label="Alerts">
              {summary.alerts.map((alert) => {
                const { Icon } = ALERT_ICONS[alert.icon];
                const destination = sectionForAlert(alert.icon);
                return (
                  <li key={alert.id}>
                    <a id={`alert-${alert.id}`} href={carPath(vehicle.id, destination)} className={`dash-alert is-${alert.severity}`} aria-label={`${alert.title}. ${alert.severity === "act" ? "Act soon" : "Worth a look"}. ${alert.detail} Open ${destination === "repairs" ? "repairs" : destination}.`} onClick={go(destination)}>
                      <span className="dash-alert-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
                      <div>
                        <h2>{alert.title}<span className="dash-tag">{alert.severity === "act" ? "Act soon" : "Worth a look"}</span><span className="dash-alert-go" aria-hidden="true">Open ›</span></h2>
                        <p>{alert.detail}</p>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul></div>
          ) : (
            <p className="dash-clear"><CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" /> All clear. Nothing needs your attention right now.</p>
          )}

          <div className="dash-costs">
            <h2 className="dash-label">Every month</h2>
            <ul>
              {summary.costs.map((cost) => {
                const Icon = COST_ICONS[cost.id];
                const share = cost.amount !== null && summary.total > 0 ? Math.round((cost.amount / summary.total) * 100) : null;
                return (
                  <li key={cost.id} className="dash-cost">
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                    <span className="dash-cost-name">{cost.label}</span>
                    {cost.amount !== null ? (
                      <>
                        <span className="dash-cost-amt">{usd(cost.amount)}</span>
                        <span className="dash-cost-share">{share}%</span>
                        <span className="dash-bar" aria-hidden="true"><span style={{ width: `${(cost.amount / maxCost) * 100}%` }} /></span>
                      </>
                    ) : (
                      <span className="dash-cost-note">{cost.note}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="dash-total"><span>Total</span><strong>{usd(summary.total)}<small>/mo</small></strong></p>
            {summary.fuelNote && <p className="dash-foot">{summary.fuelNote}</p>}
          </div>
        </div>
      )}

      <p className="dash-demo">Demo account · Illustrative figures, not an offer.</p>
      {(() => {
        const chat = <CarChat personaId={vehicle.personaId} isLease={vehicle.descriptor.includes("Lease")} onOpenPage={openPage} onOpenMove={openMove} />;
        return chatDock ? createPortal(chat, chatDock) : chat;
      })()}
    </section>
  );
}
