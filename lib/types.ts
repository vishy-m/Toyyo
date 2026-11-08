// Shared contract for Toyyo.
// Every task (data/engines, agent API, dashboard UI, 3D) builds against these types.
// Changing a type here is a cross-team change: note it in .plans/tasks/STATUS.md.

export type PersonaId = "maya" | "garcia" | "jordan" | "raj" | "nora" | "eli" | "ava" | "theo" | "ryan" | "devon" | "priya";

export type BodyStyle = "sedan" | "suv" | "truck";

export type MoveType = "lease-end" | "insurance" | "payment" | "protection";

export type Priority = "monthlyPayment" | "totalCost" | "flexibility" | "lifestyleFit";

export type ConsentSource = "driving" | "banking" | "paymentHistory" | "shareWithInsurers";

// ---------- Persona / vehicle / contract ----------

export interface Vehicle {
  year: number;
  make: "Toyota";
  model: string; // "Camry SE", "RAV4 Hybrid XLE", ...
  bodyStyle: BodyStyle;
  modelAsset: string; // "/models/camry.glb"
  paintHex: string; // persona paint color, applied to the model's paint material
  odometer: number;
  vin: string; // synthetic
  isHybrid: boolean;
  mpg: number;
}

export interface LeaseContract {
  kind: "lease";
  startDate: string; // ISO date
  termMonths: number;
  monthsRemaining: number;
  monthlyPayment: number;
  annualMileageAllowance: number;
  overageRatePerMile: number; // e.g. 0.25
  residualValue: number;
  purchaseOptionFee: number;
  dispositionFee: number;
  startingOdometer?: number; // present after a simulated lease switch
}

export interface LoanContract {
  kind: "loan";
  startDate: string;
  termMonths: number;
  monthsRemaining: number;
  monthlyPayment: number;
  apr: number; // 6.9 means 6.9%
  principalRemaining: number;
  autopay: boolean;
}

export type Contract = LeaseContract | LoanContract;

export interface InsurancePolicy {
  carrier: string; // synthetic
  monthlyPremium: number;
  usageBased: boolean;
}

export interface ToyotaCareStatus {
  startDate: string;
  expiresMonths: 24;
  expiresMiles: 25000;
}

export interface Persona {
  id: PersonaId;
  name: string; // "Maya"
  displayName: string; // "Maya, 29 · Austin commuter"
  age: number;
  city: string;
  avatarEmoji: string;
  vehicle: Vehicle;
  contract: Contract;
  insurance: InsurancePolicy;
  toyotaCare: ToyotaCareStatus;
  creditTier: "excellent" | "good" | "fair" | "building";
  consent: Record<ConsentSource, boolean>;
  preferences: Preferences; // seed; runtime copy lives in the server store
  lifeEvents: string[]; // e.g. ["new baby (3 mo)"]
  intendedBestMove: MoveType; // design intent, used by tests
  /** Present on personas imported from the hackathon data pack; drives the pack's responsible-AI rules. */
  profile?: PersonaProfile;
}

export interface PersonaProfile {
  packCustomerId: string; // e.g. "C010"
  occupation: string;
  annualIncome: number;
  preferredChannel: string; // "App" | "Phone" | ...
  marketingConsent: boolean; // false => no new-vehicle offers
  vulnerable: boolean; // true => offer a person, no upsell
  financialStressScore: number; // 0-100, demo signal
  digitalEngagement: string; // "High" | "Medium" | "Low"
}

// ---------- Case file (the customer's situation and the reference best next move) ----------

export type NextStepType = "Self-service" | "Follow-up" | "Offer";

/** One pack option row, camelCased. Numbers are the pack's own, unchanged. */
export interface CaseOption {
  optionId: string;
  optionName: string;
  newMonthlyPayment: number | null;
  monthlyPaymentChange: number | null;
  upfrontCost: number | null;
  totalCostVsKeepAsIs: number | null;
  eligibility: string; // "Y" | "N" | "Review"
  plainLanguageSummary: string;
  keyAssumption: string;
  tradeoff: string;
}

export interface CaseFile {
  personaId: PersonaId;
  source: "pack" | "toyyo";
  packCustomerId?: string;
  driver: { firstName: string; age: number; city: string; state: string; occupation: string };
  quote: string; // the situation in their own words
  context: string; // one-line summary
  bestMove: { title: string; nextStepType: NextStepType; message: string; whyNotOthers: string; guardrails: string; optionId?: string };
  options?: CaseOption[]; // pack personas only
  notes: string[]; // assumptions and caveats
}

// ---------- Trips / driving ----------

export type TripCategory = "commute" | "errand" | "childcare" | "road-trip" | "trailhead" | "other";

export type TripEventType = "hard-brake" | "fast-accel" | "harsh-corner" | "speeding-start" | "speeding-end";

export interface TripEvent {
  t: number; // seconds from trip start
  type: TripEventType;
  scoreDelta: number; // negative = hurt the score
  lngLat: [number, number];
}

export interface Trip {
  id: string;
  personaId: PersonaId;
  start: string; // ISO timestamp
  end: string;
  miles: number;
  highwayPct: number; // 0..1
  nightPct: number; // 0..1
  speedingPct: number; // 0..1
  hardBrakes: number;
  fastAccels: number;
  harshCorners: number;
  category: TripCategory;
  destinationLabel: string; // coarse, e.g. "Big Bend NP"
  score: number; // 0..100 per-trip Drive Pulse-style score
  showcase: boolean; // true = has full-resolution path for 3D replay
  path: [number, number, number][]; // [lng, lat, secondsFromStart]
  events: TripEvent[];
}

export interface DrivingSummary {
  windowDays: number;
  totalMiles: number;
  avgMonthlyMiles: number;
  monthlyMiles: { month: string; miles: number }[]; // last 6 months
  categoryMiles: Record<TripCategory, number>;
  topDestinations: { label: string; trips: number; lngLat: [number, number] }[];
  score: number; // aggregate 0..100 (mileage-weighted)
  scoreFactors: { factor: string; impact: number; detail: string }[];
  smoothStreak: number; // consecutive trips with score >= 90
  lifestyleTags: string[];
}

export interface CashflowSummary {
  payday: "biweekly-fri" | "semimonthly-1-15" | "monthly-1";
  avgBalance: number;
  paymentDueDay: number;
  latePaymentsLast12: number;
  recurringShortfall: boolean;
}

// ---------- Engines ----------

export interface Assumption {
  label: string;
  value: string;
}

export interface MoveOption {
  id: string; // e.g. "lease-end:buyout"
  moveType: MoveType;
  title: string; // "Buy out your Camry"
  summary: string; // one plain-language line (template-rendered, not LLM)
  monthlyCost?: number;
  totalCost?: number;
  savingsVsBaseline?: number; // positive = saves money vs baseline option
  equity?: number;
  deadline?: string; // ISO date
  tradeoffs: string[];
  assumptions: Assumption[];
  math: { label: string; formula: string; result: string }[];
  dataUsed: { source: string; detail: string }[];
  confidence: "high" | "medium" | "low";
  highStakes: boolean; // true => always offer a specialist handoff
  eligible: boolean;
  ineligibleReason?: string;
  upgradeModel?: { name: string; modelAsset: string; bodyStyle: BodyStyle };
}

export interface EngineResult {
  moveType: MoveType;
  baselineOptionId: string;
  options: MoveOption[];
  limitedBy?: ConsentSource[]; // data sources that were off and degraded the result
}

export interface WhatIfOverrides {
  monthlyMiles?: number;
  monthsAhead?: number; // lease time slider
  extraPrincipal?: number;
  paymentDueDay?: number;
  scoreImprovement?: number; // insurance coaching what-if
}

export interface RankedMove {
  rank: number;
  optionId: string;
  moveType: MoveType;
  score: number;
  breakdown: { impact: number; preferenceFit: number; urgency: number; confidence: number };
}

export interface TripInsight {
  id: string;
  text: string; // template-rendered
  relatedMove?: MoveType;
  relatedTripId?: string;
}

// ---------- Preferences / learning ----------

export interface LearnedItem {
  id: string;
  statement: string;
  source: "explicit" | "driving" | "payments" | "behavior";
  confidence: number; // 0..1
  createdAt: string;
}

export interface Preferences {
  priorityWeights: Record<Priority, number>; // sums to 1
  detailLevel: "brief" | "standard" | "show-math";
  format: "bullets" | "table" | "story";
  lifestyleTags: string[];
  suppressedMoveTypes: MoveType[];
  dismissed: { optionId: string; reason: DismissReason; at: string }[];
  accepted: { optionId: string; at: string }[];
  learned: LearnedItem[];
}

export type DismissReason = "too-expensive" | "not-now" | "not-relevant" | "already-done";

// ---------- Agent panel ----------

export interface Recommendation {
  id: string;
  optionId: string;
  moveType: MoveType;
  title: string;
  action: string; // one-line "what to do"
  why: string; // plain-language explanation (LLM-written, grounded)
  impactLabel: string; // "Saves ~$1,120 vs returning"
  urgencyLabel?: string; // "Decide by Feb 14"
  status: "proposed" | "accepted" | "dismissed";
  grounded: boolean; // passed the number-grounding check (false => template fallback was used)
}

export type DraftType = "comparison" | "message" | "reminder" | "plan";

export interface Draft {
  id: string;
  type: DraftType;
  title: string;
  body: string; // markdown
  relatedOptionId?: string;
  createdAt: string;
}

export interface HandoffPacket {
  id: string;
  personaId: PersonaId;
  optionId: string;
  moveType: MoveType;
  mode: "self-service" | "specialist-callback";
  customerSummary: string;
  numbers: Assumption[];
  consentedData: ConsentSource[];
  statedPreferences: string[];
  createdAt: string;
}

export interface TfsMetrics {
  personaId: PersonaId;
  recommendedMove: string;
  accepted: boolean;
  retentionLikelihood: number; // 0..1
  projectedValue: number; // $ retained / revenue
  callsAvoided: number;
  openPackets: number;
  assumptions: Assumption[];
}

// ---------- API payloads ----------

// GET /api/persona/[id]
export interface DashboardData {
  persona: Persona;
  driving: DrivingSummary;
  cashflow: CashflowSummary | null; // null when banking consent is off
  engines: Record<MoveType, EngineResult>;
  ranked: RankedMove[];
  tripInsights: TripInsight[];
  trips: Omit<Trip, "path" | "events">[]; // list view; fetch full trip separately
  preferences: Preferences; // runtime copy
  caseFile?: CaseFile; // the carousel case (situation, reference best next move, options)
}

// GET /api/trips/[tripId] -> Trip (full path + events)

// GET /api/agent/initial?personaId= -> AgentPanelState (cached per persona)
export interface AgentPanelState {
  personaId: PersonaId;
  recommendations: Recommendation[];
  drafts: Draft[];
  learned: LearnedItem[];
}

// POST /api/agent  body: AgentChatRequest  -> text/event-stream of AgentStreamEvent (one JSON per `data:` line)
export interface AgentChatRequest {
  personaId: PersonaId;
  message: string;
  context?: { widget?: string; optionId?: string; tripId?: string };
}

/** Pages the dashboard and the copilot can open. `next-move` and `recommendations` stay URL-only. */
export type DashboardPage = "overview" | "repairs" | "driving" | "finances";

export type UiAction =
  | { kind: "open_trip_replay"; tripId: string; focusEventT?: number }
  | { kind: "focus_vehicle_hotspot"; hotspot: Hotspot }
  | { kind: "set_whatif"; control: keyof WhatIfOverrides; value: number }
  | { kind: "open_move"; moveType: MoveType }
  | { kind: "open_page"; page: DashboardPage; issue?: string };

export type Hotspot = "odometer" | "tires" | "engine" | "driver-seat";

export type AgentStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; status: "start" | "done" }
  | { type: "recommendations"; recommendations: Recommendation[] }
  | { type: "draft"; draft: Draft }
  | { type: "ui_action"; action: UiAction }
  | { type: "learned"; item: LearnedItem }
  | { type: "error"; message: string }
  | { type: "done" };

// POST /api/actions  body: ActionRequest -> ActionResponse
export type ActionRequest =
  | { kind: "accept"; personaId: PersonaId; optionId: string; mode: HandoffPacket["mode"] }
  | { kind: "dismiss"; personaId: PersonaId; optionId: string; reason: DismissReason }
  | { kind: "delete_learned"; personaId: PersonaId; learnedId: string }
  | { kind: "set_consent"; personaId: PersonaId; source: ConsentSource; value: boolean }
  | { kind: "set_style"; personaId: PersonaId; detailLevel?: Preferences["detailLevel"]; format?: Preferences["format"] };

export interface ActionResponse {
  ok: boolean;
  preferences: Preferences;
  packet?: HandoffPacket;
  learned?: LearnedItem[];
}

// POST /api/whatif  body: { personaId, moveType, overrides } -> EngineResult
export interface WhatIfRequest {
  personaId: PersonaId;
  moveType: MoveType;
  overrides: WhatIfOverrides;
}

// GET /api/tfs -> TfsMetrics[] + HandoffPacket[]
export interface TfsData {
  metrics: TfsMetrics[];
  packets: HandoffPacket[];
}
