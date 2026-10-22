import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * CodeLab mark: two text cursors side by side on a charcoal tile — yours
 * (white) and a teammate's (green, with a name flag). "Code, together."
 */
export function LogoMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="24" height="24" rx="6" fill="#20211F" />
      <rect x="7.25" y="6" width="2.5" height="12" rx="1.25" fill="#FFFFFF" />
      <rect x="14.25" y="8" width="2.5" height="10" rx="1.25" fill="#6FC497" />
      <rect x="14.25" y="5" width="5.5" height="3.5" rx="1.25" fill="#6FC497" />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2 rounded-md text-fg", className)}
      aria-label="CodeLab home"
    >
      <LogoMark className="transition-transform duration-300 ease-out group-hover:-rotate-3" />
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.025em]">CodeLab</span>}
    </Link>
  );
}
