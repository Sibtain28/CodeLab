type ClassValue = string | number | false | null | undefined;

/** Joins truthy class names. Tiny replacement for clsx. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
