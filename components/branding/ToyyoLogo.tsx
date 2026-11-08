import Image from "next/image";
import clsx from "clsx";

export function ToyyoLogo({ variant = "horizontal", className, decorative = false, preload = false }: {
  variant?: "horizontal" | "badge";
  className?: string;
  decorative?: boolean;
  preload?: boolean;
}) {
  const horizontal = variant === "horizontal";
  return (
    <span className={clsx("toyyo-logo", horizontal && "toyyo-logo-horizontal", className)}>
      <Image src={horizontal ? "/branding/toyyo-logo-horizontal.webp" : "/branding/toyyo-badge.webp"} alt={decorative ? "" : "Toyyo"} fill sizes={horizontal ? "(max-width: 640px) 100px, 160px" : "64px"} className="object-contain" preload={preload} />
    </span>
  );
}
