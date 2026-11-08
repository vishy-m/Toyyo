import type { Metadata } from "next";
import { DrivingView } from "@/components/pages/Views";

export const metadata: Metadata = { title: "Driving | Toyyo" };

export default function Page() {
  return <DrivingView />;
}
