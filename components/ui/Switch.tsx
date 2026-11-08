"use client";

import clsx from "clsx";

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-[background-color,border-color,scale] [transition-duration:200ms,200ms,400ms] [transition-timing-function:var(--ease-ui-color),var(--ease-ui-color),var(--ease-press)] active:scale-[0.97] motion-reduce:active:scale-100",
        checked ? "border-transparent bg-ink" : "border-line-2 bg-transparent",
      )}
    >
      <span
        className={clsx(
          "inline-block size-5 rounded-full shadow transition-[translate,background-color] [transition-duration:500ms,200ms] [transition-timing-function:var(--ease-thumb),var(--ease-ui-color)]",
          checked ? "translate-x-6 bg-bg" : "translate-x-1 bg-ink-3",
        )}
      />
    </button>
  );
}
