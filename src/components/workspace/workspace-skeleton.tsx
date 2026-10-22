import { EditorSkeleton } from "./editor-skeleton";

/** Loading state while a project's session check and files load. */
export function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-sunken" aria-busy="true" aria-label="Loading workspace">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <div className="h-6 w-6 rounded-md bg-raised" />
        <div className="h-4 w-40 rounded bg-raised" />
        <div className="ml-auto h-8 w-24 rounded-[7px] bg-raised" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[248px] shrink-0 space-y-2 p-4 lg:block">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 rounded bg-raised/80" style={{ width: `${80 - i * 9}%` }} />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <EditorSkeleton />
        </div>
      </div>
    </div>
  );
}
