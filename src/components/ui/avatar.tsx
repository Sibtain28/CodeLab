import { cn } from "@/lib/cn";
import type { PeerColor } from "@/lib/mock/people";

const tint: Record<PeerColor, string> = {
  accent: "bg-[#e2efe7] text-[#1d5c3d]",
  violet: "bg-[#ebe7f9] text-[#4f3aa6]",
  sky: "bg-[#e0eef7] text-[#155f8c]",
  amber: "bg-[#f6ebd8] text-[#7f4c00]",
  rose: "bg-[#f8e3e9] text-[#9b2f50]",
};

const sizes = {
  xs: "h-5 w-5 text-[8.5px]",
  sm: "h-6 w-6 text-[9.5px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-10 w-10 text-[13px]",
  xl: "h-14 w-14 text-[17px]",
};

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  color,
  size = "md",
  className,
  status,
}: {
  name: string;
  color: PeerColor;
  size?: keyof typeof sizes;
  className?: string;
  status?: "online" | "away" | "offline";
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold tracking-tight ring-1 ring-inset ring-black/5",
          tint[color],
          sizes[size],
        )}
      >
        {initials(name)}
      </span>
      <span className="sr-only">{name}</span>
      {status && (
        <span
          className={cn(
            "absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-panel",
            status === "online" && "bg-success",
            status === "away" && "bg-[#d9a441]",
            status === "offline" && "bg-fg-faint",
          )}
        />
      )}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  className,
}: {
  people: { name: string; color: PeerColor }[];
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className={cn("flex items-center -space-x-1", className)}>
      {shown.map((p) => (
        <span key={p.name} className="rounded-full ring-2 ring-panel">
          <Avatar name={p.name} color={p.color} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-raised font-medium text-fg-subtle ring-2 ring-panel",
            sizes[size],
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
