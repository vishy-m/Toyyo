import type { Viewport } from "next";
import { Suspense } from "react";
import { CinematicExperience } from "@/components/cinematic/CinematicExperience";

export const viewport: Viewport = { themeColor: "#090909", colorScheme: "dark" };

/**
 * The cinematic shell owns the persistent 3D stage, the carousel and the ownership view for every
 * route in this group ("/" and "/cars/<vehicle>/<section>"). Moving between them is done with
 * window.history.pushState/replaceState, so this layout (and the selected WebGL car) never remounts.
 * The pages only validate their params and provide metadata.
 */
export default function ExperienceLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* usePathname() can suspend while prerendering a route whose params are unknown. */}
      <Suspense fallback={<div className="cine-boot" aria-hidden="true" />}>
        <CinematicExperience />
      </Suspense>
      {children}
    </>
  );
}
