/** Placeholder shown while the Monaco bundle and its language services load. */
const widths = [62, 0, 48, 34, 41, 30, 52, 0, 26, 71, 44, 58, 0, 39, 66, 28];

export function EditorSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex h-full w-full overflow-hidden bg-panel pt-3"
    >
      <span className="sr-only">Loading editor…</span>
      <div aria-hidden="true" className="w-[52px] shrink-0 pr-4 text-right font-mono text-[13px] leading-[22px] text-fg-faint/60">
        {widths.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div aria-hidden="true" className="flex-1 pl-3">
        {widths.map((w, i) => (
          <div key={i} className="flex h-[22px] items-center">
            {w > 0 && (
              <span
                className="h-[9px] animate-pulse rounded-full bg-raised"
                style={{ width: `${w}%`, animationDelay: `${(i % 5) * 120}ms` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-panel px-3 py-1.5 text-[12px] text-fg-subtle shadow-card">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Loading editor…
      </div>
    </div>
  );
}
