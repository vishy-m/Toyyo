import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboard } from "../../server/dashboard";
import { resetPersona } from "../../server/store";
import type { AgentStreamEvent } from "../../types";
import { mostInstructive } from "../../cinematic/trip-pick";
import { sectionForAlert } from "../../cinematic/alerts";
import { offlineChat } from "../loop";
import { offlineIntent } from "../offline-intents";
import { agentTools, executeTool } from "../tools";

beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", ""); resetPersona("jordan"); });
afterEach(() => vi.unstubAllEnvs());

const ctx = (events: AgentStreamEvent[]) => ({ personaId: "jordan" as const, emit: (e: AgentStreamEvent) => events.push(e), evidence: [] as unknown[] });

describe("alert pages", () => {
  it("sends each alert to the page that can act on it", () => {
    expect(sectionForAlert("driving")).toBe("driving");
    expect(sectionForAlert("mileage")).toBe("driving");
    expect(sectionForAlert("fuel")).toBe("driving");
    expect(sectionForAlert("rate")).toBe("finances");
    expect(sectionForAlert("timing")).toBe("finances");
    expect(sectionForAlert("coverage")).toBe("repairs");
  });
});

describe("open_page", () => {
  it("is in the tool list with a strict schema", () => {
    const tool = agentTools.find((t) => t.name === "open_page")!;
    expect(tool).toBeDefined();
    expect(JSON.stringify(tool.input_schema)).toContain("repairs");
    expect(JSON.stringify(tool.input_schema)).toContain("driving");
    expect(JSON.stringify(tool.input_schema)).toContain("finances");
    expect(tool.input_schema).toMatchObject({ additionalProperties: false });
  });
  it("executes by emitting a ui_action and rejects bad pages", async () => {
    const events: AgentStreamEvent[] = [];
    const ok = await executeTool("open_page", { page: "repairs", issue: "brakes grinding" }, ctx(events));
    expect(ok.isError).toBeFalsy();
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "open_page", page: "repairs", issue: "brakes grinding" } });
    expect((await executeTool("open_page", { page: "billing" }, ctx([]))).isError).toBe(true);
  });
  it("offline: a repair-sounding message opens Repairs with the message as issue", async () => {
    expect(offlineIntent("my brakes are grinding", getDashboard("jordan"))).toMatchObject({ page: "repairs", issue: "my brakes are grinding" });
    const events: AgentStreamEvent[] = [];
    await offlineChat({ personaId: "jordan", message: "my brakes are grinding" }, ctx(events));
    expect(events).toContainEqual({ type: "ui_action", action: { kind: "open_page", page: "repairs", issue: "my brakes are grinding" } });
    const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
    expect(text).not.toMatch(/Jordan|Houston|synthetic/i);
  });
  it("offline: a lease question is not a repair", () => {
    expect(offlineIntent("what happens at the end of my lease?", getDashboard("maya")).page).toBeUndefined();
  });
  it("offline: asking to see driving or finances opens those pages", () => {
    expect(offlineIntent("show my driving score", getDashboard("jordan")).page).toBe("driving");
    expect(offlineIntent("open finances", getDashboard("jordan")).page).toBe("finances");
    expect(offlineIntent("show my brakes", getDashboard("jordan")).page).toBe("repairs");
    expect(offlineIntent("show my drives", getDashboard("jordan")).page).toBe("driving");
    expect(offlineIntent("take me to my trips", getDashboard("jordan")).page).toBe("driving");
    expect(offlineIntent("show me a replay", getDashboard("jordan")).page).toBe("driving");
    expect(offlineIntent("show my loan", getDashboard("jordan")).page).toBe("finances");
    expect(offlineIntent("view my payment and refinance options", getDashboard("jordan")).page).toBe("finances");
  });
});

describe("case answers (offline)", () => {
  const answer = async (id: "ryan" | "devon" | "priya", mutate?: (d: ReturnType<typeof getDashboard>) => void) => {
    const events: AgentStreamEvent[] = [];
    const dashboard = structuredClone(getDashboard(id));
    mutate?.(dashboard);
    const { caseAnswer } = await import("../loop");
    return { text: caseAnswer(dashboard), dashboard, events };
  };
  it("offline intent recognises 'what should I do'", () => {
    expect(offlineIntent("What should I do?", getDashboard("ryan")).bestMove).toBe(true);
    expect(offlineIntent("my brakes are grinding", getDashboard("ryan")).bestMove).toBe(false);
  });
  it("ryan: keep the lease and move it to Colorado, Follow-up", async () => {
    const { text, dashboard } = await answer("ryan");
    expect(text).toContain(dashboard.caseFile!.bestMove.title);
    expect(text).toContain("$3,135");
    expect(text).toContain("Next step: Follow-up");
    expect(text).toMatch(/specialist/i);
    expect(text).not.toMatch(/buy it out/i);
  });
  it("devon: early renewal, Eligible offer, with the pack's numbers", async () => {
    const { text } = await answer("devon");
    expect(text).toContain("Early lease renewal into a new hybrid");
    expect(text).toContain("$395");
    expect(text).toContain("Next step: Eligible offer");
  });
  it("priya: buy vs return with the pack's $16,670 buyout", async () => {
    const { text } = await answer("priya");
    expect(text).toContain("$16,670");
    expect(text).toContain("Next step: Eligible offer");
  });
  it("no marketing consent: no offer wording and no renewal pitch", async () => {
    const { text } = await answer("devon", (d) => { d.persona.profile = { ...d.persona.profile!, marketingConsent: false }; });
    expect(text).not.toMatch(/offer|loyalty|new hybrid/i);
    expect(text).toContain("Next step: Self-service");
  });
  it("vulnerable: a specialist and no offer", async () => {
    const { text } = await answer("priya", (d) => { d.persona.profile = { ...d.persona.profile!, vulnerable: true }; });
    expect(text).toContain("Next step: Follow-up");
    expect(text).not.toMatch(/eligible offer/i);
  });
  it("the case file is in the agent context", async () => {
    const { agentContext } = await import("../../server/dashboard");
    expect(agentContext(getDashboard("devon")).caseFile?.bestMove.optionId).toBe("RENEW");
  });
});

describe("driving replay pick", () => {
  it("opens on the replayable drive with the most events, then the worst score", () => {
    for (const id of ["jordan", "priya", "theo"] as const) {
      const trips = getDashboard(id).trips;
      const pick = mostInstructive(trips)!;
      expect(pick.showcase).toBe(true);
      const events = (t: typeof pick) => t.hardBrakes + t.fastAccels + t.harshCorners;
      for (const t of trips.filter((x) => x.showcase)) expect(events(t) <= events(pick)).toBe(true);
    }
  });
});
