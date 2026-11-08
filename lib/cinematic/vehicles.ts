import type { PersonaId } from "@/lib/types";

export interface CinematicVehicle {
  id: string;
  personaId: PersonaId;
  name: string;
  year: number;
  /** Short line under the name in the carousel: body style and contract. */
  descriptor: string;
  /** Overview heading. */
  headline: string;
  /** Overview paragraph, second person. Figures must match the car's data (lib/engines/__tests__/engines.test.ts). */
  summary: string;
  model: { url: string; rotationY: number; length: number; dropNodes?: string[]; dropMaterials?: string[]; excludeFromBounds?: string[]; paint?: { material: string; color: string } };
  credit: { title: string; author: string; url: string; license: string };
  poster: string;
}

export const VEHICLES: CinematicVehicle[] = [
  {
    id: "camry", personaId: "ryan", name: "Camry Hybrid", year: 2025,
    descriptor: "Hybrid sedan · Lease", headline: "Moving to Denver? Keep the lease.",
    summary: "Your Camry XSE lease has 18 months left at $435 a month. Ending it early could cost about $3,135, while keeping it and moving it to Colorado costs nothing extra. A specialist confirms the registration and insurance paperwork.",
    model: { url: "/models/camry.glb", rotationY: 0, length: 4.92, paint: { material: "CarPaint", color: "#b3122c" } },
    credit: { title: "2025 Toyota Camry (XV80) Hybrid", author: "Ddiaz Design", url: "https://sketchfab.com/3d-models/2025-toyota-camry-xv80-hybrid-53f8cbf2483940fba956f4e740a3a4ae", license: "CC BY-NC-SA 4.0" },
    poster: "/models/cinematic/posters/camry.png",
  },
  {
    id: "rav4", personaId: "devon", name: "RAV4 Hybrid", year: 2024,
    descriptor: "Hybrid SUV · Lease", headline: "Barely driven. Plenty of options.",
    summary: "Your RAV4 Hybrid lease ends in 5 months and you’ve stayed well under the mileage limit, so there’s no mileage fee. Returning costs a $395 turn-in fee, buying out is $22,550 for a car worth about $26,650, and a loyalty renewal can waive the fee and start a new hybrid.",
    model: { url: "/models/cinematic/toyota-rav4.glb", rotationY: 0, length: 4.6, paint: { material: "Silver_Sky_Metallic", color: "#3f6fb0" } },
    credit: { title: "2021 Toyota RAV4 Hybrid", author: "tonielpro520", url: "https://sketchfab.com/3d-models/2021-toyota-rav4-hybrid-de74fe4e98004c92b1103947597d1b53", license: "CC BY 4.0" },
    poster: "/models/cinematic/posters/rav4.png",
  },
  {
    id: "gr-supra", personaId: "jordan", name: "GR Supra", year: 2024,
    descriptor: "Sports coupe · Loan", headline: "Keep the thrill. Rethink the cost.",
    summary: "Your Supra makes the ordinary commute feel special. Insurance is the cost most worth working on: smoother late-night driving could lift your driving score from 68, and moving the payment due date could fit your payday better.",
    model: { url: "/models/gr-supra.glb", rotationY: 0, length: 4.38, paint: { material: "Paint", color: "#e6c42a" } },
    credit: { title: "Toyota GR Supra", author: "J5nnym1r™", url: "https://sketchfab.com/3d-models/toyota-gr-supra-371c9c1ded6440699b7c261c0fb82a2c", license: "CC BY-NC 4.0" },
    poster: "/models/cinematic/posters/gr-supra.png",
  },
  {
    id: "land-cruiser", personaId: "nora", name: "Land Cruiser", year: 2017,
    descriptor: "Full-size SUV · Loan", headline: "Built for the miles still ahead.",
    summary: "Your Land Cruiser is made to be kept, and it’s set up for Hill Country weekends and long drives. There are 52 payments left on the loan, so a lower-rate refinance and a small extra payment sit next to the maintenance an older SUV will need.",
    model: { url: "/models/cinematic/toyota-land-cruiser.glb", rotationY: 0, length: 4.95, dropMaterials: ["material_0"], paint: { material: "body", color: "#6b7a55" } },
    credit: { title: "Toyota Land Cruiser J200 2017", author: "David_Holiday", url: "https://sketchfab.com/3d-models/toyota-land-cruiser-j200-2017-374e85a6e18743429f6d9c0e7bbffb3c", license: "CC BY 4.0" },
    poster: "/models/cinematic/posters/land-cruiser.png",
  },
  {
    id: "hilux", personaId: "eli", name: "Hilux", year: 2007,
    descriptor: "Pickup · Loan", headline: "A working truck. A clearer payoff.",
    summary: "Your Hilux hauls tools to every job and weekend errand. There are 27 payments left on the used-vehicle loan, and a lower rate could trim the payment. A dependable truck is worth keeping running, so the plan pairs a clearer payoff with a maintenance budget.",
    model: { url: "/models/cinematic/toyota-hilux.glb", rotationY: 0, length: 5.26, paint: { material: "vpc_v1_006_carpaint_1", color: "#d9622b" } },
    credit: { title: "Toyota Hilux 2007", author: "David_Holiday", url: "https://sketchfab.com/3d-models/toyota-hilux-2007-0234ebed01ee4b87affed0e58673247e", license: "CC BY 4.0" },
    poster: "/models/cinematic/posters/hilux.png",
  },
  {
    id: "corolla-cross", personaId: "priya", name: "Corolla Cross", year: 2024,
    descriptor: "Compact SUV · Lease", headline: "Over the miles, with 3 months to go.",
    summary: "Your Corolla Cross lease ends in 3 months and you’re on pace for about 49,500 miles against 36,000 allowed, so returning it would cost about $3,770. Buying it out is $16,670 for a car worth about $18,600, which comes out about $1,930 ahead.",
    model: { url: "/models/cinematic/toyota-corolla-cross.glb", rotationY: 0, length: 4.46, paint: { material: "2020_Toyota_Corolla_Cross_Platinum_White_Pearl_Mica", color: "#2f9aa0" } },
    credit: { title: "Toyota Corolla Cross", author: "Nieve5677", url: "https://sketchfab.com/3d-models/toyota-corolla-cross-cc503d26ea694dce85e7d0f1491b0e30", license: "CC BY 4.0" },
    poster: "/models/cinematic/posters/corolla-cross.png",
  },
  {
    id: "gr-yaris", personaId: "theo", name: "GR Yaris", year: 2020,
    descriptor: "Hot hatch · Loan", headline: "Enjoy the drive. Understand the details.",
    summary: "Your GR Yaris is a daily driver with a weekend personality. The loan is on autopay with 47 payments left. Quick launches and evening drives hold your driving score at 78; smoother starts could lower an insurance quote, and it’s worth setting money aside for tires.",
    model: { url: "/models/cinematic/toyota-yaris.glb", rotationY: 180, length: 3.995 },
    credit: { title: "2020 Toyota GR Yaris", author: "DisneyCars", url: "https://sketchfab.com/3d-models/2020-toyota-gr-yaris-44cb958908b94aa5aad0d856994f35a3", license: "CC BY 4.0" },
    poster: "/models/cinematic/posters/gr-yaris.png",
  },
];

export function getVehicle(id: string | undefined): CinematicVehicle | undefined {
  return VEHICLES.find((vehicle) => vehicle.id === id);
}
