"use client";

// The plain pages. The car lives on the landing page; here the content is the point: a title on
// the ground and one statement sheet with a row per section.

import { ContractCard } from "@/components/dashboard/ContractCard";
import { DrivingLife } from "@/components/dashboard/DrivingLife";
import { MoneyCard } from "@/components/dashboard/MoneyCard";
import { RepairAdvisor } from "@/components/repair/RepairAdvisor";
import { Panel } from "@/components/ui/Panel";
import { PageFrame, PageHeader, Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDashboard } from "@/lib/client/use-dashboard";
import { MoveList } from "./MoveList";

export function MovesView() {
  const { data } = useDashboard();
  return (
    <PageFrame>
      <PageHeader title="Your moves" lead="Four decisions about your car, ranked for you. Open one to compare every option side by side." />
      {data ? (
        <Sheet>
          <Panel title="Ranked for you">
            <MoveList data={data} />
          </Panel>
        </Sheet>
      ) : (
        <Skeleton className="h-[420px] rounded-xl" />
      )}
    </PageFrame>
  );
}

export function FinancesView() {
  const { data } = useDashboard();
  return (
    <PageFrame>
      <PageHeader title="Contract and payments" lead="Your agreement, your payment record, your cash flow and your insurance premium." />
      <Sheet>
        <ContractCard data={data} />
        <MoneyCard data={data} />
      </Sheet>
    </PageFrame>
  );
}

export function DrivingView() {
  const { data } = useDashboard();
  return (
    <PageFrame>
      <PageHeader title="Driving" lead="Every trip from the last 90 days, what moves your score, and how many miles you drive each month." />
      <Sheet>
        <DrivingLife data={data} />
      </Sheet>
    </PageFrame>
  );
}

export function RepairView() {
  const { data } = useDashboard();
  return (
    <PageFrame>
      <div className="max-w-[860px] pt-10 sm:pt-14">
        <RepairAdvisor key={data?.persona.id ?? "loading"} data={data} />
      </div>
    </PageFrame>
  );
}
