import clsx from "clsx";
import { ToyyoMascot } from "./ToyyoMascot";

export function ToyyoLoadingState({ label = "Toyyo is getting things ready…", compact = false, className }: { label?: string; compact?: boolean; className?: string }) {
  return (
    <div role="status" className={clsx("flex items-center justify-center gap-3 text-sm text-ink-2", !compact && "flex-col py-8 text-center", className)}>
      <ToyyoMascot size={compact ? 40 : 72} decorative className="toyyo-loading-mascot" />
      <span>{label}</span>
    </div>
  );
}
