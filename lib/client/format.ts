// Display formatters shared by dashboard, agent panel and TFS view.
import type { MoveType, TripCategory } from "@/lib/types";

export const usd = (n: number, opts: { cents?: boolean; sign?: boolean } = {}) => {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}$${s}`;
};

export const miles = (n: number) => `${Math.round(n).toLocaleString("en-US")} mi`;
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export const moveLabel: Record<MoveType, string> = {
  "lease-end": "Lease end",
  insurance: "Insurance",
  payment: "Payment",
  protection: "Protection",
};

export const categoryLabel: Record<TripCategory, string> = {
  commute: "Commute",
  errand: "Errand",
  childcare: "Childcare",
  "road-trip": "Road trip",
  trailhead: "Trailhead",
  other: "Other",
};

/** Fixed-locale, fixed-zone date so server and client render the same text. */
export function shortDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}
export function timeOfDay(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}
export function duration(startIso: string, endIso: string) {
  const m = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export const toolLabel: Record<string, string> = {
  get_customer_snapshot: "Reading your account",
  get_driving_summary: "Reading your trips",
  get_cashflow_summary: "Checking cash flow",
  compute_lease_end_options: "Running lease-end numbers",
  compute_insurance_options: "Pricing insurance options",
  compute_payment_options: "Running payment numbers",
  compute_protection_options: "Checking protection plans",
  get_trip_insights: "Looking for trip patterns",
  rank_moves: "Ranking your moves",
  create_draft: "Writing a draft",
  open_trip_replay: "Opening a trip replay",
  focus_vehicle_hotspot: "Pointing at your car",
  set_whatif: "Adjusting a what-if",
  open_move: "Opening the details",
  open_trip_replay_action: "Opening a trip replay",
  accept_move: "Preparing the handoff",
  update_preference: "Noting a preference",
};

export const consentLabel: Record<"driving" | "banking" | "paymentHistory" | "shareWithInsurers", string> = {
  driving: "Driving data",
  banking: "Banking data",
  paymentHistory: "Payment history",
  shareWithInsurers: "Sharing with insurers",
};

/** Turns ISO dates inside agent-written labels ("Decide by 2027-01-28") into "Jan 28". */
export function prettyDates(text: string) {
  return text.replace(/\b(\d{4}-\d{2}-\d{2})(T[\d:.]+Z?)?\b/g, (m) => shortDate(m.slice(0, 10)));
}

/** "2026-06" -> "Jun"; passes through labels that are already short. */
export function monthLabel(m: string) {
  const x = /^(\d{4})-(\d{2})$/.exec(m);
  if (!x) return m;
  return new Date(Date.UTC(+x[1], +x[2] - 1, 15)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

/** Signed score delta with at most one decimal; zero shows as "0". */
export function signed(n: number) {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
}

/** Display-only tidy-up of engine strings: "47058.88 mi" -> "47,059 mi", "19400" -> "19,400". Leaves $x.xx cents alone. */
export function prettyNums(text: string) {
  return text
    .replace(/(\d+(?:\.\d+)?)(\s?mi\b)/g, (_, n: string, unit: string) => `${Math.round(parseFloat(n)).toLocaleString("en-US")}${unit}`)
    .replace(/(?<![\d.,$])(\d{4,})(?![\d,])/g, (m, n: string, off: number, all: string) => {
      // keep years and ISO dates as-is
      if (/^(19|20)\d{2}$/.test(n) || all[off + n.length] === "-" || all[off - 1] === "-") return m;
      return parseInt(n, 10).toLocaleString("en-US");
    })
    .replace(/\$(\d{4,})(\.\d{2})?/g, (_, n: string, c = "") => `$${parseInt(n, 10).toLocaleString("en-US")}${c}`);
}
