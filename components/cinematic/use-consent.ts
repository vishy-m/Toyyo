"use client";

import { useState } from "react";
import { postAction } from "@/lib/client/api";
import type { ConsentSource, PersonaId } from "@/lib/types";

/** Saves one consent switch, then asks the dashboard to reload. */
export function useConsentToggle(personaId: PersonaId, onReload: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setConsent(source: ConsentSource, value: boolean) {
    setBusy(true);
    setError("");
    try {
      await postAction({ kind: "set_consent", personaId, source, value });
      onReload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That preference could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setConsent };
}
