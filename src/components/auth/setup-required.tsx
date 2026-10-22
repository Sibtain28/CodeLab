import { TriangleAlert } from "lucide-react";

/**
 * Shown when required environment variables are missing. Lists variable
 * *names* only — never values.
 */
export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <div role="status" className="rounded-[10px] bg-[#fbf2e3] px-4 py-3.5 text-[13px] leading-5 ring-1 ring-inset ring-warning/25">
      <p className="flex items-center gap-2 font-medium text-fg">
        <TriangleAlert className="h-4 w-4 text-warning" /> Setup required
      </p>
      <p className="mt-1.5 text-fg-muted">
        Accounts need a database. Add these to <code className="font-mono text-[12px]">.env</code>, run the
        migration, and restart the dev server:
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {missing.map((name) => (
          <li key={name} className="rounded bg-panel px-1.5 py-0.5 font-mono text-[11.5px] text-fg ring-1 ring-line">
            {name}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-fg-subtle">Step-by-step instructions are in SETUP.md.</p>
    </div>
  );
}
