"use client";

import { ArrowRight, Check, Mic, Play, Sparkles } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { people } from "@/lib/mock/people";

interface Step {
  id: string;
  title: string;
  body: string;
  keys: string[];
  screen: ReactNode;
}

function Field({ label, value, focused }: { label: string; value: string; focused?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-medium text-fg-muted">{label}</p>
      <div
        className={cn(
          "flex h-9 items-center rounded-[7px] border bg-panel px-3 font-mono text-[12.5px] text-fg",
          focused ? "border-accent/60 shadow-[0_0_0_3px_rgb(38_115_77/0.12)]" : "border-line-strong",
        )}
      >
        {value}
        {focused && <span className="ml-px h-4 w-px animate-blink bg-fg" />}
      </div>
    </div>
  );
}

const CreateScreen = (
  <div className="mx-auto w-full max-w-sm space-y-4 rounded-xl bg-panel p-5 shadow-lift">
    <p className="text-[14px] font-semibold">Create a project</p>
    <Field label="Project name" value="realtime-notes" focused />
    <div>
      <p className="mb-1.5 text-[11.5px] font-medium text-fg-muted">Language</p>
      <div className="flex flex-wrap gap-1.5">
        {["TypeScript", "Python", "Go", "Rust"].map((l, i) => (
          <span
            key={l}
            className={cn(
              "rounded-[6px] px-2.5 py-1 text-[12px] ring-1 ring-inset",
              i === 0 ? "bg-accent-soft text-accent ring-accent-line" : "text-fg-subtle ring-line-strong",
            )}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
    <div className="flex justify-end">
      <span className="rounded-[7px] bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white">
        Create project
      </span>
    </div>
  </div>
);

const InviteScreen = (
  <div className="mx-auto w-full max-w-sm rounded-xl bg-panel p-5 shadow-lift">
    <p className="text-[14px] font-semibold">Invite to realtime-notes</p>
    <div className="mt-4 flex gap-2">
      <div className="flex h-9 flex-1 items-center rounded-[7px] border border-line-strong px-3 font-mono text-[12px] text-fg-subtle">
        …/workspace/realtime-notes
      </div>
      <span className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-panel px-3 text-[12.5px] shadow-card">
        <Check className="h-3.5 w-3.5 text-accent" /> Copied
      </span>
    </div>
    <ul className="mt-4 divide-y divide-line rounded-lg ring-1 ring-line">
      {[people.priya, people.leo, people.mei].map((p, i) => (
        <li key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
          <Avatar name={p.name} color={p.color} size="sm" />
          <span className="flex-1">{p.name}</span>
          <span className={cn("text-[11.5px]", i === 2 ? "text-warning" : "text-fg-subtle")}>
            {i === 2 ? "Invited" : "Editor"}
          </span>
        </li>
      ))}
    </ul>
  </div>
);

const PairScreen = (
  <div className="w-full overflow-hidden rounded-xl bg-panel shadow-lift">
    <div className="flex items-center justify-between border-b border-line px-4 py-2">
      <span className="font-mono text-[11.5px] text-fg-muted">src/notes/sync.ts</span>
      <span className="flex items-center gap-2 text-[11px] text-fg-subtle">
        <AvatarStack people={[people.priya, people.leo]} size="xs" />
        <Mic className="h-3 w-3 text-accent" /> In call
      </span>
    </div>
    <div className="py-3 font-mono text-[12px] leading-[22px]">
      {[
        <>
          <span className="text-syn-keyword">export async function </span>
          <span className="text-syn-function">syncNote</span>
          <span className="text-syn-punct">(id: </span>
          <span className="text-syn-type">string</span>
          <span className="text-syn-punct">) {"{"}</span>
        </>,
        <>
          <span className="text-syn-keyword">{"  const "}</span>
          <span className="text-syn-plain">doc</span>
          <span className="text-syn-punct"> = </span>
          <span className="text-syn-keyword">await </span>
          <span className="text-syn-function">load</span>
          <span className="text-syn-punct">(id);</span>
          <span className="relative ml-px inline-block h-[18px] w-[2px] translate-y-[3px] bg-peer-violet">
            <span className="absolute -top-[14px] left-0 rounded-[3px] rounded-bl-none bg-peer-violet px-1 font-sans text-[9px] font-semibold leading-[13px] text-white">
              Priya
            </span>
          </span>
        </>,
        <>
          <span className="text-syn-keyword">{"  return "}</span>
          <span className="text-syn-plain">doc</span>
          <span className="text-syn-punct">.</span>
          <span className="text-syn-function">merge</span>
          <span className="text-syn-punct">(</span>
          <span className="rounded-[2px] bg-peer-sky/15 text-syn-plain">remote</span>
          <span className="text-syn-punct">);</span>
        </>,
        <span key="c" className="text-syn-punct">{"}"}</span>,
      ].map((line, i) => (
        <div key={i} className={cn("flex whitespace-pre", i === 1 && "bg-[#f4f1fd]")}>
          <span className="w-9 shrink-0 pr-3 text-right text-fg-faint">{i + 1}</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  </div>
);

const DebugScreen = (
  <div className="w-full space-y-2.5">
    <div className="rounded-xl bg-panel p-4 font-mono text-[11.5px] leading-5 shadow-lift">
      <p className="text-fg-subtle">
        <span className="text-accent">❯</span> npm run dev
      </p>
      <p className="text-danger">⨯ src/notes/sync.ts:3:23</p>
      <p className="text-danger">Type error: Property &apos;merge&apos; does not exist on type &apos;Doc&apos;.</p>
    </div>
    <div className="ml-8 rounded-xl bg-panel p-4 shadow-lift">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-accent">
        <Sparkles className="h-3.5 w-3.5" /> Explanation
      </p>
      <p className="mt-1.5 text-[12.5px] leading-5 text-fg-muted">
        <code className="font-mono text-fg">load()</code> returns a read-only snapshot. Use{" "}
        <code className="font-mono text-fg">doc.apply(remote)</code> to merge remote changes.
      </p>
    </div>
  </div>
);

const steps: Step[] = [
  {
    id: "create",
    title: "Create a workspace",
    body: "Name it, pick a language, and your environment opens in the browser.",
    keys: ["⌘", "N"],
    screen: CreateScreen,
  },
  {
    id: "invite",
    title: "Bring the team in",
    body: "Share a link and choose who can edit. Teammates appear as they join.",
    keys: ["⌘", "I"],
    screen: InviteScreen,
  },
  {
    id: "pair",
    title: "Pair in real time",
    body: "Edit the same file with named cursors while you talk on a built-in call.",
    keys: ["⌘", "⇧", "K"],
    screen: PairScreen,
  },
  {
    id: "debug",
    title: "Debug together",
    body: "Run the project, read the output, and walk through problems side by side.",
    keys: ["⌘", "↵"],
    screen: DebugScreen,
  },
];

export function Walkthrough() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + steps.length) % steps.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div role="tablist" aria-label="Product tour" aria-orientation="vertical" onKeyDown={onKeyDown} className="relative">
        {steps.map((s, i) => {
          const selected = i === active;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tour-tab-${s.id}`}
              aria-selected={selected}
              aria-controls={`tour-panel-${s.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                "group relative flex w-full gap-4 border-t border-line py-5 pl-5 text-left transition-colors duration-200 last:border-b",
                selected ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-[-1px] left-0 top-[-1px] w-[2px] origin-top bg-accent transition-transform duration-500 ease-out",
                  selected ? "scale-y-100" : "scale-y-0",
                )}
              />
              <span className="pt-0.5 font-mono text-[12px] text-fg-faint">0{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[16px] font-semibold tracking-[-0.01em]">{s.title}</span>
                  <span className={cn("hidden gap-1 transition-opacity sm:flex", selected ? "opacity-100" : "opacity-0")}>
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                    selected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <span className="min-h-0 overflow-hidden">
                    <span className="block pt-1.5 text-[14px] leading-6 text-fg-muted">{s.body}</span>
                  </span>
                </span>
              </span>
            </button>
          );
        })}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ButtonLink href="/workspace/demo" variant="secondary" size="sm">
            <Play className="h-3 w-3 fill-current" /> Try it in the demo
          </ButtonLink>
          <span className="hidden text-[12.5px] text-fg-subtle lg:inline">Use ↑ ↓ to move through the steps</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-sunken ring-1 ring-line">
        <div className="relative flex h-10 items-center gap-2 border-b border-line bg-panel/70 px-4 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#e2e2dc]" />
          <span className="h-2 w-2 rounded-full bg-[#e2e2dc]" />
          <span className="h-2 w-2 rounded-full bg-[#e2e2dc]" />
          <span className="ml-2 font-mono text-[11px] text-fg-subtle">
            codelab · {steps[active].title.toLowerCase()}
          </span>
        </div>
        <div className="relative grid min-h-[340px] grid-cols-[minmax(0,1fr)] place-items-center p-4 sm:min-h-[380px] sm:p-10">
          {steps.map((s, i) => (
            <div
              key={s.id}
              role="tabpanel"
              id={`tour-panel-${s.id}`}
              aria-labelledby={`tour-tab-${s.id}`}
              inert={i !== active}
              className={cn(
                "col-start-1 row-start-1 flex w-full justify-center transition-[opacity,transform,filter] duration-500 ease-out",
                i === active ? "translate-y-0 opacity-100 blur-0" : "pointer-events-none translate-y-3 opacity-0 blur-[2px]",
              )}
            >
              {s.screen}
            </div>
          ))}
        </div>
        <div className="relative flex items-center justify-between border-t border-line bg-panel/70 px-4 py-2.5 text-[12px] text-fg-subtle">
          <span>
            Step {active + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={() => setActive((a) => (a + 1) % steps.length)}
            className="inline-flex items-center gap-1 font-medium text-accent transition-colors hover:text-accent-strong"
          >
            {active === steps.length - 1 ? "Start over" : "Next step"} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
