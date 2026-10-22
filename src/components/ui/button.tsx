import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "danger-outline";
type Size = "xs" | "sm" | "md" | "lg";

/*
 * Note: cn() joins classes without conflict resolution. Pass layout classes
 * (margin, width, flex) via className; change look via `variant` and `size`.
 */
const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-[background-color,color,box-shadow,transform] duration-200 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(29_92_61/0.3),0_0_0_1px_rgb(29_92_61/0.9)] hover:bg-accent-strong hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_6px_16px_-6px_rgb(29_92_61/0.55),0_0_0_1px_rgb(29_92_61)]",
  secondary: "bg-panel text-fg shadow-card hover:shadow-lift",
  outline: "text-fg ring-1 ring-inset ring-line-strong hover:bg-raised",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg",
  "danger-outline": "bg-panel text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/5",
  danger: "bg-danger text-white hover:bg-[#a8332e]",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[12px]",
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13.5px]",
  lg: "h-11 px-5 text-[14.5px]",
};

interface StyleProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export function buttonClasses({ variant = "secondary", size = "md", className }: StyleProps = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}

/** Square icon-only button with an accessible label and a delayed tooltip. */
export function IconButton({
  label,
  children,
  active = false,
  size = "md",
  className,
  tooltipSide = "bottom",
  type = "button",
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: string;
  children: ReactNode;
  active?: boolean;
  size?: "sm" | "md";
  tooltipSide?: "bottom" | "top";
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        "group/icon relative inline-flex shrink-0 items-center justify-center rounded-[7px] transition-colors duration-150 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40",
        active ? "bg-hover text-fg" : "text-fg-subtle",
        className,
      )}
      {...props}
    >
      {children}
      <span
        role="presentation"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-pop transition-opacity duration-150 group-hover/icon:opacity-100 group-hover/icon:delay-500",
          tooltipSide === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
        )}
      >
        {label}
      </span>
    </button>
  );
}
