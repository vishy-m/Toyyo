import type { Metadata, Viewport } from "next";
import { Overpass } from "next/font/google";
import { MotionRoot } from "@/components/motion/MotionRoot";
import "./globals.css";

// One family: Overpass, drawn from Highway Gothic, the US road-sign face. Figures read like mile markers.
const overpass = Overpass({ variable: "--font-ui", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Next Move Copilot",
  description: "Your Toyota lease or loan, insurance and driving in one place, with the next decision worth making. Concept prototype with synthetic data.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#16181a" },
    { media: "(prefers-color-scheme: light)", color: "#d9dad2" },
  ],
};

// Applies a saved theme before first paint (no flash). See Next docs: preventing-flash-before-hydration.
const themeScript = `(function(){try{var t=localStorage.getItem("nm-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${overpass.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
