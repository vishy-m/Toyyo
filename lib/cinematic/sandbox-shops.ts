import { classifyRepair, type RepairCategory } from "@/lib/engines/repair-advisor";
import { haversineKm, type Shop } from "./shops";

export const SANDBOX_SHOPS = {
  "lone-star-auto": { name: "Lone Star Auto Works", rate: 135, email: "service@lone-star-auto.demo", offset: { lat: 0.009, lng: 0.008 } },
  "trinity-brake": { name: "Trinity Brake & Tire", rate: 118, email: "service@trinity-brake.demo", offset: { lat: -0.011, lng: -0.009 } },
} as const;
export type SandboxSlug = keyof typeof SANDBOX_SHOPS;
export const sandboxShop = (slug: string) => Object.hasOwn(SANDBOX_SHOPS, slug) ? SANDBOX_SHOPS[slug as SandboxSlug] : null;
export const isSandboxShop = (id: string) => id.startsWith("sandbox/") && sandboxShop(id.slice(8)) !== null;

export function sandboxShopsNear(origin: { lat: number; lng: number }): Shop[] {
  return (Object.keys(SANDBOX_SHOPS) as SandboxSlug[]).map((slug) => {
    const shop = SANDBOX_SHOPS[slug];
    const lat = origin.lat + shop.offset.lat, lng = origin.lng + shop.offset.lng;
    return {
      id: `sandbox/${slug}`, sandbox: true, name: shop.name, lat, lng,
      distanceKm: Math.round(haversineKm(origin, { lat, lng }) * 10) / 10,
      brand: null, isToyotaDealer: false,
      services: ["car_repair", "brakes", "diagnostics", "batteries", "electrical", "tyres", "wheel_alignment", "air_conditioning", "engine_tuning", "transmission"],
      openingHours: "Mo-Fr 08:00-17:00", website: `/sandbox-shop/${slug}`, phone: null, address: "Demo shop, not a real business",
    };
  });
}

const jobs: Record<Exclude<RepairCategory, "unknown">, { parts: [string, number][]; hours: number }> = {
  brakes: { parts: [["Front brake pads", 142], ["Front rotors (pair)", 228]], hours: 2.2 },
  battery: { parts: [["Replacement 12V battery", 189]], hours: 0.7 },
  tires: { parts: [["Four all-season tires", 584], ["Mount and balance", 80]], hours: 1.3 },
  ac: { parts: [["A/C diagnostic and refrigerant", 154], ["Compressor assembly", 465]], hours: 3.1 },
  engine: { parts: [["Engine diagnostic", 129], ["Ignition components", 198]], hours: 2.5 },
  transmission: { parts: [["Transmission service kit", 214], ["Fluid", 94]], hours: 2.8 },
};

export function shopReply(slug: SandboxSlug, request: { name: string; issue: string; vehicleYear: number; vehicleMake: string; vehicleModel: string }) {
  const shop = SANDBOX_SHOPS[slug];
  const category = classifyRepair(request.issue, request.vehicleYear).category;
  const subject = `Your ${shop.name} repair quote`;
  const greeting = `Hi ${request.name.split(" ")[0]},\n\nThanks for asking about your ${request.vehicleYear} ${request.vehicleMake} ${request.vehicleModel}. Based on “${request.issue}”, here is our preliminary quote:\n`;
  const appointment = "\nWe can take it Thursday at 9:00 AM or Friday at 1:30 PM. Please reply to reserve a time.";
  if (category === "unknown") return { subject, body: `${greeting}\nWe'd need to inspect it: diagnostic fee $129, applied to the repair.${appointment}\n\n${shop.name}\nDemo shop, not a real business` };
  const job = jobs[category];
  const labor = Math.round(job.hours * shop.rate * 100) / 100;
  const supplies = 24;
  const total = job.parts.reduce((sum, [, price]) => sum + price, 0) + labor + supplies;
  const lines = job.parts.map(([label, amount]) => `${label}: $${amount.toFixed(2)}`);
  lines.push(`Labor (${job.hours} hours × $${shop.rate}/hour): $${labor.toFixed(2)}`, `Shop supplies: $${supplies.toFixed(2)}`, `Total: $${total.toFixed(2)} (plus tax)`);
  const safety = category === "brakes" ? "\nIf the brakes are grinding or stopping feels unsafe, please avoid driving until the car is inspected.\n" : "\n";
  return { subject, body: `${greeting}\n${lines.join("\n")}${safety}${appointment}\n\n${shop.name}\nDemo shop, not a real business` };
}
