import { CircleX, Mic, MicOff, MonitorUp, PhoneOff, Sparkles, Video } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { people, type PeerColor } from "@/lib/mock/people";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-line py-3.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-subtle">{label}</p>
      <p className="mt-1 text-[14px] leading-6 text-fg-muted">{children}</p>
    </div>
  );
}

function CodeLine({ n, children, tint }: { n: number; children: ReactNode; tint?: string }) {
  return (
    <div className={cn("flex whitespace-pre", tint)}>
      <span className="w-9 shrink-0 select-none pr-3 text-right text-fg-faint">{n}</span>
      <span>{children}</span>
    </div>
  );
}

function Flag({ name, color }: { name: string; color: string }) {
  return (
    <span className="relative inline-block h-[18px] w-0 align-[-4px]">
      <span className={cn("absolute left-0 top-0 h-[18px] w-[2px] rounded-full", color)} />
      <span
        className={cn(
          "absolute -top-[15px] left-0 rounded-[4px] rounded-bl-none px-1.5 font-sans text-[9.5px] font-semibold leading-[14px] text-white",
          color,
        )}
      >
        {name}
      </span>
    </span>
  );
}

function EditingVisual() {
  return (
    <div className="overflow-x-auto rounded-xl bg-panel py-5 font-mono text-[12.5px] leading-[30px] shadow-lift">
      <CodeLine n={1}>
        <span className="text-syn-keyword">export function </span>
        <span className="text-syn-function">usePresence</span>
        <span className="text-syn-punct">(</span>
        <span className="text-syn-plain">room</span>
        <span className="text-syn-punct">: </span>
        <span className="text-syn-type">string</span>
        <span className="text-syn-punct">) {"{"}</span>
      </CodeLine>
      <CodeLine n={2} tint="bg-[#f1eefb]">
        <span className="text-syn-keyword">{"  const "}</span>
        <span className="rounded-[3px] bg-peer-violet/15 text-syn-plain">peers</span>
        <Flag name="Priya" color="bg-peer-violet" />
        <span className="text-syn-punct"> = </span>
        <span className="text-syn-function">useRoom</span>
        <span className="text-syn-punct">(room);</span>
      </CodeLine>
      <CodeLine n={3}>
        <span className="text-syn-keyword">{"  return "}</span>
        <span className="text-syn-plain">peers</span>
        <span className="text-syn-punct">.</span>
        <span className="text-syn-function">filter</span>
        <span className="text-syn-punct">((p) </span>
        <span className="text-syn-keyword">=&gt;</span>
        <span className="text-syn-plain"> p</span>
        <span className="text-syn-punct">.</span>
        <span className="text-syn-property">online</span>
        <span className="text-syn-punct">);</span>
      </CodeLine>
      <CodeLine n={4} tint="bg-[#ecf3f9]">
        <span className="text-syn-punct">{"}"}</span>
        <Flag name="Leo" color="bg-peer-sky" />
      </CodeLine>
      <CodeLine n={5}>
        <span className="text-syn-comment italic">{"// Mei is following Priya"}</span>
      </CodeLine>
    </div>
  );
}

const tileBg: Record<PeerColor, string> = {
  accent: "bg-[#eef5f0]",
  violet: "bg-[#f1eefb]",
  sky: "bg-[#ecf3f9]",
  amber: "bg-[#f8f1e5]",
  rose: "bg-[#f9edf1]",
};

function CallVisual() {
  const tiles = [
    { p: people.priya, speaking: true },
    { p: people.leo, muted: true },
    { p: people.mei },
    { p: people.sam },
  ];
  return (
    <div className="rounded-xl bg-panel p-3 shadow-lift">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(({ p, speaking, muted }) => (
          <div
            key={p.id}
            className={cn(
              "relative flex aspect-video items-center justify-center rounded-lg",
              tileBg[p.color],
              speaking && "speak-ring",
            )}
          >
            <Avatar name={p.name} color={p.color} size="lg" />
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-[4px] bg-white/85 px-1.5 text-[10px] leading-4 text-fg-muted">
              {muted ? <MicOff className="h-2.5 w-2.5 text-danger" /> : <Mic className="h-2.5 w-2.5" />}
              {p.name.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {[Mic, Video, MonitorUp].map((Icon, i) => (
          <span
            key={i}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-raised text-fg-muted ring-1 ring-inset ring-line"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
        <span className="inline-flex h-8 w-10 items-center justify-center rounded-full bg-danger text-white">
          <PhoneOff className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

function DebugVisual() {
  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-panel shadow-lift">
        <div className="flex items-center gap-4 border-b border-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em]">
          <span className="text-fg-faint">Terminal</span>
          <span className="text-fg-faint">Output</span>
          <span className="relative text-fg">
            Problems
            <span className="absolute -bottom-2 left-0 right-0 h-[2px] bg-accent" />
          </span>
        </div>
        <div className="flex items-start gap-2.5 px-4 py-3 text-[12.5px]">
          <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="leading-5 text-fg-muted">
            Argument of type <code className="font-mono text-[12px] text-fg">number | undefined</code> is
            not assignable to <code className="font-mono text-[12px] text-fg">number</code>
            <span className="ml-2 font-mono text-[11px] text-fg-subtle">MetricCard.tsx:26</span>
          </p>
        </div>
      </div>
      <div className="ml-6 rounded-xl bg-panel p-4 shadow-lift sm:ml-12">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Suggested fix
          </p>
          <span className="rounded-[4px] border border-dashed border-line-strong px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-fg-subtle">
            Roadmap
          </span>
        </div>
        <pre className="mt-2.5 overflow-hidden rounded-md bg-canvas px-3 py-2 font-mono text-[11.5px] leading-5">
          <span className="text-danger">- formatDelta(delta)</span>
          {"\n"}
          <span className="text-success">+ formatDelta(delta ?? 0)</span>
        </pre>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <div className="space-y-5">
      {/* A — wide editorial row */}
      <article className="reveal grid overflow-hidden rounded-2xl bg-panel shadow-card lg:grid-cols-[5fr_7fr]">
        <div className="flex min-w-0 flex-col p-7 sm:p-10">
          <Eyebrow>01 / Collaborative editing</Eyebrow>
          <h3 className="mt-4 max-w-sm text-[26px] font-semibold leading-[1.15] tracking-[-0.025em]">
            See every change the moment it&apos;s made.
          </h3>
          <p className="mt-3 max-w-md text-[15px] leading-7 text-fg-muted">
            Everyone types into the same file. Named cursors and live selections show who is
            working where, so pairing feels like sharing one keyboard — without the queue.
          </p>
          <div className="mt-auto pt-8">
            <Detail label="Named cursors">Know whose caret is whose at a glance.</Detail>
            <Detail label="Follow mode">Jump to a teammate&apos;s file and line in one click.</Detail>
          </div>
        </div>
        <div className="relative flex min-w-0 items-center bg-sunken p-5 sm:p-10">
          <div className="w-full min-w-0">
            <EditingVisual />
          </div>
        </div>
      </article>

      {/* B — asymmetric pair */}
      <div className="grid gap-5 lg:grid-cols-[5fr_7fr]">
        <article className="reveal flex flex-col overflow-hidden rounded-2xl bg-panel shadow-card">
          <div className="p-7 sm:p-9">
            <Eyebrow>02 / Integrated calls</Eyebrow>
            <h3 className="mt-4 text-[22px] font-semibold leading-[1.2] tracking-[-0.02em]">
              Talk it through without leaving the file.
            </h3>
            <p className="mt-2.5 text-[14.5px] leading-6 text-fg-muted">
              Voice and video sit beside the editor, so a quick question never turns into a
              separate meeting.
            </p>
          </div>
          <div className="mt-auto bg-sunken p-5 sm:p-8">
            <CallVisual />
          </div>
        </article>

        <article className="reveal flex min-w-0 flex-col overflow-hidden rounded-2xl bg-panel shadow-card">
          <div className="grid gap-4 p-7 sm:grid-cols-2 sm:p-9">
            <div>
              <Eyebrow>03 / Shared debugging</Eyebrow>
              <h3 className="mt-4 text-[22px] font-semibold leading-[1.2] tracking-[-0.02em]">
                One error. Every pair of eyes.
              </h3>
            </div>
            <p className="text-[14.5px] leading-6 text-fg-muted sm:pt-9">
              Run, read the output and work through problems together. Explanations and suggested
              fixes appear where the whole room can review them.
            </p>
          </div>
          <div className="flex flex-1 flex-col justify-center bg-sunken p-5 sm:p-8">
            <DebugVisual />
          </div>
        </article>
      </div>
    </div>
  );
}
