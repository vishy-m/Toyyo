import type { Metadata } from "next";
import { FinancesView } from "@/components/pages/Views";

export const metadata: Metadata = { title: "Contract and payments | Next Move Copilot" };

export default function Page() {
  return <FinancesView />;
}
