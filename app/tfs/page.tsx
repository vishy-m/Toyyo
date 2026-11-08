import type { Metadata } from "next";
import { TfsView } from "./TfsView";

export const metadata: Metadata = {
  title: "TFS Insight | Next Move Copilot",
  description: "What each customer's next move is worth to TFS, and the handoff packets waiting for specialists.",
};

export default function TfsPage() {
  return <TfsView />;
}
