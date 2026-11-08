"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { blur, spring, transition, useShouldReduceMotion, useTempoTransition } from "@animate-ui/react/utils/motion";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMinWidth, useMounted } from "@/lib/client/hooks";

/**
 * The page behind a modal surface dims from nothing on transition.overlay, both ways. It animates
 * its background color, not its opacity, so the color and anything layered on it come in together.
 */
function Scrim({ color, onClick }: { color: string; onClick: () => void }) {
  const overlay = useTempoTransition(transition.overlay) as Transition;
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ backgroundColor: "rgba(0, 0, 0, 0)" }}
      animate={{ backgroundColor: color, transition: overlay }}
      exit={{ backgroundColor: "rgba(0, 0, 0, 0)", transition: overlay }}
      onClick={onClick}
    />
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

function useDialogBehavior(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      el?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose, ref]);
}

function Portal({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/** Side drawer on desktop, bottom sheet under 1024px. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 720,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const desktop = useMinWidth(1024);
  const reduce = useShouldReduceMotion();
  useDialogBehavior(open, onClose, ref);
  // Sheet recipe: slides from its edge by its own size while it fades, in on transition.sheet (no
  // bounce, it's held against the edge), dismissed on transition.dismiss (at once, speeding away).
  // Desktop floats 12px off the right edge, so it travels its width plus that gap.
  const enter = useTempoTransition(transition.sheet) as Transition;
  const leave = useTempoTransition(transition.dismiss) as Transition;
  const shown = desktop ? "translateX(0%)" : "translateY(0%)";
  const offscreen = desktop ? "translateX(calc(100% + 12px))" : "translateY(100%)";
  const hidden = { opacity: 0, transform: reduce ? shown : offscreen };
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50">
            <Scrim color="rgba(0, 0, 0, 0.4)" onClick={onClose} />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              className={clsx(
                "glass-strong absolute flex flex-col",
                desktop ? "top-3 right-3 bottom-3 rounded-xl" : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl",
              )}
              style={desktop ? { width: `min(${width}px, calc(100vw - 24px))` } : undefined}
              initial={hidden}
              animate={{ opacity: 1, transform: shown, transition: enter }}
              exit={{ ...hidden, transition: leave }}
            >
              {!desktop && <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-2" aria-hidden />}
              <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-7 sm:pt-6">
                <div className="min-w-0">
                  <h2 id={labelledBy} className="font-display text-xl text-ink sm:text-[22px]">
                    {title}
                  </h2>
                  {subtitle && <div className="mt-1 text-sm text-ink-2">{subtitle}</div>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-[var(--glass-hi)] hover:text-ink"
                >
                  <X size={18} />
                </button>
              </header>
              <div data-scroll className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-7">{children}</div>
              {footer && <div className="border-t border-line px-5 py-4 sm:px-7">{footer}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** Centered dialog for confirmations. */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useShouldReduceMotion();
  useDialogBehavior(open, onClose, ref);
  // Modal recipe, flat: it fades in at once (transition.dialogFade) out of blur.surface while it
  // settles from a slight scale on spring.dialog (calm, no overshoot); dismissed on
  // transition.dismiss. The recipe's forward tilt is left out to match the product's flat UI.
  const settle = useTempoTransition(transition.dialogFade) as Transition;
  const tip = useTempoTransition(spring.dialog) as Transition;
  const leave = useTempoTransition(transition.dismiss) as Transition;
  const rest = "translateY(0px) scale(1)";
  const hidden = { opacity: 0, filter: blur.surface, transform: reduce ? rest : "translateY(8px) scale(0.96)" };
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] grid place-items-end p-3 sm:place-items-center sm:p-6">
            <Scrim color="rgba(0, 0, 0, 0.5)" onClick={onClose} />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              className={clsx("glass-strong relative w-full max-w-[480px] rounded-xl p-6 sm:p-7", className)}
              initial={hidden}
              animate={{
                opacity: 1,
                filter: "blur(0px)",
                transform: rest,
                transition: { ...tip, opacity: settle, filter: settle },
                // No filter at rest: a filter would make this the containing block of fixed children.
                transitionEnd: { filter: "none" },
              }}
              exit={{ ...hidden, transition: leave }}
            >
              {children}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
