import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-panel text-fg-subtle shadow-card [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {icon}
      </div>
      <h3 className="mt-4 text-[14px] font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-5 text-fg-subtle">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
