"use client";

import { useDataStore } from "./data-store";
import { useUiStore } from "./ui-store";

/**
 * The current persona's dashboard. Keeps the previous persona on screen until the next one loads,
 * so nothing flashes to a skeleton and the car can drive off and roll back in.
 */
export function useDashboard() {
  const personaId = useUiStore((s) => s.personaId);
  const data = useDataStore((s) => s.dashboards[personaId] ?? s.lastDashboard);
  const error = useDataStore((s) => s.dashboardError);
  return { data, error };
}
