import { cn } from "@/lib/utils";

import { Avatar } from "./avatar";

/** Overlapping avatars, capped with a "+n" counter. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  className,
}: {
  people: { id: string; name: string; photoUrl?: string | null; pending?: boolean }[];
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const shown = people.slice(0, max);
  const overlap = size === "xs" ? "-ml-1" : size === "sm" ? "-ml-2" : "-ml-2.5";
  const extra = people.length - shown.length;
  return (
    <div
      className={cn("flex items-center", className)}
      aria-label={people.map((person) => person.name).join(", ")}
    >
      {shown.map((person, index) => (
        <span
          key={person.id}
          className={cn(
            "rounded-full ring-2 ring-card",
            index > 0 && overlap,
            person.pending && "opacity-55",
          )}
        >
          <Avatar name={person.name} src={person.photoUrl} size={size} />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-3 font-semibold ring-2 ring-card",
            overlap,
            size === "xs"
              ? "size-6 text-[10px]"
              : size === "sm"
                ? "size-8 text-caption"
                : "size-10 text-small",
          )}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
