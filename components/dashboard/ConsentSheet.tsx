"use client";

import { Banknote, CarFront, Receipt, Share2 } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { Drawer } from "@/components/ui/Overlay";
import { useDataStore } from "@/lib/client/data-store";
import { useOverlayStore } from "@/lib/client/overlay-store";
import type { ConsentSource, DashboardData } from "@/lib/types";

const SOURCES: { id: ConsentSource; icon: typeof CarFront; title: string; uses: string; off: string }[] = [
  {
    id: "driving",
    icon: CarFront,
    title: "Driving and location",
    uses: "Trips, mileage trend and your driving score. Destinations are kept coarse; no home address.",
    off: "Lease projections fall back to your contract allowance; trip replays and the score are hidden.",
  },
  {
    id: "banking",
    icon: Banknote,
    title: "Banking and cash flow",
    uses: "Payday timing and average balance, to suggest a due date that never races your paycheck.",
    off: "No due-date suggestions.",
  },
  {
    id: "paymentHistory",
    icon: Receipt,
    title: "Payment history",
    uses: "Your on-time record, which helps refinance eligibility.",
    off: "Refinance estimates get less certain.",
  },
  {
    id: "shareWithInsurers",
    icon: Share2,
    title: "Share driving with insurers",
    uses: "Lets us request usage-based quotes with your score. Separate from collecting it.",
    off: "No usage-based quotes. Your score stays with you.",
  },
];

export function ConsentSheet({ data }: { data?: DashboardData }) {
  const open = useOverlayStore((s) => s.consentOpen);
  const setOpen = useOverlayStore((s) => s.setConsentOpen);
  const setConsent = useDataStore((s) => s.setConsent);
  const [pending, setPending] = useState<ConsentSource | null>(null);
  if (!data) return null;
  const consent = data.persona.consent;

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      labelledBy="consent-title"
      width={520}
      title="Your data"
      subtitle="Choose what Toyyo can use. Changes apply right away, and affected cards will say “Limited”."
    >
      <ul className="space-y-3">
        {SOURCES.map((s) => {
          const on = consent[s.id];
          const Icon = s.icon;
          return (
            <li key={s.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--glass-hi)] text-ink-2">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <label htmlFor={`consent-${s.id}`} className="block cursor-pointer text-[15px] font-semibold text-ink">
                    {s.title}
                  </label>
                  <p className="mt-1 text-[13px] leading-snug text-ink-2">{s.uses}</p>
                  {!on && <p className="mt-2 text-[13px] leading-snug text-warn">Off: {s.off}</p>}
                </div>
                <Switch
                  id={`consent-${s.id}`}
                  label={s.title}
                  checked={on}
                  onChange={async (v) => {
                    setPending(s.id);
                    try {
                      await setConsent(data.persona.id, s.id, v);
                    } finally {
                      setPending(null);
                    }
                  }}
                />
              </div>
              {pending === s.id && <p className="mt-2 text-xs text-ink-3" role="status">Updating your dashboard…</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-xs leading-relaxed text-ink-3">
        Insurance scoring never uses your ZIP code or demographics. All data here is synthetic for this concept prototype.
      </p>
    </Drawer>
  );
}
