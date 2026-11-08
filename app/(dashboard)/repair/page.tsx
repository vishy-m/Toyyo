import type { Metadata } from "next";
import { RepairView } from "@/components/pages/Views";

export const metadata: Metadata = { title: "Repair or replace | Toyyo" };

export default function Page() {
  return <RepairView />;
}
