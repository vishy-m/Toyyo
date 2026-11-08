import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVehicle, VEHICLES } from "@/lib/cinematic/vehicles";
import { carName, isSection, pageTitle, SECTIONS } from "@/components/cinematic/sections";

// Every car page is prerendered below, and moving between cars happens client-side with
// history.pushState inside the persistent experience layout, so this segment never needs an instant
// shell. Validating params at the top level keeps invalid URLs a real 404 rather than a streamed one.
export const instant = false;

export function generateStaticParams() {
  return VEHICLES.flatMap((vehicle) => SECTIONS.map((section) => ({ vehicle: vehicle.id, section: section.id })));
}

async function resolve(params: PageProps<"/cars/[vehicle]/[section]">["params"]) {
  const { vehicle: vehicleId, section } = await params;
  const vehicle = getVehicle(vehicleId);
  if (!vehicle || !isSection(section)) notFound();
  return { vehicle, section };
}

export async function generateMetadata({ params }: PageProps<"/cars/[vehicle]/[section]">): Promise<Metadata> {
  const { vehicle, section } = await resolve(params);
  return { title: pageTitle(vehicle, section), description: `Your ${carName(vehicle)}: ${vehicle.descriptor.toLowerCase()}. ${vehicle.headline}` };
}

// The experience layout renders the settled car page for this URL; the page validates it.
export default async function CarPage({ params }: PageProps<"/cars/[vehicle]/[section]">) {
  await resolve(params);
  return null;
}
