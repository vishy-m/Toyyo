"use client";

import clsx from "clsx";
import { MessageSquareText } from "lucide-react";
import { useDataStore } from "@/lib/client/data-store";
import { useUiStore } from "@/lib/client/ui-store";

const prompts: Record<string, string> = {
  "next-move": "Walk me through this move.",
  contract: "Explain where my contract stands.",
  money: "How do my payments fit my cash flow?",
  driving: "How is my driving affecting my costs?",
  "lease-end": "Draft my lease-end options.",
  insurance: "Can my driving lower my insurance?",
  payment: "Can I lower my payment?",
  protection: "Do I need extra protection?",
};

/** Small contextual "Ask" hook: opens Toyyo scoped to this widget with a ready prompt. */
export function AskButton({ widget, optionId, tripId, label, className }: { widget: string; optionId?: string; tripId?: string; label?: string; className?: string }) {
  const askAgent = useUiStore((s) => s.askAgent);
  const setDraft = useDataStore((s) => s.setDraftInput);
  return (
    <button
      type="button"
      onClick={() => {
        askAgent({ widget, optionId, tripId });
        setDraft(prompts[widget] ?? "Tell me more about this.");
      }}
      aria-label={label ?? `Ask Toyyo about ${widget}`}
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-[var(--glass-hi)] hover:text-ink",
        className,
      )}
    >
      <MessageSquareText size={14} />
      Ask
    </button>
  );
}
