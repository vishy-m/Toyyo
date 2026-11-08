"use client";

import { ArrowLeft, LocateFixed, MapPin, Search, ShieldCheck, Star, TriangleAlert, Wrench } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { coverage as careCoverage } from "@/lib/cinematic/alerts";
import { cityCoords, roundCoord } from "@/lib/cinematic/locations";
import { diagnoseRepair, type RepairDiagnosis } from "@/lib/cinematic/repair-diagnosis";
import { rankShops, shopCost, shopVerdict, topShops, type Ranking } from "@/lib/cinematic/shop-ranking";
import { ISSUE_NOUN, type ReviewsResult } from "@/lib/cinematic/shop-reviews";
import type { ShopSearchResult } from "@/lib/cinematic/shops";
import { prettyDates } from "@/lib/client/format";
import type { DashboardData } from "@/lib/types";
import type { MapPin as Pin, ReviewsState } from "./RepairMap";
import "./repair.css";

const RepairMap = dynamic(() => import("./RepairMap"), { ssr: false });

const CHIPS = ["Brakes grinding", "Won’t start / battery", "Check-engine light", "A/C blowing warm", "Vibration or tire wear"];
type Origin = { lat: number; lng: number; label: string };
type SearchState = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | { state: "done"; result: ShopSearchResult };

interface Props { data: DashboardData; initialIssue?: string; backHref: string; onBack(): void }

export function RepairPage({ data, initialIssue = "", backHref, onBack }: Props) {
  const { persona } = data;
  const home = useMemo<Origin>(() => ({ ...cityCoords(persona.city), label: `Near ${persona.city} (your car’s home area)` }), [persona.city]);
  const [issue, setIssue] = useState(initialIssue);
  const [diagnosis, setDiagnosis] = useState<RepairDiagnosis | null>(null);
  const [origin, setOrigin] = useState<Origin>(home);
  const [geo, setGeo] = useState<"idle" | "asking" | "denied" | "unsupported">("idle");
  const [search, setSearch] = useState<SearchState>({ state: "idle" });
  const [reviews, setReviews] = useState<ReviewsState>({ state: "loading" });
  const heading = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(0);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  const ranking: Ranking | null = useMemo(
    () => (diagnosis && search.state === "done" ? rankShops({ shops: search.result.shops, radiusKm: search.result.radiusKm, diagnosis }) : null),
    [diagnosis, search],
  );
  const pins: Pin[] = useMemo(() => (ranking && diagnosis ? topShops(ranking).map((entry, i) => ({
    shop: entry.shop,
    rank: i + 1,
    star: entry.shop.id === ranking.recommended?.shop.id,
    cost: diagnosis.understood ? shopCost(entry.shop, diagnosis.cost) : null,
    verdict: shopVerdict(entry, ranking, diagnosis),
  })) : []), [ranking, diagnosis]);

  /** Reviews for the shops the map shows. Runs after the shop search; the map is usable while it loads. */
  async function loadReviews(id: number, d: RepairDiagnosis, result: ShopSearchResult) {
    const top = topShops(rankShops({ shops: result.shops, radiusKm: result.radiusKm, diagnosis: d }))
      .map(({ shop }) => ({ id: shop.id, name: shop.name, address: shop.address, lat: shop.lat, lng: shop.lng }));
    if (!top.length) { setReviews({ state: "done", source: "none", byId: {} }); return; }
    try {
      const response = await fetch("/api/shop-reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: d.category, shops: top }) });
      if (!response.ok) throw new Error("Reviews are unavailable right now.");
      const body = (await response.json()) as ReviewsResult;
      if (id === requestId.current) setReviews({ state: "done", ...body });
    } catch {
      if (id === requestId.current) setReviews({ state: "error" });
    }
  }

  async function run(at: Origin, d: RepairDiagnosis) {
    const id = ++requestId.current;
    setSearch({ state: "loading" });
    setReviews({ state: "loading" });
    try {
      const response = await fetch(`/api/repair-shops?lat=${roundCoord(at.lat)}&lng=${roundCoord(at.lng)}`);
      if (!response.ok) throw new Error("Shop search is unavailable right now.");
      const result = (await response.json()) as ShopSearchResult;
      if (id !== requestId.current) return;
      setSearch({ state: "done", result });
      void loadReviews(id, d, result);
    } catch (error) {
      if (id !== requestId.current) return;
      setSearch({ state: "error", message: error instanceof Error ? error.message : "Shop search is unavailable right now." });
    }
  }

  const submit = (text = issue) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const d = diagnoseRepair(trimmed, persona, { savings: data.cashflow?.avgBalance ?? 0 });
    setDiagnosis(d);
    void run(origin, d);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) { setGeo("unsupported"); return; }
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude), label: "Near your current location" };
        setOrigin(next);
        setGeo("idle");
        if (diagnosis) void run(next, diagnosis);
      },
      () => setGeo("denied"),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const issueNoun = diagnosis ? ISSUE_NOUN[diagnosis.category] : "this problem";
  const note = !diagnosis ? <p>Describe what’s going on and press Find help. The best shops near you show up here.</p>
    : search.state === "loading" ? <p role="status">Finding shops near you…</p>
    : search.state === "error" ? <><p role="alert">{search.message}</p><button type="button" className="rp-ghost" onClick={() => void run(origin, diagnosis)}>Try again</button></>
    : ranking?.noGood ? <p className="is-warn" role="status"><TriangleAlert size={16} aria-hidden="true" /> {ranking.message}</p>
    : ranking ? <p role="status"><Star size={15} aria-hidden="true" className="rp-star" /> Top {pins.length} shops for {issueNoun}. Hover a dot for the cost, reviews and whether to go.</p>
    : null;

  return (
    <div className="rp">
      <div className="rp-left">
      <a className="rp-back" href={backHref} onClick={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onBack(); } }}>
        <ArrowLeft size={18} aria-hidden="true" /> Back to dashboard
      </a>
      <h2 id="repair-heading" ref={heading} tabIndex={-1} className="rp-title"><Wrench size={22} aria-hidden="true" /> Repairs</h2>
      <CareBlock data={data} />
      <Coverage data={data} />

      <form className="rp-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="rp-issue">What’s going on?</label>
        <textarea id="rp-issue" rows={2} maxLength={240} value={issue} onChange={(e) => setIssue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          placeholder="e.g. my brake disks are grinding" aria-describedby="rp-issue-hint" />
        <p id="rp-issue-hint" className="rp-hint">Press Enter to find shops. Shift+Enter adds a new line.</p>
        <ul className="rp-chips" aria-label="Common problems">
          {CHIPS.map((chip) => (
            <li key={chip}><button type="button" onClick={() => { setIssue(chip); submit(chip); }}>{chip}</button></li>
          ))}
        </ul>
        <div className="rp-where">
          <p><MapPin size={16} aria-hidden="true" /> {origin.label}</p>
          <button type="button" className="rp-ghost" onClick={useMyLocation} disabled={geo === "asking"}>
            <LocateFixed size={16} aria-hidden="true" /> {geo === "asking" ? "Asking your browser…" : "Use my location"}
          </button>
        </div>
        <p className="rp-hint">
          {geo === "denied" ? "Location access was declined, so we’re staying near your car’s home area. You can allow it in your browser settings."
            : geo === "unsupported" ? "Your browser can’t share a location, so we’re staying near your car’s home area."
            : "Your location is used only to find nearby shops. It’s rounded to about 1 km before it’s sent, and never saved."}
        </p>
        <button type="submit" className="rp-go" disabled={!issue.trim() || search.state === "loading"}><Search size={18} aria-hidden="true" /> {search.state === "loading" ? "Searching…" : "Find help"}</button>
      </form>
      </div>

      <div className="rp-right">
        <section className="rp-mapbox" aria-label="Repair shops near you" aria-busy={search.state === "loading"}>
          <RepairMap key={`${origin.lat},${origin.lng}`} origin={origin} originLabel={origin.label} pins={pins} reviews={reviews} issueNoun={issueNoun} note={note} />
        </section>
        <p className="rp-foot">General guidance from what you described, not a diagnosis. Costs are estimates, not quotes. Shop locations from {search.state === "done" && search.result.source === "openstreetmap" ? "OpenStreetMap" : "Mapbox"}.</p>
      </div>
    </div>
  );
}

function Coverage({ data }: { data: DashboardData }) {
  const care = data.engines.protection.options.find((option) => option.id === "protection:current");
  if (!care) return null;
  const months = care.math.find((line) => line.label === "Projected months of ToyotaCare remaining")?.result;
  const milesLeft = care.math.find((line) => line.label === "Mileage remaining")?.result;
  const service = data.engines.protection.options.find((option) => option.id === "protection:service");
  const monthsLeft = Number((months ?? "").replace(/[^\d.]/g, ""));
  const ending = /expired/i.test(care.summary) || (Number.isFinite(monthsLeft) && monthsLeft <= 6);
  const facts = [months, milesLeft && `${milesLeft} under the mileage cap`].filter(Boolean);
  return (
    <section className="rp-cover" aria-labelledby="rp-cover-h">
      <h3 id="rp-cover-h" className="rp-label">Coverage</h3>
      <p>{prettyDates(care.summary)}</p>
      {facts.length > 0 && <p className="rp-hint">{facts.join(" · ")}</p>}
      {ending && service && <p className="rp-hint">{prettyDates(service.summary)} Illustrative price, not a quote.</p>}
    </section>
  );
}

/** Compact ToyotaCare status, from the protection engine's own projection. */
function CareBlock({ data }: { data: DashboardData }) {
  const care = careCoverage(data);
  if (data.caseFile?.source === "pack" || !Number.isFinite(care.months)) return null;
  const ended = care.months <= 0;
  const soon = !ended && care.months <= 6;
  const when = care.expiry ? new Date(`${care.expiry}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  return (
    <p className={`rp-care${ended ? " is-act" : soon ? " is-watch" : ""}`}>
      <ShieldCheck size={16} aria-hidden="true" />
      <span><strong>ToyotaCare {ended ? "has ended" : soon ? "ends soon" : "is active"}.</strong>{" "}
        {ended ? "Scheduled maintenance is no longer covered." : `Scheduled maintenance is covered for about ${Math.max(1, Math.round(care.months))} more month${Math.round(care.months) === 1 ? "" : "s"}${when ? `, to ${when}` : ""}.`}
        {" "}It does not cover repairs.</span>
    </p>
  );
}
