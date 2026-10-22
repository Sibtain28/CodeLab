/** Loading state for the dashboard while the session and projects load. */
export function DashboardSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas" aria-busy="true" aria-label="Loading your projects">
      <aside className="hidden w-[236px] shrink-0 space-y-3 px-4 py-4 lg:block">
        <div className="h-6 w-28 rounded bg-raised" />
        <div className="mt-6 h-8 rounded-[7px] bg-panel shadow-card" />
        <div className="mt-5 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-6 rounded-[7px] bg-raised/70" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel lg:rounded-[12px] lg:shadow-card">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
            <div className="h-8 w-full max-w-[18rem] rounded-[7px] bg-raised" />
            <div className="ml-auto h-8 w-28 rounded-[7px] bg-raised" />
          </div>
          <div className="mx-auto w-full max-w-[1040px] px-4 py-7 sm:px-8 sm:py-10">
            <div className="h-7 w-32 rounded bg-raised" />
            <div className="mt-2 h-4 w-64 rounded bg-raised/70" />
            <div className="mt-12 overflow-hidden rounded-xl ring-1 ring-line">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="h-7 w-7 rounded-[7px] bg-raised" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 rounded bg-raised" />
                    <div className="h-3 w-64 max-w-full rounded bg-raised/70" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
