import { VEHICLES, type CinematicVehicle } from "@/lib/cinematic/vehicles";

/** Sections of a car's page, in rail order. The id is the last URL segment: /cars/<vehicle>/<section>. */
export const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "finances", label: "Finances" },
  { id: "repairs", label: "Repairs" },
  { id: "driving", label: "Driving" },
  { id: "next-move", label: "Next move" },
  { id: "recommendations", label: "Recommendations" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export function isSection(value: string | undefined): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

export function carPath(vehicleId: string, section: SectionId = "overview") {
  return `/cars/${vehicleId}/${section}`;
}

/** "2025 Camry Hybrid". */
export function carName(vehicle: CinematicVehicle) {
  return `${vehicle.year} ${vehicle.name}`;
}

/** Page title without the " · Toyyo" suffix (the root layout template adds it on the server). */
export function pageTitle(vehicle: CinematicVehicle, section: SectionId) {
  const label = SECTIONS.find((item) => item.id === section)?.label ?? "Overview";
  return section === "overview" ? carName(vehicle) : `${vehicle.name}: ${label}`;
}

/** `valid` is false for URLs the experience doesn't own (they render the not-found page instead). */
export function parseCarPath(pathname: string): { vehicle?: CinematicVehicle; section: SectionId; valid: boolean } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { section: "overview", valid: true };
  const [root, vehicleId, section] = parts;
  const vehicle = VEHICLES.find((item) => item.id === vehicleId);
  const valid = root === "cars" && parts.length === 3 && Boolean(vehicle) && isSection(section);
  return { vehicle: valid ? vehicle : undefined, section: valid && isSection(section) ? section : "overview", valid };
}
