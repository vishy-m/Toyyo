"use client";

/**
 * Runs inline on the server-rendered HTML (before first paint) and is inert when React renders it on the
 * client, which avoids React's "script tag while rendering" warning. Pattern from the Next.js guide
 * "Preventing flash before hydration".
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
