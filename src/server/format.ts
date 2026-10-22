import "server-only";

/** "just now", "4 min ago", "3 h ago", "2 d ago", then a short date. */
export function formatRelative(date: Date, now = new Date()) {
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: now.getFullYear() === date.getFullYear() ? undefined : "numeric" });
}
