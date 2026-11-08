import Image from "next/image";
import clsx from "clsx";

export function ToyyoMascot({ size = 72, className, decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return <Image src="/branding/toyyo-mascot.webp" width={size} height={size} sizes={`${size}px`} alt={decorative ? "" : "Toyyo, your automotive assistant"} className={clsx("shrink-0 object-contain", className)} />;
}

export function ToyyoAssistantAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return <ToyyoMascot size={size} decorative className={className} />;
}
