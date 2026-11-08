import type { Metadata } from "next";
import { DrivingView } from "@/components/pages/Views";

export const metadata: Metadata = { title: "Driving | Next Move Copilot" };

export default function Page() {
  return <DrivingView />;
}
