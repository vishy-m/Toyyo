"use client";

import clsx from "clsx";
import { Check, ChevronDown, Moon, PanelRightClose, PanelRightOpen, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { blur, scale, spring, transition, useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { useTheme } from "@/lib/client/hooks";
import { useOverlayStore } from "@/lib/client/overlay-store";
import { useUiStore } from "@/lib/client/ui-store";
import { mockPersonas, personaOrder } from "@/lib/mock/personas";
import type { DashboardData, Persona, PersonaId } from "@/lib/types";
import { ToyyoLogo } from "@/components/branding/ToyyoLogo";

/** Swap recipe: the old glyph shrinks into blur.icon as the new one grows out of it, in place. */
function IconSwap({ id, children }: { id: string; children: React.ReactNode }) {
  const reduce = useShouldReduceMotion();
  const from = reduce ? 1 : scale.icon;
  const hidden = { opacity: 0, scale: from, filter: blur.icon, transition: transition.swap };
  return (
    <span className="relative inline-grid size-[18px] place-items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={id}
          className="col-start-1 row-start-1 grid place-items-center"
          initial={hidden}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: transition.swap }}
          exit={hidden}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Two-letter initials in place of an emoji avatar. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function situation(p: Persona) {
  const role = p.displayName.split("·")[1]?.trim() ?? p.city;
  const c = p.contract;
  const contract = c.kind === "lease" ? `lease ends in ${c.monthsRemaining} mo` : `loan at ${c.apr}% APR`;
  return `${role}, ${contract}`;
}

function PersonaSwitcher({ current }: { current: PersonaId }) {
  const setPersona = useUiStore((s) => s.setPersona);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const p = mockPersonas[current];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    setTimeout(() => list.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, current]);

  const choose = (id: PersonaId) => {
    setOpen(false);
    btn.current?.focus();
    if (id !== current) setPersona(id);
  };

  return (
    <div className="relative min-w-[96px] flex-1 sm:flex-none">
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Customer: ${p.name}. Switch customer`}
        onClick={() => {
          setActive(personaOrder.indexOf(current));
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(personaOrder.indexOf(current));
            setOpen(true);
          }
        }}
        className="flex h-11 max-w-full min-w-0 items-center gap-2.5 rounded-lg border border-line py-1 pr-2.5 pl-1.5 text-left transition-colors hover:border-line-2 hover:bg-[var(--glass-hi)] sm:pr-3"
      >
        <span className="hidden size-8 shrink-0 place-items-center rounded-md bg-ink text-[12px] font-semibold text-bg min-[420px]:grid" aria-hidden>
          {initials(p.name)}
        </span>
        <span className="min-w-0 pl-1.5 min-[420px]:pl-0">
          <span className="block truncate text-sm leading-tight font-semibold text-ink">{p.name}</span>
          <span className="hidden truncate text-xs leading-tight text-ink-3 sm:block">{situation(p)}</span>
        </span>
        <ChevronDown size={16} className={clsx("shrink-0 text-ink-3 transition-[rotate] duration-[220ms] ease-ui-soft", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={list}
            role="listbox"
            tabIndex={-1}
            aria-label="Choose a customer"
            aria-activedescendant={`persona-opt-${personaOrder[active]}`}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % personaOrder.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a + personaOrder.length - 1) % personaOrder.length);
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(personaOrder[active]);
              } else if (e.key === "Escape" || e.key === "Tab") {
                setOpen(false);
                btn.current?.focus();
              }
            }}
            initial={{ opacity: 0, scale: scale.menu }}
            animate={{ opacity: 1, scale: 1, transition: transition.menu }}
            exit={{ opacity: 0, scale: scale.menu, transition: transition.menu }}
            style={{ originX: 0, originY: 0 }}
            className="glass-strong absolute top-[calc(100%+6px)] left-0 z-40 w-[min(340px,calc(100vw-32px))] rounded-lg p-1 outline-none"
          >
            {personaOrder.map((id, i) => {
              const q = mockPersonas[id];
              const selected = id === current;
              return (
                <div
                  key={id}
                  id={`persona-opt-${id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(id)}
                  className="relative flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2"
                >
                  {i === active && (
                    <motion.span layoutId="persona-highlight" className="absolute inset-0 rounded-md bg-[var(--glass-hi)]" transition={spring.highlight} aria-hidden />
                  )}
                  <span className="relative grid size-8 shrink-0 place-items-center rounded-md bg-ink text-[12px] font-semibold text-bg" aria-hidden>
                    {initials(q.name)}
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{q.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {q.vehicle.year} {q.vehicle.model}, {situation(q)}
                    </span>
                  </span>
                  {selected && <Check size={16} className="relative text-ink-2" />}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopBar({ data }: { data?: DashboardData }) {
  const pathname = usePathname();
  const personaId = useUiStore((s) => s.personaId);
  const panelOpen = useUiStore((s) => s.agentPanelOpen);
  const setPanel = useUiStore((s) => s.setAgentPanelOpen);
  const openConsent = useOverlayStore((s) => s.setConsentOpen);
  const [theme, setTheme] = useTheme();
  const consentOff = data ? Object.values(data.persona.consent).filter((v) => !v).length : 0;
  const navItems = [
    { href: "/", label: "Overview" },
    { href: "/moves", label: "Moves" },
    { href: "/repair", label: "Repair or replace" },
    { href: "/finances", label: "Finances" },
    { href: "/driving", label: "Driving" },
  ];

  const primaryNav = (mobile = false) => (
    <nav aria-label="Dashboard" className={clsx(mobile ? "flex w-full overflow-x-auto px-1 sm:px-3" : "hidden h-16 items-stretch xl:flex")}>
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative inline-flex h-11 shrink-0 items-center px-3 text-sm font-medium transition-colors duration-200 ease-ui-color xl:h-16",
              active ? "text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {item.label}
            {active && (
              <motion.span layoutId={mobile ? "nav-underline-m" : "nav-underline"} className="absolute inset-x-3 bottom-0 h-0.5 bg-ink" transition={spring.selection} aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] backdrop-blur-xl backdrop-saturate-150">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
        Skip to dashboard
      </a>
      <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center rounded-lg text-ink" aria-label="Toyyo home">
          <ToyyoLogo className="toyyo-logo-nav" decorative preload />
        </Link>
        <span className="hidden h-6 w-px bg-line-2 md:block" aria-hidden />
        <PersonaSwitcher current={personaId} />
        {primaryNav()}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <button
            type="button"
            onClick={() => openConsent(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-[var(--glass-hi)] hover:text-ink sm:px-3"
          >
            <ShieldCheck size={17} />
            <span className="hidden sm:inline">Your data</span>
            {consentOff > 0 && (
              <span className="num rounded-md bg-warn-soft px-1.5 text-[11px] font-semibold text-warn" aria-label={`${consentOff} sources off`}>
                {consentOff} off
              </span>
            )}
          </button>
          <Link
            href="/tfs"
            className="inline-flex h-10 items-center rounded-lg px-2 text-sm font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-[var(--glass-hi)] hover:text-ink sm:px-3"
            aria-label="TFS view"
          >
            TFS<span className="hidden sm:inline">&nbsp;view</span>
          </Link>
          <IconButton label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <IconSwap id={theme === "dark" ? "sun" : "moon"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconSwap>
          </IconButton>
          <span className="hidden lg:contents">
            <IconButton label={panelOpen ? "Hide Toyyo assistant" : "Show Toyyo assistant"} onClick={() => setPanel(!panelOpen)}>
              <IconSwap id={panelOpen ? "close" : "open"}>{panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</IconSwap>
            </IconButton>
          </span>
        </div>
      </div>
      <div className="border-t border-line xl:hidden">{primaryNav(true)}</div>
    </header>
  );
}
