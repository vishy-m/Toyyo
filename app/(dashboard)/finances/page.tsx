import type { Metadata } from "next";
import { FinancesView } from "@/components/pages/Views";

export const metadata: Metadata = { title: "Contract and payments | Toyyo" };

export default function Page() {
  return <FinancesView />;
}
