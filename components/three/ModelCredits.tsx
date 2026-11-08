"use client";
// "3D model credits" footer, generated from public/models/manifest.json (only models in use).
import { activeCredits } from "./models";

export default function ModelCredits({ className }: { className?: string }) {
  const credits = activeCredits();
  return (
    <footer className={`text-xs leading-relaxed text-ink-3 ${className ?? ""}`} aria-label="3D model credits">
      <span className="mr-1 font-medium text-ink-2">3D model credits:</span>
      {credits.map((c, i) => (
        <span key={c.title}>
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-2 hover:text-ink">
              {c.title}
            </a>
          ) : c.title}{" "}
          by {c.author} ({c.license}){i < credits.length - 1 ? "; " : ""}
        </span>
      ))}
      <span className="ml-1">Map data © Mapbox © OpenStreetMap.</span>
    </footer>
  );
}
