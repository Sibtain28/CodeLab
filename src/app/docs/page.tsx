import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/landing/site-header";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow, Kbd } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Documentation",
  description: "What the CodeLab preview includes, keyboard shortcuts, and what's coming next.",
};

const shortcuts: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Search projects (dashboard)" },
  { keys: ["⌘", "B"], label: "Toggle file explorer" },
  { keys: ["⌘", "J"], label: "Toggle terminal panel" },
  { keys: ["⌘", "⇧", "K"], label: "Toggle collaboration panel" },
  { keys: ["⌘", "↵"], label: "Run / stop the project" },
  { keys: ["⌘", "S"], label: "Save the current file" },
];

const status: { area: string; now: string; next: string }[] = [
  { area: "Editor", now: "Monaco editor; ⌘S saves your project files to PostgreSQL", next: "Version history" },
  { area: "Collaboration", now: "Live co-editing, cursors and presence (Yjs)", next: "Invites and sharing" },
  { area: "Calls", now: "Call controls, no camera or microphone access", next: "Audio and video with LiveKit" },
  { area: "Terminal & Run", now: "Simulated in the browser", next: "Sandboxed execution" },
  { area: "Accounts & data", now: "Email sign-in; projects and files saved to your account", next: "Invites and sharing" },
];

export default function DocsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-24">
          <Eyebrow>Documentation</Eyebrow>
          <h1 className="mt-5 font-display text-[clamp(2.6rem,6vw,4rem)] leading-[1] tracking-[-0.02em]">
            Getting started with the preview
          </h1>
          <p className="mt-5 text-[16.5px] leading-7 text-fg-muted">
            CodeLab is being built in phases. Accounts, saved projects and live co-editing work
            today; calls and code execution are still simulated. The demo workspace runs on
            sample data so you can explore without signing in.
          </p>

          <section className="mt-14">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">Try it</h2>
            <ol className="mt-4 space-y-3 text-[15px] leading-7 text-fg-muted">
              <li>
                <span className="mr-2 font-mono text-[12px] text-fg-faint">01</span>
                Create an account, then create a project from the dashboard — it&apos;s saved to your account.
              </li>
              <li>
                <span className="mr-2 font-mono text-[12px] text-fg-faint">02</span>
                Edit a file and press <Kbd>⌘</Kbd> <Kbd>S</Kbd> to save it. It&apos;s still there after you reload or sign in again.
              </li>
              <li>
                <span className="mr-2 font-mono text-[12px] text-fg-faint">03</span>
                Open the sample demo workspace to try the Problems tab, simulated runs and collaboration UI.
              </li>
            </ol>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/signup" variant="primary">
                Create an account
              </ButtonLink>
              <ButtonLink href="/workspace/demo" variant="secondary">
                Open the demo workspace <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          </section>

          <section className="mt-16">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">Keyboard shortcuts</h2>
            <p className="mt-1 text-[14px] text-fg-subtle">Use Ctrl instead of ⌘ on Windows and Linux.</p>
            <ul className="mt-4 divide-y divide-line rounded-xl bg-panel shadow-card">
              {shortcuts.map((s) => (
                <li key={s.label} className="flex items-center justify-between px-4 py-3 text-[14px] text-fg-muted">
                  {s.label}
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-16">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em]">What&apos;s real today</h2>
            <div className="mt-4 overflow-x-auto rounded-xl bg-panel shadow-card">
              <table className="w-full min-w-[520px] text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
                    <th className="px-4 py-3 font-normal">Area</th>
                    <th className="px-4 py-3 font-normal">In the preview</th>
                    <th className="px-4 py-3 font-normal">Coming next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {status.map((row) => (
                    <tr key={row.area}>
                      <td className="px-4 py-3 font-medium text-fg">{row.area}</td>
                      <td className="px-4 py-3 text-fg-muted">{row.now}</td>
                      <td className="px-4 py-3 text-fg-subtle">{row.next}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
