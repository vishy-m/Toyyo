import { describe, expect, it } from "vitest";
import { approveLease, evaluateLease, getLeaseConversation, replyToLease, updateLeaseMileage } from "../lease-conversation";
import { getDashboard } from "../dashboard";
import { getState } from "../store";

describe("proactive lease conversation", () => {
  it("warns once, requires option review and explicit confirmation, then updates the approved contract", async () => {
    const warning = await evaluateLease("maya");
    expect(warning.stage).toBe("warning");
    expect(warning.projectedExcessMiles).toBeGreaterThan(1000);
    expect(warning.projectedOverageCharge).toBeGreaterThan(0);
    expect(warning.messages[0].text).toContain("estimated");
    expect((await evaluateLease("maya")).messages).toHaveLength(1);
    await expect(replyToLease("maya", "CONFIRM SWITCH")).resolves.toMatchObject({ stage: "warning" });
    expect((await replyToLease("maya", "OPTIONS")).stage).toBe("offer");
    await expect(replyToLease("maya", "CONFIRM SWITCH")).rejects.toThrow("Review the option");
    const reviewed = await replyToLease("maya", "SWITCH");
    expect(reviewed.optionId).toBe("lease-end:upgrade");
    const packet = await replyToLease("maya", "CONFIRM SWITCH");
    expect(packet.stage).toBe("dealer-review");
    expect(packet.packet?.optionId).toBe("lease-end:upgrade");
    const approved = await approveLease("maya");
    expect(approved.stage).toBe("approved");
    const dashboard = getDashboard("maya");
    expect(dashboard.persona.vehicle.model).toBe("Camry");
    expect(dashboard.persona.contract.monthlyPayment).toBeGreaterThan(0);
    expect(dashboard.persona.contract.kind).toBe("lease");
    expect(dashboard.persona.contract.kind === "lease" && dashboard.persona.contract.startingOdometer).toBe(0);
  });

  it("uses updated odometer data and does not alert a lease that is below threshold", async () => {
    const quiet = await evaluateLease("raj");
    expect(quiet.stage).toBe("idle");
    expect(quiet.messages).toHaveLength(0);
    const current = getDashboard("raj").persona.vehicle.odometer;
    await expect(updateLeaseMileage("raj", current - 1)).rejects.toThrow("cannot be lower");
    const changed = await updateLeaseMileage("raj", current + 30000);
    expect(changed.stage).toBe("warning");
    expect(getDashboard("raj").persona.vehicle.odometer).toBe(current + 30000);
    getState("raj").consent.driving = false;
    expect(getLeaseConversation("raj").stage).toBe("idle");
    await expect(replyToLease("raj", "OPTIONS")).rejects.toThrow("permission was turned off");
  });
});
