"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useUiStore } from "./ui-store";

/** Keeps useUiStore.reducedMotion in sync with the OS setting. */
export function useReducedMotionSync() {
  const set = useUiStore((s) => s.setReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => set(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [set]);
}

export type Theme = "dark" | "light";

function readTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
const themeListeners = new Set<() => void>();

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      mq.addEventListener("change", cb);
      return () => {
        themeListeners.delete(cb);
        mq.removeEventListener("change", cb);
      };
    },
    readTheme,
    () => "dark" as Theme,
  );
  const setTheme = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("nm-theme", t);
    } catch {
      /* private mode */
    }
    themeListeners.forEach((l) => l());
  };
  return [theme, setTheme];
}

/** True when the viewport is at least `px` wide. SSR-safe (assumes desktop). */
export function useMinWidth(px: number) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(`(min-width: ${px}px)`);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => true,
  );
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const noop = () => () => {};
/** false during SSR + hydration, true after. For portals and client-only bits. */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
