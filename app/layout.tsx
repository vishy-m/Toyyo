import type { Metadata, Viewport } from "next";
import { Overpass } from "next/font/google";
import { MotionRoot } from "@/components/motion/MotionRoot";
import "./globals.css";

// One family: Overpass, drawn from Highway Gothic, the US road-sign face. Figures read like mile markers.
const overpass = Overpass({ variable: "--font-ui", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:3001")),
  title: "Toyyo | Your next move, made clear",
  applicationName: "Toyyo",
  description: "Toyyo brings your Toyota lease or loan, insurance and driving together to explain your next move. Independent hackathon prototype using synthetic data.",
  openGraph: {
    title: "Toyyo | Your next move, made clear",
    description: "A personal automotive assistant that makes ownership decisions easier to understand. Independent prototype with synthetic data.",
    siteName: "Toyyo",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Toyyo | Your next move, made clear", description: "Your car, your options, one clear next step. Independent synthetic prototype." },
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
