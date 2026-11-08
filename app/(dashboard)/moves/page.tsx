import type { Metadata } from "next";
import { MovesView } from "@/components/pages/Views";

export const metadata: Metadata = { title: "Moves | Toyyo" };

export default function Page() {
  return <MovesView />;
}
