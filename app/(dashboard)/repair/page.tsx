import type { Metadata } from "next";
import { RepairView } from "@/components/pages/Views";

export const metadata: Metadata = { title: "Repair or replace | Next Move Copilot" };

export default function Page() {
  return <RepairView />;
}
