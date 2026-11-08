import { notFound, redirect } from "next/navigation";
import { getVehicle, VEHICLES } from "@/lib/cinematic/vehicles";
import { carPath } from "@/components/cinematic/sections";

// A redirect-only segment: it resolves params and redirects, so it is allowed to block.
export const instant = false;

export function generateStaticParams() {
  return VEHICLES.map((vehicle) => ({ vehicle: vehicle.id }));
}

// /cars/<vehicle> opens the default section.
export default async function VehicleIndex({ params }: PageProps<"/cars/[vehicle]">) {
  const vehicle = getVehicle((await params).vehicle);
  if (!vehicle) notFound();
  redirect(carPath(vehicle.id));
}
