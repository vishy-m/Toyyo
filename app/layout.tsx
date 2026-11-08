import type { Metadata, Viewport } from "next";
import { Archivo, Overpass } from "next/font/google";
import { MotionRoot } from "@/components/motion/MotionRoot";
import { InlineScript } from "./inline-script";
import "./globals.css";

// Body and figures: Overpass, drawn from Highway Gothic, the US road-sign face. Figures read like mile markers.
const overpass = Overpass({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
// Display: Archivo's variable width axis, set condensed (font-stretch 62–75%) and heavy by the cinematic CSS.
const archivo = Archivo({ variable: "--font-display", subsets: ["latin"], axes: ["wdth"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Toyyo", template: "%s · Toyyo" },
  description: "Toyota ownership stories: a lease or loan, repairs, driving and the next decision worth making. Concept prototype with fictional drivers and synthetic data.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#16181a" },
    { media: "(prefers-color-scheme: light)", color: "#d9dad2" },
  ],
};

// Applies a saved theme before first paint (no flash) for the internal tools (/tfs, /lab).
// The cinematic experience is always dark and ignores it. See Next docs: preventing-flash-before-hydration.
const themeScript = `(function(){try{var t=localStorage.getItem("nm-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${overpass.variable} ${archivo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-full">
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
