import { initialsOf } from "@ficc/shared";
import Image from "next/image";

import { cn } from "@/lib/utils";

const SIZES = { xs: 24, sm: 32, md: 40, lg: 56, xl: 88 } as const;

/** Stable hue per name so initials avatars are recognisable. */
function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function Avatar({
  name,
  src,
  size = "md",
  ring,
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  /** Color of a 2px ring (e.g. a coach color or the surface of a court). */
  ring?: string;
  className?: string;
}) {
  const pixels = SIZES[size];
  const hue = hueOf(name);
  return (
    <span
      title={name}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        className,
      )}
      style={{
        width: pixels,
        height: pixels,
        fontSize: Math.max(10, Math.round(pixels * 0.38)),
        background: `oklch(0.42 0.06 ${hue})`,
        color: `oklch(0.95 0.03 ${hue})`,
        boxShadow: ring ? `0 0 0 2px var(--background), 0 0 0 4px ${ring}` : undefined,
      }}
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${pixels}px`} className="object-cover" unoptimized />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}
