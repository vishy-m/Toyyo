"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { ExternalLink, Phone, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { chosenProvider, mapboxToken, webglAvailable } from "@/components/map/provider";
import { DEALER_PREMIUM, type ShopVerdict } from "@/lib/cinematic/shop-ranking";
import type { ShopReviews } from "@/lib/cinematic/shop-reviews";
import { reviewsUrl, type Shop } from "@/lib/cinematic/shops";
import { usd } from "@/lib/client/format";
import "./repair-map.css";

export interface MapPin {
  shop: Shop;
  rank: number;
  star: boolean;
  cost: { low: number; high: number; dealer: boolean } | null;
  verdict: ShopVerdict;
}
export type ReviewsState = { state: "loading" } | { state: "error" } | { state: "done"; source: "google" | "none"; byId: Record<string, ShopReviews> };

interface Props {
  origin: { lat: number; lng: number };
  originLabel: string;
  pins: MapPin[];
  reviews: ReviewsState;
  /** "brakes": how the card names the problem when matching reviews. */
  issueNoun: string;
  /** Status line over the map (prompt, loading, why there is no star). */
  note?: ReactNode;
}

type Marker = { setLngLat(p: [number, number]): Marker; addTo(m: unknown): Marker; remove(): void };
type MapLike = {
  remove(): void; resize(): void;
  fitBounds(b: [[number, number], [number, number]], o: Record<string, unknown>): void;
  easeTo(o: Record<string, unknown>): void;
  on(ev: string, cb: (e?: { originalEvent?: Event }) => void): void;
  addControl(c: unknown, pos?: string): void;
};
type Lib = {
  Map: new (o: Record<string, unknown>) => MapLike;
  Marker: new (o: { element: HTMLElement; anchor?: string }) => Marker;
  AttributionControl: new (o: Record<string, unknown>) => unknown;
};

const DARK_LIBRE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Keep a dot's card fully inside the map: above the dot if it fits, else below, else beside it on the roomier side,
 * always clamped to the map's edges. Sets the card's offset from its dot and its grow origin (the dot's centre).
 */
function placeCard(node: HTMLElement, container: HTMLElement) {
  const card = node.querySelector<HTMLElement>(".rm-card");
  if (!card) return;
  const box = container.getBoundingClientRect(), dot = node.getBoundingClientRect();
  const w = card.offsetWidth, h = card.offsetHeight, gap = 10, edge = 8;
  const dx = dot.left - box.left, dy = dot.top - box.top, size = dot.width, cx = dx + size / 2, cy = dy + size / 2;
  const clampX = (x: number) => Math.min(Math.max(x, edge), box.width - w - edge);
  const clampY = (y: number) => Math.min(Math.max(y, edge), box.height - h - edge);
  let x: number, y: number;
  if (dy - gap - h >= edge) { x = clampX(cx - w / 2); y = dy - gap - h; }
  else if (dy + size + gap + h <= box.height - edge) { x = clampX(cx - w / 2); y = dy + size + gap; }
  else { x = clampX(cx > box.width / 2 ? dx - gap - w : dx + size + gap); y = clampY(cy - h / 2); }
  node.style.setProperty("--rm-x", `${Math.round(x - dx)}px`);
  node.style.setProperty("--rm-y", `${Math.round(y - dy)}px`);
  node.style.setProperty("--rm-ox", `${Math.round(cx - x)}px`);
  node.style.setProperty("--rm-oy", `${Math.round(cy - y)}px`);
}

export default function RepairMap({ origin, originLabel, pins, reviews, issueNoun, note }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const libRef = useRef<Lib | null>(null);
  const pinsRef = useRef(pins);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() => (webglAvailable() ? "loading" : "error"));
  useEffect(() => { pinsRef.current = pins; });

  // One DOM node per shop for the map library to position; React renders the dot and its card into it.
  const ids = pins.map((p) => p.shop.id).join("|");
  const nodes = useMemo(() => new Map(ids.split("|").filter(Boolean).map((id) => [id, document.createElement("div")] as const)), [ids]);

  // The map itself, once (the parent remounts this component when the origin moves).
  useEffect(() => {
    const container = el.current;
    if (!container || !webglAvailable()) return;
    let cancelled = false;
    let me: Marker | null = null;
    (async () => {
      try {
        let lib: Lib;
        let style: string;
        if (chosenProvider() === "mapbox") {
          const mapboxgl = (await import("mapbox-gl")).default;
          mapboxgl.accessToken = mapboxToken();
          lib = mapboxgl as unknown as Lib;
          style = "mapbox://styles/mapbox/dark-v11";
        } else {
          const maplibregl = await import("maplibre-gl");
          (await import("@/components/map/maplibre-worker")).ensureMaplibreWorker();
          lib = maplibregl as unknown as Lib;
          style = DARK_LIBRE;
        }
        if (cancelled) return;
        const map = new lib.Map({ container, style, center: [origin.lng, origin.lat], zoom: 11, attributionControl: false, cooperativeGestures: false });
        map.addControl(new lib.AttributionControl({ compact: true }), "bottom-left");
        mapRef.current = map;
        libRef.current = lib;
        const dot = document.createElement("div");
        dot.className = "rm-me";
        dot.setAttribute("role", "img");
        dot.setAttribute("aria-label", `You: ${originLabel}`);
        me = new lib.Marker({ element: dot, anchor: "center" }).setLngLat([origin.lng, origin.lat]).addTo(map);
        // Touch has no hover: tapping a dot focuses it (card opens); tapping the map closes it.
        map.on("click", (e) => {
          const target = e?.originalEvent?.target;
          if (target instanceof Element && target.closest(".rm-marker")) return;
          const active = document.activeElement;
          if (active instanceof HTMLElement && container.contains(active)) active.blur();
        });
        map.on("load", () => { if (!cancelled) { map.resize(); setStatus("ready"); } });
        map.on("error", () => { if (!cancelled) setStatus((s) => (s === "ready" ? s : "error")); });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      me?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [origin.lat, origin.lng, originLabel]);

  // Shop dots: added when the map is ready and whenever the set of shops changes; framed with "you".
  useEffect(() => {
    const map = mapRef.current, lib = libRef.current, container = el.current;
    if (status !== "ready" || !map || !lib || !container) return;
    const list = pinsRef.current.filter((p) => nodes.has(p.shop.id));
    const undo: (() => void)[] = [];
    for (const pin of list) {
      const node = nodes.get(pin.shop.id)!;
      node.classList.add("rm-marker");
      const place = () => placeCard(node, container);
      node.addEventListener("pointerenter", place);
      node.addEventListener("focusin", place);
      const marker = new lib.Marker({ element: node, anchor: "center" }).setLngLat([pin.shop.lng, pin.shop.lat]).addTo(map);
      undo.push(() => { node.removeEventListener("pointerenter", place); node.removeEventListener("focusin", place); marker.remove(); });
    }
    if (list.length) {
      const lngs = [origin.lng, ...list.map((p) => p.shop.lng)], lats = [origin.lat, ...list.map((p) => p.shop.lat)];
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 96, bottom: 56, left: 56, right: 56 }, maxZoom: 14, duration: 700 });
    } else {
      map.easeTo({ center: [origin.lng, origin.lat], zoom: 11, duration: 0 });
    }
    return () => undo.forEach((fn) => fn());
  }, [status, nodes, origin.lat, origin.lng]);

  return (
    <div className="rm">
      <div className="rm-map" ref={el} />
      {note && <div className="rm-note">{note}</div>}
      {status === "loading" && !pins.length && <p className="rm-loading" role="status">Loading map…</p>}
      {status === "error" && !pins.length && <p className="rm-loading" role="status">The map couldn’t load. Shops will be listed here instead.</p>}
      {status === "error" && pins.length > 0 && (
        <ol className="rm-list" aria-label="Repair shops near you">
          {pins.map((pin) => <li key={pin.shop.id}><ShopCard pin={pin} reviews={reviews} issueNoun={issueNoun} /></li>)}
        </ol>
      )}
      {status !== "error" && pins.map((pin) => {
        const node = nodes.get(pin.shop.id);
        return node ? createPortal(<Dot pin={pin} reviews={reviews} issueNoun={issueNoun} />, node, pin.shop.id) : null;
      })}
    </div>
  );
}

function Dot({ pin, reviews, issueNoun }: { pin: MapPin; reviews: ReviewsState; issueNoun: string }) {
  const { shop, rank, star } = pin;
  return (
    <>
      <button type="button" className={`rm-pin${star ? " is-star" : ""}`}
        aria-label={`${rank}. ${shop.name}${star ? ", best fit" : ""}, ${shop.distanceKm.toFixed(1)} km. Details follow.`}>
        {star ? <Star size={15} aria-hidden="true" /> : <span aria-hidden="true">{rank}</span>}
      </button>
      <ShopCard pin={pin} reviews={reviews} issueNoun={issueNoun} />
    </>
  );
}

function ShopCard({ pin, reviews, issueNoun }: { pin: MapPin; reviews: ReviewsState; issueNoun: string }) {
  const { shop, rank, star, cost, verdict } = pin;
  return (
    <div className="rm-card">
      <div className="rm-card-head">
        <span className={`rm-badge${star ? " is-star" : ""}`} aria-hidden="true">{star ? <Star size={13} /> : rank}</span>
        <div>
          <p className="rm-name">{shop.name}</p>
          <p className="rm-sub">{shop.distanceKm.toFixed(1)} km away{shop.isToyotaDealer ? " · Toyota dealer" : ""}</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>Est. cost</dt>
          <dd>{cost ? <><b>{usd(cost.low)}–{usd(cost.high)}</b><small>{cost.dealer ? `Dealer pricing: about ${Math.round(DEALER_PREMIUM * 100)}% above independent shops (AAIA study).` : "Typical independent-shop range."}</small></>
            : "Needs an inspection before anyone can price it."}</dd>
        </div>
        <div>
          <dt>Reviews</dt>
          <dd><Reviews shop={shop} reviews={reviews} issueNoun={issueNoun} /></dd>
        </div>
        <div>
          <dt>Go here?</dt>
          <dd className={`rm-verdict is-${verdict.tone}`}><b>{verdict.headline}.</b> {verdict.detail}</dd>
        </div>
      </dl>
      <p className="rm-links">
        <a href={reviewsUrl(shop)} target="_blank" rel="noopener noreferrer">Open in Google Maps <ExternalLink size={12} aria-hidden="true" /></a>
        {shop.phone && <a href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`}><Phone size={12} aria-hidden="true" /> Call</a>}
      </p>
    </div>
  );
}

/** Real reviews only (Google Places, when configured); otherwise say so and link out. Never invented. */
function Reviews({ shop, reviews, issueNoun }: { shop: Shop; reviews: ReviewsState; issueNoun: string }) {
  if (reviews.state === "loading") return <span className="rm-muted">Checking reviews…</span>;
  if (reviews.state === "error") return <span className="rm-muted">Reviews couldn’t load right now.</span>;
  if (reviews.source === "none") return <span className="rm-muted">Reviews aren’t connected in this demo. Open the shop in Google Maps to read them.</span>;
  const r = reviews.byId[shop.id];
  if (!r) return <span className="rm-muted">No Google listing matched this shop.</span>;
  return (
    <>
      {r.rating !== null && <span className="rm-rating"><Star size={12} aria-hidden="true" /> {r.rating.toFixed(1)}{r.count !== null ? ` · ${r.count.toLocaleString("en-US")} reviews` : ""} on Google</span>}
      {r.mentions.length > 0 ? (
        <ul className="rm-quotes" aria-label={`Reviews that mention ${issueNoun}`}>
          {r.mentions.map((m, i) => (
            <li key={i}>“{m.text}”<small>{m.author ? (m.authorUrl ? <a href={m.authorUrl} target="_blank" rel="noopener noreferrer">{m.author}</a> : m.author) : "A Google user"}{m.when ? `, ${m.when}` : ""}</small></li>
          ))}
        </ul>
      ) : <span className="rm-muted">None of its recent reviews mention {issueNoun}.</span>}
    </>
  );
}
